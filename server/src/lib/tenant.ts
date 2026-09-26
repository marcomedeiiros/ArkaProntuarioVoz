import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient as TenantClient } from "../generated/tenant";
import { env } from "../env";
import { prisma } from "./prisma";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { HttpError } from "./http-error";

/*
 * Um espaço de dados por clínica: cada clínica tem o próprio schema no Postgres ("clinica_<id>"),
 * com pacientes, consultas e financeiro. O banco da plataforma (public) guarda só contas,
 * clínicas, permissões e configurações. A API abre apenas o schema da clínica de quem está logado,
 * então não existe consulta capaz de misturar dados de duas clínicas.
 */

export type TenantDb = TenantClient;

const MIGRATIONS_DIR = resolve(__dirname, "../../prisma/tenant/migrations");

/** Nome do schema da clínica. Os ids são cuid (letras minúsculas e números), mas validamos mesmo assim. */
export function tenantSchema(clinicId: string) {
  if (!/^[a-z0-9]{8,40}$/.test(clinicId)) throw new Error("id de clínica inválido para schema");
  return `clinica_${clinicId}`;
}

function tenantUrl(schema: string) {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("schema", schema);
  // Poucas conexões por clínica: são muitas clínicas dividindo o mesmo Postgres.
  url.searchParams.set("connection_limit", "3");
  return url.toString();
}

/* Conexões abertas por clínica, reaproveitadas. As menos usadas são fechadas quando passam do limite. */
const MAX_OPEN = 25;
const clients = new Map<string, TenantClient>();

export function tenantDb(clinicId: string): TenantClient {
  const schema = tenantSchema(clinicId);
  let client = clients.get(schema);
  if (client) {
    clients.delete(schema); // move para o fim (mais recente)
  } else {
    client = new TenantClient({ datasources: { db: { url: tenantUrl(schema) } } });
    if (clients.size >= MAX_OPEN) {
      const [oldest, old] = clients.entries().next().value!;
      clients.delete(oldest);
      void old.$disconnect().catch(() => {});
    }
  }
  clients.set(schema, client);
  return client;
}

/** Para os testes e o encerramento da API. */
export async function closeTenantClients() {
  await Promise.all([...clients.values()].map((c) => c.$disconnect().catch(() => {})));
  clients.clear();
}

/* ============================ Estrutura (migrações) ============================ */

function tenantMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8") }));
}

/** Divide o SQL gerado pelo Prisma em comandos (não há ";" dentro de strings nesses arquivos). */
function statements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

/**
 * Cria o schema da clínica (se preciso) e aplica as migrações que faltam, cada uma numa transação.
 * Pode rodar quantas vezes quiser: o que já foi aplicado fica registrado no próprio schema.
 */
export async function migrateTenant(clinicId: string) {
  const schema = tenantSchema(clinicId);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${schema}"."_migracoes" (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await prisma.$queryRawUnsafe<{ nome: string }[]>(`SELECT nome FROM "${schema}"."_migracoes"`)).map((r) => r.nome),
  );
  for (const m of tenantMigrations()) {
    if (done.has(m.name)) continue;
    // Arquivo vazio (ou ainda sendo escrito) nunca é marcado como aplicado: senão a migração
    // ficaria registrada sem ter criado nada, e nunca mais rodaria.
    if (statements(m.sql).length === 0) {
      console.warn(`[aviso] Migração de clínica vazia ignorada por enquanto: ${m.name}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const stmt of statements(m.sql)) await tx.$executeRawUnsafe(stmt);
      await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."_migracoes" (nome) VALUES ($1)`, m.name);
    });
  }
}

/**
 * Prepara o espaço de uma clínica recém-liberada: estrutura, categorias financeiras padrão e,
 * se a clínica existia antes da separação, os dados antigos dela (ver importLegacyData).
 */
export async function provisionTenant(clinicId: string) {
  await migrateTenant(clinicId);
  const db = tenantDb(clinicId);
  await importLegacyData(clinicId);
  if ((await db.financialCategory.count()) === 0) {
    await db.financialCategory.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c })), skipDuplicates: true });
  }
  await prisma.clinic.update({ where: { id: clinicId }, data: { provisionedAt: new Date() } });
}

/** Garante que o espaço existe antes de usar (clínicas liberadas antes desta versão, por exemplo). */
export async function tenantFor(clinicId: string) {
  if (!upToDate.has(clinicId)) {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { provisionedAt: true } });
    if (!clinic) throw new HttpError(404, "Clínica não encontrada");
    // Garante a estrutura mais recente (migrações novas) antes do primeiro uso nesta execução da API,
    // mesmo que a migração da subida não tenha rodado.
    if (!clinic.provisionedAt) await provisionTenant(clinicId);
    else await migrateTenant(clinicId);
    upToDate.add(clinicId);
  }
  return tenantDb(clinicId);
}

/** Clínicas cujo schema já foi conferido/atualizado nesta execução da API. */
const upToDate = new Set<string>();

/** Na subida da API: aplica migrações novas em todas as clínicas que já têm espaço. */
export async function migrateAllTenants() {
  const clinics = await prisma.clinic.findMany({ where: { provisionedAt: { not: null } }, select: { id: true } });
  for (const c of clinics) await migrateTenant(c.id);
  return clinics.length;
}

/** Apaga o espaço de dados de uma clínica (usado quando a clínica é excluída e nos testes). */
export async function dropTenant(clinicId: string) {
  const schema = tenantSchema(clinicId);
  const client = clients.get(schema);
  if (client) {
    clients.delete(schema);
    await client.$disconnect().catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

/* ============================ Dados de antes da separação ============================ */

/**
 * Até esta versão, os dados de todas as clínicas ficavam juntos em tabelas do public. A migração
 * da plataforma as moveu para o schema "legado" (nada foi apagado). Aqui copiamos para o schema da
 * clínica o que é dela. Roda uma única vez por clínica (marcada em legacyImportedAt).
 */
async function importLegacyData(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { legacyImportedAt: true } });
  if (clinic?.legacyImportedAt) return;
  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legado' AND table_name = 'Patient') AS exists`;
  if (exists) {
    const s = tenantSchema(clinicId);
    await prisma.$transaction(async (tx) => {
      const cast = (col: string, type: string) => `"${col}"::text::"${s}"."${type}"`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "${s}"."Patient" (id, name, "birthDate", sex, "guardianName", "guardianPhone", allergies, notes, "createdAt", "updatedAt")
         SELECT id, name, "birthDate", ${cast("sex", "Sex")}, "guardianName", "guardianPhone", allergies, notes, "createdAt", "updatedAt"
         FROM legado."Patient" WHERE "clinicId" = $1 ON CONFLICT DO NOTHING`,
        clinicId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "${s}"."Consultation" (id, "patientId", "doctorId", "doctorName", template, status, "weightKg", "heightCm", transcript,
           evolution, prescription, "prescriptionNotes", "parentGuide", alerts, "generatedAt", "createdAt", "updatedAt")
         SELECT c.id, c."patientId", c."doctorId", COALESCE(u.name, 'Profissional'), ${cast("template", "ConsultationTemplate")},
           ${cast("status", "ConsultationStatus")}, c."weightKg", c."heightCm", c.transcript, c.evolution, c.prescription,
           c."prescriptionNotes", c."parentGuide", c.alerts, c."generatedAt", c."createdAt", c."updatedAt"
         FROM legado."Consultation" c LEFT JOIN public."User" u ON u.id = c."doctorId"
         WHERE c."clinicId" = $1 ON CONFLICT DO NOTHING`,
        clinicId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "${s}"."FinancialCategory" (id, name, type)
         SELECT id, name, ${cast("type", "TransactionType")} FROM legado."FinancialCategory" WHERE "clinicId" = $1 ON CONFLICT DO NOTHING`,
        clinicId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "${s}"."Transaction" (id, type, status, amount, method, date, description, "categoryId", "patientId", "consultationId", "createdAt")
         SELECT id, ${cast("type", "TransactionType")}, ${cast("status", "TransactionStatus")}, amount, ${cast("method", "PaymentMethod")},
           date, description, "categoryId", "patientId", "consultationId", "createdAt"
         FROM legado."Transaction" WHERE "clinicId" = $1 ON CONFLICT DO NOTHING`,
        clinicId,
      );
    });
  }
  await prisma.clinic.update({ where: { id: clinicId }, data: { legacyImportedAt: new Date() } });
}

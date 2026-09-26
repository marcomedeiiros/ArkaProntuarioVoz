import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { inCatalogOrder, missingRequirement, MODULE_CATALOG, MODULE_KEYS, ModuleKeySchema } from "../lib/modules";
import { provisionTenant } from "../lib/tenant";
import { aiKeyStatus, getAnthropicClient, removeAnthropicKey, saveAnthropicKey, verifyAnthropicKey } from "../services/ai-settings";
import type { PlatformActor } from "./policy";

/*
 * Área da Arka (dona do SaaS). Toda função aqui recebe um PlatformActor, que só existe para contas
 * da Arka (ver platformAuth). A Arka libera clínicas e define os módulos de cada uma, mas não lê
 * pacientes, consultas nem financeiro: esses dados ficam no schema de cada clínica.
 */

/* =========================== Clínicas (liberação e módulos) =========================== */

const StatusFilter = z.object({ status: z.enum(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"]).optional() });

export async function listClinics(_actor: PlatformActor, query: unknown) {
  const { status } = StatusFilter.parse(query);
  const clinics = await prisma.clinic.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      statusReason: true,
      reviewedAt: true,
      createdAt: true,
      modules: true,
      provisionedAt: true,
      users: { where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true } },
      _count: { select: { users: true } },
    },
  });
  const counts = await prisma.clinic.groupBy({ by: ["status"], _count: true });
  return {
    clinics: clinics.map(({ users, _count, ...c }) => ({ ...c, owner: users[0] ?? null, users: _count.users })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<string, number>>,
  };
}

const ReasonSchema = z.object({ reason: z.string().trim().max(300).optional() });

type Action = "approve" | "reject" | "suspend" | "reactivate";
const TRANSITIONS: Record<Action, { from: string[]; to: "ACTIVE" | "REJECTED" | "SUSPENDED" }> = {
  approve: { from: ["PENDING", "REJECTED"], to: "ACTIVE" },
  reject: { from: ["PENDING"], to: "REJECTED" },
  suspend: { from: ["ACTIVE"], to: "SUSPENDED" },
  reactivate: { from: ["SUSPENDED"], to: "ACTIVE" },
};

/**
 * Muda a situação de uma clínica. Liberar cria o espaço de dados próprio da clínica (schema).
 * Recusar e suspender derrubam na hora as sessões da clínica; os dados continuam guardados.
 */
export async function reviewClinic(actor: PlatformActor, clinicId: string, action: Action, input: unknown) {
  const { reason } = ReasonSchema.parse(input ?? {});
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, status: true, provisionedAt: true } });
  if (!clinic) throw new HttpError(404, "Clínica não encontrada");
  const t = TRANSITIONS[action];
  if (!t.from.includes(clinic.status)) throw new HttpError(409, "Esta ação não vale para a situação atual da clínica");

  // O espaço é criado antes de liberar: a clínica nunca fica "liberada" sem onde guardar os dados.
  if (t.to === "ACTIVE" && !clinic.provisionedAt) await provisionTenant(clinic.id);

  const blocks = t.to !== "ACTIVE";
  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: clinic.id },
      data: { status: t.to, statusReason: blocks ? reason || null : null, reviewedAt: new Date() },
    }),
    ...(blocks ? [prisma.user.updateMany({ where: { clinicId: clinic.id }, data: { tokenVersion: { increment: 1 } } })] : []),
  ]);
  return listClinics(actor, {});
}

const ModulesSchema = z.object({ modules: z.array(ModuleKeySchema).max(MODULE_KEYS.length) });

/**
 * Define as abas que a empresa tem na plataforma. Vale na hora para todos da clínica: o que sair
 * daqui some para todos os cargos, mesmo que a clínica tenha distribuído antes.
 */
export async function setClinicModules(actor: PlatformActor, clinicId: string, input: unknown) {
  const keys = inCatalogOrder(ModulesSchema.parse(input).modules);
  const problem = missingRequirement(keys);
  if (problem) throw new HttpError(400, problem);
  const { count } = await prisma.clinic.updateMany({ where: { id: clinicId }, data: { modules: keys } });
  if (!count) throw new HttpError(404, "Clínica não encontrada");
  return getClinicDetail(actor, clinicId);
}

/**
 * Tudo o que a Arka precisa para ver "o que esta empresa enxerga": abas liberadas, como a clínica
 * distribuiu entre os cargos e quantas pessoas há em cada cargo. Nenhum dado de paciente.
 */
export async function getClinicDetail(_actor: PlatformActor, clinicId: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      status: true,
      statusReason: true,
      reviewedAt: true,
      createdAt: true,
      provisionedAt: true,
      modules: true,
      users: { where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true } },
      rolePermissions: { select: { role: true, permission: true } },
    },
  });
  if (!clinic) throw new HttpError(404, "Clínica não encontrada");
  const team = await prisma.user.groupBy({ by: ["role"], where: { clinicId, active: true }, _count: true });
  const modules = inCatalogOrder(clinic.modules);
  const byRole = (role: "DOCTOR" | "SECRETARY") =>
    modules.filter((k) => clinic.rolePermissions.some((r) => r.role === role && r.permission === k));
  const { users, rolePermissions, ...rest } = clinic;
  void rolePermissions;
  return {
    ...rest,
    modules,
    owner: users[0] ?? null,
    // O que cada cargo vê hoje (administração: tudo o que a empresa tem).
    roles: { ADMIN: modules, DOCTOR: byRole("DOCTOR"), SECRETARY: byRole("SECRETARY") },
    team: Object.fromEntries(team.map((t) => [t.role, t._count])) as Partial<Record<string, number>>,
    catalog: MODULE_CATALOG,
  };
}

/* =========================== Configurações da IA =========================== */

export async function getAiSettings(_actor: PlatformActor) {
  return aiKeyStatus();
}

const KeySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/, "Isso não parece uma chave da Anthropic (começa com sk-ant-)"),
});

/** Confere a chave com a Anthropic antes de salvar: chave errada nunca fica gravada. */
export async function setAiKey(_actor: PlatformActor, input: unknown) {
  const { key } = KeySchema.parse(input);
  await verifyAnthropicKey(key);
  await saveAnthropicKey(key);
  return aiKeyStatus();
}

export async function clearAiKey(_actor: PlatformActor) {
  await removeAnthropicKey();
  return aiKeyStatus();
}

/** Testa a chave em uso (painel ou .env) sem mostrá-la. */
export async function testAiKey(_actor: PlatformActor) {
  const client = await getAnthropicClient();
  await verifyAnthropicKey(client.apiKey ?? "");
  return { ok: true };
}

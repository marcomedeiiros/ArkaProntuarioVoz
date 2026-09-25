import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_CATEGORIES } from "../src/lib/default-categories";
import { assertIsTestDatabase } from "./test-db";

export { app, prisma };

/** Senhas descartáveis, novas a cada execução: nenhuma senha fixa no repositório. */
export const randomPassword = () => randomBytes(16).toString("base64url");
export const PASSWORD = randomPassword();

/** Apaga todos os dados do banco de testes (nunca roda fora de um banco "_test"). */
export async function resetDb() {
  assertIsTestDatabase(process.env.DATABASE_URL);
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Transaction", "FinancialCategory", "Consultation", "Patient", "User", "Clinic" CASCADE',
  );
}

let seq = 0;

/**
 * Cria uma clínica completa: administração, duas médicas, secretária, pacientes,
 * categorias e uma consulta em cada etapa (rascunho, gerada e finalizada) da médica 1.
 */
export async function createClinic(label = "Clínica") {
  const tag = `${Date.now()}-${++seq}`;
  const passwordHash = await bcrypt.hash(PASSWORD, 4); // custo baixo: testes rápidos
  const clinic = await prisma.clinic.create({
    data: { name: `${label} ${tag}`, categories: { create: DEFAULT_CATEGORIES.map((c) => ({ ...c })) } },
  });
  const user = (role: "ADMIN" | "DOCTOR" | "SECRETARY", name: string) =>
    prisma.user.create({
      data: { clinicId: clinic.id, role, name, email: `${name.toLowerCase().replace(/\W/g, "")}.${tag}@teste.dev`, passwordHash },
    });
  const [admin, doctor, doctor2, secretary] = await Promise.all([
    user("ADMIN", "Admin"),
    user("DOCTOR", "Medica"),
    user("DOCTOR", "Medica2"),
    user("SECRETARY", "Secretaria"),
  ]);

  const patient = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      name: "João Pedro",
      birthDate: new Date(Date.UTC(2026, 5, 1)),
      sex: "M",
      guardianName: "Mariana",
      guardianPhone: "27998112233",
    },
  });
  const otherPatient = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      name: "Helena Martins",
      birthDate: new Date(Date.UTC(2024, 6, 1)),
      sex: "F",
      guardianName: "Rafael",
      guardianPhone: "27997224455",
      allergies: "Dipirona",
    },
  });

  const transcript =
    "Mãe relata aleitamento materno exclusivo, oito mamadas ao dia. Sustenta a cabeça e sorri. Vacinas em dia.";
  const consult = (status: "DRAFT" | "GENERATED" | "FINALIZED") =>
    prisma.consultation.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        doctorId: doctor.id,
        template: "PUERICULTURA",
        status,
        transcript,
        ...(status !== "DRAFT" && {
          evolution: "ALIMENTAÇÃO: aleitamento materno exclusivo.",
          prescription: [],
          prescriptionNotes: "Retorno em 1 mês.",
          parentGuide: "Tudo certo com o João!",
          alerts: [],
          generatedAt: new Date(),
        }),
      },
    });
  const [draft, generated, finalized] = await Promise.all([consult("DRAFT"), consult("GENERATED"), consult("FINALIZED")]);

  const categories = await prisma.financialCategory.findMany({ where: { clinicId: clinic.id } });
  return {
    clinic,
    users: { admin, doctor, doctor2, secretary },
    patient,
    otherPatient,
    consultations: { draft, generated, finalized },
    income: categories.find((c) => c.type === "INCOME")!,
    expense: categories.find((c) => c.type === "EXPENSE")!,
  };
}

export type ClinicFixture = Awaited<ReturnType<typeof createClinic>>;

/** Faz login e devolve um "navegador" que guarda o cookie de sessão entre as requisições. */
export async function loginAs(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login de ${email} falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Extrai o valor do cookie de sessão de uma resposta. */
export function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith("pv_session="));
}

export const api = () => request(app);

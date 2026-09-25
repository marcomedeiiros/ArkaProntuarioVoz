import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "./prisma";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { email as emailSchema, password as passwordSchema } from "./validation";

const InputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120).default("Administrador"),
  clinicName: z.string().trim().min(2).max(120).default("Arka Tecnologia"),
});

/**
 * Garante que o administrador exista, criando a clínica dele se preciso.
 * Se o e-mail já existe, NÃO mexe em nada (nem na senha): a senha trocada pela tela continua valendo.
 */
export async function ensureAdmin(input: z.input<typeof InputSchema>): Promise<"created" | "exists"> {
  const data = InputSchema.parse(input);
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) return "exists";

  const passwordHash = await bcrypt.hash(data.password, 12);
  await prisma.$transaction(async (tx) => {
    const clinic =
      (await tx.clinic.findFirst({ where: { name: data.clinicName }, select: { id: true } })) ??
      (await tx.clinic.create({
        data: { name: data.clinicName, categories: { create: DEFAULT_CATEGORIES.map((c) => ({ ...c })) } },
        select: { id: true },
      }));
    await tx.user.create({
      data: { clinicId: clinic.id, name: data.name, email: data.email, passwordHash, role: "ADMIN" },
    });
  });
  return "created";
}

/**
 * Administrador inicial vindo do server/.env desta máquina (BOOTSTRAP_ADMIN_*). Como o banco não vai
 * para o GitHub, é assim que a conta "fica salva" em cada computador ou servidor, sem senha no código.
 */
export async function bootstrapAdminFromEnv() {
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) return;
  const result = await ensureAdmin({
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    name: env.BOOTSTRAP_ADMIN_NAME,
    clinicName: env.BOOTSTRAP_CLINIC_NAME,
  });
  if (result === "created") {
    console.log(`Administrador inicial ${env.BOOTSTRAP_ADMIN_EMAIL} criado (clínica "${env.BOOTSTRAP_CLINIC_NAME ?? "Arka Tecnologia"}").`);
  }
}

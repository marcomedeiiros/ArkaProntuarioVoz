import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "./prisma";
import { email as emailSchema, password as passwordSchema } from "./validation";

const InputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120).default("Administrador Arka"),
});

/**
 * Garante que exista a conta da Arka (dona do SaaS). Ela não pertence a nenhuma clínica: só libera
 * clínicas, define os módulos de cada uma e as configurações da plataforma.
 * Se o e-mail já existe, NÃO mexe em nada (nem na senha): a senha trocada pela tela continua valendo.
 */
export async function ensurePlatformAdmin(input: z.input<typeof InputSchema>): Promise<"created" | "exists"> {
  const data = InputSchema.parse(input);
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) return "exists";
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 12),
      role: "ADMIN",
      platformAdmin: true,
      clinicId: null,
    },
  });
  return "created";
}

/**
 * Conta da Arka vinda do server/.env desta máquina (BOOTSTRAP_ADMIN_*). Como o banco não vai para
 * o GitHub, é assim que a conta "fica salva" em cada computador ou servidor, sem senha no código.
 */
export async function bootstrapAdminFromEnv() {
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) return;
  const result = await ensurePlatformAdmin({
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    name: env.BOOTSTRAP_ADMIN_NAME,
  });
  if (result === "created") console.log(`Conta da Arka ${env.BOOTSTRAP_ADMIN_EMAIL} criada.`);
}

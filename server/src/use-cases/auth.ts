import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { email, name, password } from "../lib/validation";
import { assertClinicCanUse, defaultRolePermissionRows, permissionsFor } from "../lib/permissions";
import { MODULE_CATALOG, MODULE_KEYS } from "../lib/modules";
import type { Role } from "@prisma/client";
import { env } from "../env";
import { escapeHtml, sendMail } from "../lib/mailer";

const BCRYPT_ROUNDS = 10;
// Hash de uma senha qualquer, usado para comparar quando o e-mail não existe. Assim o tempo de
// resposta é o mesmo nos dois casos e ninguém descobre quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-tempo-constante", BCRYPT_ROUNDS);

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clinicId: string | null;
  tokenVersion: number;
  platformAdmin: boolean;
  clinic: { id: string; name: string; modules: string[] } | null;
};

/**
 * Resultado de um caso de uso que abre sessão. `principal` vai para o cookie (a rota assina o
 * token); `session` é o que o front-end recebe. O token nunca aparece no corpo da resposta.
 */
async function opened(user: UserRow) {
  return {
    principal: { id: user.id, tokenVersion: user.tokenVersion },
    session: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        platformAdmin: user.platformAdmin,
        // A tela usa só para esconder o que não cabe; quem decide é o servidor, em cada requisição.
        // A conta da Arka não tem permissões de clínica: ela só vê a área da Arka.
        permissions: user.clinicId && !user.platformAdmin ? await permissionsFor(user.clinicId, user.role) : [],
      },
      clinic: user.clinic && !user.platformAdmin ? { id: user.clinic.id, name: user.clinic.name, modules: user.clinic.modules } : null,
      // Catálogo de abas (nome e descrição): o site monta o menu a partir dele.
      catalog: MODULE_CATALOG,
    },
  };
}

const RegisterSchema = z.object({
  clinicName: name("Nome da clínica"),
  name: name("Nome"),
  email,
  password,
});

/**
 * Cria a clínica e a primeira administradora, tudo ou nada.
 * A clínica nasce "em análise": ninguém entra até a Arka liberar (aba Liberação). Não abre sessão.
 */
export async function registerClinic(input: unknown) {
  const data = RegisterSchema.parse(input);
  if (await prisma.user.findUnique({ where: { email: data.email } })) {
    throw new HttpError(409, "E-mail já cadastrado");
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const clinic = await prisma.clinic.create({
    data: {
      name: data.clinicName,
      status: "PENDING",
      // Empresa nova recebe todas as abas do catálogo; a Arka ajusta na liberação se precisar.
      modules: MODULE_KEYS,
      users: { create: { name: data.name, email: data.email, passwordHash, role: "ADMIN" } },
      // Distribuição padrão das permissões; o espaço de dados (schema) só é criado quando a Arka liberar.
      rolePermissions: { create: defaultRolePermissionRows() },
    },
    select: { name: true },
  });
  return { status: "PENDING" as const, clinic: clinic.name };
}

const LoginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
  remember: z.boolean().optional().default(false),
});

/** `remember` ("lembrar de mim") só muda a duração da sessão; as regras de acesso são as mesmas. */
export async function login(input: unknown) {
  const data = LoginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { clinic: true } });
  const valid = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) throw new HttpError(401, "E-mail ou senha inválidos");
  // Só depois de a senha conferir: assim a mensagem de "em análise" não revela quem tem cadastro.
  if (!user.platformAdmin) {
    if (!user.clinic) throw new HttpError(401, "E-mail ou senha inválidos");
    assertClinicCanUse(user.clinic);
  }
  return { ...(await opened(user)), remember: data.remember };
}

export async function getSession(actor: { userId: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, include: { clinic: true } });
  return (await opened(user)).session;
}

/** Invalida todas as sessões da pessoa, em todos os aparelhos (inclusive a atual). */
export async function logoutEverywhere(actor: { userId: string }) {
  await prisma.user.update({ where: { id: actor.userId }, data: { tokenVersion: { increment: 1 } } });
}

const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(72), newPassword: password })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual",
  });

/**
 * Troca a senha exigindo a senha atual. Encerra as sessões de todos os outros aparelhos;
 * o aparelho atual recebe uma sessão nova e continua conectado.
 */
export async function changePassword(actor: { userId: string }, input: unknown) {
  const data = ChangePasswordSchema.parse(input);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Senha atual incorreta");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS),
      tokenVersion: { increment: 1 },
      passwordResets: { deleteMany: {} }, // links de "esqueci a senha" pendentes deixam de valer
    },
    include: { clinic: true },
  });
  return opened(updated);
}

/* ------------------------- Esqueci a senha ------------------------- */

const RESET_MINUTES = 30;
const MAX_RESETS_PER_HOUR = 3;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Envia um link de uso único para redefinir a senha. A resposta é SEMPRE a mesma, exista ou não
 * o e-mail, e o envio não é esperado: nem pelo texto nem pelo tempo de resposta dá para descobrir
 * quais e-mails estão cadastrados. Só o hash do token é guardado.
 */
export async function requestPasswordReset(input: unknown) {
  const data = z.object({ email }).parse(input);
  // Tempo mínimo fixo de resposta: com ou sem conta, a resposta demora o mesmo.
  const minimum = new Promise((r) => setTimeout(r, env.NODE_ENV === "test" ? 0 : RESET_MIN_RESPONSE_MS));
  try {
    await issueResetLink(data.email);
  } finally {
    await minimum;
  }
}

const RESET_MIN_RESPONSE_MS = 400;

async function issueResetLink(address: string) {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user || !user.active) return;

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_RESETS_PER_HOUR) return; // evita usar o sistema para lotar a caixa de alguém

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    // Links com mais de um dia não servem nem para a contagem: podem sair do banco.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, createdAt: { lt: new Date(Date.now() - 86_400_000) } } }),
    // Só o link mais recente vale. Os anteriores são invalidados (não apagados) para contar no limite por hora.
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000) },
    }),
  ]);

  // O token vai no fragmento (#): o navegador não o envia a nenhum servidor nem o grava em logs.
  const link = `${env.APP_URL ?? env.CLIENT_URL}/redefinir-senha#token=${token}`;
  void sendMail(resetEmail(user.name, user.email, link)).catch((err) =>
    console.error("Falha ao enviar o e-mail de redefinição de senha:", (err as Error).message),
  );
}

const ResetSchema = z.object({ token: z.string().min(20).max(200), password });

/** Troca a senha com o link do e-mail. Vale uma única vez e derruba todas as sessões abertas. */
export async function resetPassword(input: unknown) {
  const data = ResetSchema.parse(input);
  const invalid = new HttpError(400, "Este link é inválido ou expirou. Peça um novo.");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(data.token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active) throw invalid;

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    // Marca como usado só se ninguém usou antes (dois cliques ao mesmo tempo: um vence).
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw invalid;
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
  });
}

function resetEmail(userName: string, to: string, link: string) {
  const first = escapeHtml(userName.split(" ")[0]);
  const url = escapeHtml(link);
  return {
    to,
    subject: "Redefinir sua senha do Prontuário por Voz",
    text: [
      `Olá, ${userName.split(" ")[0]}!`,
      `Recebemos um pedido para redefinir a sua senha. Abra o link abaixo em até ${RESET_MINUTES} minutos:`,
      link,
      "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
      "Prontuário por Voz | Arka Tecnologia",
    ].join("\n\n"),
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#13285a">
  <h2 style="margin:0 0 12px">Redefinir sua senha</h2>
  <p>Olá, ${first}! Recebemos um pedido para redefinir a sua senha do <b>Prontuário por Voz</b>.</p>
  <p style="margin:24px 0"><a href="${url}" style="background:#03b9aa;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Criar nova senha</a></p>
  <p style="color:#555;font-size:14px">O link vale por ${RESET_MINUTES} minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
  <p style="color:#999;font-size:12px">Prontuário por Voz | Arka Tecnologia</p>
</div>`,
  };
}

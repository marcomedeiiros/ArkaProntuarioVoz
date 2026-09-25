import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { email, name, password } from "../lib/validation";
import { assertRole, type Actor } from "./policy";

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true };
const RoleEnum = z.enum(["ADMIN", "DOCTOR", "SECRETARY"]);

export async function listTeam(actor: Actor) {
  const users = await prisma.user.findMany({
    where: { clinicId: actor.clinicId },
    select: { ...select, _count: { select: { consultations: true } } },
    orderBy: { name: "asc" },
  });
  return users.map(({ _count, ...u }) => ({ ...u, consultationCount: _count.consultations }));
}

const CreateSchema = z.object({ name: name("Nome"), email, password, role: RoleEnum });

export async function addTeamMember(actor: Actor, input: unknown) {
  assertRole(actor, ["ADMIN"], "Apenas a administração pode adicionar pessoas à equipe");
  const data = CreateSchema.parse(input);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new HttpError(409, "E-mail já cadastrado");
  return prisma.user.create({
    data: {
      clinicId: actor.clinicId,
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
    select,
  });
}

const UpdateSchema = z
  .object({ active: z.boolean().optional(), role: RoleEnum.optional() })
  .refine((d) => d.active !== undefined || d.role !== undefined, "Nada para alterar");

/**
 * Ativa/desativa ou muda o perfil de alguém da equipe.
 * Regras: só administração; ninguém mexe no próprio acesso; a clínica nunca fica sem administrador ativo.
 */
export async function updateTeamMember(actor: Actor, userId: string, input: unknown) {
  assertRole(actor, ["ADMIN"], "Apenas a administração pode alterar a equipe");
  const data = UpdateSchema.parse(input);
  if (userId === actor.userId) throw new HttpError(400, "Você não pode alterar o seu próprio acesso");

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, clinicId: actor.clinicId } });
    if (!target) throw new HttpError(404, "Usuário não encontrado");

    const losesAdmin = target.role === "ADMIN" && target.active && (data.active === false || (data.role && data.role !== "ADMIN"));
    if (losesAdmin) {
      const otherAdmins = await tx.user.count({
        where: { clinicId: actor.clinicId, role: "ADMIN", active: true, id: { not: target.id } },
      });
      if (otherAdmins === 0) throw new HttpError(409, "A clínica precisa de pelo menos um administrador ativo");
    }

    return tx.user.update({
      where: { id: target.id },
      // Desativar também derruba as sessões abertas (reativar exige novo login).
      data: { ...data, ...(data.active === false && { tokenVersion: { increment: 1 } }) },
      select,
    });
  });
}

/** Administração encerra todas as sessões de alguém da equipe (ex.: celular perdido). */
export async function revokeMemberSessions(actor: Actor, userId: string) {
  assertRole(actor, ["ADMIN"], "Apenas a administração pode encerrar sessões da equipe");
  const { count } = await prisma.user.updateMany({
    where: { id: userId, clinicId: actor.clinicId },
    data: { tokenVersion: { increment: 1 } },
  });
  if (!count) throw new HttpError(404, "Usuário não encontrado");
}

/**
 * Apaga de vez a conta de alguém da equipe.
 * Regras: só administração; ninguém apaga a própria conta; quem já atendeu não pode ser apagado,
 * porque o prontuário precisa ser guardado (CFM 1.821/2007: 20 anos) com o nome de quem atendeu.
 * Nesses casos, desative o acesso. Como quem apaga é um administrador ativo e diferente do alvo,
 * a clínica nunca fica sem administrador.
 */
export async function deleteTeamMember(actor: Actor, userId: string) {
  assertRole(actor, ["ADMIN"], "Apenas a administração pode apagar contas da equipe");
  if (userId === actor.userId) throw new HttpError(400, "Você não pode apagar a sua própria conta");

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: userId, clinicId: actor.clinicId },
      select: { id: true, _count: { select: { consultations: true } } },
    });
    if (!target) throw new HttpError(404, "Usuário não encontrado");
    const n = target._count.consultations;
    if (n > 0) {
      throw new HttpError(
        409,
        `Esta pessoa tem ${n} consulta${n > 1 ? "s" : ""} no prontuário, que precisa ser guardado. Desative o acesso em vez de apagar.`,
      );
    }
    // Sem a linha no banco, qualquer sessão aberta dessa pessoa deixa de valer na próxima requisição.
    await tx.user.delete({ where: { id: target.id } });
  });
}

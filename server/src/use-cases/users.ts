import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { tenantFor } from "../lib/tenant";
import { inCatalogOrder, missingRequirement, MODULE_KEYS, ModuleKeySchema } from "../lib/modules";
import { HttpError } from "../lib/http-error";
import { email, name, password } from "../lib/validation";
import { assertPermission, assertRole, type Actor } from "./policy";
import type { Role } from "@prisma/client";

/**
 * Quem gerencia a equipe depende da matriz (permissão TEAM), mas mexer em conta de administrador
 * (criar, promover, alterar, apagar) é só para administrador: senão quem gerencia a equipe
 * poderia se autopromover por meio de outra conta. A conta da Arka não é gerenciada pela clínica.
 */
function assertCanManage(actor: Actor, target?: { role: Role; platformAdmin?: boolean }, newRole?: Role) {
  if (target?.platformAdmin) throw new HttpError(403, "A conta da Arka só é gerenciada pela própria Arka");
  if (actor.role !== "ADMIN" && (target?.role === "ADMIN" || newRole === "ADMIN")) {
    throw new HttpError(403, "Só a administração da clínica mexe em contas de administrador");
  }
}

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true, platformAdmin: true };
const RoleEnum = z.enum(["ADMIN", "DOCTOR", "SECRETARY"]);

export async function listTeam(actor: Actor) {
  assertPermission(actor, "TEAM");
  const users = await prisma.user.findMany({ where: { clinicId: actor.clinicId }, select, orderBy: { name: "asc" } });
  // As consultas ficam no schema da clínica: contamos lá quantas cada pessoa atendeu.
  const db = await tenantFor(actor.clinicId);
  const counts = await db.consultation.groupBy({ by: ["doctorId"], _count: true });
  return users.map((u) => ({ ...u, consultationCount: counts.find((c) => c.doctorId === u.id)?._count ?? 0 }));
}

const CreateSchema = z.object({ name: name("Nome"), email, password, role: RoleEnum });

export async function addTeamMember(actor: Actor, input: unknown) {
  assertPermission(actor, "TEAM");
  const data = CreateSchema.parse(input);
  assertCanManage(actor, undefined, data.role);
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
  assertPermission(actor, "TEAM");
  const data = UpdateSchema.parse(input);
  if (userId === actor.userId) throw new HttpError(400, "Você não pode alterar o seu próprio acesso");

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, clinicId: actor.clinicId } });
    if (!target) throw new HttpError(404, "Usuário não encontrado");
    assertCanManage(actor, target, data.role);

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
  assertPermission(actor, "TEAM");
  const target = await prisma.user.findFirst({
    where: { id: userId, clinicId: actor.clinicId },
    select: { id: true, role: true, platformAdmin: true },
  });
  if (!target) throw new HttpError(404, "Usuário não encontrado");
  assertCanManage(actor, target);
  await prisma.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } });
}

/**
 * Apaga de vez a conta de alguém da equipe.
 * Regras: só administração; ninguém apaga a própria conta; quem já atendeu não pode ser apagado,
 * porque o prontuário precisa ser guardado (CFM 1.821/2007: 20 anos) com o nome de quem atendeu.
 * Nesses casos, desative o acesso. Como quem apaga é um administrador ativo e diferente do alvo,
 * a clínica nunca fica sem administrador.
 */
export async function deleteTeamMember(actor: Actor, userId: string) {
  assertPermission(actor, "TEAM");
  if (userId === actor.userId) throw new HttpError(400, "Você não pode apagar a sua própria conta");

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: userId, clinicId: actor.clinicId },
      select: { id: true, role: true, platformAdmin: true },
    });
    if (!target) throw new HttpError(404, "Usuário não encontrado");
    assertCanManage(actor, target);
    const n = await (await tenantFor(actor.clinicId)).consultation.count({ where: { doctorId: target.id } });
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

/* ==================== Permissões dos cargos (administração da clínica) ==================== */

const EDITABLE_ROLES = ["DOCTOR", "SECRETARY"] as const;

/** Abas que a Arka liberou para a clínica e como a clínica distribuiu entre os cargos dela. */
export async function getRolePermissions(actor: Actor) {
  assertRole(actor, ["ADMIN"], "Só a administração da clínica define as permissões dos cargos");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: actor.clinicId }, select: { modules: true } });
  const rows = await prisma.clinicRolePermission.findMany({ where: { clinicId: actor.clinicId } });
  const modules = inCatalogOrder(clinic.modules);
  const of = (role: Role) => modules.filter((k) => rows.some((r) => r.role === role && r.permission === k));
  return { modules, DOCTOR: of("DOCTOR"), SECRETARY: of("SECRETARY") };
}

const KeyList = z.array(ModuleKeySchema).max(MODULE_KEYS.length);
const RolePermissionsSchema = z.strictObject(
  { DOCTOR: KeyList, SECRETARY: KeyList },
  { error: "Só os cargos Médico(a) e Secretária podem ser alterados" },
);

/**
 * A administração distribui entre os cargos só o que a Arka liberou para a clínica.
 * Vale na próxima requisição de cada pessoa (sem novo login).
 */
export async function setRolePermissions(actor: Actor, input: unknown) {
  assertRole(actor, ["ADMIN"], "Só a administração da clínica define as permissões dos cargos");
  const data = RolePermissionsSchema.parse(input);
  const { modules } = await prisma.clinic.findUniqueOrThrow({ where: { id: actor.clinicId }, select: { modules: true } });
  for (const role of EDITABLE_ROLES) {
    const keys = [...new Set(data[role])];
    if (keys.some((k) => !modules.includes(k))) throw new HttpError(400, "A clínica não tem essa aba liberada pela Arka");
    const problem = missingRequirement(keys);
    if (problem) throw new HttpError(400, problem);
  }
  await prisma.$transaction([
    prisma.clinicRolePermission.deleteMany({ where: { clinicId: actor.clinicId, role: { in: [...EDITABLE_ROLES] } } }),
    prisma.clinicRolePermission.createMany({
      data: EDITABLE_ROLES.flatMap((role) =>
        [...new Set(data[role])].map((permission) => ({ clinicId: actor.clinicId, role, permission })),
      ),
    }),
  ]);
  return getRolePermissions(actor);
}

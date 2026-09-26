import type { ClinicStatus, Role } from "@prisma/client";
import { HttpError } from "./http-error";
import { prisma } from "./prisma";
import { inCatalogOrder, MODULE_KEYS, MODULES, type ModuleKey } from "./modules";

/** Chaves de todas as abas do catálogo, na ordem do menu. */
export const ALL_PERMISSIONS: ModuleKey[] = MODULE_KEYS;

/** Distribuição padrão numa clínica nova, tirada do catálogo (a administração da clínica muda depois). */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<Role, "ADMIN">, ModuleKey[]> = {
  DOCTOR: MODULES.filter((m) => (m.defaultRoles as readonly string[]).includes("DOCTOR")).map((m) => m.key),
  SECRETARY: MODULES.filter((m) => (m.defaultRoles as readonly string[]).includes("SECRETARY")).map((m) => m.key),
};

/** Distribuição padrão no formato das linhas de ClinicRolePermission. */
export function defaultRolePermissionRows() {
  return (Object.entries(DEFAULT_ROLE_PERMISSIONS) as [Role, ModuleKey[]][]).flatMap(([role, keys]) =>
    keys.map((permission) => ({ role, permission })),
  );
}

/**
 * O que um cargo vê numa clínica = abas que a Arka liberou para a clínica ∩ o que a administração
 * da clínica deu ao cargo. A administração da clínica tem todas as abas da clínica (senão a clínica
 * poderia ficar sem quem gerencie a equipe).
 */
export async function permissionsFor(clinicId: string, role: Role): Promise<ModuleKey[]> {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { modules: true } });
  if (!clinic) return [];
  if (role === "ADMIN") return inCatalogOrder(clinic.modules);
  const rows = await prisma.clinicRolePermission.findMany({ where: { clinicId, role }, select: { permission: true } });
  return inCatalogOrder(clinic.modules).filter((k) => rows.some((r) => r.permission === k));
}

/** Clínica sem liberação ativa não usa o sistema. */
export function assertClinicCanUse(clinic: { status: ClinicStatus; statusReason: string | null }) {
  if (clinic.status === "ACTIVE") return;
  const reason = clinic.statusReason ? ` Motivo: ${clinic.statusReason}` : "";
  const message: Record<Exclude<ClinicStatus, "ACTIVE">, string> = {
    PENDING: "Seu cadastro está em análise pela Arka. Você recebe acesso assim que a clínica for liberada.",
    REJECTED: `O cadastro desta clínica não foi aprovado.${reason}`,
    SUSPENDED: `O acesso desta clínica está suspenso.${reason} Fale com a Arka.`,
  };
  throw new HttpError(403, message[clinic.status as Exclude<ClinicStatus, "ACTIVE">]);
}

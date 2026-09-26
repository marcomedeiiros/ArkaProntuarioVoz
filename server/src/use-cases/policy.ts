import type { Role } from "@prisma/client";
import { MODULES, type ModuleKey } from "../lib/modules";
import { HttpError } from "../lib/http-error";

/**
 * Quem está executando um caso de uso de CLÍNICA. Sempre vem do banco (ver requireAuth), nunca do
 * cliente. Contas da Arka não são Actor: elas não acessam dados de clínicas (ver PlatformActor).
 */
export interface Actor {
  userId: string;
  clinicId: string;
  role: Role;
  /** Módulos da clínica ∩ o que a clínica deu ao cargo, relidos a cada requisição. */
  permissions: ModuleKey[];
}

/** Conta da Arka: libera clínicas, define os módulos de cada uma e as configurações da plataforma. */
export interface PlatformActor {
  userId: string;
}

/** Mensagem de acesso negado de cada aba, a partir do catálogo. */
const denied = (key: ModuleKey) => `Seu cargo não tem acesso a ${MODULES.find((m) => m.key === key)?.label ?? key}`;

export const can = (actor: Actor, permission: ModuleKey) => actor.permissions.includes(permission);

export function assertPermission(actor: Actor, permission: ModuleKey) {
  if (!can(actor, permission)) throw new HttpError(403, denied(permission));
}

export function assertRole(actor: Actor, roles: Role[], message = "Sem permissão para esta ação") {
  if (!roles.includes(actor.role)) throw new HttpError(403, message);
}

/** Médico(a) só altera as próprias consultas; administração altera qualquer uma da clínica. */
export function assertCanEditConsultation(actor: Actor, consultation: { doctorId: string }) {
  assertPermission(actor, "CONSULTATIONS");
  if (actor.role !== "ADMIN" && consultation.doctorId !== actor.userId) {
    throw new HttpError(403, "Somente o(a) médico(a) responsável pode alterar esta consulta");
  }
}

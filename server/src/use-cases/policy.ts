import type { Role } from "@prisma/client";
import { HttpError } from "../lib/http-error";

/** Quem está executando o caso de uso. Sempre vem do banco (ver requireAuth), nunca do cliente. */
export interface Actor {
  userId: string;
  clinicId: string;
  role: Role;
}

export const CLINICAL_ROLES: Role[] = ["ADMIN", "DOCTOR"];

export function assertRole(actor: Actor, roles: Role[], message = "Sem permissão para esta ação") {
  if (!roles.includes(actor.role)) throw new HttpError(403, message);
}

export const isClinical = (actor: Actor) => CLINICAL_ROLES.includes(actor.role);

/** Médico(a) só altera as próprias consultas; administração altera qualquer uma da clínica. */
export function assertCanEditConsultation(actor: Actor, consultation: { doctorId: string }) {
  assertRole(actor, CLINICAL_ROLES, "Apenas profissionais de saúde acessam consultas");
  if (actor.role !== "ADMIN" && consultation.doctorId !== actor.userId) {
    throw new HttpError(403, "Somente o(a) médico(a) responsável pode alterar esta consulta");
  }
}

import { z } from "zod";
import type { AppointmentStatus } from "../generated/tenant";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { tenantFor, type TenantDb } from "../lib/tenant";
import { id, optionalText } from "../lib/validation";
import { assertPermission, can, type Actor } from "./policy";

/*
 * Agenda da clínica. Regras (todas aqui no servidor):
 * - só atende quem é profissional da clínica (administração ou médico(a)) e está ativo;
 * - o mesmo profissional não tem dois horários ao mesmo tempo (cancelados e faltas não contam);
 * - horário entre 5 minutos e 4 horas, com fim depois do início;
 * - iniciar o atendimento abre a consulta já ligada ao horário (precisa da aba Consultas).
 */

const MIN_MINUTES = 5;
const MAX_MINUTES = 240;
const MAX_RANGE_DAYS = 62;
/** Status que ocupam a agenda do profissional. */
const ACTIVE: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED", "ARRIVED", "DONE"];

const include = {
  patient: { select: { id: true, name: true, birthDate: true, guardianName: true, guardianPhone: true, allergies: true } },
} as const;

const isoDate = z.coerce.date({ error: "Data inválida" });

/** Profissionais que podem ter agenda (para a lista de escolha na tela). */
export async function listProfessionals(actor: Actor) {
  assertPermission(actor, "SCHEDULE");
  return prisma.user.findMany({
    where: { clinicId: actor.clinicId, active: true, role: { in: ["ADMIN", "DOCTOR"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

const RangeSchema = z
  .object({ from: isoDate, to: isoDate, doctorId: id.optional() })
  .refine((r) => r.to > r.from, "O fim do período precisa ser depois do início")
  .refine((r) => r.to.getTime() - r.from.getTime() <= MAX_RANGE_DAYS * 86_400_000, `Período de até ${MAX_RANGE_DAYS} dias`);

export async function listAppointments(actor: Actor, query: unknown) {
  assertPermission(actor, "SCHEDULE");
  const { from, to, doctorId } = RangeSchema.parse(query);
  const db = await tenantFor(actor.clinicId);
  return db.appointment.findMany({
    // Tudo o que encosta no período (inclusive horários que começam antes e terminam dentro).
    where: { startsAt: { lt: to }, endsAt: { gt: from }, ...(doctorId && { doctorId }) },
    include,
    orderBy: { startsAt: "asc" },
  });
}

const KINDS = ["PUERICULTURA", "URGENCIA", "RETORNO", "OUTRO"] as const;
const STATUSES = ["SCHEDULED", "CONFIRMED", "ARRIVED", "DONE", "CANCELED", "NO_SHOW"] as const;

const TimeFields = {
  startsAt: isoDate,
  endsAt: isoDate,
};

function assertDuration(startsAt: Date, endsAt: Date) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (minutes < MIN_MINUTES) throw new HttpError(400, "O horário precisa terminar depois de começar (mínimo de 5 minutos)");
  if (minutes > MAX_MINUTES) throw new HttpError(400, "Um horário pode ter no máximo 4 horas");
  const year = startsAt.getUTCFullYear();
  if (year < 2000 || year > new Date().getUTCFullYear() + 2) throw new HttpError(400, "Data fora do período permitido");
}

async function professional(actor: Actor, doctorId: string) {
  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, clinicId: actor.clinicId, active: true, role: { in: ["ADMIN", "DOCTOR"] } },
    select: { id: true, name: true },
  });
  if (!doctor) throw new HttpError(400, "Escolha um profissional desta clínica");
  return doctor;
}

const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** O mesmo profissional não pode ter dois horários sobrepostos. */
async function assertFree(db: TenantDb, doctorId: string, startsAt: Date, endsAt: Date, ignoreId?: string) {
  const clash = await db.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ACTIVE },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(ignoreId && { id: { not: ignoreId } }),
    },
    include: { patient: { select: { name: true } } },
  });
  if (clash) {
    throw new HttpError(
      409,
      `${clash.doctorName} já tem horário das ${hhmm(clash.startsAt)} às ${hhmm(clash.endsAt)} com ${clash.patient.name}`,
    );
  }
}

const CreateSchema = z.object({
  patientId: id,
  doctorId: id,
  ...TimeFields,
  kind: z.enum(KINDS).default("PUERICULTURA"),
  notes: optionalText(500),
});

export async function createAppointment(actor: Actor, input: unknown) {
  assertPermission(actor, "SCHEDULE");
  const data = CreateSchema.parse(input);
  assertDuration(data.startsAt, data.endsAt);
  const db = await tenantFor(actor.clinicId);
  if (!(await db.patient.findUnique({ where: { id: data.patientId }, select: { id: true } }))) {
    throw new HttpError(400, "Paciente não encontrado");
  }
  const doctor = await professional(actor, data.doctorId);
  await assertFree(db, doctor.id, data.startsAt, data.endsAt);
  return db.appointment.create({ data: { ...data, doctorName: doctor.name }, include });
}

const UpdateSchema = z.strictObject(
  {
    doctorId: id.optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    kind: z.enum(KINDS).optional(),
    status: z.enum(STATUSES).optional(),
    notes: optionalText(500),
  },
  { error: "Campo não permitido nesta alteração" },
);

/** Remarcar, trocar o profissional, mudar a etapa (confirmado, chegou, faltou...) ou as observações. */
export async function updateAppointment(actor: Actor, appointmentId: string, input: unknown) {
  assertPermission(actor, "SCHEDULE");
  const data = UpdateSchema.parse(input);
  const db = await tenantFor(actor.clinicId);
  const current = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!current) throw new HttpError(404, "Horário não encontrado");

  const startsAt = data.startsAt ?? current.startsAt;
  const endsAt = data.endsAt ?? current.endsAt;
  const status = data.status ?? current.status;
  const doctor = data.doctorId && data.doctorId !== current.doctorId ? await professional(actor, data.doctorId) : null;
  const doctorId = doctor?.id ?? current.doctorId;

  if (data.startsAt || data.endsAt) assertDuration(startsAt, endsAt);
  // Só confere choque de horário se o horário continua ocupando a agenda.
  if (ACTIVE.includes(status) && (data.startsAt || data.endsAt || doctor || !ACTIVE.includes(current.status))) {
    await assertFree(db, doctorId, startsAt, endsAt, current.id);
  }
  return db.appointment.update({
    where: { id: current.id },
    data: { ...data, ...(doctor && { doctorName: doctor.name }) },
    include,
  });
}

/** Apagar é para horário marcado por engano; desmarcar de verdade é o status "cancelado". */
export async function deleteAppointment(actor: Actor, appointmentId: string) {
  assertPermission(actor, "SCHEDULE");
  const db = await tenantFor(actor.clinicId);
  const { count } = await db.appointment.deleteMany({ where: { id: appointmentId } });
  if (!count) throw new HttpError(404, "Horário não encontrado");
}

/**
 * Começa o atendimento: abre a consulta do paciente (ou reaproveita a já aberta por este horário)
 * com quem está logado como profissional, e marca o horário como atendido.
 */
export async function startFromAppointment(actor: Actor, appointmentId: string) {
  assertPermission(actor, "SCHEDULE");
  if (!can(actor, "CONSULTATIONS")) throw new HttpError(403, "Seu cargo não tem acesso a Consultas");
  const db = await tenantFor(actor.clinicId);
  const appt = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new HttpError(404, "Horário não encontrado");
  if (appt.status === "CANCELED" || appt.status === "NO_SHOW") {
    throw new HttpError(409, "Este horário foi cancelado ou marcado como falta");
  }
  if (appt.consultationId) return { consultationId: appt.consultationId };

  const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  const consultation = await db.$transaction(async (tx) => {
    const c = await tx.consultation.create({
      data: {
        patientId: appt.patientId,
        doctorId: actor.userId,
        doctorName: me.name,
        template: appt.kind === "PUERICULTURA" ? "PUERICULTURA" : "URGENCIA",
      },
      select: { id: true },
    });
    await tx.appointment.update({ where: { id: appt.id }, data: { consultationId: c.id, status: "DONE" } });
    return c;
  });
  return { consultationId: consultation.id };
}

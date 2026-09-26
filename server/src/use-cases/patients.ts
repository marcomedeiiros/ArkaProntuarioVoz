import { z } from "zod";
import { tenantFor } from "../lib/tenant";
import { HttpError } from "../lib/http-error";
import { dateOnly, name, optionalText, phoneBR } from "../lib/validation";
import { assertPermission, type Actor } from "./policy";

/** Pediatria atende até a adolescência; aceitamos até 21 anos para acompanhar a transição. */
const MAX_AGE_YEARS = 21;

const PatientSchema = z.object({
  name: name("Nome da criança"),
  birthDate: dateOnly.refine((d) => d.getTime() <= Date.now(), "A data de nascimento não pode estar no futuro").refine((d) => {
    const limit = new Date();
    limit.setUTCFullYear(limit.getUTCFullYear() - MAX_AGE_YEARS);
    return d >= limit;
  }, `Paciente acima de ${MAX_AGE_YEARS} anos não é atendido na pediatria`),
  sex: z.enum(["M", "F"], "Informe o sexo"),
  guardianName: name("Nome do responsável"),
  guardianPhone: phoneBR,
  allergies: optionalText(500),
  notes: optionalText(2000),
});

const SearchSchema = z.string().trim().max(80).optional();

export async function searchPatients(actor: Actor, query: unknown) {
  assertPermission(actor, "PATIENTS");
  const db = await tenantFor(actor.clinicId);
  const q = SearchSchema.parse(typeof query === "string" ? query : undefined);
  return db.patient.findMany({
    where: {
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { guardianName: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    take: 100,
  });
}

export async function registerPatient(actor: Actor, input: unknown) {
  assertPermission(actor, "PATIENTS");
  const db = await tenantFor(actor.clinicId);
  const data = PatientSchema.parse(input);
  return db.patient.create({ data: { ...data } });
}

/** Ficha do paciente com o histórico. O histórico traz só metadados (sem conteúdo clínico). */
export async function getPatientRecord(actor: Actor, patientId: string) {
  assertPermission(actor, "PATIENTS");
  const db = await tenantFor(actor.clinicId);
  const patient = await db.patient.findFirst({
    where: { id: patientId },
    include: {
      consultations: {
        orderBy: { createdAt: "desc" },
        select: { id: true, template: true, status: true, createdAt: true, doctorName: true },
      },
    },
  });
  if (!patient) throw new HttpError(404, "Paciente não encontrado");
  const { consultations, ...rest } = patient;
  return { ...rest, consultations: consultations.map(({ doctorName, ...c }) => ({ ...c, doctor: { name: doctorName } })) };
}

export async function updatePatient(actor: Actor, patientId: string, input: unknown) {
  assertPermission(actor, "PATIENTS");
  const db = await tenantFor(actor.clinicId);
  const data = PatientSchema.parse(input);
  const { count } = await db.patient.updateMany({ where: { id: patientId }, data });
  if (!count) throw new HttpError(404, "Paciente não encontrado");
  return db.patient.findUniqueOrThrow({ where: { id: patientId } });
}

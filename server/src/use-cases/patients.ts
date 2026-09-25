import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { dateOnly, name, optionalText, phoneBR } from "../lib/validation";
import type { Actor } from "./policy";

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
  const q = SearchSchema.parse(typeof query === "string" ? query : undefined);
  return prisma.patient.findMany({
    where: {
      clinicId: actor.clinicId,
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
  const data = PatientSchema.parse(input);
  return prisma.patient.create({ data: { ...data, clinicId: actor.clinicId } });
}

/** Ficha do paciente com o histórico. O histórico traz só metadados (sem conteúdo clínico). */
export async function getPatientRecord(actor: Actor, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: actor.clinicId },
    include: {
      consultations: {
        orderBy: { createdAt: "desc" },
        select: { id: true, template: true, status: true, createdAt: true, doctor: { select: { name: true } } },
      },
    },
  });
  if (!patient) throw new HttpError(404, "Paciente não encontrado");
  return patient;
}

export async function updatePatient(actor: Actor, patientId: string, input: unknown) {
  const data = PatientSchema.parse(input);
  const { count } = await prisma.patient.updateMany({ where: { id: patientId, clinicId: actor.clinicId }, data });
  if (!count) throw new HttpError(404, "Paciente não encontrado");
  return prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
}

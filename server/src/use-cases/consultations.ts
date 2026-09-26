import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Prisma, type ConsultationStatus } from "../generated/tenant";
import { prisma } from "../lib/prisma";
import { tenantFor, tenantSchema, type TenantDb } from "../lib/tenant";
import { HttpError } from "../lib/http-error";
import { id } from "../lib/validation";
import { decodePcm16, hasSpeech } from "../lib/audio";
import { generateClinicalDocs } from "../services/scribe";
import { transcribe } from "../services/transcriber";
import { assertCanEditConsultation, assertPermission, type Actor } from "./policy";

const MIN_TRANSCRIPT = 40;
const MAX_TRANSCRIPT = 60_000;

const include = {
  patient: true,
  transactions: { include: { category: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ConsultationInclude;

/** A tela recebe "doctor: { id, name }"; o nome fica gravado na consulta (o prontuário guarda quem atendeu). */
function withDoctor<T extends { doctorId: string; doctorName: string }>(c: T) {
  return { ...c, doctor: { id: c.doctorId, name: c.doctorName } };
}

async function loadConsultation(db: TenantDb, consultationId: string) {
  const consultation = await db.consultation.findFirst({ where: { id: consultationId }, include });
  if (!consultation) throw new HttpError(404, "Consulta não encontrada");
  return consultation;
}

function assertNotFinalized(status: ConsultationStatus) {
  if (status === "FINALIZED") throw new HttpError(409, "Consulta finalizada. Reabra para editar.");
}

/* ---------------------------- Leitura ---------------------------- */

const ListSchema = z.object({
  status: z.enum(["DRAFT", "GENERATED", "FINALIZED"]).optional(),
  q: z.string().trim().max(80).optional(),
});

export async function listConsultations(actor: Actor, query: unknown) {
  assertPermission(actor, "CONSULTATIONS");
  const { status, q } = ListSchema.parse(query);
  const db = await tenantFor(actor.clinicId);
  const rows = await db.consultation.findMany({
    where: {
      ...(status && { status }),
      ...(q && { patient: { name: { contains: q, mode: "insensitive" } } }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      template: true,
      status: true,
      createdAt: true,
      patient: { select: { id: true, name: true } },
      doctorId: true,
      doctorName: true,
    },
  });
  return rows.map(withDoctor);
}

export async function countConsultationsByStatus(actor: Actor) {
  assertPermission(actor, "CONSULTATIONS");
  const db = await tenantFor(actor.clinicId);
  const rows = await db.consultation.groupBy({ by: ["status"], _count: true });
  const counts = { ALL: 0, DRAFT: 0, GENERATED: 0, FINALIZED: 0 };
  for (const r of rows) {
    counts[r.status] = r._count;
    counts.ALL += r._count;
  }
  return counts;
}

export async function getConsultation(actor: Actor, consultationId: string) {
  assertPermission(actor, "CONSULTATIONS");
  const db = await tenantFor(actor.clinicId);
  return withDoctor(await loadConsultation(db, consultationId));
}

/* ---------------------------- Escrita ---------------------------- */

const StartSchema = z.object({ patientId: id, template: z.enum(["PUERICULTURA", "URGENCIA"]) });

export async function startConsultation(actor: Actor, input: unknown) {
  assertPermission(actor, "CONSULTATIONS");
  const data = StartSchema.parse(input);
  const db = await tenantFor(actor.clinicId);
  const patient = await db.patient.findFirst({ where: { id: data.patientId } });
  if (!patient) throw new HttpError(404, "Paciente não encontrado");
  // O nome de quem atende fica gravado na consulta: o prontuário mantém o nome mesmo se a conta mudar.
  const doctor = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  return withDoctor(
    await db.consultation.create({ data: { ...data, doctorId: actor.userId, doctorName: doctor.name }, include }),
  );
}

const UpdateSchema = z.strictObject(
  {
    template: z.enum(["PUERICULTURA", "URGENCIA"]).optional(),
    transcript: z.string().max(MAX_TRANSCRIPT, "Transcrição longa demais").optional(),
    weightKg: z.number().min(0.3, "Peso inválido").max(200, "Peso inválido").nullable().optional(),
    heightCm: z.number().min(20, "Estatura inválida").max(220, "Estatura inválida").nullable().optional(),
    evolution: z.string().max(20_000).optional(),
    prescriptionNotes: z.string().max(5_000).optional(),
    parentGuide: z.string().max(10_000).optional(),
  },
  { error: "Campo não permitido nesta alteração" },
);

const GENERATED_FIELDS = ["evolution", "prescriptionNotes", "parentGuide"] as const;

/** Edita a captura ou os textos gerados. Regras: responsável/adm, não finalizada, textos só após gerar. */
export async function updateConsultation(actor: Actor, consultationId: string, input: unknown) {
  const db = await tenantFor(actor.clinicId);
  const consultation = await loadConsultation(db, consultationId);
  assertCanEditConsultation(actor, consultation);
  assertNotFinalized(consultation.status);
  const data = UpdateSchema.parse(input);
  if (consultation.status === "DRAFT" && GENERATED_FIELDS.some((f) => data[f] !== undefined)) {
    throw new HttpError(409, "Gere os documentos antes de editá-los");
  }
  return withDoctor(await db.consultation.update({ where: { id: consultation.id }, data, include }));
}

// Evita duas gerações simultâneas da mesma consulta (clique duplo, abas repetidas).
// Em mais de uma instância do servidor, trocar por um lock no banco ou no Redis.
const generating = new Set<string>();

export async function generateDocuments(actor: Actor, consultationId: string) {
  const db = await tenantFor(actor.clinicId);
  const consultation = await loadConsultation(db, consultationId);
  assertCanEditConsultation(actor, consultation);
  assertNotFinalized(consultation.status);
  if (consultation.transcript.trim().length < MIN_TRANSCRIPT) {
    throw new HttpError(400, "A transcrição está muito curta para gerar o prontuário");
  }
  if (generating.has(consultation.id)) throw new HttpError(409, "Os documentos desta consulta já estão sendo gerados");

  generating.add(consultation.id);
  try {
    const docs = await generateClinicalDocs({
      template: consultation.template,
      transcript: consultation.transcript,
      patient: consultation.patient,
      weightKg: consultation.weightKg?.toNumber() ?? null,
      heightCm: consultation.heightCm?.toNumber() ?? null,
      consultationDate: consultation.createdAt,
    });
    return withDoctor(await db.consultation.update({
      where: { id: consultation.id },
      data: {
        evolution: docs.evolucao,
        prescription: docs.prescricao,
        prescriptionNotes: docs.orientacoesReceita,
        parentGuide: docs.guiaPais,
        alerts: docs.alertas,
        status: "GENERATED",
        generatedAt: new Date(),
      },
      include,
    }));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, "IA sobrecarregada, tente em instantes");
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("Anthropic: chave inválida ou sem permissão (confira ANTHROPIC_API_KEY no server/.env)");
      throw new HttpError(503, "A IA não está configurada (chave da Anthropic inválida). Avise a Arka.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      throw new HttpError(502, "Falha ao comunicar com a IA");
    }
    throw err;
  } finally {
    generating.delete(consultation.id);
  }
}

/**
 * Transcreve um trecho de áudio da consulta e anexa o texto ao fim da transcrição, no banco.
 * Mesmas regras de quem edita a transcrição: profissional responsável (ou administração) e
 * consulta não finalizada. Gravar no servidor garante que nada se perde se a tela for fechada
 * enquanto o trecho é processado; a tela recebe o texto e faz a mesma junção localmente.
 */
export async function transcribeAudio(actor: Actor, consultationId: string, body: unknown) {
  assertPermission(actor, "CONSULTATIONS");
  const db = await tenantFor(actor.clinicId);
  const consultation = await db.consultation.findFirst({
    where: { id: consultationId },
    select: { id: true, doctorId: true, status: true },
  });
  if (!consultation) throw new HttpError(404, "Consulta não encontrada");
  assertCanEditConsultation(actor, consultation);
  assertNotFinalized(consultation.status);

  const samples = decodePcm16(body);
  if (!hasSpeech(samples)) return { text: "" };
  const text = await transcribe(samples);
  if (!text) return { text };

  // Junção atômica no banco: não sobrescreve edições feitas enquanto o Whisper trabalhava.
  // A finalização pode ter acontecido nesse meio-tempo, por isso o status é conferido de novo aqui.
  const table = Prisma.raw(`"${tenantSchema(actor.clinicId)}"."Consultation"`);
  const updated = await db.$executeRaw`
    UPDATE ${table}
    SET "transcript" = CASE WHEN "transcript" = '' THEN ${text} ELSE "transcript" || ' ' || ${text} END,
        "updatedAt" = now()
    WHERE "id" = ${consultation.id}
      AND "status" <> 'FINALIZED'
      AND length("transcript") + length(${text}) < ${MAX_TRANSCRIPT}`;
  if (updated === 0) {
    const current = await db.consultation.findUniqueOrThrow({ where: { id: consultation.id }, select: { status: true } });
    assertNotFinalized(current.status);
    throw new HttpError(409, "Transcrição longa demais");
  }
  return { text };
}

/** Só finaliza o que já foi gerado e tem evolução. Depois disso nada muda até reabrir. */
export async function finalizeConsultation(actor: Actor, consultationId: string) {
  const db = await tenantFor(actor.clinicId);
  const consultation = await loadConsultation(db, consultationId);
  assertCanEditConsultation(actor, consultation);
  if (consultation.status !== "GENERATED") {
    throw new HttpError(409, consultation.status === "FINALIZED" ? "A consulta já está finalizada" : "Gere os documentos antes de finalizar");
  }
  if (!consultation.evolution?.trim()) throw new HttpError(409, "A evolução está vazia");
  return withDoctor(await db.consultation.update({ where: { id: consultation.id }, data: { status: "FINALIZED" }, include }));
}

export async function reopenConsultation(actor: Actor, consultationId: string) {
  const db = await tenantFor(actor.clinicId);
  const consultation = await loadConsultation(db, consultationId);
  assertCanEditConsultation(actor, consultation);
  if (consultation.status !== "FINALIZED") throw new HttpError(409, "Só é possível reabrir uma consulta finalizada");
  return withDoctor(await db.consultation.update({ where: { id: consultation.id }, data: { status: "GENERATED" }, include }));
}

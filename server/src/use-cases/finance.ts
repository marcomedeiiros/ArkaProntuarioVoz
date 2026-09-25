import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http-error";
import { dateOnly, id, money, month, name, optionalText } from "../lib/validation";
import type { Actor } from "./policy";

const TYPES = ["INCOME", "EXPENSE"] as const;
const METHODS = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "CONVENIO", "OUTRO"] as const;

/** Datas de lançamento são meia-noite UTC. "2026-09" -> [início do mês, início do mês seguinte). Sem mês, usa o atual. */
function monthRange(value: unknown): { gte: Date; lt: Date } {
  const m = month.parse(typeof value === "string" && value ? value : undefined);
  const now = new Date();
  const year = m ? Number(m.slice(0, 4)) : now.getFullYear();
  const idx = m ? Number(m.slice(5, 7)) - 1 : now.getMonth();
  return { gte: new Date(Date.UTC(year, idx, 1)), lt: new Date(Date.UTC(year, idx + 1, 1)) };
}

const transactionInclude = { category: true, patient: { select: { id: true, name: true } } } as const;

/* ---------------------------- Categorias ---------------------------- */

export async function listCategories(actor: Actor) {
  return prisma.financialCategory.findMany({
    where: { clinicId: actor.clinicId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

const CategorySchema = z.object({ name: name("Nome da categoria"), type: z.enum(TYPES) });

export async function createCategory(actor: Actor, input: unknown) {
  const data = CategorySchema.parse(input);
  return prisma.financialCategory.create({ data: { ...data, clinicId: actor.clinicId } });
}

/* ---------------------------- Lançamentos ---------------------------- */

const earliest = () => new Date(Date.UTC(2000, 0, 1));
const latest = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
};

const TransactionSchema = z.object({
  type: z.enum(TYPES),
  status: z.enum(["PAID", "PENDING"]).default("PAID"),
  amount: money,
  method: z.enum(METHODS),
  date: dateOnly.refine((d) => d >= earliest() && d <= latest(), "Data do lançamento fora do período permitido"),
  description: optionalText(200),
  categoryId: id,
  patientId: id.nullish(),
  consultationId: id.nullish(),
});

export async function listTransactions(actor: Actor, monthParam: unknown) {
  return prisma.transaction.findMany({
    where: { clinicId: actor.clinicId, date: monthRange(monthParam) },
    include: transactionInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Registra uma entrada ou saída. Regras:
 * - categoria da clínica e do mesmo tipo do lançamento;
 * - paciente e consulta precisam ser da clínica;
 * - pagamento de consulta é sempre ENTRADA e fica ligado ao paciente da própria consulta.
 */
export async function recordTransaction(actor: Actor, input: unknown) {
  const data = TransactionSchema.parse(input);

  const category = await prisma.financialCategory.findFirst({ where: { id: data.categoryId, clinicId: actor.clinicId } });
  if (!category) throw new HttpError(400, "Categoria inválida");
  if (category.type !== data.type) throw new HttpError(400, "A categoria não corresponde ao tipo do lançamento");

  let patientId = data.patientId ?? null;
  if (data.consultationId) {
    const consultation = await prisma.consultation.findFirst({
      where: { id: data.consultationId, clinicId: actor.clinicId },
      select: { patientId: true },
    });
    if (!consultation) throw new HttpError(400, "Consulta inválida");
    if (data.type !== "INCOME") throw new HttpError(400, "Pagamento de consulta deve ser uma entrada");
    if (patientId && patientId !== consultation.patientId) {
      throw new HttpError(400, "O paciente não corresponde ao da consulta");
    }
    patientId = consultation.patientId;
  } else if (patientId && !(await prisma.patient.findFirst({ where: { id: patientId, clinicId: actor.clinicId } }))) {
    throw new HttpError(400, "Paciente inválido");
  }

  return prisma.transaction.create({
    data: {
      clinicId: actor.clinicId,
      type: data.type,
      status: data.status,
      amount: new Prisma.Decimal(data.amount),
      method: data.method,
      date: data.date,
      description: data.description,
      categoryId: category.id,
      patientId,
      consultationId: data.consultationId ?? null,
    },
    include: transactionInclude,
  });
}

const StatusSchema = z.object({ status: z.enum(["PAID", "PENDING"]) });

export async function setTransactionStatus(actor: Actor, transactionId: string, input: unknown) {
  const { status } = StatusSchema.parse(input);
  const { count } = await prisma.transaction.updateMany({ where: { id: transactionId, clinicId: actor.clinicId }, data: { status } });
  if (!count) throw new HttpError(404, "Lançamento não encontrado");
  return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: transactionInclude });
}

export async function deleteTransaction(actor: Actor, transactionId: string) {
  const { count } = await prisma.transaction.deleteMany({ where: { id: transactionId, clinicId: actor.clinicId } });
  if (!count) throw new HttpError(404, "Lançamento não encontrado");
}

/* ---------------------------- Resumo ---------------------------- */

export async function monthlySummary(actor: Actor, monthParam: unknown) {
  const where = { clinicId: actor.clinicId, date: monthRange(monthParam) };

  const [byType, byMethod, byCategory, categories] = await Promise.all([
    prisma.transaction.groupBy({ by: ["type", "status"], where, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["method"], where: { ...where, type: "INCOME", status: "PAID" }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["categoryId"], where: { ...where, status: "PAID" }, _sum: { amount: true } }),
    prisma.financialCategory.findMany({ where: { clinicId: actor.clinicId } }),
  ]);

  const sum = (type: string, status: string) =>
    byType.find((r) => r.type === type && r.status === status)?._sum.amount?.toNumber() ?? 0;
  const income = sum("INCOME", "PAID");
  const expense = sum("EXPENSE", "PAID");

  return {
    income,
    expense,
    balance: Math.round((income - expense) * 100) / 100,
    pendingIncome: sum("INCOME", "PENDING"),
    pendingExpense: sum("EXPENSE", "PENDING"),
    byMethod: byMethod
      .map((r) => ({ method: r.method, total: r._sum.amount?.toNumber() ?? 0 }))
      .sort((a, b) => b.total - a.total),
    byCategory: byCategory
      .map((r) => {
        const cat = categories.find((c) => c.id === r.categoryId);
        return { categoryId: r.categoryId, name: cat?.name ?? "?", type: cat?.type, total: r._sum.amount?.toNumber() ?? 0 };
      })
      .sort((a, b) => b.total - a.total),
  };
}

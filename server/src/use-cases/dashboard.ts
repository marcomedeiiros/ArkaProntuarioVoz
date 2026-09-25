import { prisma } from "../lib/prisma";
import { isClinical, type Actor } from "./policy";
import { monthlySummary } from "./finance";

/**
 * Números e listas da tela inicial, calculados no servidor.
 * "Hoje" usa o fuso de Brasília para bater com o dia do consultório.
 */
const CLINIC_TZ_OFFSET_HOURS = -3;

function todayRange() {
  const now = new Date(Date.now() + CLINIC_TZ_OFFSET_HOURS * 3_600_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - CLINIC_TZ_OFFSET_HOURS * 3_600_000);
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}

const listSelect = {
  id: true,
  template: true,
  status: true,
  createdAt: true,
  patient: { select: { id: true, name: true } },
  doctor: { select: { name: true } },
} as const;

export async function getDashboard(actor: Actor) {
  const finance = await monthlySummary(actor, undefined);
  const financeCard = { income: finance.income, pendingIncome: finance.pendingIncome };

  if (!isClinical(actor)) return { clinical: null, finance: financeCard };

  const where = { clinicId: actor.clinicId };
  const [todayCount, pendingCount, pending, recent] = await Promise.all([
    prisma.consultation.count({ where: { ...where, createdAt: todayRange() } }),
    prisma.consultation.count({ where: { ...where, status: { not: "FINALIZED" } } }),
    prisma.consultation.findMany({
      where: { ...where, status: { not: "FINALIZED" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: listSelect,
    }),
    prisma.consultation.findMany({ where, orderBy: { createdAt: "desc" }, take: 6, select: listSelect }),
  ]);

  return { clinical: { todayCount, pendingCount, pending, recent }, finance: financeCard };
}

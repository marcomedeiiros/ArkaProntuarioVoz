import { tenantFor } from "../lib/tenant";
import { can, type Actor } from "./policy";
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
  doctorName: true,
} as const;

const withDoctor = <T extends { doctorName: string }>({ doctorName, ...c }: T) => ({ ...c, doctor: { name: doctorName } });

export async function getDashboard(actor: Actor) {
  // Cada bloco só aparece para quem tem a permissão correspondente na matriz da Arka.
  const finance = can(actor, "FINANCE") ? await monthlySummary(actor, undefined) : null;
  const financeCard = finance && { income: finance.income, pendingIncome: finance.pendingIncome };

  if (!can(actor, "CONSULTATIONS")) return { clinical: null, finance: financeCard };

  const db = await tenantFor(actor.clinicId);
  const [todayCount, pendingCount, pending, recent] = await Promise.all([
    db.consultation.count({ where: { createdAt: todayRange() } }),
    db.consultation.count({ where: { status: { not: "FINALIZED" } } }),
    db.consultation.findMany({
      where: { status: { not: "FINALIZED" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: listSelect,
    }),
    db.consultation.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: listSelect }),
  ]);

  return {
    clinical: { todayCount, pendingCount, pending: pending.map(withDoctor), recent: recent.map(withDoctor) },
    finance: financeCard,
  };
}

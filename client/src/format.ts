import type { ConsultationStatus, PaymentMethod, Role, Template } from "./types";

export const brl = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Idade como pediatra fala: dias no primeiro mês, meses até 2 anos, "anos e meses" até 6 e,
 * depois disso, só anos. Com `atIso`, calcula a idade que a criança tinha naquela data.
 */
export function ageLabel(birthIso: string, atIso?: string): string {
  const birth = new Date(birthIso);
  const at = atIso ? new Date(atIso) : new Date();
  let months = (at.getFullYear() - birth.getUTCFullYear()) * 12 + (at.getMonth() - birth.getUTCMonth());
  if (at.getDate() < birth.getUTCDate()) months--;
  if (months < 1) {
    const days = Math.max(0, Math.floor((at.getTime() - birth.getTime()) / 86_400_000));
    return days === 0 ? "recém-nascido" : plural(days, "dia", "dias");
  }
  if (months < 24) return plural(months, "mês", "meses");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years < 6 && rest > 0) return `${plural(years, "ano", "anos")} e ${plural(rest, "mês", "meses")}`;
  return plural(years, "ano", "anos");
}

/** "1 paciente", "6 pacientes" (nada de "paciente(s)"). */
export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export const TEMPLATE_LABEL: Record<Template, string> = {
  PUERICULTURA: "Puericultura",
  URGENCIA: "Consulta geral / Urgência",
};

export const STATUS_LABEL: Record<ConsultationStatus, string> = {
  DRAFT: "Rascunho",
  GENERATED: "Gerado pela IA",
  FINALIZED: "Finalizada",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  CONVENIO: "Convênio",
  OUTRO: "Outro",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador(a)",
  DOCTOR: "Médico(a)",
  SECRETARY: "Secretária(o)",
};

/** Link wa.me com o número no formato brasileiro (adiciona 55 se faltar). */
export function whatsappLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// "sv-SE" formata como AAAA-MM-DD no fuso local
export const today = () => new Date().toLocaleDateString("sv-SE");
export const currentMonth = () => today().slice(0, 7);

/** Primeira letra maiúscula, preservando o resto ("quinta-feira, 24 de setembro" -> "Quinta-feira, ..."). */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Exibe telefone guardado só com dígitos: "27998112233" -> "(27) 99811-2233". */
export function formatPhone(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

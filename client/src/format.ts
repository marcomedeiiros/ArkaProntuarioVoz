import type { ConsultationStatus, PaymentMethod, Role, Template } from "./types";

export const brl = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const dateTimeBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ageLabel(birthIso: string): string {
  const birth = new Date(birthIso);
  const now = new Date();
  let months = (now.getFullYear() - birth.getUTCFullYear()) * 12 + (now.getMonth() - birth.getUTCMonth());
  if (now.getDate() < birth.getUTCDate()) months--;
  if (months < 1) return "recém-nascido";
  if (months < 24) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `${years} anos`;
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

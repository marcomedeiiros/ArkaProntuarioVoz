import { z } from "zod";

/*
 * CATÁLOGO DE ABAS (módulos) da plataforma. É a única fonte da verdade:
 * - a Arka liga e desliga cada aba por empresa (Clínicas e liberação > empresa);
 * - a administração da clínica distribui entre os cargos as abas que a empresa tem;
 * - o menu do site é montado a partir daqui.
 *
 * PARA CRIAR UMA ABA NOVA:
 * 1. acrescente uma entrada abaixo (a chave é gravada no banco: não mude a de uma aba existente);
 * 2. no servidor, proteja as rotas dela com assertPermission(actor, "SUA_CHAVE");
 * 3. no site, registre a tela e o ícone em client/src/modules.tsx.
 * Não precisa de migração no banco: as chaves são guardadas como texto e validadas por este catálogo.
 * Empresas já existentes NÃO ganham a aba nova sozinhas: a Arka liga para quem deve ter.
 */
export const MODULES = [
  {
    key: "SCHEDULE",
    label: "Agenda",
    description: "Horários de cada profissional por semana, mês ou dia, com confirmação pelo WhatsApp",
    requires: ["PATIENTS"],
    defaultRoles: ["DOCTOR", "SECRETARY"],
  },
  {
    key: "PATIENTS",
    label: "Pacientes",
    description: "Cadastro e ficha das crianças, com o histórico de consultas",
    requires: [],
    defaultRoles: ["DOCTOR", "SECRETARY"],
  },
  {
    key: "CONSULTATIONS",
    label: "Consultas",
    description: "Gravação, transcrição e prontuário, receita e guia gerados pela IA",
    requires: ["PATIENTS"],
    defaultRoles: ["DOCTOR"],
  },
  {
    key: "FINANCE",
    label: "Financeiro",
    description: "Entradas, saídas, valores a receber e resumo do mês",
    requires: [],
    defaultRoles: ["DOCTOR", "SECRETARY"],
  },
  {
    key: "TEAM",
    label: "Equipe",
    description: "Convidar pessoas e gerenciar os acessos da clínica",
    requires: [],
    defaultRoles: [],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  description: string;
  requires: readonly string[];
  defaultRoles: readonly ("DOCTOR" | "SECRETARY")[];
}[];

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_KEYS = MODULES.map((m) => m.key) as ModuleKey[];

export const ModuleKeySchema = z.enum(MODULE_KEYS as [ModuleKey, ...ModuleKey[]], "Aba desconhecida");

/** Mantém só chaves do catálogo, na ordem do catálogo (o que estiver gravado e sumiu do catálogo é ignorado). */
export function inCatalogOrder(keys: readonly string[]): ModuleKey[] {
  return MODULE_KEYS.filter((k) => keys.includes(k));
}

/** Confere dependências (ex.: Consultas precisa de Pacientes). Devolve a mensagem do primeiro problema. */
export function missingRequirement(keys: readonly string[]): string | null {
  for (const m of MODULES) {
    if (!keys.includes(m.key)) continue;
    const missing = m.requires.find((r) => !keys.includes(r));
    if (missing) return `${m.label} precisa de ${MODULES.find((x) => x.key === missing)!.label} também`;
  }
  return null;
}

/** O que vai para o site: nome, descrição e dependências de cada aba (sem regras internas). */
export const MODULE_CATALOG = MODULES.map(({ key, label, description, requires }) => ({ key, label, description, requires }));

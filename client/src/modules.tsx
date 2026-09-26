import { CalendarDays, Stethoscope, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";

/*
 * Lado visual do catálogo de abas. Nome, descrição e regras vêm do servidor
 * (server/src/lib/modules.ts, enviado na sessão como `catalog`); aqui fica só o ícone e o endereço.
 *
 * PARA CRIAR UMA ABA NOVA no site: acrescente a chave abaixo com o ícone e o caminho, e registre a
 * rota da tela em App.tsx com only(can.has("SUA_CHAVE"), <SuaTela />). Uma aba que exista no
 * catálogo do servidor mas ainda não tenha tela aqui simplesmente não aparece no menu.
 */
export const MODULE_UI: Record<string, { path: string; icon: LucideIcon }> = {
  SCHEDULE: { path: "/agenda", icon: CalendarDays },
  PATIENTS: { path: "/pacientes", icon: Users },
  CONSULTATIONS: { path: "/consultas", icon: Stethoscope },
  FINANCE: { path: "/financeiro", icon: Wallet },
  TEAM: { path: "/equipe", icon: UserCog },
};

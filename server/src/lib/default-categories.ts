/** Categorias financeiras criadas para toda clínica nova. */
export const DEFAULT_CATEGORIES = [
  { name: "Consulta particular", type: "INCOME" },
  { name: "Puericultura", type: "INCOME" },
  { name: "Retorno", type: "INCOME" },
  { name: "Convênio", type: "INCOME" },
  { name: "Procedimento", type: "INCOME" },
  { name: "Aluguel", type: "EXPENSE" },
  { name: "Materiais e insumos", type: "EXPENSE" },
  { name: "Salários", type: "EXPENSE" },
  { name: "Impostos", type: "EXPENSE" },
  { name: "Softwares", type: "EXPENSE" },
  { name: "Outros", type: "EXPENSE" },
] as const;

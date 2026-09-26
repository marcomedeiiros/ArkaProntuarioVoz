/*
 * Datas da agenda, sempre no horário local de quem usa (o da clínica). A semana começa na segunda,
 * como nas agendas de consultório.
 */

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

/** Segunda-feira da semana de `d`. */
export function startOfWeek(d: Date) {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7; // segunda = 0
  return addDays(day, -offset);
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const time = (d: Date | string) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "2026-09-25" (para input type=date) e "09:30" (para input type=time), no horário local. */
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const toTimeInput = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Junta data e hora digitadas (locais) numa data. */
export function fromInputs(date: string, hhmm: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

/**
 * Distribui horários que se sobrepõem em colunas lado a lado (como no Google Agenda):
 * devolve, para cada item, a coluna e quantas colunas o grupo dele usa.
 */
export function layoutOverlaps<T extends { startsAt: string; endsAt: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const placed: { item: T; col: number; cols: number }[] = [];
  let group: { item: T; col: number; cols: number }[] = [];
  let groupEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) g.cols = cols;
    placed.push(...group);
    group = [];
  };
  for (const item of sorted) {
    const start = +new Date(item.startsAt);
    const end = +new Date(item.endsAt);
    if (group.length && start >= groupEnd) flush();
    const taken = new Set(group.filter((g) => +new Date(g.item.endsAt) > start).map((g) => g.col));
    let col = 0;
    while (taken.has(col)) col++;
    group.push({ item, col, cols: 1 });
    groupEnd = Math.max(groupEnd, end);
  }
  if (group.length) flush();
  return placed;
}

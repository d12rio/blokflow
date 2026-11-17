import { cardKey, columnKey, type Card, type Lists, type Stage } from "./board";

export const PAGE_SIZE = 25;

// One stage's stories as far as they're loaded: ids in the order Storyblok returned them.
export type Column = { ids: number[]; total: number; page: number; done: boolean };
export type Columns = Record<number, Column>;

export type StagePage = { stageId: number; ids: number[]; total: number; page: number };

export function columnFromPage({ ids, total, page }: Omit<StagePage, "stageId">): Column {
  return { ids, total, page, done: ids.length >= total || ids.length < page * PAGE_SIZE };
}

export function appendPage(columns: Columns, { stageId, ids, total, page }: StagePage): Columns {
  const current = columns[stageId];
  if (!current || page <= 1) return { ...columns, [stageId]: columnFromPage({ ids, total, page }) };
  const merged = [...current.ids, ...ids.filter((id) => !current.ids.includes(id))];
  return { ...columns, [stageId]: { ids: merged, total, page, done: merged.length >= total || ids.length < PAGE_SIZE } };
}

// A moved card leaves its column and goes to the top of the new one, and both totals follow.
export function moveId(columns: Columns, id: number, from: number, to: number): Columns {
  if (from === to) return columns;
  const next = { ...columns };
  const source = next[from];
  if (source?.ids.includes(id)) next[from] = { ...source, ids: source.ids.filter((x) => x !== id), total: Math.max(0, source.total - 1) };
  const target = next[to];
  if (target && !target.ids.includes(id)) next[to] = { ...target, ids: [id, ...target.ids], total: target.total + 1 };
  return next;
}

export function listsFromColumns(stages: Stage[], columns: Columns, cards: Map<number, Card>): Lists {
  return Object.fromEntries(
    stages.map((s) => [columnKey(s.id), (columns[s.id]?.ids ?? []).filter((id) => cards.get(id)?.stageId === s.id).map(cardKey)]),
  );
}

// Newer data wins, except for cards with a save in flight, whose local state is newer than any page.
export function mergeCards(current: Card[], incoming: Card[], keepLocal: ReadonlySet<number> = new Set()): Card[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const card of incoming) if (!keepLocal.has(card.id)) byId.set(card.id, card);
  return [...byId.values()];
}

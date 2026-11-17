export type Workflow = {
  id: number;
  name: string;
  isDefault: boolean;
  contentTypes: string[];
};

export type Stage = {
  id: number;
  name: string;
  color: string;
  position: number;
  workflowId: number;
};

export type Card = {
  id: number;
  name: string;
  fullSlug: string;
  contentType: string;
  updatedAt: string;
  dueDate: string | null;
  stageId: number;
  userIds: number[];
  roleIds: number[];
  published: boolean;
  unpublishedChanges: boolean;
};

export type Person = {
  id: number;
  name: string;
  avatar: string | null;
  roleIds: number[];
};

export type Me = { userId: number; roleIds: number[] };

// Column key -> card keys, in display order. The shape ui-sdk's createTransfer works with.
export type Lists = Record<string, string[]>;

export type Move = { key: string; from: string; to: string; index: number };

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);

export function parseWorkflow(raw: unknown): Workflow | null {
  const w = obj(raw);
  const id = num(w.id);
  if (Number.isNaN(id)) return null;
  return {
    id,
    name: text(w.name) || `Workflow ${id}`,
    isDefault: w.is_default === true,
    contentTypes: Array.isArray(w.content_types) ? w.content_types.filter((c): c is string => typeof c === "string") : [],
  };
}

export function parseStage(raw: unknown): Stage | null {
  const s = obj(raw);
  const id = num(s.id);
  if (Number.isNaN(id)) return null;
  const position = num(s.position);
  return {
    id,
    name: text(s.name) || `Stage ${id}`,
    color: text(s.color) || "#8b91a7",
    position: Number.isNaN(position) ? 0 : position,
    workflowId: num(s.workflow_id),
  };
}

// The docs don't pin down where a story's assignees live: they've been seen on the story
// and on its `stage` object, so both are read.
export function parseStory(raw: unknown): Card | null {
  const s = obj(raw);
  const stage = obj(s.stage);
  const id = num(s.id);
  const stageId = num(stage.workflow_stage_id);
  if (Number.isNaN(id) || Number.isNaN(stageId) || s.is_folder === true) return null;
  return {
    id,
    name: text(s.name) || text(s.slug) || `Story ${id}`,
    fullSlug: text(s.full_slug),
    contentType: text(s.content_type),
    updatedAt: text(s.updated_at),
    dueDate: text(stage.due_date) || null,
    stageId,
    userIds: unique([...ids(s.user_ids), ...ids(stage.user_ids)]),
    roleIds: unique([...ids(s.space_role_ids), ...ids(stage.space_role_ids)]),
    published: s.published === true,
    unpublishedChanges: s.unpublished_changes === true,
  };
}

export function parseCollaborator(raw: unknown): Person | null {
  const c = obj(raw);
  const user = obj(c.user);
  const id = num(user.id ?? c.user_id);
  if (Number.isNaN(id)) return null;
  const fullName = [text(user.firstname), text(user.lastname)].filter(Boolean).join(" ");
  return {
    id,
    name: text(user.friendly_name) || fullName || text(user.userid) || `User ${id}`,
    avatar: text(user.avatar) || null,
    roleIds: unique([...ids(c.space_role_ids), ...(typeof c.space_role_id === "number" ? [c.space_role_id] : [])]),
  };
}

function unique(values: number[]) {
  return [...new Set(values)];
}

export function markAssigned(cards: Card[], storyIds: number[], userId: number) {
  const assigned = new Set(storyIds);
  return cards.map((c) => (assigned.has(c.id) && !c.userIds.includes(userId) ? { ...c, userIds: [...c.userIds, userId] } : c));
}

export const columnKey =(stageId: number) => String(stageId);
export const cardKey = (storyId: number) => String(storyId);

export function sortStages(stages: Stage[]) {
  return [...stages].sort((a, b) => a.position - b.position || a.id - b.id);
}

// Which workflow to show: the one asked for, then the space's configured default, then Storyblok's default.
export function pickWorkflow(workflows: Workflow[], requested: number | null, configured: number | null) {
  return (
    workflows.find((w) => w.id === requested) ??
    workflows.find((w) => w.id === configured) ??
    workflows.find((w) => w.isDefault) ??
    workflows[0] ??
    null
  );
}

export function isAssignedTo(card: Card, me: Me) {
  return card.userIds.includes(me.userId) || card.roleIds.some((r) => me.roleIds.includes(r));
}

export type CardFilter = { mineOnly: boolean; query: string; me: Me };

export function filterCards(cards: Card[], { mineOnly, query, me }: CardFilter) {
  const q = query.trim().toLowerCase();
  return cards.filter(
    (c) =>
      (!mineOnly || isAssignedTo(c, me)) &&
      (!q || c.name.toLowerCase().includes(q) || c.fullSlug.toLowerCase().includes(q)),
  );
}

// Overdue first, then by due date, then the most recently updated.
export function compareCards(a: Card, b: Card) {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function buildLists(stages: Stage[], cards: Card[]): Lists {
  const lists: Lists = Object.fromEntries(sortStages(stages).map((s) => [columnKey(s.id), [] as string[]]));
  for (const card of [...cards].sort(compareCards)) lists[columnKey(card.stageId)]?.push(cardKey(card.id));
  return lists;
}

// The card that changed columns between two snapshots of the board, if any.
export function findMove(before: Lists, after: Lists): Move | null {
  const columnOf = (lists: Lists) => {
    const map = new Map<string, string>();
    for (const [column, keys] of Object.entries(lists)) for (const key of keys) map.set(key, column);
    return map;
  };
  const was = columnOf(before);
  for (const [to, keys] of Object.entries(after)) {
    for (const [index, key] of keys.entries()) {
      const from = was.get(key);
      if (from !== undefined && from !== to) return { key, from, to, index };
    }
  }
  return null;
}

export function moveCard(cards: Card[], storyId: number, stageId: number, patch: Partial<Card> = {}) {
  return cards.map((c) => (c.id === storyId ? { ...c, ...patch, stageId } : c));
}

export type DueState = "overdue" | "soon" | "later";

export function dueState(dueDate: string | null, now: number): DueState | null {
  if (!dueDate) return null;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return null;
  if (due < now) return "overdue";
  return due - now < 2 * 24 * 60 * 60 * 1000 ? "soon" : "later";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function assigneeNames(card: Card, people: Record<number, Person>) {
  return card.userIds.map((id) => people[id]?.name ?? `User ${id}`);
}

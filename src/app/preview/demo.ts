import type { Card, Person, Stage, Workflow } from "@/lib/board";
import { PAGE_SIZE } from "@/lib/columns";

export const FAILING_STORY_ID = 9013;
export const DEMO_USER_ID = 1;

export const demoWorkflows: Workflow[] = [
  { id: 10, name: "Editorial", isDefault: true, contentTypes: [] },
  { id: 20, name: "Legal review", isDefault: false, contentTypes: ["page"] },
];

const stage = (id: number, name: string, color: string, position: number): Stage => ({ id, name, color, position, workflowId: 10 });

export const demoStages: Stage[] = [
  stage(101, "Drafting", "#8b91a7", 1),
  stage(102, "In review", "#f5a623", 2),
  stage(103, "Changes requested", "#e5271d", 3),
  stage(104, "Approved", "#037c7d", 4),
  stage(105, "Ready to publish", "#4a6cf7", 5),
  stage(106, "Archive", "#5f616e", 6),
];

export const demoPeople: Person[] = [
  { id: 1, name: "Robin Park", avatar: null, roleIds: [7] },
  { id: 2, name: "Sam Okafor", avatar: null, roleIds: [8] },
  { id: 3, name: "Alex Lindqvist", avatar: null, roleIds: [8] },
  { id: 4, name: "Jo Ferreira", avatar: null, roleIds: [9] },
];

const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(Date.UTC(2026, 10, 17) + offsetDays * day).toISOString();

const card = (
  id: number,
  name: string,
  stageId: number,
  extra: Partial<Card> = {},
): Card => ({
  id,
  name,
  fullSlug: `articles/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  contentType: "article",
  updatedAt: at(-(id % 9)),
  dueDate: null,
  stageId,
  userIds: [],
  roleIds: [],
  published: false,
  unpublishedChanges: false,
  ...extra,
});

export const demoCards: Card[] = [
  card(9001, "Spring launch announcement", 101, { userIds: [1], dueDate: at(5) }),
  card(9002, "How we test level design", 101, { userIds: [2] }),
  card(9003, "Pricing page refresh", 101, { contentType: "page", fullSlug: "pricing", published: true, unpublishedChanges: true }),
  card(9004, "Clouds that cast shadows", 102, { userIds: [1, 3], dueDate: at(1) }),
  card(9005, "Hitboxes that match the monster", 102, { userIds: [3] }),
  card(9006, "Accessibility statement", 103, { contentType: "page", fullSlug: "legal/accessibility", userIds: [4], dueDate: at(-2) }),
  card(9007, "Store page art rendered by the game", 103, { roleIds: [7] }),
  card(9008, "Patch notes 1.4", 104, { userIds: [2], published: true, unpublishedChanges: true }),
  card(9009, "Community spotlight: speedrunners", 104),
  card(9010, "Behind the soundtrack", 105, { userIds: [1], dueDate: at(-1) }),
  card(9011, "Holiday sale banner", 105, { contentType: "banner", fullSlug: "banners/holiday-sale" }),
  card(9012, "Old roadmap", 106, { published: true }),
  card(FAILING_STORY_ID, "Locked by legal (moving this fails)", 101, { userIds: [4] }),
  // Enough stories for Drafting and In review to need more than one page.
  ...Array.from({ length: 56 }, (_, i) => card(9100 + i, `Backlog idea ${i + 1}`, 101)),
  ...Array.from({ length: 28 }, (_, i) => card(9200 + i, `Review batch item ${i + 1}`, 102)),
];

// Pages like Storyblok's: newest first, optionally narrowed by a search on name and slug.
export function demoPage(stageId: number, page: number, search?: string) {
  const q = search?.trim().toLowerCase();
  const all = demoCards
    .filter((c) => c.stageId === stageId && (!q || c.name.toLowerCase().includes(q) || c.fullSlug.includes(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id - b.id);
  return { cards: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: all.length };
}

const para = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string) => ({ type: "text", text });
const mention = (id: number) => ({ type: "mention", attrs: { id } });

// Shaped like the Management API's responses, so the preview runs them through the real parsers.
export const demoStoryRaw = (card: Card) => ({
  id: card.id,
  name: card.name,
  full_slug: card.fullSlug,
  created_at: at(-20),
  updated_at: card.updatedAt,
  published_at: card.published ? at(-3) : null,
  first_published_at: card.published ? at(-12) : null,
  published: card.published,
  unpublished_changes: card.unpublishedChanges,
  last_author: { id: 2, friendly_name: "Sam Okafor" },
  user_ids: [...new Set([...card.userIds, ...(card.id === 9004 ? [4] : [])])],
  space_role_ids: card.roleIds,
  tag_list: card.id === 9004 ? ["graphics", "devlog"] : [],
});

export const demoCommentsRaw = (storyId: number) =>
  storyId === 9004
    ? [
        {
          id: 1,
          user_id: 3,
          created_at: at(-2),
          message_json: [para(t("First draft is in. "), mention(1), t(" can you check the screenshots before review?"))],
        },
        { id: 2, user_id: 1, created_at: at(-1), message_json: [para(t("Looks good. Two captions need work, see the field notes.")), para(t("Moving it to review."))] },
      ]
    : [];

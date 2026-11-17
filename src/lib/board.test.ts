import { describe, expect, it } from "vitest";
import {
  buildLists,
  dueState,
  filterCards,
  findMove,
  initials,
  isAssignedTo,
  markAssigned,
  moveCard,
  parseCollaborator,
  parseStage,
  parseStory,
  pickWorkflow,
  type Card,
  type Stage,
  type Workflow,
} from "./board";

const stage = (id: number, position: number, extra: Partial<Stage> = {}): Stage => ({
  id,
  name: `Stage ${id}`,
  color: "#000",
  position,
  workflowId: 1,
  ...extra,
});

const card = (id: number, stageId: number, extra: Partial<Card> = {}): Card => ({
  id,
  name: `Story ${id}`,
  fullSlug: `blog/story-${id}`,
  contentType: "article",
  updatedAt: "2026-11-01T00:00:00.000Z",
  dueDate: null,
  stageId,
  userIds: [],
  roleIds: [],
  published: false,
  unpublishedChanges: false,
  ...extra,
});

describe("parseStory", () => {
  it("reads a story in a workflow stage", () => {
    const parsed = parseStory({
      id: 5,
      name: "Hello",
      full_slug: "blog/hello",
      content_type: "article",
      updated_at: "2026-11-02T10:00:00.000Z",
      published: true,
      unpublished_changes: true,
      stage: { workflow_stage_id: 12, due_date: "2026-12-01T00:00:00.000Z", user_ids: [3] },
      user_ids: [3, 4],
      space_role_ids: [9],
    });
    expect(parsed).toMatchObject({
      id: 5,
      stageId: 12,
      dueDate: "2026-12-01T00:00:00.000Z",
      userIds: [3, 4],
      roleIds: [9],
      published: true,
      unpublishedChanges: true,
    });
  });

  it("skips stories without a stage, folders and junk", () => {
    expect(parseStory({ id: 1, stage: null })).toBeNull();
    expect(parseStory({ id: 1, is_folder: true, stage: { workflow_stage_id: 2 } })).toBeNull();
    expect(parseStory("nope")).toBeNull();
  });

  it("falls back to the slug for a name", () => {
    expect(parseStory({ id: 1, slug: "x", stage: { workflow_stage_id: 2 } })?.name).toBe("x");
  });
});

describe("parseStage and parseCollaborator", () => {
  it("defaults missing stage fields", () => {
    expect(parseStage({ id: 3, workflow_id: 1 })).toMatchObject({ name: "Stage 3", position: 0 });
    expect(parseStage({ name: "no id" })).toBeNull();
  });

  it("names people from what the API gives", () => {
    expect(parseCollaborator({ user: { id: 1, friendly_name: "Robin" }, space_role_ids: [2] })).toMatchObject({ name: "Robin", roleIds: [2] });
    expect(parseCollaborator({ user: { id: 2, firstname: "Sam", lastname: "Okafor" }, space_role_id: 4 })).toMatchObject({
      name: "Sam Okafor",
      roleIds: [4],
    });
    expect(parseCollaborator({ user_id: 3 })?.name).toBe("User 3");
  });
});

describe("pickWorkflow", () => {
  const workflows: Workflow[] = [
    { id: 1, name: "A", isDefault: false, contentTypes: [] },
    { id: 2, name: "B", isDefault: true, contentTypes: [] },
    { id: 3, name: "C", isDefault: false, contentTypes: [] },
  ];
  it("prefers the requested, then the configured, then Storyblok's default", () => {
    expect(pickWorkflow(workflows, 3, 1)?.id).toBe(3);
    expect(pickWorkflow(workflows, 99, 1)?.id).toBe(1);
    expect(pickWorkflow(workflows, null, null)?.id).toBe(2);
    expect(pickWorkflow([], null, null)).toBeNull();
  });
});

describe("assignment and filters", () => {
  const me = { userId: 7, roleIds: [3] };

  it("counts direct and role assignments", () => {
    expect(isAssignedTo(card(1, 1, { userIds: [7] }), me)).toBe(true);
    expect(isAssignedTo(card(1, 1, { roleIds: [3] }), me)).toBe(true);
    expect(isAssignedTo(card(1, 1, { userIds: [8], roleIds: [4] }), me)).toBe(false);
  });

  it("filters by assignee and by name or slug", () => {
    const cards = [card(1, 1, { userIds: [7], name: "Launch post" }), card(2, 1, { name: "Pricing", fullSlug: "pages/pricing" })];
    expect(filterCards(cards, { mineOnly: true, query: "", me }).map((c) => c.id)).toEqual([1]);
    expect(filterCards(cards, { mineOnly: false, query: "PRICING", me }).map((c) => c.id)).toEqual([2]);
    expect(filterCards(cards, { mineOnly: false, query: "pages/", me }).map((c) => c.id)).toEqual([2]);
    expect(filterCards(cards, { mineOnly: true, query: "pricing", me })).toEqual([]);
  });
});

describe("buildLists", () => {
  it("orders columns by position and cards by due date, then recency", () => {
    const stages = [stage(20, 2), stage(10, 1)];
    const cards = [
      card(1, 10, { updatedAt: "2026-11-01T00:00:00.000Z" }),
      card(2, 10, { updatedAt: "2026-11-05T00:00:00.000Z" }),
      card(3, 10, { dueDate: "2026-12-01T00:00:00.000Z" }),
      card(4, 20),
      card(5, 99),
    ];
    const lists = buildLists(stages, cards);
    expect(Object.keys(lists)).toEqual(["10", "20"]);
    expect(lists["10"]).toEqual(["3", "2", "1"]);
    expect(lists["20"]).toEqual(["4"]);
  });

  it("keeps empty columns", () => {
    expect(buildLists([stage(1, 1)], [])).toEqual({ "1": [] });
  });
});

describe("findMove", () => {
  it("finds the card that changed columns", () => {
    expect(findMove({ a: ["1", "2"], b: [] }, { a: ["2"], b: ["1"] })).toEqual({ key: "1", from: "a", to: "b", index: 0 });
  });

  it("ignores a reorder within a column", () => {
    expect(findMove({ a: ["1", "2"] }, { a: ["2", "1"] })).toBeNull();
  });
});

describe("moveCard", () => {
  it("changes one card's stage and leaves the others", () => {
    const cards = [card(1, 1), card(2, 1)];
    const moved = moveCard(cards, 2, 5, { dueDate: null });
    expect(moved.map((c) => c.stageId)).toEqual([1, 5]);
    expect(cards[1].stageId).toBe(1);
  });
});

describe("dueState and initials", () => {
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  it("classifies due dates", () => {
    expect(dueState(null, now)).toBeNull();
    expect(dueState("garbage", now)).toBeNull();
    expect(dueState("2026-11-16T00:00:00.000Z", now)).toBe("overdue");
    expect(dueState("2026-11-18T00:00:00.000Z", now)).toBe("soon");
    expect(dueState("2026-12-18T00:00:00.000Z", now)).toBe("later");
  });

  it("makes initials", () => {
    expect(initials("Robin Park")).toBe("RP");
    expect(initials("Mary Jane Watson")).toBe("MW");
    expect(initials("robin")).toBe("RO");
    expect(initials("  ")).toBe("?");
  });
});

describe("markAssigned", () => {
  it("adds the user to the stories assigned to them, once", () => {
    const cards = [card(1, 1), card(2, 1, { userIds: [7] }), card(3, 1, { userIds: [8] })];
    const marked = markAssigned(cards, [2, 3, 99], 7);
    expect(marked.map((c) => c.userIds)).toEqual([[], [7], [8, 7]]);
    expect(marked[0]).toBe(cards[0]);
  });
});

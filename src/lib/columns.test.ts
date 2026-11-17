import { describe, expect, it } from "vitest";
import type { Card, Stage } from "./board";
import { appendPage, columnFromPage, listsFromColumns, mergeCards, moveId, PAGE_SIZE } from "./columns";

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
const card = (id: number, stageId: number, name = `Story ${id}`): Card => ({
  id,
  name,
  fullSlug: "",
  contentType: "",
  updatedAt: "",
  dueDate: null,
  stageId,
  userIds: [],
  roleIds: [],
  published: false,
  unpublishedChanges: false,
});

describe("columnFromPage and appendPage", () => {
  it("knows when a stage has more to load", () => {
    expect(columnFromPage({ ids: range(1, PAGE_SIZE), total: 60, page: 1 }).done).toBe(false);
    expect(columnFromPage({ ids: range(1, 3), total: 3, page: 1 }).done).toBe(true);
  });

  it("appends the next page without duplicates and finishes at the total", () => {
    let columns = appendPage({}, { stageId: 7, ids: range(1, PAGE_SIZE), total: 30, page: 1 });
    columns = appendPage(columns, { stageId: 7, ids: [PAGE_SIZE, ...range(PAGE_SIZE + 1, 5)], total: 30, page: 2 });
    expect(columns[7].ids).toHaveLength(30);
    expect(columns[7]).toMatchObject({ page: 2, done: true });
  });

  it("replaces a column when page 1 comes again", () => {
    const columns = appendPage({ 7: columnFromPage({ ids: [1, 2], total: 2, page: 1 }) }, { stageId: 7, ids: [3], total: 1, page: 1 });
    expect(columns[7].ids).toEqual([3]);
  });

  it("stops when a short page arrives even if the total says more", () => {
    const columns = appendPage({ 7: columnFromPage({ ids: range(1, PAGE_SIZE), total: 99, page: 1 }) }, { stageId: 7, ids: [200], total: 99, page: 2 });
    expect(columns[7].done).toBe(true);
  });
});

describe("moveId", () => {
  it("moves to the top of the target and adjusts totals", () => {
    const columns = { 1: columnFromPage({ ids: [10, 11], total: 40, page: 1 }), 2: columnFromPage({ ids: [20], total: 1, page: 1 }) };
    const moved = moveId(columns, 11, 1, 2);
    expect(moved[1]).toMatchObject({ ids: [10], total: 39 });
    expect(moved[2]).toMatchObject({ ids: [11, 20], total: 2 });
  });

  it("leaves a stage that isn't loaded, like a hidden one, alone", () => {
    const columns = { 1: columnFromPage({ ids: [10], total: 1, page: 1 }) };
    expect(moveId(columns, 10, 1, 9)).toEqual({ 1: { ids: [], total: 0, page: 1, done: true } });
  });
});

describe("listsFromColumns", () => {
  it("keeps Storyblok's order and drops cards that moved elsewhere", () => {
    const stages = [{ id: 1, position: 1 }, { id: 2, position: 2 }] as Stage[];
    const cards = new Map([card(10, 1), card(11, 2), card(12, 1)].map((c) => [c.id, c]));
    const columns = { 1: columnFromPage({ ids: [12, 10, 11], total: 3, page: 1 }) };
    expect(listsFromColumns(stages, columns, cards)).toEqual({ "1": ["12", "10"], "2": [] });
  });
});

describe("mergeCards", () => {
  it("takes newer data unless a save is in flight", () => {
    const merged = mergeCards([card(1, 1, "local"), card(2, 1, "local")], [card(1, 1, "server"), card(2, 1, "server"), card(3, 1)], new Set([2]));
    expect(merged.map((c) => c.name)).toEqual(["server", "local", "Story 3"]);
  });
});

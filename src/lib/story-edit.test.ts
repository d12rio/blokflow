import { describe, expect, it } from "vitest";
import { dueDateToIso, isoToDueDate, normalizeTags, replaceLastSegment, sameIds, slugify } from "./story-edit";

describe("slugify", () => {
  it("makes a valid single segment", () => {
    expect(slugify("  Hello World! ")).toBe("hello-world");
    expect(slugify("Über Café / News")).toBe("uber-cafe-news");
    expect(slugify("keep_under-scores")).toBe("keep_under-scores");
    expect(slugify("---")).toBe("");
  });
});

describe("replaceLastSegment", () => {
  it("swaps the story's own slug in its full path", () => {
    expect(replaceLastSegment("blog/old-post", "new-post")).toBe("blog/new-post");
    expect(replaceLastSegment("home", "start")).toBe("start");
  });
});

describe("normalizeTags", () => {
  it("trims, drops empties and case-insensitive duplicates, keeps order", () => {
    expect(normalizeTags([" News", "news", "", "Dev "])).toEqual(["News", "Dev"]);
  });
});

describe("due dates", () => {
  it("round-trips a picked date", () => {
    expect(dueDateToIso("2026-11-18")).toBe("2026-11-18T00:00:00.000Z");
    expect(isoToDueDate("2026-11-18T00:00:00.000Z")).toBe("2026-11-18");
    expect(dueDateToIso(null)).toBeNull();
    expect(isoToDueDate("nope")).toBeNull();
  });
});

describe("sameIds", () => {
  it("ignores order", () => {
    expect(sameIds([1, 2], [2, 1])).toBe(true);
    expect(sameIds([1], [1, 2])).toBe(false);
  });
});

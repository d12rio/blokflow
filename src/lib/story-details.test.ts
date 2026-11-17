import { describe, expect, it } from "vitest";
import { commentParagraphs, parseComment, parseStoryDetails } from "./story-details";

const para = (...content: unknown[]) => ({ type: "paragraph", content });

describe("commentParagraphs", () => {
  it("keeps paragraphs, text, mentions and line breaks", () => {
    const json = [
      para({ type: "text", text: "Hi " }, { type: "mention", attrs: { id: 7, label: "Robin" } }, { type: "hard_break" }, { type: "text", text: "ok?" }),
      para({ type: "text", text: "Second" }),
    ];
    expect(commentParagraphs(json, null)).toEqual([
      [{ text: "Hi " }, { mention: 7, label: "Robin" }, { text: "\n" }, { text: "ok?" }],
      [{ text: "Second" }],
    ]);
  });

  it("walks into a doc node and lists", () => {
    const json = [{ type: "doc", content: [{ type: "bullet_list", content: [{ type: "list_item", content: [para({ type: "text", text: "One" })] }] }] }];
    expect(commentParagraphs(json, null)).toEqual([[{ text: "One" }]]);
  });

  it("accepts mention ids given as strings and skips empty paragraphs", () => {
    expect(commentParagraphs([para({ type: "mention", attrs: { id: "12" } }), para()], null)).toEqual([[{ mention: 12, label: null }]]);
  });

  it("falls back to the plain message", () => {
    expect(commentParagraphs(undefined, "One\n\nTwo")).toEqual([[{ text: "One" }], [{ text: "Two" }]]);
    expect(commentParagraphs([], "  ")).toEqual([]);
  });
});

describe("parseComment", () => {
  it("reads a comment's author from user_id or a user object", () => {
    expect(parseComment({ id: 1, user_id: 5, created_at: "x", message: "Hi" })).toMatchObject({ userId: 5, authorName: null });
    expect(parseComment({ id: 2, user: { id: 6, friendly_name: "Sam" }, message: "Hi" })).toMatchObject({ userId: 6, authorName: "Sam" });
    expect(parseComment({ message: "no id" })).toBeNull();
  });
});

describe("parseStoryDetails", () => {
  it("reads the fields the modal shows", () => {
    expect(
      parseStoryDetails({
        id: 1,
        name: "Hello",
        published_at: "",
        last_author: { id: 2, friendly_name: "Sam" },
        user_ids: [2, 3],
        tag_list: ["a", 5],
      }),
    ).toMatchObject({ publishedAt: null, lastAuthor: { id: 2, name: "Sam" }, userIds: [2, 3], tags: ["a"] });
  });
});

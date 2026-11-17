import { describe, expect, it } from "vitest";
import { errorReason } from "./errors";

describe("errorReason", () => {
  it("pulls the message out of Storyblok's error shapes", () => {
    expect(errorReason('{"error":"Unauthorized"}')).toBe("Unauthorized");
    expect(errorReason('["Workflow stage is not allowed"]')).toBe("Workflow stage is not allowed");
    expect(errorReason('{"workflow_stage_id":["is not allowed","is not allowed"],"base":["Locked"]}')).toBe("is not allowed Locked");
  });

  it("falls back to the raw text", () => {
    expect(errorReason("Bad gateway ")).toBe("Bad gateway");
    expect(errorReason("")).toBe("");
  });
});

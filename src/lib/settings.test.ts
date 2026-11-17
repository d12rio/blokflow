import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("defaults anything missing or malformed", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ defaultWorkflowId: -1, hiddenStageIds: "1,2", columnWidth: "huge" })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values, accepting numeric strings and dropping duplicates", () => {
    expect(
      normalizeSettings({ defaultWorkflowId: "42", hiddenStageIds: [3, "4", 3, "x", 0, 1.5], columnWidth: "wide", extra: true }),
    ).toEqual({
      defaultWorkflowId: 42,
      hiddenStageIds: [3, 4],
      columnWidth: "wide",
    });
  });
});

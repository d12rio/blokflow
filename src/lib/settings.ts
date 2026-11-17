export const COLUMN_WIDTHS = ["compact", "comfortable", "wide"] as const;
export type ColumnWidth = (typeof COLUMN_WIDTHS)[number];

// Stored per space in the plugin's space-level settings (app_provision.space_level_settings).
// Only non-sensitive configuration belongs here.
export type PluginSettings = {
  // The workflow the board opens with. null means Storyblok's default workflow.
  defaultWorkflowId: number | null;
  // Columns nobody needs on the board, like an archive stage.
  hiddenStageIds: number[];
  columnWidth: ColumnWidth;
};

export const DEFAULT_SETTINGS: PluginSettings = { defaultWorkflowId: null, hiddenStageIds: [], columnWidth: "comfortable" };

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
};
const isColumnWidth = (v: unknown): v is ColumnWidth => COLUMN_WIDTHS.includes(v as ColumnWidth);

// Settings come from whatever was saved before, so every field is checked and defaulted.
export function normalizeSettings(raw: unknown): PluginSettings {
  const s = obj(raw);
  return {
    defaultWorkflowId: id(s.defaultWorkflowId),
    hiddenStageIds: Array.isArray(s.hiddenStageIds)
      ? [...new Set(s.hiddenStageIds.map(id).filter((n): n is number => n !== null))]
      : [],
    columnWidth: isColumnWidth(s.columnWidth) ? s.columnWidth : DEFAULT_SETTINGS.columnWidth,
  };
}

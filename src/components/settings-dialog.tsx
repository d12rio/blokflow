"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { toast } from "@ui-sdk/react/toast";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import type { BoardActions } from "@/app/actions";
import type { Stage, Workflow } from "@/lib/board";
import { COLUMN_WIDTHS, normalizeSettings, type ColumnWidth, type PluginSettings } from "@/lib/settings";
import type { SessionRef } from "@/lib/storyblok/session";
import { signInUrl } from "@/lib/storyblok/urls";

const STORYBLOK_DEFAULT = "default";

const COLUMN_WIDTH_LABELS: Record<ColumnWidth, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  wide: "Wide",
};

type Props = {
  session: SessionRef;
  settings: PluginSettings;
  // Why settings couldn't be loaded, if they couldn't. The dialog then explains instead of saving.
  error: string | null;
  workflows: Workflow[];
  // The stages of the workflow on screen. Hidden stages of other workflows are kept as they are.
  stages: Stage[];
  onSave: BoardActions["onSaveSettings"];
};

export function SettingsDialog({ session, settings, error, workflows, stages, onSave }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);

  const stageIds = new Set(stages.map((s) => s.id));
  const visible = stages.filter((s) => !draft.hiddenStageIds.includes(s.id)).map((s) => String(s.id));

  function setVisible(values: string[]) {
    const shown = new Set(values.map(Number));
    const otherWorkflows = draft.hiddenStageIds.filter((id) => !stageIds.has(id));
    setDraft((d) => ({ ...d, hiddenStageIds: [...otherWorkflows, ...stages.filter((s) => !shown.has(s.id)).map((s) => s.id)] }));
  }

  async function save() {
    const result = await onSave(session, normalizeSettings(draft));
    if (!result.ok) {
      toast.error("Couldn't save the settings", {
        description: result.error,
        ...(result.signedOut && { action: { label: "Sign in", href: signInUrl } }),
      });
      return;
    }
    toast.success("Settings saved", { description: "They apply to everyone using the board in this space." });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(settings);
        setOpen(next);
      }}
    >
      <DialogTrigger className="secondary-button">Settings</DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="settings-dialog">
        <DialogTitle>Board settings</DialogTitle>
        <DialogDescription>Saved for this space in Storyblok, for everyone who uses the board here.</DialogDescription>

        {error && <p className="settings-error">Settings couldn&apos;t be loaded: {error}</p>}

        <Field>
          <FieldLabel>Open the board with</FieldLabel>
          <Select
            value={draft.defaultWorkflowId ? String(draft.defaultWorkflowId) : STORYBLOK_DEFAULT}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, defaultWorkflowId: !v || v === STORYBLOK_DEFAULT ? null : Number(v) }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STORYBLOK_DEFAULT}>Storyblok&apos;s default workflow</SelectItem>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Columns to show</FieldLabel>
          <CheckboxGroup value={visible} onValueChange={(v) => setVisible(v as string[])}>
            {stages.map((s) => (
              <label key={s.id} className="checkbox-row">
                <Checkbox value={String(s.id)}>
                  <CheckboxIndicator />
                </Checkbox>
                <span className="stage-dot" style={{ "--stage-color": s.color } as CSSProperties} aria-hidden="true" />
                {s.name}
              </label>
            ))}
          </CheckboxGroup>
          <FieldDescription>Stories in hidden columns stay in Storyblok; they just don&apos;t show on the board.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Column width</FieldLabel>
          <SegmentedControl
            aria-label="Column width"
            value={draft.columnWidth}
            onValueChange={(v) => v && setDraft((d) => ({ ...d, columnWidth: v as ColumnWidth }))}
          >
            <SegmentedControlIndicator />
            {COLUMN_WIDTHS.map((w) => (
              <SegmentedControlItem key={w} value={w}>
                {COLUMN_WIDTH_LABELS[w]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <FieldDescription>Columns stretch to fill wide screens, up to a limit for each size.</FieldDescription>
        </Field>

        <div className="dialog-actions">
          <DialogClose className="secondary-button">Cancel</DialogClose>
          <Button data-variant="solid" onClick={save} disabled={!!error} pendingAnnouncement="Saving settings">
            Save settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

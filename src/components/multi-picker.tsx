"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxCreate,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/react/combobox";
import { useRef, useState, type ReactNode } from "react";

type Option = { value: string; label: string };

type Props = {
  label: string;
  value: string[];
  options: Option[];
  placeholder: string;
  empty: string;
  disabled?: boolean;
  creatable?: boolean;
  renderChip?: (value: string) => ReactNode;
  // Called once the list closes, or when a chip is removed while it's closed. Picking several
  // items is one change, not one save per click.
  onCommit: (values: string[]) => Promise<void> | void;
};

export function MultiPicker({ label, value, options, placeholder, empty, disabled, creatable, renderChip, onCommit }: Props) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [created, setCreated] = useState<Option[]>([]);
  const open = useRef(false);
  const shown = draft ?? value;
  const all = [...options, ...created.filter((c) => !options.some((o) => o.value === c.value))];
  const labelOf = (v: string) => all.find((o) => o.value === v)?.label ?? v;

  function commit(values: string[]) {
    setDraft(values);
    void Promise.resolve(onCommit(values)).finally(() => setDraft(null));
  }

  return (
    <Combobox
      multiple
      value={shown}
      disabled={disabled}
      itemToLabel={labelOf}
      onOpenChange={(next) => {
        open.current = next;
        if (!next && draft) commit(draft);
      }}
      onValueChange={(next) => {
        const values = next as string[];
        if (open.current) setDraft(values);
        else commit(values);
      }}
    >
      <ComboboxChips className="picker-chips">
        <ComboboxValue>
          {(state) =>
            (state.value as string[]).map((v, i) => (
              <ComboboxChip key={v} value={v} className="picker-chip">
                {renderChip?.(v)}
                {state.labels[i] ?? labelOf(v)}
                <ComboboxChipRemove aria-label={`Remove ${state.labels[i] ?? labelOf(v)}`} className="picker-chip-remove">
                  ×
                </ComboboxChipRemove>
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxInput aria-label={label} placeholder={shown.length ? "" : placeholder} className="picker-input" />
      </ComboboxChips>
      <ComboboxContent className="picker-content">
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {all.map((o) => (
            <ComboboxItem key={o.value} value={o.value} label={o.label}>
              {renderChip?.(o.value)}
              {o.label}
              <ComboboxItemIndicator />
            </ComboboxItem>
          ))}
          {creatable && (
            <ComboboxCreate
              minLength={1}
              onCreate={(query) => {
                const tag = query.trim();
                if (!tag) return;
                setCreated((list) => [...list, { value: tag, label: tag }]);
                setDraft((d) => [...(d ?? value), tag]);
              }}
            >
              {(state) => <>Create “{state.query}”</>}
            </ComboboxCreate>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

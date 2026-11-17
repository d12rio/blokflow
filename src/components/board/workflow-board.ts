import {
  createChange,
  createTransfer,
  definePrimitive,
  type ChangeDetails,
  type TransferDraft,
  type TransferLists,
} from "@ui-sdk/core";

// createTransfer's reasons; none of them are in the shared vocabulary.
export type BoardChangeReason = "drag" | "move-key" | "imperative";

export type WorkflowBoardOptions = {
  value?: TransferLists;
  defaultValue?: TransferLists;
  onValueChange?: (value: TransferLists, details: ChangeDetails<BoardChangeReason>) => void;
  cardLabel?: (card: string) => string | undefined;
  columnLabel?: (column: string) => string | undefined;
};

const isOver = (state: { moving: TransferDraft | null }, column: string) =>
  !!state.moving && state.moving.from !== column && !!state.moving.lists[column]?.includes(state.moving.key);

const isControl = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("a, button, input, [data-slot='menu-trigger']");

export const workflowBoard = definePrimitive({
  name: "workflow-board",
  options: {
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    cardLabel: "callback",
    columnLabel: "callback",
  },
  controlled: ["value"],
  state: (options: WorkflowBoardOptions) => ({
    value: options.value ?? options.defaultValue ?? {},
    moving: null as TransferDraft | null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context);
    const transfer = createTransfer(context, {
      key: "value",
      draft: "moving",
      set: (value, { reason, event }) => change("value", value, { reason, event }),
      order: () => Object.keys(context.store.get().value),
      label: (card) => context.options().cardLabel?.(card),
      listLabel: (column) => context.options().columnLabel?.(column),
    });
    return {
      transfer,
      moveCard: (card: string, column: string) => transfer.move(card, column, 0),
    };
  },
  slots: (slot) => ({
    root: slot({}),
    column: slot<{ value: string }, { over: boolean }>({
      props: { value: "string" },
      state: (state, { key }) => ({ over: isOver(state, key) }),
      attrs: (state, { key }) => ({ "data-over": isOver(state, key) ? "" : undefined }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }, { moving: boolean; dragging: boolean }>({
      props: { value: "string" },
      state: (state, { api, key }) => ({ moving: api.transfer.moving(state, key), dragging: api.transfer.dragging(state, key) }),
      attrs: (state, { api, key }) => ({ "data-grabbed": api.transfer.moving(state, key) ? "" : undefined }),
      on: {
        // The whole card drags, except its link and buttons, so a click on them stays a click.
        pointerdown: (event, { api, key }) => {
          if (!isControl(event.target)) api.transfer.pointerdown(event as PointerEvent, key);
        },
      },
      bind: (el, { api, key }) => api.transfer.bindItem(el, key),
    }),
    // Cards hold a link and a menu, so keyboard moves go through a handle of their own.
    handle: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      on: {
        keydown: (event, { api, key }) => {
          api.transfer.keydown(event as KeyboardEvent, key);
        },
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event as PointerEvent, key),
      },
    }),
  }),
  agent: { actions: ["moveCard"] },
});

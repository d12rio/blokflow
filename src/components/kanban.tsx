"use client";

import { Button } from "@ui-sdk/react/button";
import { createDialogController } from "@ui-sdk/react/dialog";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { createMenuController, Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "@ui-sdk/react/menu";
import { OverlayHost } from "@ui-sdk/react/overlays";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { Toast, ToastAction, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import type { ActionError, BoardActions } from "@/app/actions";
import { BoardColumn, BoardRoot } from "@/components/board/board-parts";
import { SettingsDialog } from "@/components/settings-dialog";
import { StoryCard } from "@/components/story-card";
import { StoryDialog } from "@/components/story-dialog";
import {
  buildLists,
  columnKey,
  filterCards,
  findMove,
  isAssignedTo,
  markAssigned,
  moveCard,
  type Card,
  type Lists,
  type Me,
  type Person,
  type Stage,
  type Workflow,
} from "@/lib/board";
import { appendPage, listsFromColumns, mergeCards, moveId, type Columns, type StagePage } from "@/lib/columns";
import type { PluginSettings } from "@/lib/settings";
import { useStoredFlag } from "@/lib/use-stored-flag";
import type { SessionRef } from "@/lib/storyblok/session";
import { signInUrl, storyEditorUrl } from "@/lib/storyblok/urls";

const INSTRUCTIONS_ID = "board-instructions";
const MIN_SEARCH = 2;

const toPage = (r: { stageId: number; page: number; cards: Card[]; total: number }): StagePage => ({
  stageId: r.stageId,
  page: r.page,
  total: r.total,
  ids: r.cards.map((c) => c.id),
});

// Loads the next page when it scrolls into view, and stays a button for keyboards and as a fallback.
function LoadMore({ stageName, remaining, loading, onLoad }: { stageName: string; remaining: number; loading: boolean; onLoad: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef(onLoad);
  useEffect(() => {
    latest.current = onLoad;
  });
  useEffect(() => {
    const el = sentinel.current;
    if (!el || loading) return;
    // Recreated after each load, so a column that's still shorter than the viewport keeps filling.
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && latest.current(), { rootMargin: "240px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);
  return (
    <div ref={sentinel} className="load-more">
      <Button className="secondary-button" onClick={onLoad} disabled={loading} aria-label={`Load more stories in ${stageName}`}>
        {loading ? "Loading\…" : `Load more${remaining ? ` (${remaining})` : ""}`}
      </Button>
    </div>
  );
}

type Props = {
  session: SessionRef;
  actions: BoardActions;
  workflows: Workflow[];
  workflow: Workflow;
  stages: Stage[];
  initial: { cards: Card[]; columns: Columns; mineIds: number[] };
  people: Person[];
  tags: string[];
  me: Me;
  settings: PluginSettings;
  settingsError: string | null;
};

function failed(title: string, result: ActionError) {
  toast.error(title, {
    description: result.error,
    ...(result.signedOut && { action: { label: "Sign in", href: signInUrl } }),
  });
}

export function Kanban({ session, actions, workflows, workflow, stages, initial, people, tags, me, settings, settingsError }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshing, startRefresh] = useTransition();

  const [cards, setCards] = useState(initial.cards);
  const [columns, setColumns] = useState(initial.columns);
  const [search, setSearch] = useState<{ query: string; columns: Columns } | null>(null);
  const [loadedInitial, setLoadedInitial] = useState(initial);
  if (loadedInitial !== initial) {
    setLoadedInitial(initial);
    setCards(initial.cards);
    setColumns(initial.columns);
    setSearch(null);
  }
  const [loading, setLoading] = useState<ReadonlySet<number>>(new Set());

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchFor = deferredQuery.trim();
  // Searching asks Storyblok per stage, so it finds stories that aren't loaded yet.
  const searching = searchFor.length >= MIN_SEARCH;
  const [mineOnly, showMine] = useStoredFlag(`kanban:${session.spaceId}:${session.userId}:mine`);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [now] = useState(() => Date.now());
  const [menu] = useState(() => createMenuController<number>());
  const [details] = useState(() => createDialogController<number>());
  const searchRef = useRef<HTMLInputElement>(null);

  useShortcut("/", () => searchRef.current?.focus(), { description: "Search stories" });

  const peopleById = useMemo(() => {
    const byId = Object.fromEntries(people.map((p) => [p.id, p])) as Record<number, Person>;
    // The collaborators list can leave out the space's owner, so the current user always has a name.
    byId[me.userId] ??= { id: me.userId, name: "You", avatar: null, roleIds: me.roleIds };
    return byId;
  }, [people, me]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const visibleStages = useMemo(
    () => stages.filter((s) => !settings.hiddenStageIds.includes(s.id)),
    [stages, settings.hiddenStageIds],
  );
  const onBoard = useMemo(() => cards.filter((c) => !settings.hiddenStageIds.includes(c.stageId)), [cards, settings.hiddenStageIds]);
  const mineIds = initial.mineIds;
  const markMine = useCallback((list: Card[]) => markAssigned(list, mineIds, me.userId), [mineIds, me.userId]);
  const searchColumns = searching && search?.query === searchFor ? search.columns : null;
  const searchPending = searching && !searchColumns;

  // "Assigned to me" is complete from the start, so it filters what's loaded; otherwise the columns
  // show Storyblok's pages, or the search results.
  const lists = useMemo(() => {
    if (mineOnly) return buildLists(visibleStages, filterCards(onBoard, { mineOnly: true, query: deferredQuery, me }));
    return listsFromColumns(visibleStages, searching ? (searchColumns ?? {}) : columns, cardById);
  }, [mineOnly, visibleStages, onBoard, deferredQuery, me, searching, searchColumns, columns, cardById]);
  const shownColumns = mineOnly ? null : searching ? searchColumns : columns;
  const mineCount = useMemo(() => onBoard.filter((c) => isAssignedTo(c, me)).length, [onBoard, me]);
  const shownCount = Object.values(lists).reduce((n, keys) => n + keys.length, 0);

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    Promise.all(visibleStages.map((s) => actions.onLoadPage(session, { stageId: s.id, page: 1, search: searchFor }))).then((results) => {
      if (cancelled) return;
      const problem = results.find((r) => !r.ok);
      if (problem && !problem.ok) failed("Couldn\’t search the stories", problem);
      const pages = results.flatMap((r) => (r.ok ? [r] : []));
      setCards((cs) => mergeCards(cs, markMine(pages.flatMap((r) => r.cards))));
      setSearch({ query: searchFor, columns: pages.reduce<Columns>((acc, r) => appendPage(acc, toPage(r)), {}) });
    });
    return () => {
      cancelled = true;
    };
  }, [searching, searchFor, visibleStages, actions, session, markMine]);

  async function loadMore(stageId: number) {
    const source = searching ? searchColumns : columns;
    const column = source?.[stageId];
    if (!column || column.done || loading.has(stageId)) return;
    setLoading((prev) => new Set(prev).add(stageId));
    const result = await actions.onLoadPage(session, { stageId, page: column.page + 1, search: searching ? searchFor : undefined });
    setLoading((prev) => {
      const next = new Set(prev);
      next.delete(stageId);
      return next;
    });
    if (!result.ok) return failed(`Couldn\’t load more of ${stageById.get(stageId)?.name ?? "this stage"}`, result);
    setCards((cs) => mergeCards(cs, markMine(result.cards), pending));
    if (searching) setSearch((s) => (s && s.query === searchFor ? { ...s, columns: appendPage(s.columns, toPage(result)) } : s));
    else setColumns((c) => appendPage(c, toPage(result)));
  }

  function shiftColumns(id: number, from: number, to: number) {
    setColumns((c) => moveId(c, id, from, to));
    setSearch((s) => (s ? { ...s, columns: moveId(s.columns, id, from, to) } : s));
  }

  const updateCard = useCallback(
    (storyId: number, patch: Partial<Card>) => setCards((cs) => cs.map((c) => (c.id === storyId ? { ...c, ...patch } : c))),
    [],
  );

  const setPendingFor = (id: number, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function move(card: Card, stageId: number) {
    if (card.stageId === stageId) return;
    const from = card.stageId;
    const target = stageById.get(stageId)?.name ?? "the new stage";
    setCards((cs) => moveCard(cs, card.id, stageId));
    shiftColumns(card.id, from, stageId);
    setPendingFor(card.id, true);
    const result = await actions.onMove(session, { storyId: card.id, stageId });
    setPendingFor(card.id, false);
    if (!result.ok) {
      setCards((cs) => moveCard(cs, card.id, from));
      shiftColumns(card.id, stageId, from);
      failed(`Couldn't move “${card.name}” to ${target}`, result);
      return;
    }
    setCards((cs) => moveCard(cs, card.id, result.stageId, { dueDate: result.dueDate }));
    toast.success(`Moved “${card.name}” to ${target}`);
  }

  async function assign(card: Card) {
    setPendingFor(card.id, true);
    const result = await actions.onAssignToMe(session, {
      storyId: card.id,
      stageId: card.stageId,
      dueDate: card.dueDate,
    });
    setPendingFor(card.id, false);
    if (!result.ok) {
      failed(`Couldn't assign “${card.name}” to you`, result);
      return;
    }
    setCards((cs) =>
      cs.map((c) => (c.id === card.id ? { ...c, userIds: [...new Set([...c.userIds, me.userId])], dueDate: result.dueDate ?? c.dueDate } : c)),
    );
    toast.success(`Assigned “${card.name}” to you`);
  }

  function onBoardChange(next: Lists) {
    const moved = findMove(lists, next);
    const card = moved && cardById.get(Number(moved.key));
    if (moved && card) void move(card, Number(moved.to));
  }

  const cardLabel = useCallback((key: string) => cardById.get(Number(key))?.name, [cardById]);
  const columnLabel = useCallback((key: string) => stageById.get(Number(key))?.name, [stageById]);

  function switchWorkflow(id: string | null) {
    if (!id || Number(id) === workflow.id) return;
    const params = new URLSearchParams(searchParams?.toString());
    params.set("workflow", id);
    router.push(`?${params}`);
  }

  const total = visibleStages.reduce((n, s) => n + (columns[s.id]?.total ?? 0), 0);
  const emptyMessage =
    stages.length === 0
      ? "This workflow has no stages. Add them in Storyblok under Settings → Workflows."
      : total === 0
        ? "No stories are in this workflow yet. A story joins it when someone sets its workflow stage in Storyblok."
        : mineOnly && mineCount === 0
          ? "Nothing in this workflow is assigned to you."
          : !searchPending && shownCount === 0 && deferredQuery.trim()
            ? "No stories match your search."
            : null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Blokflow</h1>
          <p>
            {total} {total === 1 ? "story" : "stories"} in {workflow.name}
          </p>
        </div>

        {workflows.length > 1 && (
          <Select value={String(workflow.id)} onValueChange={(v) => switchWorkflow(v as string | null)}>
            <SelectLabel>Workflow</SelectLabel>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <SegmentedControl
          aria-label="Show"
          value={mineOnly ? "mine" : "all"}
          onValueChange={(v) => showMine(v === "mine")}
        >
          <SegmentedControlIndicator />
          <SegmentedControlItem value="all">All stories</SegmentedControlItem>
          <SegmentedControlItem value="mine">Assigned to me ({mineCount})</SegmentedControlItem>
        </SegmentedControl>

        <InputGroup className="search">
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search stories"
            aria-keyshortcuts="/"
            placeholder="Search stories…  /"
            value={query}
            onValueChange={setQuery}
          />
          <InputClear aria-label="Clear search" />
        </InputGroup>

        <div className="header-actions">
          <Button
            className="secondary-button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            pendingAnnouncement="Refreshing the board"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <SettingsDialog
            session={session}
            settings={settings}
            error={settingsError}
            workflows={workflows}
            stages={stages}
            onSave={actions.onSaveSettings}
          />
        </div>
      </header>

      {emptyMessage && (
        <div className="empty-banner" role="status">
          <span>{emptyMessage}</span>
          {mineOnly && mineCount === 0 && total > 0 && (
            <Button className="link-button" onClick={() => showMine(false)}>
              Show all stories
            </Button>
          )}
        </div>
      )}

      <p id={INSTRUCTIONS_ID} className="visually-hidden">
        Press Space or Enter to pick up the story. Use Left and Right to move it to another stage, then Space or Enter to drop it.
        Escape puts it back.
      </p>

      <BoardRoot
        className="board"
        data-column-width={settings.columnWidth}
        value={lists}
        onValueChange={onBoardChange}
        cardLabel={cardLabel}
        columnLabel={columnLabel}
      >
        {visibleStages.map((stage) => {
          const keys = lists[columnKey(stage.id)] ?? [];
          const column = shownColumns?.[stage.id];
          const count = column ? column.total : keys.length;
          return (
            <section key={stage.id} className="column" aria-labelledby={`stage-${stage.id}`}>
              <header className="column-header">
                <span className="stage-dot" style={{ "--stage-color": stage.color } as CSSProperties} aria-hidden="true" />
                <h2 id={`stage-${stage.id}`}>{stage.name}</h2>
                <span className="count" aria-label={`${count} ${count === 1 ? "story" : "stories"}`}>
                  {count}
                </span>
              </header>
              <div className="column-scroll">
                <BoardColumn
                  value={columnKey(stage.id)}
                  className="column-list"
                  aria-labelledby={`stage-${stage.id}`}
                  aria-busy={searchPending || undefined}
                >
                {keys.map((key) => {
                  const card = cardById.get(Number(key));
                  if (!card) return null;
                  return (
                    <StoryCard
                      key={key}
                      card={card}
                      people={peopleById}
                      mine={isAssignedTo(card, me)}
                      pending={pending.has(card.id)}
                      now={now}
                      menu={menu}
                      details={details}
                      instructionsId={INSTRUCTIONS_ID}
                    />
                  );
                })}
                </BoardColumn>
                {column && !column.done && (
                  <LoadMore
                    stageName={stage.name}
                    remaining={Math.max(0, column.total - keys.length)}
                    loading={loading.has(stage.id)}
                    onLoad={() => void loadMore(stage.id)}
                  />
                )}
              </div>
            </section>
          );
        })}
      </BoardRoot>

      <Menu
        controller={menu}
        onAction={(value) => {
          const card = cardById.get(menu.getPayload() ?? -1);
          if (!card) return;
          if (value.startsWith("move:")) void move(card, Number(value.slice(5)));
          else if (value === "assign") return assign(card);
          else if (value === "open") window.open(storyEditorUrl(session.spaceId, card.id), "_blank", "noopener");
        }}
        pendingAnnouncement="Assigning the story"
      >
        <MenuContent<number> align="end">
          {(state) => {
            const card = state.payload === undefined ? undefined : cardById.get(state.payload);
            if (!card) return null;
            const targets = stages.filter((s) => s.id !== card.stageId);
            return (
              <>
                <MenuGroup>
                  <MenuGroupLabel>Move to</MenuGroupLabel>
                  {targets.map((s) => (
                    <MenuItem key={s.id} value={`move:${s.id}`}>
                      <span className="stage-dot" style={{ "--stage-color": s.color } as CSSProperties} aria-hidden="true" />
                      {s.name}
                      {settings.hiddenStageIds.includes(s.id) && <span className="menu-hint">hidden</span>}
                    </MenuItem>
                  ))}
                  {targets.length === 0 && (
                    <MenuItem value="none" disabled>
                      No other stages
                    </MenuItem>
                  )}
                </MenuGroup>
                <MenuSeparator />
                <MenuItem value="assign" disabled={card.userIds.includes(me.userId)}>
                  {card.userIds.includes(me.userId) ? "Assigned to you" : "Assign to me"}
                </MenuItem>
                <MenuItem value="open">Open in Storyblok</MenuItem>
              </>
            );
          }}
        </MenuContent>
      </Menu>

      <StoryDialog
        controller={details}
        session={session}
        cards={cardById}
        stages={stages}
        people={peopleById}
        tags={tags}
        me={me.userId}
        now={now}
        actions={actions}
        onCardChange={updateCard}
      />

      <ToastRegion>
        {() => (
          <Toast>
            <ToastTitle />
            <ToastDescription />
            <ToastAction />
            <ToastClose aria-label="Dismiss" />
          </Toast>
        )}
      </ToastRegion>
      <OverlayHost />
    </div>
  );
}

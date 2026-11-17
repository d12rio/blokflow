import type { AppSession } from "@storyblok/app-extension-auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { assignToMe, loadStagePage, loadStoryDetails, moveStory, saveSpaceSettings, saveStoryBasics, saveWorkflow } from "@/app/actions";
import { Kanban } from "@/components/kanban";
import { LoadingBoard } from "@/components/loading-board";
import { Notice } from "@/components/notice";
import { markAssigned, pickWorkflow } from "@/lib/board";
import { columnFromPage, mergeCards, type Columns } from "@/lib/columns";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  listAssignedToMe,
  listPeople,
  listStages,
  listStagePage,
  listTags,
  listWorkflows,
  loadSettings,
  MapiError,
} from "@/lib/storyblok/mapi";
import { getAppSession } from "@/lib/storyblok/session";
import { signInUrl } from "@/lib/storyblok/urls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LoadingBoard />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}

// Stages load a few at a time, to stay well inside Storyblok's rate limit.
const STAGE_CONCURRENCY = 3;

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return results;
}

async function loadBoard(session: AppSession, requestedWorkflow: number | null) {
  const [workflows, people, tags, settingsResult] = await Promise.all([
    listWorkflows(session),
    listPeople(session),
    listTags(session),
    loadSettings(session).then(
      (settings) => ({ settings, error: null }),
      (error: unknown) => ({ settings: DEFAULT_SETTINGS, error: error instanceof Error ? error.message : String(error) }),
    ),
  ]);
  const workflow = pickWorkflow(workflows, requestedWorkflow, settingsResult.settings.defaultWorkflowId);
  if (!workflow) return null;

  const stages = await listStages(session, workflow.id);
  const visible = stages.filter((s) => !settingsResult.settings.hiddenStageIds.includes(s.id));
  // Only the first page of each visible stage; the board loads more as a column is scrolled.
  const [pages, assigned] = await Promise.all([
    inBatches(visible, STAGE_CONCURRENCY, async (s) => ({ stageId: s.id, ...(await listStagePage(session, s.id, 1)) })),
    listAssignedToMe(
      session,
      visible.map((s) => s.id),
    ),
  ]);
  const mineIds = assigned.map((c) => c.id);
  const cards = markAssigned(mergeCards(assigned, pages.flatMap((p) => p.cards)), mineIds, session.userId);
  const columns: Columns = Object.fromEntries(
    pages.map((p) => [p.stageId, columnFromPage({ ids: p.cards.map((c) => c.id), total: p.total, page: 1 })]),
  );
  const me = { userId: session.userId, roleIds: people.find((p) => p.id === session.userId)?.roleIds ?? [] };
  return { workflows, workflow, stages, initial: { cards, columns, mineIds }, people, tags, me, settings: settingsResult.settings, settingsError: settingsResult.error };
}

async function Board({ searchParams }: { searchParams: SearchParams }) {
  // The session check compares the token expiry with the current time, so it only runs at request time.
  await connection();
  const params = await searchParams;
  const spaceId = Number(params.space_id);
  const userId = Number(params.user_id);

  const session = spaceId && userId ? await getAppSession({ spaceId, userId }) : undefined;
  if (!session) redirect(signInUrl);

  const result = await loadBoard(session, Number(params.workflow) || null).then(
    (board) => ({ board, error: null }),
    (error: unknown) => ({ board: null, error }),
  );

  if (result.error) {
    const { error } = result;
    if (error instanceof MapiError && error.status === 401) redirect(signInUrl);
    const forbidden = error instanceof MapiError && error.status === 403;
    return (
      <Notice title={forbidden ? "This plugin can't read workflows here" : "Couldn't load the board"} signIn={forbidden}>
        {forbidden
          ? "Your role or the plugin's permissions don't include workflows. Ask an admin, or sign in again to grant access."
          : error instanceof Error
            ? error.message
            : String(error)}
      </Notice>
    );
  }

  const { board } = result;
  if (!board) {
    return (
      <Notice title="This space has no workflows yet">
        Create one in Storyblok under Settings → Workflows, then reopen this board.
      </Notice>
    );
  }

  return (
    <Kanban
      key={board.workflow.id}
      session={{ spaceId, userId }}
      actions={{
        onMove: moveStory,
        onAssignToMe: assignToMe,
        onSaveSettings: saveSpaceSettings,
        onLoadDetails: loadStoryDetails,
        onSaveBasics: saveStoryBasics,
        onSaveWorkflow: saveWorkflow,
        onLoadPage: loadStagePage,
      }}
      workflows={board.workflows}
      workflow={board.workflow}
      stages={board.stages}
      initial={board.initial}
      people={board.people}
      tags={board.tags}
      me={board.me}
      settings={board.settings}
      settingsError={board.settingsError}
    />
  );
}

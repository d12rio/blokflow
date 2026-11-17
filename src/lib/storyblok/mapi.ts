import "server-only";
import type { AppSession } from "@storyblok/app-extension-auth";
import { getManagementBaseUrl } from "@storyblok/region-helper";
import { errorReason } from "./errors";
import {
  parseCollaborator,
  parseStage,
  parseStory,
  parseWorkflow,
  sortStages,
  type Card,
  type Person,
  type Stage,
  type Workflow,
} from "../board";
import { PAGE_SIZE } from "../columns";
import { normalizeSettings, type PluginSettings } from "../settings";
import { parseComments, parseStoryDetails, type StoryDetails } from "../story-details";

type MapiSession = Pick<AppSession, "accessToken" | "spaceId" | "region">;

const STORIES_PER_PAGE = 100;
const MAX_RETRIES = 5;

export class MapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // What Storyblok said, without the request line, for showing to people.
    readonly reason: string,
  ) {
    super(message);
  }
}


async function mapi(session: MapiSession, path: string, init?: RequestInit) {
  const url = `${getManagementBaseUrl(session.region)}/v1/spaces/${session.spaceId}${path}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    // No Retry-After header is documented, so back off exponentially on 429.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new MapiError(
        `Storyblok ${init?.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status} ${body}`,
        res.status,
        errorReason(body) || `HTTP ${res.status}`,
      );
    }
    return res;
  }
}

const parsed = <T>(items: unknown, parse: (raw: unknown) => T | null) =>
  (Array.isArray(items) ? items : []).map(parse).filter((x): x is T => x !== null);

export async function listWorkflows(session: MapiSession): Promise<Workflow[]> {
  const res = await mapi(session, "/workflows");
  const { workflows } = (await res.json()) as { workflows?: unknown };
  return parsed(workflows, parseWorkflow);
}

export async function listStages(session: MapiSession, workflowId: number): Promise<Stage[]> {
  const res = await mapi(session, `/workflow_stages?in_workflow=${workflowId}`);
  const { workflow_stages } = (await res.json()) as { workflow_stages?: unknown };
  return sortStages(parsed(workflow_stages, parseStage).filter((s) => s.workflowId === workflowId));
}

const STORY_ORDER = "updated_at:desc";

// One page of one stage, newest first. `total` is the stage's full count, from Storyblok's header.
export async function listStagePage(
  session: MapiSession,
  stageId: number,
  page: number,
  search?: string,
): Promise<{ cards: Card[]; total: number }> {
  const params = new URLSearchParams({
    in_workflow_stages: String(stageId),
    story_only: "true",
    sort_by: STORY_ORDER,
    per_page: String(PAGE_SIZE),
    page: String(page),
  });
  if (search?.trim()) params.set("search", search.trim());
  const res = await mapi(session, `/stories?${params}`);
  const { stories } = (await res.json()) as { stories?: unknown[] };
  const cards = parsed(stories, parseStory);
  return { cards, total: Number(res.headers.get("total") ?? cards.length) };
}

// The story list leaves out assignees (only GET /stories/:id has them), but its `mine` filter
// returns the stories assigned to the signed-in user. Loading all of them up front keeps
// "Assigned to me" complete however far each column has been scrolled.
export async function listAssignedToMe(session: MapiSession, stageIds: number[]): Promise<Card[]> {
  if (!stageIds.length) return [];
  const cards: Card[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      in_workflow_stages: stageIds.join(","),
      story_only: "true",
      mine: "true",
      sort_by: STORY_ORDER,
      per_page: String(STORIES_PER_PAGE),
      page: String(page),
    });
    const res = await mapi(session, `/stories?${params}`);
    const { stories } = (await res.json()) as { stories?: unknown[] };
    const batch = stories ?? [];
    cards.push(...parsed(batch, parseStory));
    const total = Number(res.headers.get("total") ?? 0);
    if (batch.length < STORIES_PER_PAGE || page * STORIES_PER_PAGE >= total) return cards;
  }
}

export async function getStoryAssignees(session: MapiSession, storyId: number) {
  const res = await mapi(session, `/stories/${storyId}`);
  const { story } = (await res.json()) as { story?: { user_ids?: unknown; space_role_ids?: unknown } };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);
  return { userIds: ids(story?.user_ids), roleIds: ids(story?.space_role_ids) };
}

const message = (error: unknown) =>
  error instanceof MapiError && (error.status === 401 || error.status === 403)
    ? "Storyblok doesn't let this plugin read them."
    : error instanceof Error
      ? error.message
      : String(error);

async function loadComments(session: MapiSession, storyId: number): Promise<unknown[]> {
  const res = await mapi(session, `/comments?with_story=${storyId}&per_page=100`);
  const { comments } = (await res.json()) as { comments?: unknown[] };
  return comments ?? [];
}

// Everything the story modal shows: the full story (which, unlike the list, has every assignee) and its
// story-level comments. Comments load on their own, so if Storyblok refuses them the details still show.
// Field-level discussions aren't readable with a plugin's token, so they're left out.
export async function getStoryDetails(session: MapiSession, storyId: number): Promise<StoryDetails> {
  const [storyRes, comments] = await Promise.allSettled([
    mapi(session, `/stories/${storyId}`).then((res) => res.json() as Promise<{ story?: unknown }>),
    loadComments(session, storyId),
  ]);
  if (storyRes.status === "rejected") throw storyRes.reason;
  const story = parseStoryDetails(storyRes.value.story);
  if (!story) throw new Error(`Storyblok returned no story for ${storyId}.`);

  return {
    ...story,
    // Story-level comments are the ones outside a field discussion.
    comments:
      comments.status === "fulfilled"
        ? parseComments(comments.value.filter((c) => !(c as { discussion_id?: unknown }).discussion_id))
        : [],
    commentsError: comments.status === "rejected" ? message(comments.reason) : null,
  };
}

// Used for names and avatars on cards, and for the current user's roles. Not every role may
// read collaborators, so a failure leaves the board working with ids only.
export async function listPeople(session: MapiSession): Promise<Person[]> {
  try {
    const res = await mapi(session, "/collaborators");
    const { collaborators } = (await res.json()) as { collaborators?: unknown };
    return parsed(collaborators, parseCollaborator);
  } catch {
    return [];
  }
}

export type StageChange = {
  storyId: number;
  stageId: number;
  assignUserIds?: number[];
  assignRoleIds?: number[];
  // Left out: Storyblok's default. null: no due date.
  dueDate?: string | null;
};

export async function createStageChange(session: MapiSession, change: StageChange) {
  const body: Record<string, unknown> = {
    workflow_stage_change: {
      story_id: change.storyId,
      workflow_stage_id: change.stageId,
      ...(change.dueDate !== undefined && { due_date: change.dueDate }),
    },
  };
  if (change.assignUserIds) body.assign = { user_ids: change.assignUserIds, space_role_ids: change.assignRoleIds ?? [] };
  const res = await mapi(session, "/workflow_stage_changes", { method: "POST", body: JSON.stringify(body) });
  const { workflow_stage_change } = (await res.json()) as {
    workflow_stage_change?: { workflow_stage_id?: number; due_date?: string | null };
  };
  return {
    stageId: workflow_stage_change?.workflow_stage_id ?? change.stageId,
    dueDate: workflow_stage_change?.due_date ?? null,
  };
}

export type StoryPatch = { name?: string; slug?: string; tags?: string[] };

// Changes only the given basics. The story is read first and its content sent back as received,
// so nothing else changes; it is saved as a draft and never published.
export async function updateStoryBasics(session: MapiSession, storyId: number, patch: StoryPatch) {
  const current = ((await (await mapi(session, `/stories/${storyId}`)).json()) as { story?: Record<string, unknown> }).story;
  if (!current) throw new Error(`Storyblok returned no story for ${storyId}.`);
  const res = await mapi(session, `/stories/${storyId}`, {
    method: "PUT",
    body: JSON.stringify({
      story: {
        name: patch.name ?? current.name,
        slug: patch.slug ?? current.slug,
        tag_list: patch.tags ?? current.tag_list,
        content: current.content,
      },
    }),
  });
  const story = parseStoryDetails(((await res.json()) as { story?: unknown }).story);
  if (!story) throw new Error("Storyblok didn't return the saved story.");
  return story;
}

export async function listTags(session: MapiSession): Promise<string[]> {
  try {
    const res = await mapi(session, "/tags");
    const { tags } = (await res.json()) as { tags?: { name?: unknown }[] };
    return (tags ?? []).map((t) => t.name).filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

// Space-level settings live on this plugin's app provision. We find it by slug in the space's list,
// which also gives us the app id the update needs.
async function findProvision(session: MapiSession) {
  const slug = process.env.STORYBLOK_SPACE_PLUGIN_SLUG;
  if (!slug) throw new Error("Missing environment variable STORYBLOK_SPACE_PLUGIN_SLUG. See .env.example.");
  const res = await mapi(session, "/app_provisions");
  const { app_provisions } = (await res.json()) as {
    app_provisions: { app_id: number | string; slug: string; space_level_settings?: unknown }[];
  };
  const provision = app_provisions.find((p) => p.slug === slug);
  if (!provision) throw new Error(`The plugin "${slug}" isn't installed in this space.`);
  return provision;
}

export async function loadSettings(session: MapiSession): Promise<PluginSettings> {
  return normalizeSettings((await findProvision(session)).space_level_settings);
}

export async function saveSettings(session: MapiSession, settings: PluginSettings) {
  const { app_id } = await findProvision(session);
  await mapi(session, `/app_provisions/${app_id}`, {
    method: "PUT",
    body: JSON.stringify({ app_provision: { space_level_settings: normalizeSettings(settings) } }),
  });
}

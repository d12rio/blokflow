"use server";

import type { AssignRequest, BasicsResult, DetailsResult, MoveRequest, PageRequest, PageResult, StageResult, WorkflowRequest } from "@/app/actions";
import { replaceLastSegment } from "@/lib/story-edit";
import type { StoryPatch } from "@/lib/storyblok/mapi";
import { parseComments, parseStoryDetails } from "@/lib/story-details";
import type { SessionRef } from "@/lib/storyblok/session";
import { demoCards, demoCommentsRaw, demoPage, demoStoryRaw, FAILING_STORY_ID } from "./demo";

// Fake saves for the dev-only preview: nothing reaches Storyblok.
const wait = () => new Promise((r) => setTimeout(r, 400));

function devOnly() {
  if (process.env.NODE_ENV === "production") throw new Error("The preview is only available in development.");
}

export async function previewMove(_ref: SessionRef, request: MoveRequest): Promise<StageResult> {
  devOnly();
  await wait();
  if (request.storyId === FAILING_STORY_ID) {
    return { ok: false, error: "Storyblok didn't allow this move: This stage can't be changed by your role." };
  }
  return { ok: true, stageId: request.stageId, dueDate: null };
}

export async function previewAssign(_ref: SessionRef, request: AssignRequest): Promise<StageResult> {
  devOnly();
  await wait();
  return { ok: true, stageId: request.stageId, dueDate: request.dueDate };
}

export async function previewSaveSettings(): Promise<{ ok: true }> {
  devOnly();
  await wait();
  return { ok: true };
}

export async function previewLoadDetails(_ref: SessionRef, storyId: number): Promise<DetailsResult> {
  devOnly();
  await wait();
  const card = demoCards.find((c) => c.id === storyId);
  const story = card && parseStoryDetails(demoStoryRaw(card));
  if (!story) return { ok: false, error: `Storyblok GET /stories/${storyId} failed: 404` };
  return {
    ok: true,
    details: {
      ...story,
      comments: parseComments(demoCommentsRaw(storyId)),
      commentsError: null,
    },
  };
}

// The preview remembers edits for as long as the dev server runs.
const edited = new Map<number, { name?: string; slug?: string; tags?: string[] }>();

export async function previewSaveBasics(_ref: SessionRef, storyId: number, patch: StoryPatch): Promise<BasicsResult> {
  devOnly();
  await wait();
  const card = demoCards.find((c) => c.id === storyId);
  if (!card) return { ok: false, error: "Story not found." };
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "A story needs a name." };
  const next = { ...edited.get(storyId), ...patch };
  edited.set(storyId, next);
  const raw = demoStoryRaw(card);
  const slug = next.slug ?? card.fullSlug.split("/").pop() ?? "";
  const story = parseStoryDetails({
    ...raw,
    name: next.name ?? raw.name,
    full_slug: replaceLastSegment(card.fullSlug, slug),
    tag_list: next.tags ?? raw.tag_list,
    updated_at: new Date().toISOString(),
    unpublished_changes: raw.published,
  });
  return story ? { ok: true, details: story } : { ok: false, error: "Story not found." };
}

export async function previewSaveWorkflow(_ref: SessionRef, request: WorkflowRequest): Promise<StageResult> {
  devOnly();
  await wait();
  if (request.storyId === FAILING_STORY_ID) {
    return { ok: false, error: "Storyblok didn't allow this change: This stage can't be changed by your role." };
  }
  return { ok: true, stageId: request.stageId, dueDate: request.dueDate };
}

export async function previewLoadPage(_ref: SessionRef, request: PageRequest): Promise<PageResult> {
  devOnly();
  await wait();
  return { ok: true, stageId: request.stageId, page: request.page, ...demoPage(request.stageId, request.page, request.search) };
}

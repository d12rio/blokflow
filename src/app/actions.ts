"use server";

import type { PluginSettings } from "@/lib/settings";
import type { StoryDetails } from "@/lib/story-details";
import type { Card } from "@/lib/board";
import {
  createStageChange,
  getStoryAssignees,
  getStoryDetails,
  listStagePage,
  MapiError,
  saveSettings,
  updateStoryBasics,
  type StoryPatch,
} from "@/lib/storyblok/mapi";
import { normalizeTags, slugify } from "@/lib/story-edit";
import { getAppSession, type SessionRef } from "@/lib/storyblok/session";

export type ActionError = { ok: false; error: string; signedOut?: boolean };
const signedOut: ActionError = { ok: false, error: "Your Storyblok session expired.", signedOut: true };
const failure = (error: unknown): ActionError => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

export type MoveRequest = { storyId: number; stageId: number };
export type AssignRequest = { storyId: number; stageId: number; dueDate: string | null };
export type StageResult = { ok: true; stageId: number; dueDate: string | null } | ActionError;

// Moves only change the stage. Publishing stays a separate, explicit step in Storyblok.
// Which transitions are allowed is Storyblok's call; a refusal comes back with its reason.
export async function moveStory(ref: SessionRef, request: MoveRequest): Promise<StageResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    return { ok: true, ...(await createStageChange(session, request)) };
  } catch (error) {
    return refused("this move", error);
  }
}

// Storyblok assigns people through a stage change, so this re-enters the current stage with the new assignees.
// The board's story list doesn't include assignees, so the current ones are read first and kept.
export async function assignToMe(ref: SessionRef, request: AssignRequest): Promise<StageResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    const current = await getStoryAssignees(session, request.storyId);
    return {
      ok: true,
      ...(await createStageChange(session, {
        storyId: request.storyId,
        stageId: request.stageId,
        assignUserIds: [...new Set([...current.userIds, session.userId])],
        assignRoleIds: current.roleIds,
        dueDate: request.dueDate,
      })),
    };
  } catch (error) {
    return failure(error);
  }
}

// A refusal from Storyblok (validation, permissions) comes back as its own words.
const refused = (what: string, error: unknown): ActionError => {
  if (error instanceof MapiError && error.status === 401) return signedOut;
  if (error instanceof MapiError && error.status >= 400 && error.status < 500) {
    return { ok: false, error: `Storyblok didn't allow ${what}: ${error.reason}` };
  }
  return failure(error);
};

export type BasicsResult = { ok: true; details: Omit<StoryDetails, "comments" | "commentsError"> } | ActionError;

export async function saveStoryBasics(ref: SessionRef, storyId: number, patch: StoryPatch): Promise<BasicsResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  const clean: StoryPatch = {};
  if (patch.name !== undefined) {
    clean.name = patch.name.trim();
    if (!clean.name) return { ok: false, error: "A story needs a name." };
  }
  if (patch.slug !== undefined) {
    clean.slug = slugify(patch.slug);
    if (!clean.slug) return { ok: false, error: "Use letters, numbers, dashes or underscores for the slug." };
  }
  if (patch.tags !== undefined) clean.tags = normalizeTags(patch.tags);
  try {
    return { ok: true, details: await updateStoryBasics(session, storyId, clean) };
  } catch (error) {
    return refused("this change", error);
  }
}

export type WorkflowRequest = { storyId: number; stageId: number; dueDate: string | null; userIds: number[] };

// Stage, due date and assignees are all part of a workflow stage change, so any of them is saved as one,
// with the others sent as they are. Role assignments are read fresh and kept.
export async function saveWorkflow(ref: SessionRef, request: WorkflowRequest): Promise<StageResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    const current = await getStoryAssignees(session, request.storyId);
    return {
      ok: true,
      ...(await createStageChange(session, {
        storyId: request.storyId,
        stageId: request.stageId,
        dueDate: request.dueDate,
        assignUserIds: [...new Set(request.userIds)],
        assignRoleIds: current.roleIds,
      })),
    };
  } catch (error) {
    return refused("this change", error);
  }
}

export type PageRequest = { stageId: number; page: number; search?: string };
export type PageResult = { ok: true; stageId: number; page: number; cards: Card[]; total: number } | ActionError;

export async function loadStagePage(ref: SessionRef, request: PageRequest): Promise<PageResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    const { cards, total } = await listStagePage(session, request.stageId, Math.max(1, request.page), request.search);
    return { ok: true, stageId: request.stageId, page: request.page, cards, total };
  } catch (error) {
    return failure(error);
  }
}

export type DetailsResult = { ok: true; details: StoryDetails } | ActionError;

export async function loadStoryDetails(ref: SessionRef, storyId: number): Promise<DetailsResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    return { ok: true, details: await getStoryDetails(session, storyId) };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSpaceSettings(ref: SessionRef, settings: PluginSettings): Promise<{ ok: true } | ActionError> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    await saveSettings(session, settings);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export type BoardActions = {
  onMove: typeof moveStory;
  onAssignToMe: typeof assignToMe;
  onSaveSettings: typeof saveSpaceSettings;
  onLoadDetails: typeof loadStoryDetails;
  onSaveBasics: typeof saveStoryBasics;
  onSaveWorkflow: typeof saveWorkflow;
  onLoadPage: typeof loadStagePage;
};

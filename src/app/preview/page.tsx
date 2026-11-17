import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Kanban } from "@/components/kanban";
import { LoadingBoard } from "@/components/loading-board";
import { markAssigned } from "@/lib/board";
import { columnFromPage, mergeCards, type Columns } from "@/lib/columns";
import type { PluginSettings } from "@/lib/settings";
import {
  previewAssign,
  previewLoadDetails,
  previewLoadPage,
  previewMove,
  previewSaveBasics,
  previewSaveSettings,
  previewSaveWorkflow,
} from "./actions";
import { DEMO_USER_ID, demoCards, demoPage, demoPeople, demoStages, demoWorkflows } from "./demo";

const settings: PluginSettings = { defaultWorkflowId: null, hiddenStageIds: [106], columnWidth: "comfortable" };

// A dev-only board with demo data and fake saves, for working on the UI without Storyblok.
// It loads like the real page: the first page of each visible stage, plus everything assigned to you.
export default function Preview() {
  if (process.env.NODE_ENV === "production") notFound();
  const visible = demoStages.filter((s) => !settings.hiddenStageIds.includes(s.id));
  const pages = visible.map((s) => ({ stageId: s.id, ...demoPage(s.id, 1) }));
  const assigned = demoCards.filter((c) => c.userIds.includes(DEMO_USER_ID) && visible.some((s) => s.id === c.stageId));
  const mineIds = assigned.map((c) => c.id);
  const columns: Columns = Object.fromEntries(
    pages.map((p) => [p.stageId, columnFromPage({ ids: p.cards.map((c) => c.id), total: p.total, page: 1 })]),
  );
  const cards = markAssigned(mergeCards(assigned, pages.flatMap((p) => p.cards)), mineIds, DEMO_USER_ID);

  return (
    <Suspense fallback={<LoadingBoard />}>
      <Kanban
        session={{ spaceId: 0, userId: DEMO_USER_ID }}
        actions={{
          onMove: previewMove,
          onAssignToMe: previewAssign,
          onSaveSettings: previewSaveSettings,
          onLoadDetails: previewLoadDetails,
          onSaveBasics: previewSaveBasics,
          onSaveWorkflow: previewSaveWorkflow,
          onLoadPage: previewLoadPage,
        }}
        workflows={demoWorkflows}
        workflow={demoWorkflows[0]}
        stages={demoStages}
        initial={{ cards, columns, mineIds }}
        people={demoPeople}
        tags={["devlog", "graphics", "news", "release"]}
        me={{ userId: DEMO_USER_ID, roleIds: [7] }}
        settings={settings}
        settingsError={null}
      />
    </Suspense>
  );
}

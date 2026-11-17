"use client";

import { createParts } from "@ui-sdk/react/primitive";
import { workflowBoard } from "./workflow-board";

export const {
  Root: BoardRoot,
  Column: BoardColumn,
  Card: BoardCard,
  Handle: BoardHandle,
} = createParts(workflowBoard, {
  root: "div",
  column: "ol",
  card: "li",
  handle: "button",
});

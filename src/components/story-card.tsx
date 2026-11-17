"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar";
import { DialogTrigger, type DialogController } from "@ui-sdk/react/dialog";
import { MenuTrigger, type MenuController } from "@ui-sdk/react/menu";
import { memo, useRef } from "react";
import { BoardCard, BoardHandle } from "@/components/board/board-parts";
import { cardKey, dueState, initials, type Card, type Person } from "@/lib/board";
import { avatarUrl } from "@/lib/storyblok/urls";

const MAX_AVATARS = 3;

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const formatDate = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : dateFormat.format(t);
};

type Props = {
  card: Card;
  people: Record<number, Person>;
  mine: boolean;
  pending: boolean;
  now: number;
  menu: MenuController<number>;
  details: DialogController<number>;
  instructionsId: string;
};

const CLICK_SLOP_PX = 5;

export const StoryCard = memo(function StoryCard({ card, people, mine, pending, now, menu, details, instructionsId }: Props) {
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const due = dueState(card.dueDate, now);
  const assignees = card.userIds.map((id) => people[id] ?? { id, name: `User ${id}`, avatar: null, roleIds: [] });
  const status = !card.published ? "Draft" : card.unpublishedChanges ? "Changed" : "Published";

  return (
    <BoardCard
      value={cardKey(card.id)}
      className="story-card"
      data-pending={pending || undefined}
      data-mine={mine || undefined}
      onPointerDownCapture={(e) => {
        pressedAt.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        // A click anywhere on the card opens it, unless it hit a control or ended a drag.
        const start = pressedAt.current;
        const moved = start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX;
        if (moved || (e.target as Element).closest("a, button")) return;
        void details.open({ payload: card.id });
      }}
    >
      <div className="story-card-top">
        <BoardHandle
          value={cardKey(card.id)}
          className="drag-handle"
          aria-label={`Move ${card.name}`}
          aria-describedby={instructionsId}
        >
          <GripIcon />
        </BoardHandle>
        <DialogTrigger controller={details} payload={card.id} className="story-title">
          {card.name}
        </DialogTrigger>
        <MenuTrigger controller={menu} payload={card.id} className="card-menu" aria-label={`Actions for ${card.name}`}>
          <MoreIcon />
        </MenuTrigger>
      </div>

      {card.fullSlug && <p className="story-slug">/{card.fullSlug}</p>}

      <div className="story-meta">
        {card.contentType && <span className="chip">{card.contentType}</span>}
        <span className="chip" data-status={status.toLowerCase()}>
          {status}
        </span>
        {due && card.dueDate && (
          <span className="chip due" data-due={due}>
            {due === "overdue" ? "Overdue · " : "Due "}
            {formatDate(card.dueDate)}
          </span>
        )}
        {assignees.length > 0 && (
          <span className="assignees" role="img" aria-label={`Assigned to ${assignees.map((p) => p.name).join(", ")}`}>
            {assignees.slice(0, MAX_AVATARS).map((person) => (
              <Avatar key={person.id} className="assignee" title={person.name}>
                {person.avatar && <AvatarImage src={avatarUrl(person.avatar)} alt="" />}
                <AvatarFallback>{initials(person.name)}</AvatarFallback>
              </Avatar>
            ))}
            {assignees.length > MAX_AVATARS && <span className="assignee-more">+{assignees.length - MAX_AVATARS}</span>}
          </span>
        )}
      </div>
    </BoardCard>
  );
});

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" fill="currentColor">
      {[3, 8, 13].flatMap((y) => [<circle key={`l${y}`} cx="3.5" cy={y} r="1.5" />, <circle key={`r${y}`} cx="8.5" cy={y} r="1.5" />])}
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

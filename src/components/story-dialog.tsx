"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar";
import { Button } from "@ui-sdk/react/button";
import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker,
  DatePickerContent,
  DatePickerInput,
  DatePickerTrigger,
} from "@ui-sdk/react/date-picker";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, type DialogController } from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack } from "@ui-sdk/react/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { toast } from "@ui-sdk/react/toast";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ActionError, BoardActions, DetailsResult } from "@/app/actions";
import { MultiPicker } from "@/components/multi-picker";
import { dueState, initials, type Card, type Person, type Stage } from "@/lib/board";
import type { StoryComment, StoryDetails } from "@/lib/story-details";
import { dueDateToIso, isoToDueDate, replaceLastSegment, sameIds, slugify } from "@/lib/story-edit";
import type { SessionRef } from "@/lib/storyblok/session";
import { avatarUrl, signInUrl, storyEditorUrl } from "@/lib/storyblok/urls";

const dateTime = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDateTime = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? "—" : dateTime.format(t);
};

type Props = {
  controller: DialogController<number>;
  session: SessionRef;
  cards: Map<number, Card>;
  stages: Stage[];
  people: Record<number, Person>;
  tags: string[];
  me: number;
  now: number;
  actions: Pick<BoardActions, "onLoadDetails" | "onSaveBasics" | "onSaveWorkflow">;
  onCardChange: (storyId: number, patch: Partial<Card>) => void;
};

export function StoryDialog({ controller, cards, ...rest }: Props) {
  return (
    <Dialog controller={controller}>
      <DialogBackdrop />
      <DialogContent<number> className="story-dialog" initialFocus="content">
        {(state) => {
          const card = state.payload === undefined ? undefined : cards.get(state.payload);
          return card ? <StoryView key={card.id} card={card} {...rest} /> : null;
        }}
      </DialogContent>
    </Dialog>
  );
}

type Loaded = { storyId: number; attempt: number; result: DetailsResult };
type Basics = Omit<StoryDetails, "comments" | "commentsError">;

function failed(title: string, result: ActionError) {
  toast.error(title, {
    description: result.error,
    ...(result.signedOut && { action: { label: "Sign in", href: signInUrl } }),
  });
}

function StoryView({
  card,
  session,
  stages,
  people: knownPeople,
  tags: knownTags,
  me,
  now,
  actions,
  onCardChange,
}: Omit<Props, "controller" | "cards"> & { card: Card }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [basics, setBasics] = useState<Basics | null>(null);
  const [saving, setSaving] = useState(0);
  const queue = useRef(Promise.resolve());

  const { spaceId, userId } = session;
  const { onLoadDetails } = actions;
  useEffect(() => {
    let cancelled = false;
    onLoadDetails({ spaceId, userId }, card.id).then(
      (result) => {
        if (cancelled) return;
        setLoaded({ storyId: card.id, attempt, result });
        // The full story knows every assignee; the board's list only knew about you.
        if (result.ok) onCardChange(card.id, { userIds: result.details.userIds });
      },
      (error: unknown) =>
        !cancelled && setLoaded({ storyId: card.id, attempt, result: { ok: false, error: error instanceof Error ? error.message : String(error) } }),
    );
    return () => {
      cancelled = true;
    };
  }, [onLoadDetails, onCardChange, spaceId, userId, card.id, attempt]);

  const current = loaded?.storyId === card.id && loaded.attempt === attempt ? loaded.result : null;
  const details = current?.ok ? current.details : null;
  const story = basics ?? details;
  const people = withFallbackNames(knownPeople, me, story?.lastAuthor ?? null);
  const stage = stages.find((s) => s.id === card.stageId);
  const status = !card.published ? "Draft" : card.unpublishedChanges ? "Changed" : "Published";
  const due = dueState(card.dueDate, now);
  const slug = card.fullSlug.split("/").pop() ?? "";
  const ready = !!details;

  // Saves run one after another, so quick edits can't overtake each other.
  function save(work: () => Promise<void>) {
    setSaving((n) => n + 1);
    queue.current = queue.current.then(work).finally(() => setSaving((n) => n - 1));
    return queue.current;
  }

  function saveBasics(patch: { name?: string; slug?: string; tags?: string[] }) {
    return save(async () => {
      const result = await actions.onSaveBasics(session, card.id, patch);
      if (!result.ok) return failed(`Couldn't save “${card.name}”`, result);
      setBasics(result.details);
      onCardChange(card.id, {
        name: result.details.name,
        fullSlug: result.details.fullSlug || replaceLastSegment(card.fullSlug, patch.slug ?? slug),
        updatedAt: result.details.updatedAt,
        published: result.details.published,
        unpublishedChanges: result.details.unpublishedChanges,
      });
    });
  }

  function saveWorkflow(patch: { stageId?: number; dueDate?: string | null; userIds?: number[] }) {
    const before = { stageId: card.stageId, dueDate: card.dueDate, userIds: card.userIds };
    const next = { ...before, ...patch };
    onCardChange(card.id, next);
    return save(async () => {
      const result = await actions.onSaveWorkflow(session, { storyId: card.id, ...next });
      if (!result.ok) {
        onCardChange(card.id, before);
        return failed(`Couldn't update “${card.name}”`, result);
      }
      onCardChange(card.id, { stageId: result.stageId, dueDate: result.dueDate });
    });
  }

  const personOptions = Object.values(people)
    .map((p) => ({ value: String(p.id), label: p.id === me && !p.name.includes("(you)") && p.name !== "You" ? `${p.name} (you)` : p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const tagOptions = [...new Set([...knownTags, ...(story?.tags ?? [])])].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }));

  return (
    <>
      <header className="sd-header">
        <div className="sd-badges">
          <span className="stage-pill" style={{ "--stage-color": stage?.color } as CSSProperties}>
            <span className="stage-dot" aria-hidden="true" />
            {stage?.name ?? "Unknown stage"}
          </span>
          <span className="chip" data-status={status.toLowerCase()}>
            {status}
          </span>
          {card.contentType && <span className="chip">{card.contentType}</span>}
        </div>
        <span className="sd-saving" role="status">
          {saving > 0 ? "Saving…" : ""}
        </span>
        <DialogClose className="dialog-close" aria-label="Close">
          <CloseIcon />
        </DialogClose>
      </header>

      <div className="sd-layout">
        <div className="sd-main">
          <InlineEdit
            label="Name"
            value={card.name}
            disabled={!ready}
            onSave={(name) => saveBasics({ name })}
            display={(value) => <DialogTitle className="sd-title">{value}</DialogTitle>}
          />
          <InlineEdit
            label="Slug"
            value={slug}
            disabled={!ready}
            mono
            transform={slugify}
            hint={(draft) => `/${replaceLastSegment(card.fullSlug, slugify(draft) || "…")}`}
            onSave={(next) => saveBasics({ slug: next })}
            display={(value) => <DialogDescription className="sd-slug">/{replaceLastSegment(card.fullSlug, value)}</DialogDescription>}
          />

          {!current && (
            <Progress value={null} className="dialog-progress">
              <ProgressLabel>Loading story details and workflow stage comments</ProgressLabel>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          )}

          {current && !current.ok && (
            <div className="dialog-error" role="alert">
              <p>Couldn&apos;t load this story&apos;s details: {current.error}</p>
              {current.signedOut ? (
                <a className="button-link" href={signInUrl}>
                  Sign in again
                </a>
              ) : (
                <Button className="secondary-button" onClick={() => setAttempt((a) => a + 1)}>
                  Try again
                </Button>
              )}
            </div>
          )}

          {details && (
            <section className="comments-section" aria-labelledby="story-comments-heading">
              <h3 id="story-comments-heading">Workflow Stage Comments{details.commentsError ? "" : ` (${details.comments.length})`}</h3>
              {details.commentsError ? (
                <p className="muted empty-note">Workflow stage comments couldn&apos;t be loaded. {details.commentsError}</p>
              ) : details.comments.length ? (
                <ol className="comment-list">
                  {details.comments.map((c) => (
                    <CommentView key={c.id} comment={c} people={people} />
                  ))}
                </ol>
              ) : (
                <p className="muted empty-note">No workflow stage comments on this story yet.</p>
              )}
            </section>
          )}
        </div>

        <aside className="sd-sidebar" aria-label="Properties">
          <Property label="Stage">
            <Select
              value={String(card.stageId)}
              disabled={!ready}
              onValueChange={(v) => v && Number(v) !== card.stageId && void saveWorkflow({ stageId: Number(v) })}
            >
              <SelectTrigger aria-label="Stage" className="sd-control">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className="stage-dot" style={{ "--stage-color": s.color } as CSSProperties} aria-hidden="true" />
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Property>

          <Property label="Due date">
            <div className="sd-due" data-due={due ?? undefined}>
              <DatePicker
                value={isoToDueDate(card.dueDate)}
                disabled={!ready}
                onValueChange={(v) => {
                  const iso = dueDateToIso(typeof v === "string" ? v : null);
                  if (isoToDueDate(iso) !== isoToDueDate(card.dueDate)) void saveWorkflow({ dueDate: iso });
                }}
              >
                <div className="sd-date-row">
                  <DatePickerInput aria-label="Due date" className="sd-control" />
                  <DatePickerTrigger aria-label="Pick a due date" className="icon-button">
                    <CalendarIcon />
                  </DatePickerTrigger>
                  {card.dueDate && (
                    <Button aria-label="Remove due date" className="icon-button" disabled={!ready} onClick={() => void saveWorkflow({ dueDate: null })}>
                      <CloseIcon />
                    </Button>
                  )}
                </div>
                <DatePickerContent>
                  <div className="calendar-head">
                    <CalendarPrevious aria-label="Previous month">
                      <ChevronIcon direction="left" />
                    </CalendarPrevious>
                    <CalendarHeading />
                    <CalendarNext aria-label="Next month">
                      <ChevronIcon direction="right" />
                    </CalendarNext>
                  </div>
                  <CalendarGrid>
                    <CalendarWeekdays>{(index) => <CalendarWeekday index={index} />}</CalendarWeekdays>
                    <CalendarWeeks>{(cell) => <CalendarDay value={cell.date} />}</CalendarWeeks>
                  </CalendarGrid>
                </DatePickerContent>
              </DatePicker>
              {due === "overdue" && <span className="sd-due-note">Overdue</span>}
            </div>
          </Property>

          <Property label="Assignees">
            <MultiPicker
              label="Assignees"
              value={card.userIds.map(String)}
              options={personOptions}
              disabled={!ready}
              placeholder="Assign people…"
              empty="No one matches."
              renderChip={(value) => {
                const person = people[Number(value)];
                return <PersonAvatar person={person} id={Number(value)} name={person?.name ?? `User ${value}`} />;
              }}
              onCommit={(values) => {
                const ids = values.map(Number);
                if (!sameIds(ids, card.userIds)) void saveWorkflow({ userIds: ids });
              }}
            />
            {details && details.roleIds.length > 0 && (
              <p className="sd-hint">
                Also assigned to {details.roleIds.length} {details.roleIds.length === 1 ? "role" : "roles"}; those stay as they are.
              </p>
            )}
          </Property>

          <Property label="Tags">
            <MultiPicker
              label="Tags"
              value={story?.tags ?? []}
              options={tagOptions}
              disabled={!ready}
              placeholder="Add tags…"
              empty="No tags yet. Type to create one."
              creatable
              onCommit={(values) => {
                const before = story?.tags ?? [];
                if (values.join("\u0000") !== before.join("\u0000")) void saveBasics({ tags: values });
              }}
            />
          </Property>

          <dl className="sd-meta">
            <dt>Updated</dt>
            <dd>
              {formatDateTime(story?.updatedAt ?? card.updatedAt)}
              {story?.lastAuthor && <span className="muted"> · {story.lastAuthor.name}</span>}
            </dd>
            <dt>Created</dt>
            <dd>{story ? formatDateTime(story.createdAt) : "…"}</dd>
            <dt>Published</dt>
            <dd>{story ? (story.publishedAt ? formatDateTime(story.publishedAt) : <span className="muted">Never</span>) : "…"}</dd>
          </dl>
        </aside>
      </div>

      <footer className="sd-footer">
        <p className="muted sd-footnote">Changes save to Storyblok as you make them. Nothing is published.</p>
        <a className="button-link" data-variant="solid" href={storyEditorUrl(session.spaceId, card.id)} target="_blank" rel="noopener noreferrer">
          Open in Storyblok
          <ExternalIcon />
        </a>
      </footer>
    </>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sd-property">
      <span className="sd-property-label" aria-hidden="true">
        {label}
      </span>
      <div className="sd-property-value">{children}</div>
    </div>
  );
}

function InlineEdit({
  label,
  value,
  disabled,
  mono,
  transform,
  hint,
  display,
  onSave,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  mono?: boolean;
  transform?: (draft: string) => string;
  hint?: (draft: string) => string;
  display: (value: string) => ReactNode;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className="inline-edit" data-mono={mono || undefined}>
        {display(value)}
        <Button className="icon-button inline-edit-button" aria-label={`Edit ${label.toLowerCase()}`} disabled={disabled} onClick={() => setDraft(value)}>
          <PencilIcon />
        </Button>
      </div>
    );
  }

  const next = transform ? transform(draft) : draft.trim();
  return (
    <form
      className="inline-edit-form"
      data-mono={mono || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!next || next === value) return setDraft(null);
        void onSave(next).then(() => setDraft(null));
      }}
    >
      <Input
        aria-label={label}
        value={draft}
        onValueChange={setDraft}
        autoFocus
        onKeyDown={(e) => {
          // Escape leaves the field without closing the dialog.
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
      <div className="inline-edit-actions">
        {hint && <span className="sd-hint">{hint(draft)}</span>}
        <Button type="button" className="secondary-button" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        <Button type="submit" data-variant="solid" disabled={!next} pendingAnnouncement={`Saving ${label.toLowerCase()}`}>
          Save
        </Button>
      </div>
    </form>
  );
}

// The collaborators list can leave people out (a space's owner, for one), so fill in what we know.
function withFallbackNames(people: Record<number, Person>, me: number, lastAuthor: { id: number | null; name: string } | null) {
  const extra: Record<number, Person> = {};
  if (lastAuthor?.id != null && (!people[lastAuthor.id] || people[lastAuthor.id].name === "You")) {
    extra[lastAuthor.id] = { id: lastAuthor.id, name: lastAuthor.name, avatar: null, roleIds: people[lastAuthor.id]?.roleIds ?? [] };
  }
  if (!people[me] && !extra[me]) extra[me] = { id: me, name: "You", avatar: null, roleIds: [] };
  return Object.keys(extra).length ? { ...people, ...extra } : people;
}

function PersonAvatar({ person, id, name }: { person: Person | undefined; id: number | null; name: string }) {
  return (
    <Avatar className="person-avatar" data-person={id ?? undefined}>
      {person?.avatar && <AvatarImage src={avatarUrl(person.avatar)} alt="" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function CommentView({ comment, people }: { comment: StoryComment; people: Record<number, Person> }) {
  const person = comment.userId !== null ? people[comment.userId] : undefined;
  const name = person?.name ?? comment.authorName ?? (comment.userId !== null ? `User ${comment.userId}` : "Someone");
  return (
    <li className="comment">
      <PersonAvatar person={person} id={comment.userId} name={name} />
      <div className="comment-body">
        <p className="comment-meta">
          <strong>{name}</strong> <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
        </p>
        {comment.paragraphs.length ? (
          comment.paragraphs.map((parts, i) => (
            <p key={i} className="comment-text">
              {parts.map((part, j) =>
                "mention" in part ? (
                  <span key={j} className="mention">
                    @{people[part.mention]?.name ?? part.label ?? `User ${part.mention}`}
                  </span>
                ) : (
                  <Fragment key={j}>{part.text}</Fragment>
                ),
              )}
            </p>
          ))
        ) : (
          <p className="comment-text muted">(empty comment)</p>
        )}
      </div>
    </li>
  );
}

const icon = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

function CloseIcon() {
  return (
    <svg {...icon} strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg {...icon} strokeLinejoin="round">
      <path d="M10.5 2.5l3 3L6 13H3v-3z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...icon}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg {...icon} strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"} />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...icon} strokeLinecap="round">
      <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" />
    </svg>
  );
}

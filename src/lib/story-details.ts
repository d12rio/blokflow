export type StoryComment = {
  id: number;
  userId: number | null;
  authorName: string | null;
  createdAt: string;
  // Paragraphs of plain text. Mentions arrive as `{ mention: userId }` so the UI can name them.
  paragraphs: CommentPart[][];
};

export type CommentPart = { text: string } | { mention: number; label: string | null };

export type StoryDetails = {
  id: number;
  name: string;
  fullSlug: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  published: boolean;
  unpublishedChanges: boolean;
  lastAuthor: { id: number | null; name: string } | null;
  userIds: number[];
  roleIds: number[];
  tags: string[];
  comments: StoryComment[];
  commentsError: string | null;
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

const BLOCK_TYPES = new Set(["doc", "paragraph", "heading", "blockquote", "bullet_list", "ordered_list", "list_item"]);

// Comments are rich text (ProseMirror-style nodes). We keep paragraphs, text, mentions and line breaks.
export function commentParagraphs(messageJson: unknown, message: unknown): CommentPart[][] {
  const nodes = list(messageJson);
  if (!nodes.length) {
    const plain = text(message).trim();
    return plain ? plain.split(/\n{2,}/).map((p) => [{ text: p }]) : [];
  }

  const paragraphs: CommentPart[][] = [];
  const inline = (node: unknown, out: CommentPart[]) => {
    const n = obj(node);
    const type = text(n.type);
    if (type === "text") out.push({ text: text(n.text) });
    else if (type === "mention") {
      const attrs = obj(n.attrs);
      const id = num(attrs.id) ?? num(Number(attrs.id));
      if (id !== null) out.push({ mention: id, label: text(attrs.label) || null });
    } else if (type === "hard_break" || type === "hardBreak") out.push({ text: "\n" });
    else for (const child of list(n.content)) inline(child, out);
  };
  const block = (node: unknown) => {
    const n = obj(node);
    const children = list(n.content);
    if (children.some((c) => BLOCK_TYPES.has(text(obj(c).type)))) {
      children.forEach(block);
      return;
    }
    const parts: CommentPart[] = [];
    inline(n, parts);
    if (parts.some((p) => !("text" in p) || p.text.trim())) paragraphs.push(parts);
  };
  for (const node of nodes) block(node);
  return paragraphs;
}

export function parseComment(raw: unknown): StoryComment | null {
  const c = obj(raw);
  const id = num(c.id);
  if (id === null) return null;
  const user = obj(c.user);
  return {
    id,
    userId: num(c.user_id) ?? num(user.id),
    authorName: text(user.friendly_name) || null,
    createdAt: text(c.created_at),
    paragraphs: commentParagraphs(c.message_json, c.message),
  };
}

const byDate = (a: StoryComment, b: StoryComment) => a.createdAt.localeCompare(b.createdAt);

export function parseComments(items: unknown): StoryComment[] {
  return list(items)
    .map(parseComment)
    .filter((c): c is StoryComment => c !== null)
    .sort(byDate);
}

export function parseStoryDetails(
  raw: unknown,
): Omit<StoryDetails, "comments" | "commentsError"> | null {
  const s = obj(raw);
  const id = num(s.id);
  if (id === null) return null;
  const author = obj(s.last_author);
  const authorName = text(author.friendly_name) || text(author.userid);
  return {
    id,
    name: text(s.name) || text(s.slug) || `Story ${id}`,
    fullSlug: text(s.full_slug),
    createdAt: text(s.created_at),
    updatedAt: text(s.updated_at),
    publishedAt: text(s.published_at) || null,
    firstPublishedAt: text(s.first_published_at) || null,
    published: s.published === true,
    unpublishedChanges: s.unpublished_changes === true,
    lastAuthor: authorName ? { id: num(author.id), name: authorName } : null,
    userIds: ids(s.user_ids),
    roleIds: ids(s.space_role_ids),
    tags: list(s.tag_list).filter((t): t is string => typeof t === "string"),
  };
}

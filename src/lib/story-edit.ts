// Storyblok slugs are one path segment: lowercase letters, digits, dashes and underscores.
export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function replaceLastSegment(fullSlug: string, slug: string) {
  const parts = fullSlug.split("/");
  parts[parts.length - 1] = slug;
  return parts.join("/");
}

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

// The date picker works in plain dates; Storyblok stores due dates as timestamps. Midnight UTC keeps
// the date the same for everyone who reads it back as a date.
export const dueDateToIso = (date: string | null) => (date ? `${date}T00:00:00.000Z` : null);

export const isoToDueDate = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

export const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

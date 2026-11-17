// Storyblok answers errors as {"error": "..."}, {"message": "..."}, a list of messages, or a field map.
export function errorReason(body: string): string {
  try {
    const json = JSON.parse(body) as unknown;
    const flat = (v: unknown): string[] =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(flat)
          : v && typeof v === "object"
            ? Object.values(v as Record<string, unknown>).flatMap(flat)
            : [];
    const messages = flat(json).filter((m) => m.trim());
    if (messages.length) return [...new Set(messages)].join(" ");
  } catch {}
  return body.trim();
}

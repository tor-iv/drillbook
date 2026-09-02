/**
 * Loose text match used wherever the model names a thing by paraphrase
 * (todo_done, forget, calendar_delete): exact (case-insensitive) first, then
 * either string containing the other.
 */
export function fuzzyFind<T>(items: T[], textOf: (t: T) => string, needle: string): T | undefined {
  const n = normalizeText(needle);
  if (!n) return undefined;
  return (
    items.find((t) => normalizeText(textOf(t)) === n) ??
    items.find((t) => {
      const h = normalizeText(textOf(t));
      return h.includes(n) || n.includes(h);
    })
  );
}

/** Lowercase, trimmed, single-spaced — the comparison form for user text. */
export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

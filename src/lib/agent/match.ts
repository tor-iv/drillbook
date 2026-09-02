/**
 * Loose text match used wherever the model names a thing by paraphrase
 * (todo_done, forget, calendar_delete): exact (case-insensitive) first, then
 * either string containing the other.
 */
export function fuzzyFind<T>(items: T[], textOf: (t: T) => string, needle: string): T | undefined {
  const n = needle.trim().toLowerCase();
  if (!n) return undefined;
  return (
    items.find((t) => textOf(t).toLowerCase() === n) ??
    items.find((t) => {
      const h = textOf(t).toLowerCase();
      return h.includes(n) || n.includes(h);
    })
  );
}

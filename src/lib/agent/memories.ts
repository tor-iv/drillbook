import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fuzzyFind, normalizeText } from "./match";

import { MEMORY_CATEGORIES, type MemoryCategory, type MemorySource } from "./memory-types";

export type MemoryRow = typeof schema.memories.$inferSelect;
export { MEMORY_CATEGORIES, type MemoryCategory, type MemorySource };

/** Bounds on what rides along in every prompt, even if the brain hoards. */
export const MAX_MEMORY_ROWS = 60;
export const MAX_MEMORY_CHARS = 3000;

/**
 * Pure: active rows → the compact block the model reads. Newest first inside
 * each category (recency is the only importance signal we have), cut at the
 * row and character caps.
 */
export function renderMemories(rows: Pick<MemoryRow, "id" | "category" | "content">[]): string {
  const lines: string[] = [];
  let chars = 0;
  for (const cat of MEMORY_CATEGORIES) {
    for (const r of rows.filter((x) => x.category === cat)) {
      const line = `#${r.id} [${cat}] ${r.content}`;
      if (lines.length >= MAX_MEMORY_ROWS || chars + line.length > MAX_MEMORY_CHARS) return lines.join("\n");
      lines.push(line);
      chars += line.length + 1;
    }
  }
  return lines.join("\n");
}

export function activeMemories(): MemoryRow[] {
  return db.select().from(schema.memories).where(eq(schema.memories.archived, false)).orderBy(desc(schema.memories.id)).all();
}

export function formatMemories(): string {
  return renderMemories(activeMemories());
}

/**
 * Insert, or — when an active memory in the same category already says the
 * same thing — keep the existing wording and just bump its recency.
 */
export function remember(category: MemoryCategory, content: string, source: MemorySource = "chat"): MemoryRow {
  const clean = content.trim().replace(/\s+/g, " ");
  const dup = db
    .select()
    .from(schema.memories)
    .where(and(eq(schema.memories.category, category), eq(schema.memories.archived, false)))
    .all()
    .find((r) => normalizeText(r.content) === normalizeText(clean));
  if (dup) {
    db.update(schema.memories).set({ updatedAt: sql`(datetime('now'))` }).where(eq(schema.memories.id, dup.id)).run();
    return dup;
  }
  return db.insert(schema.memories).values({ category, content: clean, source }).returning().get();
}

/** Archive the active memory matching "#id" or a paraphrase. Returns what was archived. */
export function forget(match: string): MemoryRow | undefined {
  const rows = activeMemories();
  const byId = /^#?(\d+)$/.exec(match.trim());
  const hit = byId ? rows.find((r) => r.id === Number(byId[1])) : fuzzyFind(rows, (r) => r.content, match);
  if (!hit) return undefined;
  db.update(schema.memories)
    .set({ archived: true, updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.memories.id, hit.id))
    .run();
  return hit;
}

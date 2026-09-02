import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Action } from "./schema";

export type Channel = "web" | "telegram";
export type ChatRow = typeof schema.chatMessages.$inferSelect;

/** How many prior messages (user + assistant rows) ride along on each turn. */
export const MAX_HISTORY = 20;

/**
 * Pure: DB rows (oldest → newest) → the Anthropic transcript. Assistant rows
 * are re-serialized as the JSON envelope the router must emit, so the model
 * sees a consistent output format in its own past turns instead of prose —
 * that's what keeps multi-turn JSON stable. Leading assistant rows are dropped
 * because the API requires a transcript to open with a user turn.
 */
export function toTranscript(rows: Pick<ChatRow, "role" | "content" | "actionsJson">[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = rows.map((r) =>
    r.role === "assistant"
      ? { role: "assistant", content: JSON.stringify({ reply: r.content, actions: parseJson(r.actionsJson, []) }) }
      : { role: "user", content: r.content },
  );
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

export function loadHistory(): Anthropic.MessageParam[] {
  const rows = db.select().from(schema.chatMessages).orderBy(desc(schema.chatMessages.id)).limit(MAX_HISTORY).all();
  return toTranscript(rows.reverse());
}

export function persistTurn(turn: {
  channel: Channel;
  userContent: string;
  reply: string;
  actions: Action[];
  results: string[];
  clientMsgId?: string;
}): void {
  db.transaction((tx) => {
    tx.insert(schema.chatMessages)
      .values({ channel: turn.channel, role: "user", content: turn.userContent, clientMsgId: turn.clientMsgId ?? null })
      .run();
    tx.insert(schema.chatMessages)
      .values({
        channel: turn.channel,
        role: "assistant",
        content: turn.reply,
        actionsJson: turn.actions.length ? JSON.stringify(turn.actions) : null,
        resultsJson: turn.results.length ? JSON.stringify(turn.results) : null,
      })
      .run();
  });
}

/** Newest-first page of the conversation for the UI. */
export function listRecent(before?: number, limit = 30): ChatRow[] {
  const q = db.select().from(schema.chatMessages);
  const rows = (before ? q.where(lt(schema.chatMessages.id, before)) : q)
    .orderBy(desc(schema.chatMessages.id))
    .limit(limit)
    .all();
  return rows.reverse();
}

/** The assistant row that answered a given web clientMsgId, if that turn already ran. */
export function findByClientMsgId(clientMsgId: string): ChatRow | undefined {
  const user = db.select().from(schema.chatMessages).where(eq(schema.chatMessages.clientMsgId, clientMsgId)).get();
  if (!user) return undefined;
  return db
    .select()
    .from(schema.chatMessages)
    .where(and(gt(schema.chatMessages.id, user.id), eq(schema.chatMessages.role, "assistant")))
    .orderBy(asc(schema.chatMessages.id))
    .limit(1)
    .get();
}

export function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** UI/API shape of a message: results parsed, internals dropped. */
export function toWire(r: ChatRow) {
  return {
    id: r.id,
    channel: r.channel,
    role: r.role,
    content: r.content,
    results: parseJson<string[]>(r.resultsJson, []),
    createdAt: r.createdAt,
  };
}
export type WireMessage = ReturnType<typeof toWire>;

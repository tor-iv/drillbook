import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasShortcutToken } from "@/lib/auth";
import type { NudgeSlot } from "@/lib/coach";
import { runDailyNudge } from "@/lib/cron/daily-nudge";
import { localDate } from "@/lib/dates";

// Pulled by the iPhone Shortcuts automations that deliver nudges as native
// iMessages (docs/imessage-shortcut.md). Flat {text} response so Shortcuts'
// "Get Dictionary Value" works in one step.

const SLOTS: NudgeSlot[] = ["morning", "midday", "evening"];

function latestNudge(kind: "daily" | "weekly", date?: string): string | null {
  const rows = db
    .select()
    .from(schema.aiNudges)
    .where(date ? sql`${schema.aiNudges.kind} = ${kind} AND ${schema.aiNudges.date} = ${date}` : eq(schema.aiNudges.kind, kind))
    .orderBy(desc(schema.aiNudges.id))
    .limit(1)
    .all();
  return rows[0]?.content ?? null;
}

export async function GET(req: NextRequest) {
  if (!hasShortcutToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  if (params.get("kind") === "weekly") {
    return NextResponse.json({ text: latestNudge("weekly") });
  }

  const slotParam = params.get("slot") ?? "evening";
  const slot: NudgeSlot = (SLOTS as string[]).includes(slotParam) ? (slotParam as NudgeSlot) : "evening";

  // Idempotent via the cron_runs guard: if the in-process cron already fired
  // this slot, this returns "already ran today" and we serve the stored row —
  // otherwise the Shortcut's pull doubles as a cron fallback and generates it.
  const result = await runDailyNudge(false, slot);
  const text = result === "already ran today" ? latestNudge("daily", localDate()) : result;
  return NextResponse.json({ text: text ?? "No nudge yet today." });
}

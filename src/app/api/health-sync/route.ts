import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasShortcutToken } from "@/lib/auth";
import { askClaudeJson } from "@/lib/claude";
import { localDate } from "@/lib/dates";
import { workoutModel } from "@/lib/workoutai";

const workoutSchema = z.object({
  type: z.enum(["run", "swim", "climb", "lift", "other"]),
  durationMin: z.number().nonnegative().nullable().optional(),
  distanceMi: z.number().nonnegative().nullable().optional(),
  calories: z.number().nonnegative().nullable().optional(),
  startedAt: z.string().min(1),
});

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bodyWeightLb: z.number().positive().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});

// Single-day (the nightly Shortcut), batch (the history import script), or a
// raw text dump from a minimal Shortcut — the AI structures the dump so the
// phone side stays dumb and simple.
const bodySchema = z.union([
  daySchema,
  z.object({ days: z.array(daySchema).max(500) }),
  z.object({ dump: z.string().min(3).max(20000) }),
]);

const DUMP_SYSTEM = `You convert raw Apple Health text (output of iOS Shortcuts "Find Workouts" / "Find Health Samples", any formatting) into JSON. Extract today's workouts and the most recent body weight if present. Map activity types: running->run, swimming->swim, climbing/bouldering->climb, strength/functional training->lift, anything else->other. Convert kg to lb (x2.2046) and km to miles (x0.6214). Only report numbers present in the text — use null otherwise. Reply with ONLY JSON: {"bodyWeightLb": <number|null>, "workouts": [{"type":"run|swim|climb|lift|other","durationMin":<number|null>,"distanceMi":<number|null>,"calories":<number|null>,"startedAt":"<ISO timestamp or null>"}]}`;

const dumpResultSchema = z.object({
  bodyWeightLb: z.number().positive().nullable().catch(null),
  workouts: z
    .array(
      z.object({
        type: z.enum(["run", "swim", "climb", "lift", "other"]),
        durationMin: z.number().nonnegative().nullable().catch(null),
        distanceMi: z.number().nonnegative().nullable().catch(null),
        calories: z.number().nonnegative().nullable().catch(null),
        startedAt: z.string().nullable().catch(null),
      }),
    )
    .max(20)
    .catch([]),
});

function upsertDay(day: z.infer<typeof daySchema>): { workouts: number; weight: boolean } {
  let wroteWeight = false;
  if (day.bodyWeightLb != null) {
    const bw = db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.key, "bodyweight"))
      .get();
    if (bw) {
      db.insert(schema.entries)
        .values({ activityId: bw.id, date: day.date, value: day.bodyWeightLb })
        .onConflictDoUpdate({
          target: [schema.entries.activityId, schema.entries.date],
          set: { value: day.bodyWeightLb, updatedAt: sql`(datetime('now'))` },
        })
        .run();
      wroteWeight = true;
    }
  }

  for (const w of day.workouts) {
    // UNIQUE(started_at, type) → re-syncing the same day is a no-op update,
    // so the nightly Shortcut and the history import can safely overlap.
    db.insert(schema.workouts)
      .values({
        date: day.date,
        type: w.type,
        durationMin: w.durationMin ?? null,
        distanceMi: w.distanceMi ?? null,
        calories: w.calories ?? null,
        startedAt: w.startedAt,
        rawJson: JSON.stringify(w),
      })
      .onConflictDoUpdate({
        target: [schema.workouts.startedAt, schema.workouts.type],
        set: {
          durationMin: w.durationMin ?? null,
          distanceMi: w.distanceMi ?? null,
          calories: w.calories ?? null,
        },
      })
      .run();
  }
  return { workouts: day.workouts.length, weight: wroteWeight };
}

export async function POST(req: NextRequest) {
  if (!hasShortcutToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  let payload = parsed.data;
  if ("dump" in payload) {
    const today = localDate();
    const ai = dumpResultSchema.parse(
      await askClaudeJson({ model: workoutModel(), system: DUMP_SYSTEM, content: payload.dump }),
    );
    payload = {
      date: today,
      bodyWeightLb: ai.bodyWeightLb,
      workouts: ai.workouts.map((w, i) => ({
        ...w,
        // Synthetic-but-stable startedAt when the dump lacks timestamps.
        startedAt: w.startedAt ?? `${today}Tdump-${i}`,
      })),
    };
  }

  const days = "days" in payload ? payload.days : [payload];
  let workoutCount = 0;
  let weightCount = 0;
  // One transaction per request: a 500-day import batch is a single fsync,
  // not 500.
  db.transaction(() => {
    for (const day of days) {
      const r = upsertDay(day);
      workoutCount += r.workouts;
      if (r.weight) weightCount++;
    }
  });

  return NextResponse.json({ ok: true, days: days.length, workouts: workoutCount, weightDays: weightCount });
}

import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasShortcutToken } from "@/lib/auth";

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

// Single-day (the nightly Shortcut) or batch (the history import script).
const bodySchema = z.union([daySchema, z.object({ days: z.array(daySchema).max(500) })]);

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

  const days = "days" in parsed.data ? parsed.data.days : [parsed.data];
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

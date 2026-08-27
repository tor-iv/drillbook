import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasShortcutToken } from "@/lib/auth";
import { localDate } from "@/lib/dates";
import { estimateMeal, foodAiConfigured, foodModel } from "@/lib/foodai";
import { parseWorkouts, workoutModel } from "@/lib/workoutai";

// Voice-logging endpoint for Siri/iOS Shortcuts (bearer token — no browser
// session). Every branch returns a short `spoken` string Siri reads aloud.
const bodySchema = z.union([
  z.object({ type: z.literal("counter"), activityKey: z.string(), delta: z.number().finite() }),
  z.object({ type: z.literal("weight"), value: z.number().positive() }),
  z.object({ type: z.literal("meal"), description: z.string().min(2).max(500) }),
  z.object({ type: z.literal("workout"), description: z.string().min(2).max(500) }),
]);

export async function POST(req: NextRequest) {
  if (!hasShortcutToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const input = parsed.data;
  const date = localDate();

  try {
    if (input.type === "counter" || input.type === "weight") {
      const key = input.type === "weight" ? "bodyweight" : input.activityKey;
      const activity = db.select().from(schema.activities).where(eq(schema.activities.key, key)).get();
      if (!activity) return NextResponse.json({ error: "unknown activity", spoken: `I don't know ${key}.` }, { status: 404 });
      const isCounter = activity.kind === "counter";
      const delta = input.type === "counter" ? input.delta : input.value;
      db.insert(schema.entries)
        .values({ activityId: activity.id, date, value: Math.max(0, delta) })
        .onConflictDoUpdate({
          target: [schema.entries.activityId, schema.entries.date],
          set: isCounter
            ? { value: sql`MAX(0, ${schema.entries.value} + ${delta})`, updatedAt: sql`(datetime('now'))` }
            : { value: delta, updatedAt: sql`(datetime('now'))` },
        })
        .run();
      const row = db
        .select()
        .from(schema.entries)
        .where(sql`${schema.entries.activityId} = ${activity.id} AND ${schema.entries.date} = ${date}`)
        .get();
      const total = row?.value ?? 0;
      const goalPart = activity.dailyTarget ? ` of ${activity.dailyTarget}` : "";
      const spoken = isCounter
        ? `Logged. ${activity.label}: ${total}${goalPart} today.`
        : `Logged ${delta} ${activity.unit}.`;
      return NextResponse.json({ ok: true, spoken, total });
    }

    if (input.type === "meal") {
      if (!foodAiConfigured()) return NextResponse.json({ error: "AI not configured", spoken: "Food AI isn't set up." }, { status: 500 });
      const est = await estimateMeal({ description: input.description });
      db.insert(schema.meals)
        .values({
          date,
          name: est.name,
          description: input.description,
          calories: est.calories,
          protein: est.protein,
          method: "text",
          model: foodModel(),
        })
        .run();
      const total = Math.round(
        db.select().from(schema.meals).where(eq(schema.meals.date, date)).all().reduce((s, m) => s + m.calories, 0),
      );
      return NextResponse.json({
        ok: true,
        spoken: `Logged ${est.name}, about ${Math.round(est.calories)} calories. ${total} today.`,
      });
    }

    // workout
    const res = await parseWorkouts({ description: input.description });
    if (res.workouts.length === 0) {
      return NextResponse.json({ error: "no workout found", spoken: "I couldn't find a workout in that." }, { status: 422 });
    }
    const now = Date.now();
    for (const [i, w] of res.workouts.entries()) {
      db.insert(schema.workouts)
        .values({
          date,
          type: w.type,
          durationMin: w.durationMin,
          distanceMi: w.distanceMi,
          calories: w.calories,
          startedAt: new Date(now + i).toISOString(),
          source: "manual",
          rawJson: JSON.stringify({ summary: w.summary, description: input.description, model: workoutModel() }),
        })
        .run();
    }
    return NextResponse.json({
      ok: true,
      spoken: `Logged ${res.workouts.map((w) => w.summary).join(" and ")}.`,
    });
  } catch (e) {
    console.error("[log] failed:", e);
    return NextResponse.json({ error: String(e), spoken: "That didn't save. Try again." }, { status: 500 });
  }
}

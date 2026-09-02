import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, localDate } from "@/lib/dates";
import { estimateMeal, foodModel } from "@/lib/foodai";
import { createEvent, googleConnected } from "@/lib/google";
import { parseWorkouts, workoutModel } from "@/lib/workoutai";
import { fuzzyFind } from "./match";
import { forget, remember } from "./memories";
import type { Action } from "./schema";

export function earlierMeals(date: string): { name: string; calories: number }[] {
  return db
    .select()
    .from(schema.meals)
    .where(eq(schema.meals.date, date))
    .all()
    .map((m) => ({ name: m.name, calories: m.calories }));
}

// Deduped meal names from the last 14 days so "my usual breakfast" resolves.
export function recentMealNames(today: string): { name: string; calories: number; date: string }[] {
  const rows = db
    .select()
    .from(schema.meals)
    .where(sql`${schema.meals.date} >= ${addDays(today, -14)} AND ${schema.meals.date} < ${today}`)
    .orderBy(sql`${schema.meals.id} DESC`)
    .all();
  const seen = new Set<string>();
  const out: { name: string; calories: number; date: string }[] = [];
  for (const m of rows) {
    const key = m.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m.name, calories: Math.round(m.calories), date: m.date });
    if (out.length >= 12) break;
  }
  return out;
}

/** Execute one router action; returns the one-line receipt shown to the user. */
export async function runAction(a: Action): Promise<string> {
  const date = localDate();
  if (a.type === "counter" || a.type === "weight") {
    const key = a.type === "weight" ? "bodyweight" : a.activityKey;
    const activity = db.select().from(schema.activities).where(eq(schema.activities.key, key)).get();
    if (!activity) return `(unknown activity ${key})`;
    const delta = a.type === "weight" ? a.value : a.delta;
    const isCounter = activity.kind === "counter";
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
    return `✓ ${activity.label}: ${row?.value ?? 0}${activity.dailyTarget ? `/${activity.dailyTarget}` : ""}`;
  }
  if (a.type === "todo_add") {
    db.insert(schema.todos).values({ text: a.text, due: a.due ?? null }).run();
    return `✓ On the list: ${a.text}${a.due ? ` (by ${a.due})` : ""}`;
  }
  if (a.type === "todo_done") {
    const open = db.select().from(schema.todos).where(eq(schema.todos.done, 0)).all();
    const hit = fuzzyFind(open, (t) => t.text, a.match);
    if (!hit) return `(nothing open matching "${a.match}")`;
    db.update(schema.todos)
      .set({ done: 1, completedAt: new Date().toISOString() })
      .where(eq(schema.todos.id, hit.id))
      .run();
    return `✓ Done: ${hit.text}`;
  }
  if (a.type === "remember") {
    const row = remember(a.category, a.content);
    return `✓ Noted: ${row.content}`;
  }
  if (a.type === "forget") {
    const row = forget(a.match);
    return row ? `✓ Forgot: ${row.content}` : `(nothing in memory matching "${a.match}")`;
  }
  if (a.type === "calendar") {
    if (!googleConnected()) return "(calendar not connected — hit Connect in Settings first)";
    const ok = await createEvent({
      title: a.title,
      date: a.date,
      startTime: a.startTime ?? null,
      endTime: a.endTime ?? null,
    });
    return ok
      ? `✓ Calendar: ${a.title} on ${a.date}${a.startTime ? ` at ${a.startTime}` : ""}`
      : "(calendar write failed)";
  }
  if (a.type === "meal") {
    const est = await estimateMeal({ description: a.description, earlierMealsToday: earlierMeals(date) });
    db.insert(schema.meals)
      .values({
        date,
        name: est.name,
        description: a.description,
        calories: est.calories,
        protein: est.protein,
        method: "text",
        model: foodModel(),
        itemsJson: est.items.length ? JSON.stringify(est.items) : null,
      })
      .run();
    return `✓ ${est.name} ~${Math.round(est.calories)} cal${est.question ? `\n${est.question}` : ""}`;
  }
  if (a.type === "meal_revise") {
    const last = db
      .select()
      .from(schema.meals)
      .where(eq(schema.meals.date, date))
      .orderBy(desc(schema.meals.id))
      .limit(1)
      .get();
    if (!last) return "(no meal today to revise)";
    const est = await estimateMeal({
      description: `${last.description ?? last.name}. Additional detail: ${a.detail}`,
      earlierMealsToday: earlierMeals(date).filter((m) => m.name !== last.name),
    });
    db.update(schema.meals)
      .set({
        name: est.name,
        calories: est.calories,
        protein: est.protein,
        itemsJson: est.items.length ? JSON.stringify(est.items) : null,
      })
      .where(eq(schema.meals.id, last.id))
      .run();
    return `✓ Revised: ${est.name} ~${Math.round(est.calories)} cal`;
  }
  const res = await parseWorkouts({ description: a.description });
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
        rawJson: JSON.stringify({ summary: w.summary, description: a.description, model: workoutModel() }),
      })
      .run();
  }
  return res.workouts.length ? `✓ ${res.workouts.map((w) => w.summary).join(", ")}` : "(no workout found)";
}

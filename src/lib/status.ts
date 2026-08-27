import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, dateRange, localDate } from "@/lib/dates";

export type ActivityStatus = {
  id: number;
  key: string;
  label: string;
  kind: "counter" | "measure";
  unit: string;
  goal: number | null;
  done: number | null; // null = nothing logged (distinct from 0 for measures)
  met: boolean; // counter: done >= goal; measure: any value logged
  streak: number; // consecutive days met, ending today-or-yesterday
};

export type DayStatus = {
  date: string;
  activities: ActivityStatus[];
  behind: boolean; // any active counter with a goal not yet met
  summary: string; // one-liner for the Shortcut notification / calendar event
};

function activeActivities() {
  return db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.active, true))
    .orderBy(asc(schema.activities.sortOrder))
    .all();
}

function entriesBetween(activityIds: number[], from: string, to: string) {
  if (activityIds.length === 0) return [];
  return db
    .select()
    .from(schema.entries)
    .where(
      and(
        inArray(schema.entries.activityId, activityIds),
        gte(schema.entries.date, from),
        lte(schema.entries.date, to),
      ),
    )
    .all();
}

function dayMet(activity: { kind: string; dailyTarget: number | null }, value: number | undefined): boolean {
  if (value === undefined) return false;
  if (activity.kind === "measure") return true; // logging at all counts
  return activity.dailyTarget == null ? value > 0 : value >= activity.dailyTarget;
}

/**
 * Streak = consecutive met days ending today (or yesterday, so an unfinished
 * today doesn't read as "streak broken" at 9am). Computed over a bounded
 * window — a streak longer than 400 days caps there, acceptable for a wall
 * display.
 */
function computeStreak(
  activity: { kind: string; dailyTarget: number | null },
  byDate: Map<string, number>,
  today: string,
): number {
  let streak = 0;
  let day = today;
  // Today only extends the streak if already met; otherwise start from yesterday.
  if (dayMet(activity, byDate.get(day))) {
    streak++;
  }
  day = addDays(day, -1);
  for (let i = 0; i < 400; i++) {
    if (dayMet(activity, byDate.get(day))) {
      streak++;
      day = addDays(day, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function getTodayStatus(today: string = localDate()): DayStatus {
  const acts = activeActivities();
  const windowStart = addDays(today, -401);
  const rows = entriesBetween(
    acts.map((a) => a.id),
    windowStart,
    today,
  );

  const byActivity = new Map<number, Map<string, number>>();
  for (const r of rows) {
    let m = byActivity.get(r.activityId);
    if (!m) byActivity.set(r.activityId, (m = new Map()));
    m.set(r.date, r.value);
  }

  const statuses: ActivityStatus[] = acts.map((a) => {
    const byDate = byActivity.get(a.id) ?? new Map<string, number>();
    const done = byDate.get(today);
    return {
      id: a.id,
      key: a.key,
      label: a.label,
      kind: a.kind,
      unit: a.unit,
      goal: a.dailyTarget,
      done: done ?? null,
      met: dayMet(a, done),
      streak: computeStreak(a, byDate, today),
    };
  });

  const counters = statuses.filter((s) => s.kind === "counter" && s.goal != null);
  const behind = counters.some((s) => !s.met);

  const parts = statuses
    .filter((s) => s.done != null && s.kind === "counter")
    .map((s) => `${s.done} ${s.unit === "reps" ? s.label.toLowerCase() : s.unit}`);
  const missing = counters.filter((s) => !s.met).map((s) => `${s.label} ${(s.done ?? 0)}/${s.goal}`);
  const summary = behind
    ? `Behind: ${missing.join(", ")}`
    : parts.length > 0
      ? `All goals hit — ${parts.join(", ")}`
      : "Nothing logged yet today";

  return { date: today, activities: statuses, behind, summary };
}

export type WeekStatus = {
  from: string;
  to: string;
  totals: { label: string; unit: string; total: number; weeklyGoal: number | null; daysMet: number }[];
  weight: { date: string; value: number }[];
  workouts: { type: string; count: number; totalMin: number; totalMi: number }[];
};

export function getWeekStatus(endDate: string = localDate()): WeekStatus {
  const days = dateRange(endDate, 7);
  const from = days[0];
  const acts = activeActivities();
  const rows = entriesBetween(
    acts.map((a) => a.id),
    from,
    endDate,
  );

  const totals = acts
    .filter((a) => a.kind === "counter")
    .map((a) => {
      const mine = rows.filter((r) => r.activityId === a.id);
      return {
        label: a.label,
        unit: a.unit,
        total: mine.reduce((sum, r) => sum + r.value, 0),
        weeklyGoal: a.dailyTarget != null ? a.dailyTarget * 7 : null,
        daysMet: mine.filter((r) => dayMet(a, r.value)).length,
      };
    });

  const weightAct = acts.find((a) => a.key === "bodyweight");
  const weight = weightAct
    ? rows
        .filter((r) => r.activityId === weightAct.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, value: r.value }))
    : [];

  const workoutRows = db
    .select()
    .from(schema.workouts)
    .where(and(gte(schema.workouts.date, from), lte(schema.workouts.date, endDate)))
    .all();
  const byType = new Map<string, { count: number; totalMin: number; totalMi: number }>();
  for (const w of workoutRows) {
    const t = byType.get(w.type) ?? { count: 0, totalMin: 0, totalMi: 0 };
    t.count++;
    t.totalMin += w.durationMin ?? 0;
    t.totalMi += w.distanceMi ?? 0;
    byType.set(w.type, t);
  }
  const workouts = [...byType.entries()].map(([type, t]) => ({ type, ...t }));

  return { from, to: endDate, totals, weight, workouts };
}

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";

// Energy-balance estimates. Deliberately rough — the point is a consistent
// daily signal (in vs out vs target), not lab precision. All knobs are env
// overridable as life changes.
const GOAL_WEIGHT_LB = Number(process.env.WEIGHT_GOAL_LB ?? 190);
const HEIGHT_CM = Number(process.env.ATHLETE_HEIGHT_CM ?? 189); // ~6'2.5"
const AGE = Number(process.env.ATHLETE_AGE ?? 25);
// Non-exercise activity multiplier. Kept modest (desk life) because tracked
// workouts are added on top — a classic double-count trap otherwise.
const ACTIVITY_FACTOR = Number(process.env.ACTIVITY_FACTOR ?? 1.35);
// ~0.75 lb/week of loss — noticeable progress that still allows a life.
const DAILY_DEFICIT_TARGET = Number(process.env.DAILY_DEFICIT_TARGET ?? 400);

const LB_PER_KG = 2.2046226218;

// kcal/hour ≈ MET × kg; used only when Apple Health didn't supply calories.
const MET: Record<string, number> = { run: 10, swim: 8, climb: 6, lift: 5, other: 5 };

export function goalWeightLb(): number {
  return GOAL_WEIGHT_LB;
}

/** Most recent logged body weight on or before `date`, else null. */
export function latestWeightLb(date: string): number | null {
  const bw = db.select().from(schema.activities).where(eq(schema.activities.key, "bodyweight")).get();
  if (!bw) return null;
  const row = db
    .select()
    .from(schema.entries)
    .where(and(eq(schema.entries.activityId, bw.id), lte(schema.entries.date, date)))
    .orderBy(desc(schema.entries.date))
    .limit(1)
    .get();
  return row?.value ?? null;
}

/** Mifflin-St Jeor BMR for a male, scaled by the non-exercise factor. */
function baselineBurn(weightLb: number): number {
  const kg = weightLb / LB_PER_KG;
  const bmr = 10 * kg + 6.25 * HEIGHT_CM - 5 * AGE + 5;
  return bmr * ACTIVITY_FACTOR;
}

function workoutBurn(w: { type: string; durationMin: number | null; calories: number | null }, weightLb: number): number {
  if (w.calories != null && w.calories > 0) return w.calories;
  if (w.durationMin == null) return 0;
  return (MET[w.type] ?? 5) * (weightLb / LB_PER_KG) * (w.durationMin / 60);
}

export type DayEnergy = {
  weightLb: number | null;
  goalWeightLb: number;
  burned: number | null; // baseline + workouts; null when no weight ever logged
  eaten: number | null; // null when no meals logged that day
  balance: number | null; // eaten - burned; needs both
  deficitTarget: number;
};

export function getDayEnergy(date: string): DayEnergy {
  const weightLb = latestWeightLb(date);

  let burned: number | null = null;
  if (weightLb != null) {
    const workouts = db.select().from(schema.workouts).where(eq(schema.workouts.date, date)).all();
    burned = Math.round(baselineBurn(weightLb) + workouts.reduce((s, w) => s + workoutBurn(w, weightLb), 0));
  }

  const meals = db.select().from(schema.meals).where(eq(schema.meals.date, date)).all();
  const eaten = meals.length > 0 ? Math.round(meals.reduce((s, m) => s + m.calories, 0)) : null;

  return {
    weightLb,
    goalWeightLb: GOAL_WEIGHT_LB,
    burned,
    eaten,
    balance: eaten != null && burned != null ? eaten - burned : null,
    deficitTarget: DAILY_DEFICIT_TARGET,
  };
}

/** Per-day balances over a range, only for days with food logged. */
export function getRangeBalances(from: string, to: string): { date: string; balance: number }[] {
  const meals = db
    .select()
    .from(schema.meals)
    .where(and(gte(schema.meals.date, from), lte(schema.meals.date, to)))
    .all();
  const dates = [...new Set(meals.map((m) => m.date))].sort();
  return dates
    .map((date) => ({ date, balance: getDayEnergy(date).balance }))
    .filter((d): d is { date: string; balance: number } => d.balance != null);
}

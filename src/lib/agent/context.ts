import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { athleteProfile } from "@/lib/coach";
import { getDayEnergy, getDayMetrics } from "@/lib/energy";
import { getTodayStatus } from "@/lib/status";
import { recentMealNames } from "./actions";
import { formatMemories } from "./memories";

/**
 * Everything the router model knows about right now, as one JSON-able object.
 * Single place to grow the model's world (memories, calendar, ...).
 */
export async function buildRouterContext(message: string): Promise<Record<string, unknown>> {
  const status = getTodayStatus();
  const energy = getDayEnergy(status.date);
  const metrics = getDayMetrics(status.date);
  const openTodos = db
    .select()
    .from(schema.todos)
    .where(eq(schema.todos.done, 0))
    .all()
    .map((t) => ({ text: t.text, due: t.due ?? undefined }));
  return {
    athlete: athleteProfile(),
    today: status,
    energy,
    appleHealth: metrics
      ? {
          steps: metrics.steps != null ? Math.round(metrics.steps) : undefined,
          exerciseMin: metrics.exerciseMin != null ? Math.round(metrics.exerciseMin) : undefined,
          sleepHoursLastNight: metrics.sleepHours ?? undefined,
          restingHr: metrics.restingHr != null ? Math.round(metrics.restingHr) : undefined,
          vo2Max: metrics.vo2Max ?? undefined,
        }
      : undefined,
    openTodos,
    recentMeals: recentMealNames(status.date),
    memories: formatMemories() || undefined,
    message,
  };
}

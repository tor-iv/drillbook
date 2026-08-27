import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { localDate } from "@/lib/dates";
import { getTodayStatus } from "@/lib/status";
import { CounterCard, MeasureCard } from "@/components/activity-cards";
import { CoachNote } from "@/components/coach-note";
import { WorkoutLog } from "@/components/workout-log";
import { getDayEnergy } from "@/lib/energy";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const today = localDate();
  const status = getTodayStatus(today);
  const nudge = db
    .select()
    .from(schema.aiNudges)
    .where(and(eq(schema.aiNudges.date, today), eq(schema.aiNudges.kind, "daily")))
    .orderBy(desc(schema.aiNudges.id))
    .get();
  const todayWorkouts = db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.date, today))
    .orderBy(desc(schema.workouts.id))
    .all();

  const energy = getDayEnergy(today);
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const openCount = status.activities.filter((a) => a.kind === "counter" && a.goal != null && !a.met).length;

  return (
    <main>
      <header className="mb-6">
        <h1 className="font-display text-5xl leading-none">Drillbook</h1>
        <p className="mt-1 text-sm text-pencil">
          {dateLabel} — {openCount === 0 ? "all drills closed" : `${openCount} drill${openCount > 1 ? "s" : ""} open`}
        </p>
      </header>

      {nudge && <CoachNote content={nudge.content} />}

      {status.calories != null && (
        <a href="/food" className="marker-box mb-5 flex items-baseline justify-between p-3">
          <span className="font-display text-lg leading-none">Food</span>
          <span className="text-sm text-pencil">
            {energy.burned != null
              ? `${status.calories} in · ~${energy.burned} out →`
              : `${status.calories} cal today →`}
          </span>
        </a>
      )}

      <div className="flex flex-col gap-5">
        {status.activities.map((a) =>
          a.kind === "counter" ? (
            <CounterCard key={a.key} activity={a} />
          ) : (
            <MeasureCard
              key={a.key}
              activity={a}
              goalNote={
                a.key === "bodyweight" && energy.weightLb != null
                  ? `${Math.max(0, Math.round((energy.weightLb - energy.goalWeightLb) * 10) / 10)} lb to ${energy.goalWeightLb}`
                  : undefined
              }
            />
          ),
        )}
        <WorkoutLog
          initialWorkouts={todayWorkouts.map((w) => ({
            id: w.id,
            type: w.type,
            durationMin: w.durationMin,
            distanceMi: w.distanceMi,
            calories: w.calories,
            source: w.source,
            rawJson: w.rawJson,
          }))}
        />
      </div>
    </main>
  );
}

import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { localDate } from "@/lib/dates";
import { getTodayStatus } from "@/lib/status";
import { CounterCard, MeasureCard } from "@/components/activity-cards";
import { CoachNote } from "@/components/coach-note";
import { WorkoutLog } from "@/components/workout-log";
import { getDayEnergy, getDayMetrics } from "@/lib/energy";

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
  const metrics = getDayMetrics(today);
  const fmtSleep = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const engine: { label: string; value: string }[] = [];
  if (metrics?.steps != null) engine.push({ label: "steps", value: Math.round(metrics.steps).toLocaleString() });
  if (energy.burned != null)
    engine.push({ label: energy.burnSource === "measured" ? "burned" : "burned (est)", value: String(energy.burned) });
  if (metrics?.sleepHours != null) engine.push({ label: "sleep", value: fmtSleep(metrics.sleepHours) });
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const openCount = status.activities.filter((a) => a.kind === "counter" && a.goal != null && !a.met).length;

  return (
    <main>
      <header className="mb-6">
        <h1 className="font-display text-5xl leading-none">Tally</h1>
        <p className="mt-1 text-sm text-pencil">
          {dateLabel} — {openCount === 0 ? "all drills closed" : `${openCount} drill${openCount > 1 ? "s" : ""} open`}
        </p>
      </header>

      {nudge && <CoachNote content={nudge.content} />}

      {engine.length > 0 && (
        <div className="marker-box mb-5 flex justify-between p-3">
          {engine.map((e) => (
            <div key={e.label} className="text-center">
              <div className="font-display text-xl leading-none">{e.value}</div>
              <div className="mt-1 text-xs text-pencil">{e.label}</div>
            </div>
          ))}
        </div>
      )}

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

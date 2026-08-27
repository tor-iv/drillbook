import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { localDate } from "@/lib/dates";
import { getTodayStatus } from "@/lib/status";
import { CounterCard, MeasureCard } from "@/components/activity-cards";
import { CoachNote } from "@/components/coach-note";

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
          <span className="text-sm text-pencil">{status.calories} cal today →</span>
        </a>
      )}

      <div className="flex flex-col gap-5">
        {status.activities.map((a) =>
          a.kind === "counter" ? (
            <CounterCard key={a.key} activity={a} />
          ) : (
            <MeasureCard key={a.key} activity={a} />
          ),
        )}
      </div>
    </main>
  );
}

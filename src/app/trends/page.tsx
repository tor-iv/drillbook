import Link from "next/link";
import clsx from "clsx";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { dateRange, localDate } from "@/lib/dates";
import { DayChart, type DayPoint } from "@/components/day-chart";

const LOG_DAYS = 14;

function shortLabel(label: string): string {
  return label.split(" ")[0].replace("-", "").toLowerCase();
}

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number])
    ? Number(params.days)
    : 30;

  const today = localDate();
  const dates = dateRange(today, days);
  const from = dates[0];

  const acts = db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.active, true))
    .orderBy(asc(schema.activities.sortOrder))
    .all();
  const rows =
    acts.length > 0
      ? db
          .select()
          .from(schema.entries)
          .where(
            and(
              inArray(
                schema.entries.activityId,
                acts.map((a) => a.id),
              ),
              gte(schema.entries.date, from),
              lte(schema.entries.date, today),
            ),
          )
          .all()
      : [];

  return (
    <main>
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-4xl leading-none">Trends</h1>
        <div className="flex gap-1" role="group" aria-label="date range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/trends?days=${r}`}
              className={clsx(
                "font-display border-2 border-ink px-3 py-1 text-sm leading-none",
                r === days ? "bg-ink text-paper" : "bg-transparent text-ink",
              )}
            >
              {r}d
            </Link>
          ))}
        </div>
      </header>

      <DayLog acts={acts} />

      <div className="flex flex-col gap-6">
        {acts.map((a) => {
          const mine = new Map(rows.filter((r) => r.activityId === a.id).map((r) => [r.date, r.value]));
          const points: DayPoint[] = dates.map((d) => ({ date: d, value: mine.get(d) ?? null }));
          const logged = points.filter((p) => p.value != null);
          return (
            <section key={a.key} className="marker-box p-4">
              <h2 className="font-display mb-1 text-2xl leading-none">{a.label}</h2>
              <DayChart points={points} goal={a.dailyTarget} unit={a.unit} kind={a.kind} />
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-pencil">as a table</summary>
                <table className="mt-1 w-full text-sm">
                  <thead>
                    <tr className="text-left text-pencil">
                      <th className="font-normal">date</th>
                      <th className="font-normal">{a.unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logged.map((p) => (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td className="tabular-nums">{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}

// One line per recent day: everything done, in the order it matters.
function DayLog({ acts }: { acts: (typeof schema.activities.$inferSelect)[] }) {
  const today = localDate();
  const days = dateRange(today, LOG_DAYS);
  const from = days[0];

  const entryRows =
    acts.length > 0
      ? db
          .select()
          .from(schema.entries)
          .where(
            and(
              inArray(
                schema.entries.activityId,
                acts.map((a) => a.id),
              ),
              gte(schema.entries.date, from),
              lte(schema.entries.date, today),
            ),
          )
          .all()
      : [];
  const workoutRows = db
    .select()
    .from(schema.workouts)
    .where(and(gte(schema.workouts.date, from), lte(schema.workouts.date, today)))
    .all();
  const mealRows = db
    .select()
    .from(schema.meals)
    .where(and(gte(schema.meals.date, from), lte(schema.meals.date, today)))
    .all();

  const byId = new Map(acts.map((a) => [a.id, a]));
  const lines = [...days].reverse().map((date) => {
    const parts: string[] = [];
    for (const e of entryRows.filter((r) => r.date === date)) {
      const a = byId.get(e.activityId);
      if (!a || e.value <= 0) continue;
      parts.push(a.kind === "measure" ? `${e.value} ${a.unit}` : `${e.value} ${shortLabel(a.label)}`);
    }
    for (const w of workoutRows.filter((r) => r.date === date)) {
      parts.push(w.distanceMi ? `${w.type} ${w.distanceMi}mi` : `${w.type}${w.durationMin ? ` ${Math.round(w.durationMin)}m` : ""}`);
    }
    const cal = mealRows.filter((m) => m.date === date).reduce((s, m) => s + m.calories, 0);
    if (cal > 0) parts.push(`${Math.round(cal)} cal`);
    return { date, text: parts.join(" · ") };
  });

  return (
    <section className="marker-box mb-6 p-4">
      <h2 className="font-display mb-2 text-2xl leading-none">Day log</h2>
      <dl className="flex flex-col gap-1 text-sm">
        {lines.map((l) => (
          <div key={l.date} className="flex gap-3">
            <dt className="font-display w-16 shrink-0 text-pencil">
              {new Date(`${l.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </dt>
            <dd className={l.text ? "" : "text-pencil"}>{l.text || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

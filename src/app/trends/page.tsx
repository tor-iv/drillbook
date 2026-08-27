import Link from "next/link";
import clsx from "clsx";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { dateRange, localDate } from "@/lib/dates";
import { DayChart, type DayPoint } from "@/components/day-chart";

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

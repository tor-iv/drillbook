import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const writeups = db
    .select()
    .from(schema.aiNudges)
    .where(eq(schema.aiNudges.kind, "weekly"))
    .orderBy(desc(schema.aiNudges.date))
    .limit(12)
    .all();

  return (
    <main>
      <h1 className="font-display mb-1 text-4xl leading-none">Coach</h1>
      <p className="mb-4 text-sm text-pencil">Weekly plans, written every Sunday evening from your actual numbers.</p>

      {writeups.length === 0 ? (
        <p className="marker-box p-4 text-sm">
          Nothing yet — the first plan writes itself Sunday at 6pm once there&apos;s a week of data on the sheet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {writeups.map((w) => (
            <article key={w.id} className="marker-box p-4">
              <h2 className="font-display text-xl text-margin">week of {w.date}</h2>
              <div className="font-marker mt-2 whitespace-pre-wrap text-sm leading-relaxed">{w.content}</div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

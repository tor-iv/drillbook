import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { googleConfigured, googleConnected } from "@/lib/google";
import { GoalEditor } from "@/components/goal-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const params = await searchParams;
  const acts = db.select().from(schema.activities).orderBy(asc(schema.activities.sortOrder)).all();
  const cronRuns = db.select().from(schema.cronRuns).all();
  const connected = googleConnected();

  return (
    <main>
      <h1 className="font-display mb-4 text-4xl leading-none">Setup</h1>

      <section className="mb-6">
        <h2 className="font-display mb-2 text-2xl">Daily goals</h2>
        <GoalEditor
          activities={acts.map((a) => ({
            key: a.key,
            label: a.label,
            kind: a.kind,
            unit: a.unit,
            dailyTarget: a.dailyTarget,
            active: a.active,
          }))}
        />
      </section>

      <section className="mb-6">
        <h2 className="font-display mb-2 text-2xl">Google Calendar</h2>
        <div className="marker-box p-4 text-sm">
          {params.google === "connected" && <p className="highlighted mb-2 inline-block">Connected.</p>}
          {params.google === "error" && <p className="mb-2 text-margin">Connection failed — try again.</p>}
          {params.google === "denied" && <p className="mb-2 text-margin">Consent was denied.</p>}
          {!googleConfigured() ? (
            <p className="text-pencil">
              Not configured yet — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (see docs/google-setup.md).
            </p>
          ) : connected ? (
            <p>
              Connected — a daily summary event is written with the 8pm nudge.{" "}
              <a href="/api/google/auth" className="underline">
                Reconnect
              </a>
            </p>
          ) : (
            <a href="/api/google/auth" className="btn-ink inline-block px-4 py-2 text-lg leading-none">
              Connect Google Calendar
            </a>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-display mb-2 text-2xl">Jobs</h2>
        <div className="marker-box p-4 text-sm">
          {(["daily-nudge", "weekly-coach"] as const).map((key) => {
            const run = cronRuns.find((r) => r.jobKey === key);
            return (
              <p key={key}>
                <span className="font-display">{key}</span>:{" "}
                {run ? `last ran ${run.lastRunDate}` : "never ran"}
              </p>
            );
          })}
          <p className="mt-2 text-pencil">
            Daily nudge fires 8pm, weekly coach Sunday 6pm ({process.env.CRON_TIMEZONE ?? "America/New_York"}).
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 text-2xl">Phone</h2>
        <div className="marker-box p-4 text-sm text-pencil">
          <p>Apple Health sync + evening notification run as iOS Shortcuts — see docs/apple-health-shortcut.md in the repo.</p>
        </div>
      </section>
    </main>
  );
}

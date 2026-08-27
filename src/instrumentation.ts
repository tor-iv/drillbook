// Registered once when the standalone Node server boots — this is what makes
// a single container act as app + scheduler. Would NOT work on serverless.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.CRON_ENABLED !== "true") return;

  const cron = await import("node-cron");
  const { runDailyNudge } = await import("@/lib/cron/daily-nudge");
  const { runWeeklyCoach } = await import("@/lib/cron/weekly-coach");

  const timezone = process.env.CRON_TIMEZONE ?? "America/New_York";

  // Three daily touchpoints: morning briefing, midday checkpoint, evening
  // close-out (the evening run also writes the calendar event).
  cron.schedule("30 7 * * *", () => runDailyNudge(false, "morning").catch((e) => console.error("[cron] nudge-am:", e)), {
    timezone,
  });
  cron.schedule("0 13 * * *", () => runDailyNudge(false, "midday").catch((e) => console.error("[cron] nudge-noon:", e)), {
    timezone,
  });
  cron.schedule("0 20 * * *", () => runDailyNudge(false, "evening").catch((e) => console.error("[cron] nudge-pm:", e)), {
    timezone,
  });
  // 6pm Sunday — weekly coach writeup for the coming week.
  cron.schedule("0 18 * * 0", () => runWeeklyCoach().catch((e) => console.error("[cron] weekly-coach:", e)), {
    timezone,
  });

  console.log(`[cron] scheduled nudges 07:30/13:00/20:00 and weekly-coach Sun 18:00 (${timezone})`);
}

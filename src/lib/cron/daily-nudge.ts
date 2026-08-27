import { db, schema } from "@/db";
import { athleteProfile, coachConfigured, coachModel, coachSay, DAILY_NUDGE_SYSTEM } from "@/lib/coach";
import { sendCoachEmail } from "@/lib/email";
import { localDate } from "@/lib/dates";
import { googleConnected, upsertDailyEvent } from "@/lib/google";
import { getTodayStatus } from "@/lib/status";
import { alreadyRanToday, markRan } from "./guard";

export async function runDailyNudge(force = false): Promise<string> {
  const today = localDate();
  if (!force && alreadyRanToday("daily-nudge", today)) return "already ran today";

  const status = getTodayStatus(today);

  // The nudge must go out even when the LLM is down or unconfigured —
  // fall back to a template rather than losing the day's email.
  const template = status.behind
    ? `Still open today — ${status.summary}. Close it out.`
    : `${status.summary}. Good day.`;
  let content = template;
  let model = "template";
  if (coachConfigured()) {
    try {
      content = await coachSay(DAILY_NUDGE_SYSTEM, {
        athlete: athleteProfile(),
        date: today,
        activities: status.activities
          .filter((a) => a.kind === "counter")
          .map((a) => ({ label: a.label, done: a.done ?? 0, goal: a.goal, unit: a.unit, streak: a.streak })),
        bodyWeightLb: status.activities.find((a) => a.key === "bodyweight")?.done ?? undefined,
        caloriesEatenToday: status.calories ?? undefined,
      });
      model = coachModel();
    } catch (e) {
      console.error("[daily-nudge] LLM failed, using template:", e);
    }
  }

  db.insert(schema.aiNudges).values({ date: today, kind: "daily", content, model }).run();

  // Email and calendar are independent best-effort deliveries — one failing
  // must not block the other or the run marker.
  const subject = status.behind ? `Drillbook: you're behind today` : `Drillbook: goals hit`;
  await sendCoachEmail(subject, content).catch((e) => console.error("[daily-nudge] email failed:", e));
  if (googleConnected()) {
    await upsertDailyEvent(today, status.summary).catch((e) => console.error("[daily-nudge] calendar failed:", e));
  }

  markRan("daily-nudge", today);
  return content;
}

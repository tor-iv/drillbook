import { db, schema } from "@/db";
import { coachSay, DAILY_NUDGE_SYSTEM, llmConfigured, llmModel } from "@/lib/deepseek";
import { sendCoachEmail } from "@/lib/email";
import { localDate } from "@/lib/dates";
import { googleConnected, upsertDailyEvent } from "@/lib/google";
import { getTodayStatus } from "@/lib/status";
import { alreadyRanToday, markRan } from "./guard";

export async function runDailyNudge(force = false): Promise<string> {
  const today = localDate();
  if (!force && alreadyRanToday("daily-nudge", today)) return "already ran today";

  const status = getTodayStatus(today);

  let content: string;
  if (llmConfigured()) {
    content = await coachSay(DAILY_NUDGE_SYSTEM, {
      date: today,
      activities: status.activities
        .filter((a) => a.kind === "counter")
        .map((a) => ({ label: a.label, done: a.done ?? 0, goal: a.goal, unit: a.unit, streak: a.streak })),
      bodyWeightLb: status.activities.find((a) => a.key === "bodyweight")?.done ?? undefined,
    });
  } else {
    // Template fallback so the pipeline works before the API key exists.
    content = status.behind
      ? `Still open today — ${status.summary}. Close it out.`
      : `${status.summary}. Good day.`;
  }

  db.insert(schema.aiNudges)
    .values({ date: today, kind: "daily", content, model: llmConfigured() ? llmModel() : "template" })
    .run();

  const subject = status.behind ? `Drillbook: you're behind today` : `Drillbook: goals hit`;
  await sendCoachEmail(subject, content);

  if (googleConnected()) {
    await upsertDailyEvent(today, status.summary);
  }

  markRan("daily-nudge", today);
  return content;
}

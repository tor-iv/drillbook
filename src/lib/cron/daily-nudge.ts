import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { athleteProfile, coachConfigured, coachModel, coachSay, dailyNudgeSystem, type NudgeSlot } from "@/lib/coach";
import { addDays } from "@/lib/dates";
import { sendCoachEmail } from "@/lib/email";
import { localDate } from "@/lib/dates";
import { googleConnected, upsertDailyEvent } from "@/lib/google";
import { getDayEnergy } from "@/lib/energy";
import { sendNudgeSms } from "@/lib/sms";
import { sendOwnerTelegram } from "@/lib/telegram";
import { getTodayStatus } from "@/lib/status";
import { alreadyRanToday, markRan } from "./guard";

export async function runDailyNudge(force = false, slot: NudgeSlot = "evening"): Promise<string> {
  const today = localDate();
  if (!force && alreadyRanToday(`daily-nudge-${slot}`, today)) return "already ran today";

  const status = getTodayStatus(today);
  const energy = getDayEnergy(today);

  // The nudge must go out even when the LLM is down or unconfigured —
  // fall back to a template rather than losing the day's email.
  const template = status.behind
    ? `Still open today — ${status.summary}. Close it out.`
    : `${status.summary}. Good day.`;
  let content = template;
  let model = "template";
  if (coachConfigured()) {
    try {
      const openTodos = db
        .select()
        .from(schema.todos)
        .where(eq(schema.todos.done, 0))
        .all()
        .map((t) => ({ text: t.text, due: t.due ?? undefined }));
      content = await coachSay(dailyNudgeSystem(slot), {
        athlete: athleteProfile(),
        date: today,
        openTodos: openTodos.length ? openTodos : undefined,
        yesterdaySummary: slot === "morning" ? getTodayStatus(addDays(today, -1)).summary : undefined,
        activities: status.activities
          .filter((a) => a.kind === "counter")
          .map((a) => ({ label: a.label, done: a.done ?? 0, goal: a.goal, unit: a.unit, streak: a.streak })),
        bodyWeightLb: energy.weightLb ?? undefined,
        goalWeightLb: energy.goalWeightLb,
        caloriesEatenToday: energy.eaten ?? undefined,
        estCaloriesBurnedToday: energy.burned ?? undefined,
        energyBalance: energy.balance ?? undefined,
        dailyDeficitTarget: energy.deficitTarget,
      });
      model = coachModel();
    } catch (e) {
      console.error("[daily-nudge] LLM failed, using template:", e);
    }
  }

  db.insert(schema.aiNudges).values({ date: today, kind: "daily", content, model }).run();

  // Email, SMS, Telegram, and calendar are independent best-effort
  // deliveries — one failing must not block the others or the run marker.
  const subject =
    slot === "morning"
      ? `Tally: today's plan`
      : slot === "midday"
        ? `Tally: midday check`
        : status.behind
          ? `Tally: you're behind today`
          : `Tally: goals hit`;
  await sendCoachEmail(subject, content).catch((e) => console.error("[daily-nudge] email failed:", e));
  await sendNudgeSms(content).catch((e) => console.error("[daily-nudge] sms failed:", e));
  await sendOwnerTelegram(content).catch((e) => console.error("[daily-nudge] telegram failed:", e));
  // Calendar event only once, at end of day when the summary is complete.
  if (slot === "evening" && googleConnected()) {
    await upsertDailyEvent(today, status.summary).catch((e) => console.error("[daily-nudge] calendar failed:", e));
  }

  markRan(`daily-nudge-${slot}`, today);
  return content;
}

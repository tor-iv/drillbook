import { db, schema } from "@/db";
import { athleteProfile, coachConfigured, coachModel, coachSay, WEEKLY_COACH_SYSTEM } from "@/lib/coach";
import { sendCoachEmail } from "@/lib/email";
import { sendOwnerTelegram } from "@/lib/telegram";
import { localDate } from "@/lib/dates";
import { getRangeBalances, goalWeightLb } from "@/lib/energy";
import { getWeekStatus } from "@/lib/status";
import { alreadyRanToday, markRan } from "./guard";

export async function runWeeklyCoach(force = false): Promise<string> {
  const today = localDate();
  if (!force && alreadyRanToday("weekly-coach", today)) return "already ran today";

  const week = getWeekStatus(today);

  // Same resilience contract as the daily nudge: template beats silence.
  const lines = week.totals.map(
    (t) => `${t.label}: ${t.total} ${t.unit}${t.weeklyGoal ? ` / ${t.weeklyGoal}` : ""} (${t.daysMet}/7 days)`,
  );
  let content = `Week ${week.from} → ${week.to}\n${lines.join("\n")}`;
  let model = "template";
  if (coachConfigured()) {
    try {
      content = await coachSay(WEEKLY_COACH_SYSTEM, {
        athlete: athleteProfile(),
        goalWeightLb: goalWeightLb(),
        dailyEnergyBalances: getRangeBalances(week.from, week.to),
        ...week,
      });
      model = coachModel();
    } catch (e) {
      console.error("[weekly-coach] LLM failed, using template:", e);
    }
  }

  db.insert(schema.aiNudges).values({ date: today, kind: "weekly", content, model }).run();

  await sendCoachEmail(`Tally: your week + next week's plan`, content).catch((e) =>
    console.error("[weekly-coach] email failed:", e),
  );
  await sendOwnerTelegram(content).catch((e) => console.error("[weekly-coach] telegram failed:", e));

  markRan("weekly-coach", today);
  return content;
}

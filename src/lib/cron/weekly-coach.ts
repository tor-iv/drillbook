import { db, schema } from "@/db";
import { athleteProfile, coachConfigured, coachModel, coachSay, WEEKLY_COACH_SYSTEM } from "@/lib/coach";
import { sendCoachEmail } from "@/lib/email";
import { localDate } from "@/lib/dates";
import { getWeekStatus } from "@/lib/status";
import { alreadyRanToday, markRan } from "./guard";

export async function runWeeklyCoach(force = false): Promise<string> {
  const today = localDate();
  if (!force && alreadyRanToday("weekly-coach", today)) return "already ran today";

  const week = getWeekStatus(today);

  let content: string;
  if (coachConfigured()) {
    content = await coachSay(WEEKLY_COACH_SYSTEM, { athlete: athleteProfile(), ...week });
  } else {
    const lines = week.totals.map(
      (t) => `${t.label}: ${t.total} ${t.unit}${t.weeklyGoal ? ` / ${t.weeklyGoal}` : ""} (${t.daysMet}/7 days)`,
    );
    content = `Week ${week.from} → ${week.to}\n${lines.join("\n")}`;
  }

  db.insert(schema.aiNudges)
    .values({ date: today, kind: "weekly", content, model: coachConfigured() ? coachModel() : "template" })
    .run();

  await sendCoachEmail(`Drillbook: your week + next week's plan`, content);

  markRan("weekly-coach", today);
  return content;
}

import { db, schema } from "@/db";
import { athleteProfile, coachConfigured, coachModel, coachSay, WEEKLY_COACH_SYSTEM } from "@/lib/coach";
import { sendCoachEmail } from "@/lib/email";
import { sendOwnerTelegram } from "@/lib/telegram";
import { localDate } from "@/lib/dates";
import { and, gte, lte } from "drizzle-orm";
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
      const rows = db
        .select()
        .from(schema.dayMetrics)
        .where(and(gte(schema.dayMetrics.date, week.from), lte(schema.dayMetrics.date, week.to)))
        .all();
      const avg = (vals: (number | null)[]) => {
        const nums = vals.filter((v): v is number => v != null);
        return nums.length ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10 : undefined;
      };
      content = await coachSay(WEEKLY_COACH_SYSTEM, {
        athlete: athleteProfile(),
        goalWeightLb: goalWeightLb(),
        dailyEnergyBalances: getRangeBalances(week.from, week.to),
        appleHealthWeek: rows.length
          ? {
              daysSynced: rows.length,
              avgSleepHours: avg(rows.map((r) => r.sleepHours)),
              avgSteps: avg(rows.map((r) => r.steps)),
              avgRestingHr: avg(rows.map((r) => r.restingHr)),
              avgMeasuredBurn: avg(
                rows.map((r) => (r.activeEnergy != null && r.basalEnergy != null ? r.activeEnergy + r.basalEnergy : null)),
              ),
            }
          : undefined,
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

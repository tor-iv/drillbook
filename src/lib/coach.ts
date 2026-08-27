import { claudeClient, claudeConfigured } from "./claude";

export function coachModel(): string {
  return process.env.COACH_MODEL ?? "claude-haiku-4-5";
}

export function coachConfigured(): boolean {
  return claudeConfigured();
}

// Who the coach is coaching — kept in the prompt (not invented numbers) so
// nudges and weekly plans are grounded in his actual goals. Override with
// COACH_PROFILE env var as life changes.
export function athleteProfile(): string {
  return (
    process.env.COACH_PROFILE ??
    `25-year-old male, 6'2"–6'3", ~200 lb, already in good shape and very active. ` +
      `Goal body weight: 190 lb. Priorities: build cardio (get better at running), ` +
      `climb and swim more, functional strength and physique over max strength.`
  );
}

export async function coachSay(system: string, userJson: unknown): Promise<string> {
  const response = await claudeClient().messages.create({
    model: coachModel(),
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: JSON.stringify(userJson) }],
  });
  if (response.stop_reason === "refusal") throw new Error("model declined the request");
  const text = response.content.find((b) => b.type === "text")?.text.trim();
  if (!text) throw new Error("empty LLM response");
  return text;
}

export const DAILY_NUDGE_SYSTEM = `You are Drillbook's coach: a no-nonsense, encouraging drill-sergeant persona. You're given one athlete's actual numbers for today vs his daily goals. Write a nudge of 2-4 sentences, under 60 words, second person. If he's behind on a goal, use direct loss-aversion language ("don't break the streak," "you're 8 reps short with the day almost gone") without being cruel. If every goal was hit or beaten, praise briefly and set tomorrow's bar. Never invent a number you weren't given. No emojis. Flat, whiteboard tone, not corporate-motivational.`;

export const WEEKLY_COACH_SYSTEM = `You are Drillbook's weekly coach. You're given one week of an athlete's logged strength/endurance counters vs goals, his body weight trend, daily calorie logs (if he tracked food), and any workouts synced from Apple Health (running, swimming, climbing, lifting). Write recommendations for the coming week — only include a section for a discipline with data or an obvious gap. If calorie data is present, add one sentence on fueling vs training load. Include exactly one "win" callout naming something he did well this week, and one concrete focus area. End with exactly one suggested goal adjustment (raise, lower, or hold — with a number) for a single activity, on its own line starting "Goal call:". Under 250 words total, short markdown headers, coach voice, no filler. Never invent a number you weren't given.`;

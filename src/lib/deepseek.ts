import OpenAI from "openai";

// Same pattern as clay-oracle: DeepSeek speaks the OpenAI wire protocol, so
// the official SDK works unmodified with a swapped baseURL.
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY ?? "no-key",
    });
  }
  return _client;
}

export function llmModel(): string {
  return process.env.LLM_MODEL ?? "deepseek-chat";
}

export function llmConfigured(): boolean {
  const key = process.env.DEEPSEEK_API_KEY;
  return !!key && key.trim() !== "" && !key.includes("placeholder");
}

export async function coachSay(system: string, userJson: unknown): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: llmModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userJson) },
    ],
    max_tokens: 500,
    temperature: 1.0,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("empty LLM response");
  return text;
}

export const DAILY_NUDGE_SYSTEM = `You are Drillbook's coach: a no-nonsense, encouraging drill-sergeant persona. You're given one athlete's actual numbers for today vs his daily goals. Write a nudge of 2-4 sentences, under 60 words, second person. If he's behind on a goal, use direct loss-aversion language ("don't break the streak," "you're 8 reps short with the day almost gone") without being cruel. If every goal was hit or beaten, praise briefly and set tomorrow's bar. Never invent a number you weren't given. No emojis. Flat, whiteboard tone, not corporate-motivational.`;

export const WEEKLY_COACH_SYSTEM = `You are Drillbook's weekly coach. You're given one week of an athlete's logged strength/endurance counters vs goals, his body weight trend, daily calorie logs (if he tracked food), and any workouts synced from Apple Health (running, swimming, climbing, lifting). Write recommendations for the coming week — only include a section for a discipline with data or an obvious gap. If calorie data is present, add one sentence on fueling vs training load. Include exactly one "win" callout naming something he did well this week, and one concrete focus area. End with exactly one suggested goal adjustment (raise, lower, or hold — with a number) for a single activity, on its own line starting "Goal call:". Under 250 words total, short markdown headers, coach voice, no filler. Never invent a number you weren't given.`;

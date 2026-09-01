import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { askClaudeJson, claudeConfigured } from "./claude";
import { groundItem, type GroundedItem } from "./fdc";

// Food estimation needs vision. FOOD_MODEL env overrides (currently sonnet-5
// in prod — haiku underestimated real meals).
export function foodModel(): string {
  return process.env.FOOD_MODEL ?? "claude-haiku-4-5";
}

export function foodAiConfigured(): boolean {
  return claudeConfigured();
}

// Research-backed structure (itemize-then-sum beats single-shot; vision
// models systematically underestimate large portions; size references and
// meal context reduce error): the model must break the meal into components
// with gram weights before any calorie math, then FDC grounds each item.
const SYSTEM = `You estimate nutrition for one meal from a photo and/or short description, for a very active ~200 lb male athlete.

Work in this order:
1. Identify every component of the meal, including cooking fat, dressings, sauces, and drinks. Nothing is "garnish" — if it's edible, it's an item.
2. Assign each component a weight in grams. Use visible size references first (plate diameter ~27cm, fork ~18cm, hand, standard bowl ~500ml); when portion size is ambiguous, assume athlete-sized portions — real-world bowls of rice, pasta, or cereal run 1.5-2x the label serving. Vision models systematically UNDERestimate large portions: when torn between two sizes, pick the larger.
3. Give each item calories and protein for that gram amount. Sautéed or fried items: include 10-20% extra for cooking oil. Restaurant food runs fattier than home cooking. Nuts, seeds, oils, nut butters, and cheese are calorie-dense even in small volumes.
4. Sum the items for the totals. The totals MUST equal the sum of the items.

If the photo shows a nutrition label or packaged food, READ the label: use its per-serving values times the number of servings actually eaten (stated in the caption or visible). Label numbers beat estimation — one item per package, confidence high.

If earlier meals from today are provided, they are context only — estimate ONLY the current meal.

Reply with ONLY a JSON object, no prose, no code fences:
{"name": "<3-6 word meal name>", "items": [{"food": "<simple searchable food name, e.g. 'cooked white rice' not 'fluffy rice'>", "grams": <number>, "kcal": <number>, "protein": <number>}], "calories": <total kcal>, "protein": <total g>, "confidence": "high"|"low", "question": "<one short question or null>"}

Single best point estimates — never ranges, never refusals; if genuinely ambiguous, estimate the middle and lean larger. Set confidence "low" only when a hidden factor (unseen oil, unknowable depth, mixed dish, no quantities) could swing calories by more than ~35% — and then put the ONE question whose answer would most tighten the estimate in "question" (e.g. "Cooked in oil or dry?"). Otherwise question is null.`;

const itemSchema = z.object({
  food: z.string().min(1),
  grams: z.number().positive(),
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative().nullable().catch(null),
});

const resultSchema = z.object({
  name: z.string().min(1),
  items: z.array(itemSchema).max(20).catch([]),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().nullable().catch(null),
  confidence: z.enum(["high", "low"]).catch("high"),
  question: z.string().nullable().catch(null),
});

export type FoodEstimate = {
  name: string;
  calories: number;
  protein: number | null;
  confidence: "high" | "low";
  question: string | null;
  items: GroundedItem[];
};

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"] as const);
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function estimateMeal(input: {
  description?: string;
  imageBase64?: string;
  imageMediaType?: string;
  earlierMealsToday?: { name: string; calories: number }[];
}): Promise<FoodEstimate> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    const mediaType = MEDIA_TYPES.has(input.imageMediaType as MediaType)
      ? (input.imageMediaType as MediaType)
      : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: input.imageBase64 },
    });
  }
  const context =
    input.earlierMealsToday?.length
      ? `\nEarlier today he ate: ${input.earlierMealsToday.map((m) => `${m.name} (${Math.round(m.calories)} cal)`).join(", ")}.`
      : "";
  content.push({
    type: "text",
    text:
      (input.description?.trim() ? `Meal: ${input.description.trim()}` : "Estimate this meal.") +
      `\nLocal time: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.CRON_TIMEZONE ?? "America/New_York" })}.` +
      context,
  });

  const raw = resultSchema.parse(await askClaudeJson({ model: foodModel(), system: SYSTEM, content }));

  // Ground each item against USDA FDC; totals recomputed from grounded items
  // when we have any, else the model's totals stand.
  let items: GroundedItem[] = [];
  if (raw.items.length > 0) {
    // Sequential, not parallel — DEMO_KEY burst-limits concurrent lookups
    // from one IP (intermittent 400s observed with Promise.all).
    for (const item of raw.items) items.push(await groundItem(item));
    const fdcCount = items.filter((i) => i.source === "fdc").length;
    console.log(`[food] "${raw.name}": ${items.length} items, ${fdcCount} FDC-grounded, model total ${Math.round(raw.calories)}`);
  }
  const calories = items.length > 0 ? items.reduce((s, i) => s + i.kcal, 0) : raw.calories;
  const proteinSum = items.length > 0 ? items.reduce((s, i) => s + (i.protein ?? 0), 0) : null;

  return {
    name: raw.name,
    calories: Math.round(calories),
    protein: proteinSum != null && proteinSum > 0 ? Math.round(proteinSum) : raw.protein,
    confidence: raw.confidence,
    question: raw.confidence === "low" ? raw.question : null,
    items,
  };
}

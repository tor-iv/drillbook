import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Food estimation needs vision, which DeepSeek's chat model doesn't do —
// Claude Haiku 4.5 is the cheapest vision-capable Claude (~$0.003/meal photo).
// Model overridable via FOOD_MODEL.
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "no-key" });
  }
  return _client;
}

export function foodModel(): string {
  return process.env.FOOD_MODEL ?? "claude-haiku-4-5";
}

export function foodAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.trim() !== "" && !key.includes("placeholder");
}

const SYSTEM = `You estimate nutrition for one meal from a photo and/or short description. The eater is a very active ~200 lb male athlete — when portion size is ambiguous, assume athlete-sized portions, not small USDA reference servings. Reply with ONLY a JSON object, no prose, no code fences: {"name": "<3-6 word meal name>", "calories": <number, total kcal>, "protein": <number, grams>, "confidence": "high"|"low"}. Give your single best point estimate — never a range, never a refusal; if genuinely ambiguous, estimate the middle of the plausible range. Set confidence to "low" only when hidden factors (unseen oils, unknowable portion depth, mixed dishes, no quantities given) could plausibly swing calories by more than ~35%.`;

const resultSchema = z.object({
  name: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().nullable().catch(null),
  confidence: z.enum(["high", "low"]).catch("high"),
});

export type FoodEstimate = z.infer<typeof resultSchema>;

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"] as const);
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function estimateMeal(input: {
  description?: string;
  imageBase64?: string;
  imageMediaType?: string;
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
  content.push({
    type: "text",
    text: input.description?.trim() ? `Meal: ${input.description.trim()}` : "Estimate this meal.",
  });

  const response = await getClient().messages.create({
    model: foodModel(),
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("model declined the request");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  // Tolerate stray prose/fences around the JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in response: ${text.slice(0, 120)}`);
  return resultSchema.parse(JSON.parse(match[0]));
}

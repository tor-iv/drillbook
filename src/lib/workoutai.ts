import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { askClaudeJson, claudeConfigured } from "./claude";

// Parses workouts from a screenshot (fitness app summary, watch face, gym
// whiteboard) and/or a short dictated description into structured rows for
// the workouts table — same vision pattern as foodai.
export function workoutModel(): string {
  return process.env.WORKOUT_MODEL ?? "claude-haiku-4-5";
}

export function workoutAiConfigured(): boolean {
  return claudeConfigured();
}

const SYSTEM = `You extract workouts from a screenshot (fitness app summary, smartwatch screen, gym whiteboard) and/or a short description. A single input may contain several workouts. Reply with ONLY a JSON object, no prose, no code fences: {"workouts": [{"type": "run"|"swim"|"climb"|"lift"|"other", "durationMin": <number or null>, "distanceMi": <number or null>, "calories": <number or null>, "summary": "<3-8 word label>"}]}. Map any strength/gym/weights/crossfit session to "lift", bouldering or rope climbing to "climb". Convert km to miles (1 km = 0.621 mi). Only report numbers actually shown or stated — use null for anything not given, never invent. If the input contains no workout at all, return {"workouts": []}.`;

const resultSchema = z.object({
  workouts: z
    .array(
      z.object({
        type: z.enum(["run", "swim", "climb", "lift", "other"]),
        durationMin: z.number().nonnegative().nullable().catch(null),
        distanceMi: z.number().nonnegative().nullable().catch(null),
        calories: z.number().nonnegative().nullable().catch(null),
        summary: z.string().min(1),
      }),
    )
    .max(10),
});

export type ParsedWorkouts = z.infer<typeof resultSchema>;

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"] as const);
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function parseWorkouts(input: {
  description?: string;
  imageBase64?: string;
  imageMediaType?: string;
}): Promise<ParsedWorkouts> {
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
    text: input.description?.trim() ? `Workout: ${input.description.trim()}` : "Extract the workouts shown.",
  });

  return resultSchema.parse(await askClaudeJson({ model: workoutModel(), system: SYSTEM, content }));
}

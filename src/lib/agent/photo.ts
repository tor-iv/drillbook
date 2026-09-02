import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { askClaudeJson } from "@/lib/claude";
import { coachModel } from "@/lib/coach";
import { localDate } from "@/lib/dates";
import { estimateMeal, foodModel } from "@/lib/foodai";
import { parseWorkouts, workoutModel } from "@/lib/workoutai";
import { earlierMeals } from "./actions";

export type PhotoInput = { base64: string; mediaType: string };

const classifySchema = z.object({ kind: z.enum(["meal", "workout", "unclear"]).catch("unclear") });

// Route the photo by looking at it, not just the caption — food photos,
// watch/app workout screenshots, and everything else go different ways.
export async function classifyPhoto(photo: PhotoInput, caption: string): Promise<"meal" | "workout" | "unclear"> {
  try {
    const res = classifySchema.parse(
      await askClaudeJson({
        model: coachModel(),
        system: `Classify this photo. "meal" = food or drink to be eaten. "workout" = a fitness tracker/watch/app screenshot or gym equipment showing a completed workout. "unclear" = anything else. The caption (if any) is a strong hint. Reply ONLY {"kind":"meal"|"workout"|"unclear"}.`,
        content: [
          { type: "image", source: { type: "base64", media_type: photo.mediaType as "image/jpeg", data: photo.base64 } },
          { type: "text", text: caption ? `Caption: ${caption}` : "No caption." },
        ],
      }),
    );
    return res.kind;
  } catch (e) {
    console.error("[agent] photo classify failed:", e);
    return "unclear";
  }
}

/** Log a photo (meal or workout screenshot) and return the reply text. Channel-agnostic. */
export async function handlePhotoBytes(photo: PhotoInput, caption: string): Promise<string> {
  const workoutish = /\b(run|ran|lift|lifted|climb|swim|swam|workout|gym|erg|mi|miles|min)\b/i.test(caption);
  const kind = workoutish ? "workout" : await classifyPhoto(photo, caption);
  if (kind === "unclear") {
    return "Can't tell what this is — resend it with a word or two (\"lunch\", \"morning run\").";
  }
  const date = localDate();
  if (kind === "workout") {
    const res = await parseWorkouts({
      description: caption,
      imageBase64: photo.base64,
      imageMediaType: photo.mediaType,
    });
    if (res.workouts.length === 0) return "I couldn't read a workout from that — add a few words.";
    const now = Date.now();
    for (const [i, w] of res.workouts.entries()) {
      db.insert(schema.workouts)
        .values({
          date,
          type: w.type,
          durationMin: w.durationMin,
          distanceMi: w.distanceMi,
          calories: w.calories,
          startedAt: new Date(now + i).toISOString(),
          source: "manual",
          rawJson: JSON.stringify({ summary: w.summary, description: caption || undefined, model: workoutModel() }),
        })
        .run();
    }
    return `Logged: ${res.workouts.map((w) => w.summary).join(", ")}.`;
  }
  const est = await estimateMeal({
    description: caption,
    imageBase64: photo.base64,
    imageMediaType: photo.mediaType,
    earlierMealsToday: earlierMeals(date),
  });
  db.insert(schema.meals)
    .values({
      date,
      name: est.name,
      description: caption || null,
      calories: est.calories,
      protein: est.protein,
      method: "photo",
      model: foodModel(),
      itemsJson: est.items.length ? JSON.stringify(est.items) : null,
    })
    .run();
  const total = Math.round(
    db.select().from(schema.meals).where(eq(schema.meals.date, date)).all().reduce((s, m) => s + m.calories, 0),
  );
  return `Logged ${est.name} — about ${Math.round(est.calories)} cal${est.protein ? `, ${Math.round(est.protein)}g protein` : ""}. ${total} cal today.${est.question ? `\n${est.question}` : ""}`;
}

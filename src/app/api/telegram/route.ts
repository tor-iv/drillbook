import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { askClaudeJson } from "@/lib/claude";
import { athleteProfile, COACH_PERSONA, coachModel } from "@/lib/coach";
import { localDate } from "@/lib/dates";
import { getDayEnergy, getDayMetrics } from "@/lib/energy";
import { createEvent, googleConnected } from "@/lib/google";
import { estimateMeal, foodModel } from "@/lib/foodai";
import { pinMatches } from "@/lib/auth";
import { getTodayStatus } from "@/lib/status";
import { fetchTelegramPhoto, ownerChatId, sendTelegram, setOwnerChatId, telegramConfigured } from "@/lib/telegram";
import { parseWorkouts, workoutModel } from "@/lib/workoutai";

// Telegram webhook: the conversational coach. Verified by the secret token
// Telegram echoes back on every webhook call; scoped to the single claimed
// owner chat.

const ROUTER_SYSTEM = `${COACH_PERSONA} You're chatting with your athlete on Telegram. You know his profile and today's live numbers (provided as JSON, including today's date). Default reply: 1-3 sentences. Go longer only when he asks for a plan or a breakdown.

If his message asks to LOG something, include it in "actions" (and confirm naturally in the reply): counters (pullups/pushups/squats/abs/pages use activityKey with a positive or negative delta), weight in lb, meals (pass his food description through verbatim), workouts (pass his description verbatim). If he asks to PUT SOMETHING ON HIS CALENDAR, add a calendar action: date as YYYY-MM-DD (resolve "tomorrow"/"Friday" from today's date), startTime/endTime as 24h HH:MM local, omit times for all-day. He also keeps a TO-DO LIST here (open items are in the JSON): "add X to my list / remind me to X" → todo_add (due date optional); "done with X / did X / check off X" → todo_done with enough of the item's text to match it; asking what's on his list → answer from openTodos. If he's adding detail or a correction to the meal he JUST logged ("it had two scoops of rice", "cooked in butter", "actually it was a large") → meal_revise with that detail, not a new meal. Multiple actions allowed. Questions about progress, training, food, or anything else: just answer from the data — never invent numbers.

Workout advice covers TODAY only — exact sets/reps/distances for today's session. The Sunday weekly plan owns the week; don't sketch multi-day plans unless he explicitly asks for one. Meal suggestions only when he asks — don't volunteer food advice, but when asked, give real meals with rough calorie/protein numbers. Never vague advice or motivational filler.

Return ONLY JSON: {"reply": "<message>", "actions": [{"type":"counter","activityKey":"pushups","delta":20} | {"type":"weight","value":199.5} | {"type":"meal","description":"..."} | {"type":"workout","description":"..."} | {"type":"calendar","title":"Climbing","date":"2026-09-02","startTime":"18:00","endTime":"19:30"} | {"type":"todo_add","text":"...","due":"2026-09-05"} | {"type":"todo_done","match":"..."} | {"type":"meal_revise","detail":"..."}]}. "actions" may be empty.`;

const actionSchema = z.union([
  z.object({ type: z.literal("counter"), activityKey: z.string(), delta: z.number() }),
  z.object({ type: z.literal("weight"), value: z.number().positive() }),
  z.object({ type: z.literal("meal"), description: z.string().min(1) }),
  z.object({ type: z.literal("workout"), description: z.string().min(1) }),
  z.object({
    type: z.literal("calendar"),
    title: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  }),
  z.object({
    type: z.literal("todo_add"),
    text: z.string().min(1),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  }),
  z.object({ type: z.literal("todo_done"), match: z.string().min(1) }),
  z.object({ type: z.literal("meal_revise"), detail: z.string().min(1) }),
]);
const routerSchema = z.object({
  reply: z.string().min(1),
  actions: z.array(actionSchema).max(6).catch([]),
});

type Action = z.infer<typeof actionSchema>;

function earlierMeals(date: string): { name: string; calories: number }[] {
  return db
    .select()
    .from(schema.meals)
    .where(eq(schema.meals.date, date))
    .all()
    .map((m) => ({ name: m.name, calories: m.calories }));
}

async function runAction(a: Action): Promise<string> {
  const date = localDate();
  if (a.type === "counter" || a.type === "weight") {
    const key = a.type === "weight" ? "bodyweight" : a.activityKey;
    const activity = db.select().from(schema.activities).where(eq(schema.activities.key, key)).get();
    if (!activity) return `(unknown activity ${key})`;
    const delta = a.type === "weight" ? a.value : a.delta;
    const isCounter = activity.kind === "counter";
    db.insert(schema.entries)
      .values({ activityId: activity.id, date, value: Math.max(0, delta) })
      .onConflictDoUpdate({
        target: [schema.entries.activityId, schema.entries.date],
        set: isCounter
          ? { value: sql`MAX(0, ${schema.entries.value} + ${delta})`, updatedAt: sql`(datetime('now'))` }
          : { value: delta, updatedAt: sql`(datetime('now'))` },
      })
      .run();
    const row = db
      .select()
      .from(schema.entries)
      .where(sql`${schema.entries.activityId} = ${activity.id} AND ${schema.entries.date} = ${date}`)
      .get();
    return `✓ ${activity.label}: ${row?.value ?? 0}${activity.dailyTarget ? `/${activity.dailyTarget}` : ""}`;
  }
  if (a.type === "todo_add") {
    db.insert(schema.todos).values({ text: a.text, due: a.due ?? null }).run();
    return `✓ On the list: ${a.text}${a.due ? ` (by ${a.due})` : ""}`;
  }
  if (a.type === "todo_done") {
    const open = db.select().from(schema.todos).where(eq(schema.todos.done, 0)).all();
    const needle = a.match.toLowerCase();
    const hit =
      open.find((t) => t.text.toLowerCase() === needle) ??
      open.find((t) => t.text.toLowerCase().includes(needle) || needle.includes(t.text.toLowerCase()));
    if (!hit) return `(nothing open matching "${a.match}")`;
    db.update(schema.todos)
      .set({ done: 1, completedAt: new Date().toISOString() })
      .where(eq(schema.todos.id, hit.id))
      .run();
    return `✓ Done: ${hit.text}`;
  }
  if (a.type === "calendar") {
    if (!googleConnected()) return "(calendar not connected — hit Connect in Settings first)";
    const ok = await createEvent({
      title: a.title,
      date: a.date,
      startTime: a.startTime ?? null,
      endTime: a.endTime ?? null,
    });
    return ok
      ? `✓ Calendar: ${a.title} on ${a.date}${a.startTime ? ` at ${a.startTime}` : ""}`
      : "(calendar write failed)";
  }
  if (a.type === "meal") {
    const est = await estimateMeal({ description: a.description, earlierMealsToday: earlierMeals(date) });
    db.insert(schema.meals)
      .values({
        date,
        name: est.name,
        description: a.description,
        calories: est.calories,
        protein: est.protein,
        method: "text",
        model: foodModel(),
        itemsJson: est.items.length ? JSON.stringify(est.items) : null,
      })
      .run();
    return `✓ ${est.name} ~${Math.round(est.calories)} cal${est.question ? `\n${est.question}` : ""}`;
  }
  if (a.type === "meal_revise") {
    const last = db
      .select()
      .from(schema.meals)
      .where(eq(schema.meals.date, date))
      .orderBy(desc(schema.meals.id))
      .limit(1)
      .get();
    if (!last) return "(no meal today to revise)";
    const est = await estimateMeal({
      description: `${last.description ?? last.name}. Additional detail: ${a.detail}`,
      earlierMealsToday: earlierMeals(date).filter((m) => m.name !== last.name),
    });
    db.update(schema.meals)
      .set({
        name: est.name,
        calories: est.calories,
        protein: est.protein,
        itemsJson: est.items.length ? JSON.stringify(est.items) : null,
      })
      .where(eq(schema.meals.id, last.id))
      .run();
    return `✓ Revised: ${est.name} ~${Math.round(est.calories)} cal`;
  }
  const res = await parseWorkouts({ description: a.description });
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
        rawJson: JSON.stringify({ summary: w.summary, description: a.description, model: workoutModel() }),
      })
      .run();
  }
  return res.workouts.length ? `✓ ${res.workouts.map((w) => w.summary).join(", ")}` : "(no workout found)";
}

const classifySchema = z.object({ kind: z.enum(["meal", "workout", "unclear"]).catch("unclear") });

// Route the photo by looking at it, not just the caption — food photos,
// watch/app workout screenshots, and everything else go different ways.
async function classifyPhoto(photo: { base64: string; mediaType: string }, caption: string): Promise<"meal" | "workout" | "unclear"> {
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
    console.error("[telegram] photo classify failed:", e);
    return "unclear";
  }
}

async function handlePhoto(fileId: string, caption: string): Promise<string> {
  const photo = await fetchTelegramPhoto(fileId);
  if (!photo) return "Couldn't download that photo — try again.";
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

export async function POST(req: NextRequest) {
  if (!telegramConfigured()) return NextResponse.json({ ok: true });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as {
    message?: {
      chat?: { id?: number };
      text?: string;
      caption?: string;
      photo?: { file_id: string }[];
    };
  } | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  // Always 200 so Telegram doesn't retry-storm.
  if (!msg || !chatId) return NextResponse.json({ ok: true });

  try {
    const owner = ownerChatId();
    if (!owner) {
      // Claim flow: first chat to present the PIN becomes the owner.
      if (msg.text && pinMatches(msg.text.trim())) {
        setOwnerChatId(chatId);
        await sendTelegram(chatId, "Connected. Log meals, workouts, and reps here, or ask for today's plan.");
      } else {
        await sendTelegram(chatId, "Send the PIN to claim this bot.");
      }
      return NextResponse.json({ ok: true });
    }
    if (chatId !== owner) return NextResponse.json({ ok: true }); // strangers: silence

    if (msg.photo?.length) {
      const reply = await handlePhoto(msg.photo[msg.photo.length - 1].file_id, msg.caption ?? "");
      await sendTelegram(chatId, reply);
      return NextResponse.json({ ok: true });
    }

    if (!msg.text) return NextResponse.json({ ok: true });

    const status = getTodayStatus();
    const energy = getDayEnergy(status.date);
    const metrics = getDayMetrics(status.date);
    const openTodos = db
      .select()
      .from(schema.todos)
      .where(eq(schema.todos.done, 0))
      .all()
      .map((t) => ({ text: t.text, due: t.due ?? undefined }));
    const routed = routerSchema.parse(
      await askClaudeJson({
        model: coachModel(),
        system: ROUTER_SYSTEM,
        content: JSON.stringify({
          athlete: athleteProfile(),
          today: status,
          energy,
          appleHealth: metrics
            ? {
                steps: metrics.steps != null ? Math.round(metrics.steps) : undefined,
                exerciseMin: metrics.exerciseMin != null ? Math.round(metrics.exerciseMin) : undefined,
                sleepHoursLastNight: metrics.sleepHours ?? undefined,
                restingHr: metrics.restingHr != null ? Math.round(metrics.restingHr) : undefined,
                vo2Max: metrics.vo2Max ?? undefined,
              }
            : undefined,
          openTodos,
          message: msg.text,
        }),
      }),
    );
    const results: string[] = [];
    for (const a of routed.actions) {
      results.push(await runAction(a).catch((e) => `(failed: ${String(e).slice(0, 60)})`));
    }
    const reply = results.length ? `${routed.reply}\n${results.join("\n")}` : routed.reply;
    await sendTelegram(chatId, reply);
  } catch (e) {
    console.error("[telegram] handler failed:", e);
    await sendTelegram(chatId, "Something broke on my end — try that again.").catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

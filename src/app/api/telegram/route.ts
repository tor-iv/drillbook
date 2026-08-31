import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { askClaudeJson } from "@/lib/claude";
import { athleteProfile, COACH_PERSONA, coachModel } from "@/lib/coach";
import { localDate } from "@/lib/dates";
import { getDayEnergy } from "@/lib/energy";
import { estimateMeal, foodModel } from "@/lib/foodai";
import { pinMatches } from "@/lib/auth";
import { getTodayStatus } from "@/lib/status";
import { fetchTelegramPhoto, ownerChatId, sendTelegram, setOwnerChatId, telegramConfigured } from "@/lib/telegram";
import { parseWorkouts, workoutModel } from "@/lib/workoutai";

// Telegram webhook: the conversational coach. Verified by the secret token
// Telegram echoes back on every webhook call; scoped to the single claimed
// owner chat.

const ROUTER_SYSTEM = `${COACH_PERSONA} You're chatting with your athlete on Telegram. You know his profile and today's live numbers (provided as JSON). Default reply: 1-3 sentences. Go longer only when he asks for a plan or a breakdown.

If his message asks to LOG something, include it in "actions" (and confirm naturally in the reply): counters (pullups/pushups/squats/abs/pages use activityKey with a positive or negative delta), weight in lb, meals (pass his food description through verbatim), workouts (pass his description verbatim). Multiple actions allowed. Questions about progress, training, food, or anything else: just answer from the data — never invent numbers.

Be concrete: when he asks what to do or eat, give exact workouts (sets/reps/distances) or example meals with real foods and rough calorie/protein numbers — never vague advice or motivational filler.

Return ONLY JSON: {"reply": "<message>", "actions": [{"type":"counter","activityKey":"pushups","delta":20} | {"type":"weight","value":199.5} | {"type":"meal","description":"..."} | {"type":"workout","description":"..."}]}. "actions" may be empty.`;

const actionSchema = z.union([
  z.object({ type: z.literal("counter"), activityKey: z.string(), delta: z.number() }),
  z.object({ type: z.literal("weight"), value: z.number().positive() }),
  z.object({ type: z.literal("meal"), description: z.string().min(1) }),
  z.object({ type: z.literal("workout"), description: z.string().min(1) }),
]);
const routerSchema = z.object({
  reply: z.string().min(1),
  actions: z.array(actionSchema).max(6).catch([]),
});

type Action = z.infer<typeof actionSchema>;

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
  if (a.type === "meal") {
    const est = await estimateMeal({ description: a.description });
    db.insert(schema.meals)
      .values({
        date,
        name: est.name,
        description: a.description,
        calories: est.calories,
        protein: est.protein,
        method: "text",
        model: foodModel(),
      })
      .run();
    return `✓ ${est.name} ~${Math.round(est.calories)} cal`;
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

async function handlePhoto(fileId: string, caption: string): Promise<string> {
  const photo = await fetchTelegramPhoto(fileId);
  if (!photo) return "Couldn't download that photo — try again.";
  const workoutish = /\b(run|ran|lift|lifted|climb|swim|swam|workout|gym|erg|mi|miles|min)\b/i.test(caption);
  const date = localDate();
  if (workoutish) {
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
    })
    .run();
  const total = Math.round(
    db.select().from(schema.meals).where(eq(schema.meals.date, date)).all().reduce((s, m) => s + m.calories, 0),
  );
  return `Logged ${est.name} — about ${Math.round(est.calories)} cal${est.protein ? `, ${Math.round(est.protein)}g protein` : ""}. ${total} cal today.${est.confidence === "low" ? " (rough guess — a few words next time tightens it)" : ""}`;
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
        await sendTelegram(chatId, "About time, kid. Tally's open — log your meals, workouts, and reps right here, or just tell me what's going on.");
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
    const routed = routerSchema.parse(
      await askClaudeJson({
        model: coachModel(),
        system: ROUTER_SYSTEM,
        content: JSON.stringify({
          athlete: athleteProfile(),
          today: status,
          energy,
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

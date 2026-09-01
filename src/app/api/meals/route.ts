import { and, desc, eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";
import { localDate } from "@/lib/dates";
import { estimateMeal, foodAiConfigured, foodModel } from "@/lib/foodai";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/photos";
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") ?? localDate();
  const rows = db
    .select()
    .from(schema.meals)
    .where(eq(schema.meals.date, date))
    .orderBy(desc(schema.meals.id))
    .all();
  const totals = {
    calories: Math.round(rows.reduce((s, m) => s + m.calories, 0)),
    protein: Math.round(rows.reduce((s, m) => s + (m.protein ?? 0), 0)),
  };
  return NextResponse.json({ date, meals: rows, totals });
}

// multipart form: optional `photo` file, optional `description` text (at least
// one required), optional `date`.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // JSON body {cloneId} re-logs a past meal verbatim — exact repeat, no AI
  // (so this branch stays above the AI-configured gate).
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { cloneId?: number } | null;
    const cloneId = Number(body?.cloneId);
    if (!Number.isInteger(cloneId)) return NextResponse.json({ error: "cloneId required" }, { status: 400 });
    const src = db.select().from(schema.meals).where(eq(schema.meals.id, cloneId)).get();
    if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
    const row = db
      .insert(schema.meals)
      .values({
        date: localDate(),
        name: src.name,
        description: src.description,
        calories: src.calories,
        protein: src.protein,
        method: "text",
        model: "clone",
        itemsJson: src.itemsJson,
      })
      .returning()
      .get();
    return NextResponse.json({ ok: true, meal: row, confidence: "high", question: null });
  }

  if (!foodAiConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form required" }, { status: 400 });
  const photo = form.get("photo");
  const description = ((form.get("description") as string | null) ?? "").slice(0, 500);
  const date = (form.get("date") as string | null) ?? localDate();
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (!hasPhoto && !description.trim()) {
    return NextResponse.json({ error: "need a photo or a description" }, { status: 400 });
  }
  if (hasPhoto && photo.size > MAX_BYTES) {
    return NextResponse.json({ error: "photo too large (15MB max)" }, { status: 413 });
  }

  let imageBase64: string | undefined;
  let imageMediaType: string | undefined;
  let photoBuf: Buffer | undefined;
  if (hasPhoto) {
    photoBuf = Buffer.from(await photo.arrayBuffer());
    imageBase64 = photoBuf.toString("base64");
    imageMediaType = photo.type;
  }

  const earlier = db
    .select()
    .from(schema.meals)
    .where(eq(schema.meals.date, date))
    .all()
    .map((m) => ({ name: m.name, calories: m.calories }));

  let estimate;
  try {
    estimate = await estimateMeal({ description, imageBase64, imageMediaType, earlierMealsToday: earlier });
  } catch (e) {
    console.error("[meals] estimate failed:", e);
    return NextResponse.json({ error: "couldn't estimate that — try adding a short description" }, { status: 502 });
  }

  // Persist the photo only after a successful estimate — no orphan files.
  let photoPath: string | null = null;
  if (hasPhoto && photoBuf) {
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    photoPath = `meals/${date}-${nanoid(8)}.${ext}`;
    mkdirSync(join(UPLOAD_DIR, "meals"), { recursive: true });
    await writeFile(join(UPLOAD_DIR, photoPath), photoBuf);
  }

  const row = db
    .insert(schema.meals)
    .values({
      date,
      name: estimate.name,
      description: description.trim() || null,
      calories: estimate.calories,
      protein: estimate.protein,
      method: hasPhoto ? "photo" : "text",
      photoPath,
      model: foodModel(),
      itemsJson: estimate.items.length ? JSON.stringify(estimate.items) : null,
    })
    .returning()
    .get();

  // confidence/question are advisory UI feedback for this one response, not stored.
  return NextResponse.json({ ok: true, meal: row, confidence: estimate.confidence, question: estimate.question });
}

// Revise an existing meal: either with extra detail (AI re-estimate — the
// follow-up-question flow) or with per-item gram corrections (pure linear
// rescale, no AI — the portion-editing flow).
export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: number; detail?: string; grams?: number[] } | null;
  const id = Number(body?.id);
  const detail = (body?.detail ?? "").trim().slice(0, 300);
  if (!Number.isInteger(id) || (!detail && !Array.isArray(body?.grams))) {
    return NextResponse.json({ error: "id plus detail or grams required" }, { status: 400 });
  }
  const meal = db.select().from(schema.meals).where(eq(schema.meals.id, id)).get();
  if (!meal) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (Array.isArray(body?.grams)) {
    const items = JSON.parse(meal.itemsJson ?? "[]") as { food: string; grams: number; kcal: number; protein: number | null }[];
    if (items.length === 0 || body.grams.length !== items.length) {
      return NextResponse.json({ error: "grams length must match items" }, { status: 400 });
    }
    const scaled = items.map((it, i) => {
      const g = Number(body.grams![i]);
      if (!Number.isFinite(g) || g <= 0 || it.grams <= 0) return it;
      const f = g / it.grams;
      return { ...it, grams: g, kcal: it.kcal * f, protein: it.protein != null ? it.protein * f : null };
    });
    const row = db
      .update(schema.meals)
      .set({
        calories: Math.round(scaled.reduce((s, i) => s + i.kcal, 0)),
        protein: Math.round(scaled.reduce((s, i) => s + (i.protein ?? 0), 0)) || meal.protein,
        itemsJson: JSON.stringify(scaled),
      })
      .where(eq(schema.meals.id, id))
      .returning()
      .get();
    return NextResponse.json({ ok: true, meal: row });
  }

  const earlier = db
    .select()
    .from(schema.meals)
    .where(and(eq(schema.meals.date, meal.date)))
    .all()
    .filter((m) => m.id !== id)
    .map((m) => ({ name: m.name, calories: m.calories }));
  let estimate;
  try {
    estimate = await estimateMeal({
      description: `${meal.description ?? meal.name}. Additional detail: ${detail}`,
      earlierMealsToday: earlier,
    });
  } catch (e) {
    console.error("[meals] revise failed:", e);
    return NextResponse.json({ error: "couldn't revise — try again" }, { status: 502 });
  }
  const row = db
    .update(schema.meals)
    .set({
      name: estimate.name,
      calories: estimate.calories,
      protein: estimate.protein,
      itemsJson: estimate.items.length ? JSON.stringify(estimate.items) : null,
    })
    .where(eq(schema.meals.id, id))
    .returning()
    .get();
  return NextResponse.json({ ok: true, meal: row });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  db.delete(schema.meals).where(and(eq(schema.meals.id, id))).run();
  return NextResponse.json({ ok: true });
}

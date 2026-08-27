import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";
import { localDate } from "@/lib/dates";
import { parseWorkouts, workoutAiConfigured, workoutModel } from "@/lib/workoutai";

const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") ?? localDate();
  const rows = db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.date, date))
    .orderBy(desc(schema.workouts.id))
    .all();
  return NextResponse.json({ date, workouts: rows });
}

// multipart form: optional `photo` (screenshot), optional `description` —
// at least one required. AI parses into 0..n structured workouts.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!workoutAiConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form required" }, { status: 400 });
  const photo = form.get("photo");
  const description = ((form.get("description") as string | null) ?? "").slice(0, 500);
  const date = (form.get("date") as string | null) ?? localDate();
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (!hasPhoto && !description.trim()) {
    return NextResponse.json({ error: "need a screenshot or a description" }, { status: 400 });
  }
  if (hasPhoto && photo.size > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (15MB max)" }, { status: 413 });
  }

  let parsed;
  try {
    parsed = await parseWorkouts({
      description,
      imageBase64: hasPhoto ? Buffer.from(await photo.arrayBuffer()).toString("base64") : undefined,
      imageMediaType: hasPhoto ? photo.type : undefined,
    });
  } catch (e) {
    console.error("[workouts] parse failed:", e);
    return NextResponse.json({ error: "couldn't read that — try a few words of description" }, { status: 502 });
  }
  if (parsed.workouts.length === 0) {
    return NextResponse.json({ error: "no workout found in that — describe it in a few words" }, { status: 422 });
  }

  const now = Date.now();
  const inserted = parsed.workouts.map((w, i) => {
    // Synthetic startedAt (ms offset keeps UNIQUE(started_at, type) happy for
    // multiple workouts in one submission).
    const startedAt = new Date(now + i).toISOString();
    return db
      .insert(schema.workouts)
      .values({
        date,
        type: w.type,
        durationMin: w.durationMin,
        distanceMi: w.distanceMi,
        calories: w.calories,
        startedAt,
        source: "manual",
        rawJson: JSON.stringify({ summary: w.summary, description: description.trim() || undefined, model: workoutModel() }),
      })
      .returning()
      .get();
  });

  return NextResponse.json({ ok: true, workouts: inserted });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  db.delete(schema.workouts).where(eq(schema.workouts.id, id)).run();
  return NextResponse.json({ ok: true });
}

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";
import { localDate } from "@/lib/dates";

const postSchema = z
  .object({
    activityKey: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    delta: z.number().finite().optional(), // counters: increment
    value: z.number().finite().optional(), // measures (or counter overwrite)
  })
  .refine((b) => (b.delta == null) !== (b.value == null), {
    message: "Provide exactly one of delta or value",
  });

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { activityKey, delta, value } = parsed.data;
  const date = parsed.data.date ?? localDate();

  const activity = db.select().from(schema.activities).where(eq(schema.activities.key, activityKey)).get();
  if (!activity) return NextResponse.json({ error: "unknown activity" }, { status: 404 });

  if (delta != null) {
    // Upsert-increment: today's row accumulates through the day. excluded.value
    // carries the delta; clamp at zero so mis-taps can be backed out with a
    // negative delta but can't go negative.
    db.insert(schema.entries)
      .values({ activityId: activity.id, date, value: Math.max(0, delta) })
      .onConflictDoUpdate({
        target: [schema.entries.activityId, schema.entries.date],
        set: {
          value: sql`MAX(0, ${schema.entries.value} + ${delta})`,
          updatedAt: sql`(datetime('now'))`,
        },
      })
      .run();
  } else {
    db.insert(schema.entries)
      .values({ activityId: activity.id, date, value: value! })
      .onConflictDoUpdate({
        target: [schema.entries.activityId, schema.entries.date],
        set: { value: value!, updatedAt: sql`(datetime('now'))` },
      })
      .run();
  }

  const row = db
    .select()
    .from(schema.entries)
    .where(and(eq(schema.entries.activityId, activity.id), eq(schema.entries.date, date)))
    .get();
  return NextResponse.json({ ok: true, date, activityKey, value: row?.value ?? 0 });
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const activityKey = params.get("activityKey");
  const to = params.get("to") ?? localDate();
  const from = params.get("from") ?? to.slice(0, 8) + "01";

  const query = db
    .select({
      date: schema.entries.date,
      value: schema.entries.value,
      activityKey: schema.activities.key,
    })
    .from(schema.entries)
    .innerJoin(schema.activities, eq(schema.entries.activityId, schema.activities.id))
    .where(
      and(
        gte(schema.entries.date, from),
        lte(schema.entries.date, to),
        ...(activityKey ? [eq(schema.activities.key, activityKey)] : []),
      ),
    )
    .orderBy(asc(schema.entries.date));

  return NextResponse.json({ from, to, entries: query.all() });
}

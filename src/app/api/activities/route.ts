import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = db.select().from(schema.activities).orderBy(asc(schema.activities.sortOrder)).all();
  return NextResponse.json({ activities: rows });
}

const patchSchema = z.object({
  key: z.string(),
  dailyTarget: z.number().positive().nullable().optional(),
  active: z.boolean().optional(),
  label: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { key, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const result = db.update(schema.activities).set(changes).where(eq(schema.activities.key, key)).run();
  if (result.changes === 0) return NextResponse.json({ error: "unknown activity" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

const postSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  kind: z.enum(["counter", "measure"]),
  unit: z.string().min(1),
  dailyTarget: z.number().positive().nullable(),
});

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const maxSort = db.select().from(schema.activities).all().reduce((m, a) => Math.max(m, a.sortOrder), 0);
  try {
    db.insert(schema.activities)
      .values({ ...parsed.data, sortOrder: maxSort + 1 })
      .run();
  } catch {
    return NextResponse.json({ error: "key already exists" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

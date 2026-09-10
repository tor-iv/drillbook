import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { remember } from "@/lib/agent/memories";
import { MEMORY_CATEGORIES } from "@/lib/agent/memory-types";
import { authorized } from "@/lib/auth";

const category = z.enum(MEMORY_CATEGORIES);

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ memories: db.select().from(schema.memories).orderBy(schema.memories.id).all() });
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ category, content: z.string().trim().min(1).max(300) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "category and content required" }, { status: 400 });
  return NextResponse.json({ memory: remember(parsed.data.category, parsed.data.content, "manual") });
}

export async function PATCH(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z
    .object({
      id: z.number().int().positive(),
      content: z.string().trim().min(1).max(300).optional(),
      category: category.optional(),
      archived: z.boolean().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { id, ...fields } = parsed.data;
  const memory = db
    .update(schema.memories)
    .set({ ...fields, updatedAt: sql`(datetime('now'))` })
    .where(eq(schema.memories.id, id))
    .returning()
    .get();
  if (!memory) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ memory });
}

// Hard delete — the deliberate UI action. The chat's `forget` only archives.
export async function DELETE(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  db.delete(schema.memories).where(eq(schema.memories.id, id)).run();
  return NextResponse.json({ ok: true });
}

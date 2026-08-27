import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";

const ALLOWED_KEYS = new Set(["sms_opt_in"]);

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = db.select().from(schema.settings).all();
  return NextResponse.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

const patchSchema = z.object({ key: z.string(), value: z.string().max(200) });

export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !ALLOWED_KEYS.has(parsed.data.key)) {
    return NextResponse.json({ error: "invalid setting" }, { status: 400 });
  }
  db.insert(schema.settings)
    .values({ key: parsed.data.key, value: parsed.data.value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: parsed.data.value, updatedAt: sql`(datetime('now'))` },
    })
    .run();
  return NextResponse.json({ ok: true });
}

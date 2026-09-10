import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { authorized } from "@/lib/auth";

// The Coach tab: newest daily nudge and newest weekly plan.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const latest = (kind: "daily" | "weekly") => {
    const row = db.select().from(schema.aiNudges).where(eq(schema.aiNudges.kind, kind)).orderBy(desc(schema.aiNudges.id)).get();
    return row ? { date: row.date, content: row.content, createdAt: row.createdAt } : null;
  };
  return NextResponse.json({ daily: latest("daily"), weekly: latest("weekly") });
}

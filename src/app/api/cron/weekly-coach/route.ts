import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { runWeeklyCoach } from "@/lib/cron/weekly-coach";

export async function POST(req: NextRequest) {
  const secretOk =
    !!process.env.CRON_SECRET && req.nextUrl.searchParams.get("secret") === process.env.CRON_SECRET;
  if (!secretOk && !(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWeeklyCoach(true);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

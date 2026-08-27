import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { runDailyNudge } from "@/lib/cron/daily-nudge";

// Manual trigger for testing — same function the scheduler calls.
export async function POST(req: NextRequest) {
  const secretOk =
    !!process.env.CRON_SECRET && req.nextUrl.searchParams.get("secret") === process.env.CRON_SECRET;
  if (!secretOk && !(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const slotParam = req.nextUrl.searchParams.get("slot");
    const slot = slotParam === "morning" || slotParam === "midday" ? slotParam : "evening";
    const result = await runDailyNudge(true, slot);
    return NextResponse.json({ ok: true, slot, result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

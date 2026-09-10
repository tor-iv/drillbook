import { NextRequest, NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { getTodayStatus } from "@/lib/status";

// Consumed by the "Drillbook Status" iOS Shortcut → native notification.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = getTodayStatus();
  return NextResponse.json(status);
}

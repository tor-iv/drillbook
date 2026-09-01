import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { exchangeCode } from "@/lib/google";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  // Behind Caddy, req.nextUrl's host is the container id — redirect via the
  // public APP_URL instead.
  const dest = new URL("/settings", process.env.APP_URL ?? req.nextUrl.origin);

  if (!code) {
    dest.searchParams.set("google", "denied");
    return NextResponse.redirect(dest);
  }
  try {
    await exchangeCode(code);
    dest.searchParams.set("google", "connected");
  } catch (e) {
    console.error("[google] callback:", e);
    dest.searchParams.set("google", "error");
  }
  return NextResponse.redirect(dest);
}

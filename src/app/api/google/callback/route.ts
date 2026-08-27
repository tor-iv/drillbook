import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { exchangeCode } from "@/lib/google";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  const dest = req.nextUrl.clone();
  dest.search = "";
  dest.pathname = "/settings";

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

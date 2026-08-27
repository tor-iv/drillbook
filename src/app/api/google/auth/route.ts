import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { consentUrl, googleConfigured } from "@/lib/google";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!googleConfigured()) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID/SECRET not configured" }, { status: 500 });
  }
  return NextResponse.redirect(consentUrl());
}

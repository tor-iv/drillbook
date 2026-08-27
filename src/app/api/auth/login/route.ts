import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, pinMatches, sessionCookieOptions } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/constants";

const bodySchema = z.object({ pin: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }
  if (!pinMatches(parsed.data.pin)) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await createSessionToken(), sessionCookieOptions());
  return res;
}

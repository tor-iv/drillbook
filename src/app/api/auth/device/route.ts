import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorized, listDeviceTokens, mintDeviceToken, pinMatches, revokeDeviceToken } from "@/lib/auth";

// Native clients trade the PIN for a durable bearer token once, then never
// see the PIN again. Listing/revoking needs an existing session.

export async function POST(req: NextRequest) {
  const parsed = z.object({ pin: z.string().min(1), name: z.string().min(1).max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "pin and name required" }, { status: 400 });
  if (!pinMatches(parsed.data.pin)) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  return NextResponse.json(mintDeviceToken(parsed.data.name));
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ devices: listDeviceTokens() });
}

export async function DELETE(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: revokeDeviceToken(id) });
}

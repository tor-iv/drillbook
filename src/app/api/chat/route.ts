import { NextRequest, NextResponse } from "next/server";
import { handlePhotoBytes } from "@/lib/agent/photo";
import { findByClientMsgId, listRecent, parseJson, persistTurn, toWire } from "@/lib/agent/history";
import { routeMessage } from "@/lib/agent/route-message";
import { authorized } from "@/lib/auth";
import { claudeConfigured } from "@/lib/claude";

const MAX_BYTES = 15 * 1024 * 1024;


export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const before = Number(req.nextUrl.searchParams.get("before")) || undefined;
  return NextResponse.json({ messages: listRecent(before).map(toWire) });
}

// multipart form: `text` and/or `photo`, plus `clientMsgId` (client-generated)
// so a retried send never runs the model — or its actions — twice.
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!claudeConfigured()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad form" }, { status: 400 });
  const text = String(form.get("text") ?? "").trim();
  const photo = form.get("photo");
  const clientMsgId = String(form.get("clientMsgId") ?? "").trim();
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (!text && !hasPhoto) return NextResponse.json({ error: "say something" }, { status: 400 });
  if (!clientMsgId) return NextResponse.json({ error: "clientMsgId required" }, { status: 400 });

  const already = findByClientMsgId(clientMsgId);
  if (already) return NextResponse.json({ reply: already.content, results: parseJson<string[]>(already.resultsJson, []) });

  try {
    if (hasPhoto) {
      if (photo.size > MAX_BYTES) return NextResponse.json({ error: "photo too large" }, { status: 413 });
      const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
      const reply = await handlePhotoBytes({ base64, mediaType: photo.type || "image/jpeg" }, text);
      persistTurn({ channel: "web", userContent: `[photo] ${text}`.trim(), reply, actions: [], results: [], clientMsgId });
      return NextResponse.json({ reply, results: [] });
    }
    const routed = await routeMessage(text, { channel: "web", clientMsgId });
    return NextResponse.json({ reply: routed.reply, results: routed.results });
  } catch (e) {
    console.error("[chat] failed:", e);
    return NextResponse.json({ error: "Something broke on my end — try that again." }, { status: 500 });
  }
}

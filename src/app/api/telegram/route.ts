import { NextRequest, NextResponse } from "next/server";
import { handlePhotoBytes } from "@/lib/agent/photo";
import { routeMessage } from "@/lib/agent/route-message";
import { pinMatches } from "@/lib/auth";
import { fetchTelegramPhoto, ownerChatId, sendTelegram, setOwnerChatId, telegramConfigured } from "@/lib/telegram";

// Telegram webhook: one channel into the shared agent (src/lib/agent). This
// file only does Telegram things — secret check, owner claim, photo download,
// send — and delegates every decision to routeMessage / handlePhotoBytes.

export async function POST(req: NextRequest) {
  if (!telegramConfigured()) return NextResponse.json({ ok: true });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as {
    message?: {
      chat?: { id?: number };
      text?: string;
      caption?: string;
      photo?: { file_id: string }[];
    };
  } | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  // Always 200 so Telegram doesn't retry-storm.
  if (!msg || !chatId) return NextResponse.json({ ok: true });

  try {
    const owner = ownerChatId();
    if (!owner) {
      // Claim flow: first chat to present the PIN becomes the owner.
      if (msg.text && pinMatches(msg.text.trim())) {
        setOwnerChatId(chatId);
        await sendTelegram(chatId, "Connected. Log meals, workouts, and reps here, or ask for today's plan.");
      } else {
        await sendTelegram(chatId, "Send the PIN to claim this bot.");
      }
      return NextResponse.json({ ok: true });
    }
    if (chatId !== owner) return NextResponse.json({ ok: true }); // strangers: silence

    if (msg.photo?.length) {
      const photo = await fetchTelegramPhoto(msg.photo[msg.photo.length - 1].file_id);
      const reply = photo
        ? await handlePhotoBytes(photo, msg.caption ?? "")
        : "Couldn't download that photo — try again.";
      await sendTelegram(chatId, reply);
      return NextResponse.json({ ok: true });
    }

    if (!msg.text) return NextResponse.json({ ok: true });

    const routed = await routeMessage(msg.text, { channel: "telegram" });
    await sendTelegram(chatId, routed.text);
  } catch (e) {
    console.error("[telegram] handler failed:", e);
    await sendTelegram(chatId, "Something broke on my end — try that again.").catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Telegram Bot API via plain fetch — free, unlimited, two-way. The owner
// claims the bot by texting it the app PIN; the chat id is then stored in
// settings and becomes the only chat the bot talks to.
const API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function ownerChatId(): string | null {
  return (
    db.select().from(schema.settings).where(eq(schema.settings.key, "telegram_chat_id")).get()?.value ?? null
  );
}

export function setOwnerChatId(chatId: string): void {
  db.insert(schema.settings)
    .values({ key: "telegram_chat_id", value: chatId })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: chatId, updatedAt: sql`(datetime('now'))` } })
    .run();
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
  });
  if (!res.ok) throw new Error(`telegram sendMessage ${res.status}: ${await res.text()}`);
}

/** Best-effort nudge to the owner (no-op until bot configured + claimed). */
export async function sendOwnerTelegram(text: string): Promise<void> {
  const chatId = ownerChatId();
  if (!telegramConfigured() || !chatId) {
    console.log("[telegram] not configured/claimed — skipping");
    return;
  }
  await sendTelegram(chatId, text);
}

/** Download a Telegram photo as base64 (largest size). */
export async function fetchTelegramPhoto(fileId: string): Promise<{ base64: string; mediaType: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const meta = (await (await fetch(`${API}/bot${token}/getFile?file_id=${fileId}`)).json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  const path = meta.result?.file_path;
  if (!meta.ok || !path) return null;
  const file = await fetch(`${API}/file/bot${token}/${path}`);
  if (!file.ok) return null;
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mediaType = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return { base64, mediaType };
}

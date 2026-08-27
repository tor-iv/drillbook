import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// SMS nudges via Twilio's REST API — a plain fetch keeps the dependency
// count at zero (same reasoning as the hand-rolled Google OAuth). Sending
// requires both env config AND the in-app consent toggle (Setup → SMS
// reminders), which doubles as the documented opt-in for carrier vetting.
export function smsOptedIn(): boolean {
  return (
    db.select().from(schema.settings).where(eq(schema.settings.key, "sms_opt_in")).get()?.value === "true"
  );
}

export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER) &&
    process.env.NUDGE_SMS_TO
  );
}

export async function sendNudgeSms(body: string): Promise<void> {
  if (!smsConfigured() || !smsOptedIn()) {
    console.log("[sms] not configured or not opted in — skipping");
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // Prefer the Messaging Service (it carries the A2P campaign registration);
    // bare From number is the fallback.
    body: new URLSearchParams({
      To: process.env.NUDGE_SMS_TO!,
      ...(process.env.TWILIO_MESSAGING_SERVICE_SID
        ? { MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
        : { From: process.env.TWILIO_FROM_NUMBER! }),
      Body: body.slice(0, 1500),
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string; code?: number } | null;
    throw new Error(`Twilio ${res.status}: ${detail?.code ?? ""} ${detail?.message ?? ""}`);
  }
}

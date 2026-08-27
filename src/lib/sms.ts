// SMS nudges via Twilio's REST API — a plain fetch keeps the dependency
// count at zero (same reasoning as the hand-rolled Google OAuth). Degrades
// silently until TWILIO_FROM_NUMBER exists (i.e. a number is bought and
// A2P-registered).
export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.NUDGE_SMS_TO
  );
}

export async function sendNudgeSms(body: string): Promise<void> {
  if (!smsConfigured()) {
    console.log("[sms] not configured — skipping");
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: process.env.NUDGE_SMS_TO!,
      From: process.env.TWILIO_FROM_NUMBER!,
      Body: body.slice(0, 1500),
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string; code?: number } | null;
    throw new Error(`Twilio ${res.status}: ${detail?.code ?? ""} ${detail?.message ?? ""}`);
  }
}

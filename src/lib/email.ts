import { Resend } from "resend";

export function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return !!key && key.trim() !== "" && !key.includes("placeholder");
}

export async function sendCoachEmail(subject: string, text: string): Promise<void> {
  if (!emailConfigured()) {
    console.warn("[email] RESEND_API_KEY not set — skipping send:", subject);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Drillbook <nudge@foefinder.me>",
    to: process.env.NUDGE_EMAIL_TO ?? "",
    subject,
    text,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

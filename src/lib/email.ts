import { Resend } from "resend";

export function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return !!key && key.trim() !== "" && !key.includes("placeholder");
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Tiny renderer for the coach's markdown-ish output (### headers, **bold**,
 * - bullets, "Goal call:" lines) into inline-styled HTML that email clients
 * respect. Falls back gracefully: unknown lines become paragraphs.
 */
function coachHtml(text: string): string {
  const lines = escapeHtml(text.trim()).split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim().replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (!line) {
      closeList();
      continue;
    }
    const header = line.match(/^#{1,4}\s+(.*)$/);
    if (header) {
      closeList();
      out.push(
        `<h3 style="margin:18px 0 6px;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:#d6482f;">${header[1]}</h3>`,
      );
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul style="margin:4px 0 10px;padding-left:20px;">');
        inList = true;
      }
      out.push(`<li style="margin:2px 0;">${line.replace(/^[-*]\s+/, "")}</li>`);
    } else if (/^goal call:/i.test(line)) {
      closeList();
      out.push(
        `<p style="margin:14px 0 0;padding:10px 12px;border:2px solid #16130d;background:#ffe24a;font-weight:600;">${line}</p>`,
      );
    } else {
      closeList();
      out.push(`<p style="margin:8px 0;">${line}</p>`);
    }
  }
  closeList();
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f4ec;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#16130d;">
    <div style="border-left:3px solid #d6482f;padding-left:14px;margin-bottom:14px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:.02em;">TALLY</div>
      <div style="font-size:12px;color:#8b8578;">from Coach</div>
    </div>
    <div style="border:2px solid #16130d;background:#fffdf7;padding:16px 18px;box-shadow:3px 3px 0 0 #16130d;">
      ${out.join("\n")}
    </div>
    <p style="font-size:11px;color:#8b8578;margin-top:14px;">
      <a href="https://tally.tors-bored.com" style="color:#8b8578;">tally.tors-bored.com</a>
    </p>
  </div></body></html>`;
}

export async function sendCoachEmail(subject: string, text: string): Promise<void> {
  if (!emailConfigured()) {
    console.warn("[email] RESEND_API_KEY not set — skipping send:", subject);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Tally <coach@foefinder.me>",
    to: process.env.NUDGE_EMAIL_TO ?? "",
    subject,
    text,
    html: coachHtml(text),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

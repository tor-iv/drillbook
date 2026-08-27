// Public page (excluded from the PIN wall) — required for A2P 10DLC campaign
// vetting, which verifies the SMS privacy language below.
export const metadata = { title: "Privacy Policy — Drillbook" };

export default function PrivacyPage() {
  return (
    <main className="prose-sm max-w-none">
      <h1 className="font-display text-4xl leading-none">Privacy Policy</h1>
      <p className="mt-1 text-sm text-pencil">Effective August 27, 2026</p>

      <div className="marker-box mt-4 flex flex-col gap-3 p-4 text-sm leading-relaxed">
        <p>
          Drillbook is a single-user personal fitness tracker operated by its sole user and owner. The only data it
          stores — workout logs, food logs, body weight, and progress photos — is entered by the account owner about
          himself and stored on a server he controls. There are no other users, no advertising, no analytics trackers,
          and no sale of data.
        </p>

        <h2 className="font-display text-2xl">SMS / Text Messaging Program</h2>
        <p>
          Coach Gus Reminders sends daily fitness reminder text messages. The sole recipient is the account owner, who
          opts in by enabling SMS reminders in his own account configuration. Message frequency: up to 3 messages per
          day. Message and data rates may apply. Reply <strong>STOP</strong> to unsubscribe at any time, or{" "}
          <strong>HELP</strong> for help. Carriers are not liable for delayed or undelivered messages.
        </p>
        <p>
          <strong>
            No mobile information will be shared with third parties or affiliates for marketing or promotional
            purposes. All the above categories exclude text messaging originator opt-in data and consent; this
            information will not be shared with any third parties.
          </strong>
        </p>

        <h2 className="font-display text-2xl">Data</h2>
        <p>
          Data is retained until the owner deletes it. Third-party processors used solely to operate the service:
          Anthropic (AI text/image analysis of logs the owner submits), Twilio (SMS delivery), Resend (email delivery),
          and Google (optional calendar events, at the owner&apos;s explicit authorization). None receive data for
          marketing purposes.
        </p>
        <p>
          Contact: <a className="underline" href="mailto:vcox484@gmail.com">vcox484@gmail.com</a>
        </p>
      </div>
    </main>
  );
}

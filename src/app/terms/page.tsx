// Public page (excluded from the PIN wall) — companion to /privacy for A2P
// campaign vetting.
export const metadata = { title: "Terms of Service — Tally" };

export default function TermsPage() {
  return (
    <main>
      <h1 className="font-display text-4xl leading-none">Terms of Service</h1>
      <p className="mt-1 text-sm text-pencil">Effective August 27, 2026</p>

      <div className="marker-box mt-4 flex flex-col gap-3 p-4 text-sm leading-relaxed">
        <p>
          Tally (drillbook.tors-bored.com) is a private, single-user personal fitness tracking application. Access is restricted to the
          account owner. The service is provided as-is, without warranty; fitness and nutrition figures are estimates,
          not medical advice.
        </p>

        <h2 className="font-display text-2xl">SMS Terms</h2>
        <p>
          By enabling SMS reminders (Tally Reminders), the account owner consents to receive up to 3 recurring
          automated fitness reminder text messages per day at the mobile number he provides. Consent is not a condition
          of any purchase; nothing is sold through this service. Message and data rates may apply. Message frequency
          may vary. Reply <strong>STOP</strong> to cancel at any time, <strong>HELP</strong> for help. Carriers are not
          liable for delayed or undelivered messages.
        </p>
        <p>
          Mobile information and messaging consent are not shared with third parties or affiliates for marketing or
          promotional purposes. See the <a className="underline" href="/privacy">Privacy Policy</a>.
        </p>

        <p>
          Contact: <a className="underline" href="mailto:vcox484@gmail.com">vcox484@gmail.com</a>
        </p>
      </div>
    </main>
  );
}

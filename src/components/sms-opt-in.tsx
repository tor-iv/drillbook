"use client";

import { useState } from "react";

export function SmsOptIn({ phone, initialOptedIn }: { phone: string; initialOptedIn: boolean }) {
  const [optedIn, setOptedIn] = useState(initialOptedIn);
  const [error, setError] = useState(false);

  async function toggle(next: boolean) {
    setOptedIn(next);
    setError(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sms_opt_in", value: next ? "true" : "false" }),
    }).catch(() => null);
    if (!res?.ok) {
      setOptedIn(!next);
      setError(true);
    }
  }

  return (
    <div className="marker-box p-4 text-sm">
      <h3 className="font-display text-lg leading-none">SMS reminders</h3>
      <label className="mt-2 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={optedIn}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-[#16130d]"
        />
        <span>
          I agree to receive up to 2 automated fitness reminder text messages per day from Drillbook at{" "}
          <strong>{phone}</strong>. Message and data rates may apply. Message frequency may vary. Reply{" "}
          <strong>STOP</strong> to opt out at any time, <strong>HELP</strong> for help. See the{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" className="underline">
            Terms
          </a>
          .
        </span>
      </label>
      <p className="mt-2 text-pencil">{optedIn ? "SMS reminders are ON." : "SMS reminders are OFF."}</p>
      {error && <p className="text-margin">Couldn&apos;t save — try again.</p>}
    </div>
  );
}

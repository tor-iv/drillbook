"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(res?.status === 401 ? "Wrong PIN" : "Couldn't sign in — try again");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[70dvh] flex-col justify-center">
      <h1 className="font-display text-6xl leading-none">Drillbook</h1>
      <p className="font-marker mt-2 text-pencil">Sign the sheet.</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          autoFocus
          className="font-marker marker-box w-full px-4 py-4 text-center text-4xl tracking-[0.5em] focus:outline-none"
          aria-label="PIN"
        />
        <button type="submit" disabled={busy} className="btn-ink px-4 py-4 text-2xl leading-none">
          {busy ? "checking…" : "Open the book"}
        </button>
        {error && <p className="text-center text-margin">{error}</p>}
      </form>
    </main>
  );
}

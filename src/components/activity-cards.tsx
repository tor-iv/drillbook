"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import type { ActivityStatus } from "@/lib/status";
import { Tally } from "./tally";

async function postEntry(body: Record<string, unknown>) {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("save failed");
  return res.json() as Promise<{ value: number }>;
}

export function CounterCard({ activity }: { activity: ActivityStatus }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic local count: taps register instantly; the server round-trip
  // reconciles in the background. Logging must feel like clicking a pen.
  const [count, setCount] = useState(activity.done ?? 0);
  const [error, setError] = useState(false);

  const met = activity.goal != null && count >= activity.goal;

  function add(delta: number) {
    setCount((c) => Math.max(0, c + delta));
    setError(false);
    postEntry({ activityKey: activity.key, delta })
      .then(({ value }) => {
        setCount(value);
        startTransition(() => router.refresh());
      })
      .catch(() => setError(true));
  }

  const steps = activity.unit === "pages" ? [1, 5, 10] : [1, 5, 10];

  return (
    <section className="marker-box p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-none">
          <span className={clsx(met && "highlighted")}>{activity.label}</span>
        </h2>
        <Tally count={activity.streak} />
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-display whitespace-nowrap text-6xl leading-none tabular-nums" aria-live="polite">
          {count}
          {activity.goal != null && (
            <span className="text-2xl text-pencil"> / {activity.goal}</span>
          )}
        </p>
        <div className="flex shrink-0 gap-1.5">
          {steps.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="btn-ink min-w-12 px-2 py-3 text-xl leading-none"
              aria-label={`add ${s} ${activity.unit} to ${activity.label}`}
            >
              +{s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button onClick={() => add(-1)} className="btn-paper px-2 py-1 text-sm" aria-label={`undo one ${activity.unit}`}>
          −1 oops
        </button>
        {error && <p className="text-sm text-margin">didn&apos;t save — tap again</p>}
        {met && !error && <p className="font-display text-sm text-margin">closed out</p>}
      </div>
    </section>
  );
}

export function MeasureCard({ activity, goalNote }: { activity: ActivityStatus; goalNote?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(activity.done != null ? String(activity.done) : "");
  const [saved, setSaved] = useState(activity.done != null);
  const [error, setError] = useState(false);

  function save() {
    const value = parseFloat(draft);
    if (!Number.isFinite(value) || value <= 0) return;
    setError(false);
    postEntry({ activityKey: activity.key, value })
      .then(() => {
        setSaved(true);
        startTransition(() => router.refresh());
      })
      .catch(() => setError(true));
  }

  return (
    <section className="marker-box p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-none">{activity.label}</h2>
        {goalNote ? <span className="font-marker text-sm text-margin">{goalNote}</span> : <Tally count={activity.streak} />}
      </div>
      <div className="mt-2 flex items-end gap-3">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          placeholder="—"
          className="font-display w-36 border-b-2 border-ink bg-transparent text-5xl leading-none tabular-nums focus:outline-none"
          aria-label={`${activity.label} in ${activity.unit}`}
        />
        <span className="text-pencil">{activity.unit}</span>
        <button onClick={save} className="btn-ink ml-auto px-4 py-3 text-xl leading-none">
          {saved ? "saved" : "log it"}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-margin">didn&apos;t save — try again</p>}
    </section>
  );
}

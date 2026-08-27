"use client";

import { useRef, useState } from "react";

type Workout = {
  id: number;
  type: string;
  durationMin: number | null;
  distanceMi: number | null;
  calories: number | null;
  source: string;
  rawJson: string | null;
};

function label(w: Workout): string {
  try {
    const summary = w.rawJson ? (JSON.parse(w.rawJson).summary as string | undefined) : undefined;
    if (summary) return summary;
  } catch {
    /* legacy rows: fall through to the built-up label */
  }
  const bits = [w.type];
  if (w.distanceMi) bits.push(`${w.distanceMi}mi`);
  if (w.durationMin) bits.push(`${Math.round(w.durationMin)}min`);
  return bits.join(" ");
}

export function WorkoutLog({ initialWorkouts }: { initialWorkouts: Workout[] }) {
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(photo?: File) {
    if (busy) return;
    if (!photo && !description.trim()) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    if (photo) form.set("photo", photo);
    if (description.trim()) form.set("description", description.trim());
    const res = await fetch("/api/workouts", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "Couldn't log that — try again");
      return;
    }
    const { workouts: added } = await res.json();
    setWorkouts((w) => [...added, ...w]);
    setDescription("");
  }

  async function remove(id: number) {
    setWorkouts((w) => w.filter((x) => x.id !== id));
    await fetch(`/api/workouts?id=${id}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <section className="marker-box p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl leading-none">Workouts</h2>
        <button onClick={() => setOpen(!open)} className="btn-paper px-3 py-1 text-sm" aria-expanded={open}>
          {open ? "close" : "+ add"}
        </button>
      </div>

      {workouts.length === 0 ? (
        <p className="mt-2 text-sm text-pencil">Nothing yet today — synced from your watch nightly, or add one here.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {workouts.map((w) => (
            <li key={w.id} className="flex items-center gap-2">
              <span className="font-display text-margin">{w.type}</span>
              <span className="flex-1">{label(w)}</span>
              {w.source === "manual" && (
                <button onClick={() => remove(w.id)} className="text-xs text-pencil" aria-label={`delete ${label(w)}`}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 border-t-2 border-ink/10 pt-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Say it or snap it — “5 mile run, 42 min” or a screenshot of your watch/app summary"
            className="w-full resize-none border-b-2 border-ink bg-transparent text-base focus:outline-none"
            aria-label="workout description"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => submit()}
              disabled={busy || !description.trim()}
              className="btn-ink flex-1 px-4 py-2 text-lg leading-none disabled:opacity-40"
            >
              {busy ? "reading…" : "log workout"}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-paper px-4 py-2 text-lg leading-none"
              aria-label="upload workout screenshot"
            >
              📷 screenshot
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) submit(f);
              e.target.value = "";
            }}
          />
          {error && <p className="mt-2 text-sm text-margin">{error}</p>}
        </div>
      )}
    </section>
  );
}

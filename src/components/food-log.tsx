"use client";

import { useRef, useState } from "react";

type Meal = { id: number; name: string; calories: number; protein: number | null; method: string };

export function FoodLog({ initialMeals }: { initialMeals: Meal[] }) {
  const [meals, setMeals] = useState(initialMeals);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalCal = Math.round(meals.reduce((s, m) => s + m.calories, 0));
  const totalProtein = Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0));

  async function submit(photo?: File) {
    if (busy) return;
    if (!photo && !description.trim()) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    if (photo) form.set("photo", photo);
    if (description.trim()) form.set("description", description.trim());
    const res = await fetch("/api/meals", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "Couldn't log that — try again");
      return;
    }
    const { meal } = await res.json();
    setMeals((m) => [meal, ...m]);
    setDescription("");
  }

  async function remove(id: number) {
    setMeals((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/meals?id=${id}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <div>
      <section className="marker-box mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-5xl leading-none tabular-nums">
            {totalCal}
            <span className="text-xl text-pencil"> cal today</span>
          </p>
          <p className="text-sm text-pencil">{totalProtein}g protein</p>
        </div>
      </section>

      <div className="marker-box mb-4 p-4">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Describe it — tap the mic on your keyboard to dictate. “chipotle chicken bowl, double rice”"
          className="w-full resize-none border-b-2 border-ink bg-transparent text-lg focus:outline-none"
          aria-label="meal description"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => submit()}
            disabled={busy || !description.trim()}
            className="btn-ink flex-1 px-4 py-3 text-xl leading-none disabled:opacity-40"
          >
            {busy ? "estimating…" : "log it"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn-paper px-4 py-3 text-xl leading-none"
            aria-label="photograph the meal"
          >
            📷 snap it
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) submit(f);
            e.target.value = "";
          }}
        />
        {error && <p className="mt-2 text-sm text-margin">{error}</p>}
      </div>

      {meals.length === 0 ? (
        <p className="text-sm text-pencil">Nothing logged today.</p>
      ) : (
        <ul className="marker-box divide-y-2 divide-ink/10 p-2">
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-2">
              <div className="flex-1">
                <p className="leading-tight">{m.name}</p>
                <p className="text-xs text-pencil">
                  {Math.round(m.calories)} cal{m.protein != null && ` · ${Math.round(m.protein)}g protein`}
                  {m.method === "photo" && " · 📷"}
                </p>
              </div>
              <button onClick={() => remove(m.id)} className="btn-paper px-2 py-1 text-xs" aria-label={`delete ${m.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

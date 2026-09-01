"use client";

import { useRef, useState } from "react";

type Meal = { id: number; name: string; calories: number; protein: number | null; method: string };

export function FoodLog({
  initialMeals,
  burned,
  deficitTarget,
}: {
  initialMeals: Meal[];
  burned: number | null;
  deficitTarget: number;
}) {
  const [meals, setMeals] = useState(initialMeals);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [followUp, setFollowUp] = useState<{ mealId: number; question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalCal = Math.round(meals.reduce((s, m) => s + m.calories, 0));
  const totalProtein = Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0));

  async function submit(photo?: File) {
    if (busy) return;
    if (!photo && !description.trim()) return;
    setBusy(true);
    setError("");
    setHint("");
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
    const { meal, confidence, question } = await res.json();
    setMeals((m) => [meal, ...m]);
    setDescription("");
    setFollowUp(null);
    setAnswer("");
    if (question) {
      setFollowUp({ mealId: meal.id, question });
    } else if (confidence === "low") {
      setHint(`Rough guess on "${meal.name}" — a few words (size, sauces, sides) tightens it.`);
    }
  }

  async function answerFollowUp() {
    if (!followUp || !answer.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/meals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: followUp.mealId, detail: answer.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't revise — try again");
      return;
    }
    const { meal } = await res.json();
    setMeals((m) => m.map((x) => (x.id === meal.id ? meal : x)));
    setFollowUp(null);
    setAnswer("");
    setHint(`Updated: ${meal.name}, ${Math.round(meal.calories)} cal.`);
  }

  async function remove(id: number) {
    setMeals((m) => m.filter((x) => x.id !== id));
    if (followUp?.mealId === id) setFollowUp(null);
    await fetch(`/api/meals?id=${id}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <div>
      <section className="marker-box mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-5xl leading-none tabular-nums">
            {totalCal}
            <span className="text-xl text-pencil"> in</span>
            {burned != null && <span className="text-xl text-pencil"> · ~{burned} out</span>}
          </p>
          <p className="text-sm text-pencil">{totalProtein}g protein</p>
        </div>
        {burned != null && meals.length > 0 && (
          <p className="mt-1 text-sm text-pencil">
            {totalCal - burned <= -deficitTarget ? (
              <span className="highlighted text-ink">on pace — {burned - totalCal} cal deficit (target {deficitTarget})</span>
            ) : totalCal - burned < 0 ? (
              `${burned - totalCal} cal deficit so far (target ${deficitTarget})`
            ) : (
              `${totalCal - burned} cal over burn so far`
            )}
          </p>
        )}
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
        {hint && <p className="mt-2 text-sm text-pencil">{hint}</p>}
        {followUp && (
          <div className="mt-3 border-t-2 border-ink/20 pt-3">
            <p className="text-sm">{followUp.question}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answerFollowUp()}
                placeholder="answer to tighten the estimate"
                className="flex-1 border-b-2 border-ink bg-transparent text-sm focus:outline-none"
                aria-label="answer the estimator's question"
              />
              <button
                onClick={answerFollowUp}
                disabled={busy || !answer.trim()}
                className="btn-paper px-3 py-1 text-sm disabled:opacity-40"
              >
                {busy ? "…" : "update"}
              </button>
            </div>
          </div>
        )}
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

"use client";

import { useEffect, useRef, useState } from "react";

type Item = { food: string; grams: number; kcal: number; protein: number | null; source?: string };
type Meal = {
  id: number;
  name: string;
  calories: number;
  protein: number | null;
  method: string;
  itemsJson: string | null;
};
type Usual = { id: number; name: string; calories: number };

function itemsOf(m: Meal): Item[] {
  try {
    return m.itemsJson ? (JSON.parse(m.itemsJson) as Item[]) : [];
  } catch {
    return [];
  }
}

export function FoodLog({
  initialMeals,
  usuals,
  burned,
  deficitTarget,
}: {
  initialMeals: Meal[];
  usuals: Usual[];
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
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [gramEdits, setGramEdits] = useState<Record<number, string[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const totalCal = Math.round(meals.reduce((s, m) => s + m.calories, 0));
  const totalProtein = Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0));

  function attachPhoto(f: File) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPendingPhoto(f);
    setPhotoUrl(URL.createObjectURL(f));
  }

  function clearPhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPendingPhoto(null);
    setPhotoUrl(null);
  }

  async function submit() {
    if (busy) return;
    if (!pendingPhoto && !description.trim()) return;
    setBusy(true);
    setError("");
    setHint("");
    const form = new FormData();
    if (pendingPhoto) form.set("photo", pendingPhoto);
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
    clearPhoto();
    setFollowUp(null);
    setAnswer("");
    if (question) {
      setFollowUp({ mealId: meal.id, question });
    } else if (confidence === "low") {
      setHint(`Rough guess on "${meal.name}" — a few words (size, sauces, sides) tightens it.`);
    }
  }

  async function relog(u: Usual) {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cloneId: u.id }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't re-log that");
      return;
    }
    const { meal } = await res.json();
    setMeals((m) => [meal, ...m]);
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

  async function saveGrams(meal: Meal) {
    const edits = gramEdits[meal.id];
    if (!edits || busy) return;
    const grams = edits.map((g) => Number(g));
    if (grams.some((g) => !Number.isFinite(g) || g <= 0)) {
      setError("Grams must be positive numbers");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/meals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: meal.id, grams }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't update portions");
      return;
    }
    const { meal: updated } = await res.json();
    setMeals((m) => m.map((x) => (x.id === updated.id ? updated : x)));
    setGramEdits((e) => ({ ...e, [meal.id]: undefined as unknown as string[] }));
    setExpandedId(null);
  }

  function toggleExpand(m: Meal) {
    if (expandedId === m.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.id);
    setGramEdits((e) => ({ ...e, [m.id]: itemsOf(m).map((i) => String(Math.round(i.grams))) }));
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
        {photoUrl && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="meal to log" className="h-16 w-16 border-2 border-ink object-cover" />
            <p className="flex-1 text-xs text-pencil">
              Photo attached — a few words (size, sides, sauces) sharpen the estimate. 45° angle works best for bowls.
            </p>
            <button onClick={clearPhoto} className="btn-paper px-2 py-1 text-xs" aria-label="remove photo">
              ✕
            </button>
          </div>
        )}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={
            pendingPhoto
              ? "describe it — “double chicken, extra rice, cooked in oil”"
              : "Describe it — tap the mic on your keyboard to dictate. “chipotle chicken bowl, double rice”"
          }
          className="w-full resize-none border-b-2 border-ink bg-transparent text-lg focus:outline-none"
          aria-label="meal description"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={submit}
            disabled={busy || (!description.trim() && !pendingPhoto)}
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
            {pendingPhoto ? "📷 retake" : "📷 snap it"}
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
            if (f) attachPhoto(f);
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

      {usuals.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-pencil">usuals — one tap re-logs it exactly</p>
          <div className="flex flex-wrap gap-2">
            {usuals.map((u) => (
              <button
                key={u.id}
                onClick={() => relog(u)}
                disabled={busy}
                className="btn-paper px-2 py-1 text-xs disabled:opacity-40"
              >
                {u.name} · {u.calories}
              </button>
            ))}
          </div>
        </div>
      )}

      {meals.length === 0 ? (
        <p className="text-sm text-pencil">Nothing logged today.</p>
      ) : (
        <ul className="marker-box divide-y-2 divide-ink/10 p-2">
          {meals.map((m) => {
            const items = itemsOf(m);
            const expanded = expandedId === m.id;
            return (
              <li key={m.id} className="p-2">
                <div className="flex items-center gap-3">
                  <button
                    className="flex-1 text-left"
                    onClick={() => items.length > 0 && toggleExpand(m)}
                    aria-expanded={expanded}
                  >
                    <p className="leading-tight">{m.name}</p>
                    <p className="text-xs text-pencil">
                      {Math.round(m.calories)} cal{m.protein != null && ` · ${Math.round(m.protein)}g protein`}
                      {m.method === "photo" && " · 📷"}
                      {items.length > 0 && (expanded ? " · ▾" : " · ▸ breakdown")}
                    </p>
                  </button>
                  <button onClick={() => remove(m.id)} className="btn-paper px-2 py-1 text-xs" aria-label={`delete ${m.name}`}>
                    ✕
                  </button>
                </div>
                {expanded && items.length > 0 && (
                  <div className="mt-2 border-t-2 border-ink/10 pt-2">
                    {items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-sm">
                        <span className="flex-1">{it.food}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={gramEdits[m.id]?.[i] ?? String(Math.round(it.grams))}
                          onChange={(e) =>
                            setGramEdits((ed) => {
                              const cur = [...(ed[m.id] ?? items.map((x) => String(Math.round(x.grams))))];
                              cur[i] = e.target.value;
                              return { ...ed, [m.id]: cur };
                            })
                          }
                          className="w-16 border-b-2 border-ink bg-transparent text-right tabular-nums focus:outline-none"
                          aria-label={`grams of ${it.food}`}
                        />
                        <span className="w-8 text-xs text-pencil">g</span>
                        <span className="w-14 text-right text-xs tabular-nums text-pencil">{Math.round(it.kcal)} cal</span>
                      </div>
                    ))}
                    <button
                      onClick={() => saveGrams(m)}
                      disabled={busy}
                      className="btn-paper mt-2 px-3 py-1 text-sm disabled:opacity-40"
                    >
                      {busy ? "…" : "update portions"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

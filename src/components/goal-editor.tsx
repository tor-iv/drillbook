"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Activity = {
  key: string;
  label: string;
  kind: "counter" | "measure";
  unit: string;
  dailyTarget: number | null;
  active: boolean;
};

export function GoalEditor({ activities }: { activities: Activity[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(activities.map((a) => [a.key, a.dailyTarget != null ? String(a.dailyTarget) : ""])),
  );
  const [status, setStatus] = useState<Record<string, "saved" | "error" | undefined>>({});

  async function patch(key: string, body: Record<string, unknown>) {
    const res = await fetch("/api/activities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...body }),
    }).catch(() => null);
    setStatus((s) => ({ ...s, [key]: res?.ok ? "saved" : "error" }));
    if (res?.ok) router.refresh();
  }

  function saveTarget(a: Activity) {
    const raw = drafts[a.key].trim();
    const value = raw === "" ? null : parseFloat(raw);
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      setStatus((s) => ({ ...s, [a.key]: "error" }));
      return;
    }
    patch(a.key, { dailyTarget: value });
  }

  return (
    <div className="marker-box divide-y-2 divide-ink/10 p-2">
      {activities.map((a) => (
        <div key={a.key} className="flex items-center gap-3 p-2">
          <label htmlFor={`goal-${a.key}`} className="font-display flex-1 text-lg leading-none">
            {a.label}
            {!a.active && <span className="ml-2 text-xs text-pencil">(off)</span>}
          </label>
          {a.kind === "counter" ? (
            <>
              <input
                id={`goal-${a.key}`}
                type="number"
                inputMode="numeric"
                value={drafts[a.key]}
                onChange={(e) => {
                  setDrafts((d) => ({ ...d, [a.key]: e.target.value }));
                  setStatus((s) => ({ ...s, [a.key]: undefined }));
                }}
                onBlur={() => saveTarget(a)}
                placeholder="none"
                className="font-marker w-20 border-b-2 border-ink bg-transparent text-right text-xl tabular-nums focus:outline-none"
              />
              <span className="w-12 text-xs text-pencil">{a.unit}/day</span>
            </>
          ) : (
            <span className="text-xs text-pencil">logged, not goaled</span>
          )}
          <button
            onClick={() => patch(a.key, { active: !a.active })}
            className="btn-paper px-2 py-1 text-xs"
            aria-label={`${a.active ? "hide" : "show"} ${a.label}`}
          >
            {a.active ? "hide" : "show"}
          </button>
          {status[a.key] === "saved" && <span className="text-xs text-pencil">✓</span>}
          {status[a.key] === "error" && <span className="text-xs text-margin">!</span>}
        </div>
      ))}
    </div>
  );
}

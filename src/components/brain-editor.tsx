"use client";

import { useState } from "react";
import { MEMORY_CATEGORIES, type MemoryCategory, type Memory as MemoryRow } from "@/lib/agent/memory-types";

export function BrainEditor({ initial }: { initial: MemoryRow[] }) {
  const [rows, setRows] = useState(initial);
  const [category, setCategory] = useState<MemoryCategory>("fact");
  const [content, setContent] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  async function call(method: string, body?: unknown, query = "") {
    setError("");
    const res = await fetch(`/api/memories${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (!res?.ok) {
      setError("That didn't save — try again");
      return null;
    }
    return res.json();
  }

  async function add() {
    if (!content.trim()) return;
    const data = await call("POST", { category, content: content.trim() });
    if (!data) return;
    const m: MemoryRow = data.memory;
    setRows((r) => (r.some((x) => x.id === m.id) ? r.map((x) => (x.id === m.id ? m : x)) : [...r, m]));
    setContent("");
  }

  async function patch(id: number, fields: Partial<Pick<MemoryRow, "content" | "category" | "archived">>) {
    const data = await call("PATCH", { id, ...fields });
    if (data) setRows((r) => r.map((x) => (x.id === id ? data.memory : x)));
  }

  async function remove(id: number) {
    const data = await call("DELETE", undefined, `?id=${id}`);
    if (data) setRows((r) => r.filter((x) => x.id !== id));
  }

  function saveDraft(m: MemoryRow) {
    const next = (drafts[m.id] ?? m.content).trim();
    if (next && next !== m.content) void patch(m.id, { content: next });
  }

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);

  return (
    <div>
      <div className="marker-box mb-4 p-3">
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
            className="font-display border-b-2 border-ink bg-transparent text-base focus:outline-none"
            aria-label="category"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="Something worth remembering"
            className="flex-1 border-b-2 border-ink bg-transparent text-base focus:outline-none"
          />
          <button onClick={add} disabled={!content.trim()} className="btn-ink px-3 py-1 text-lg leading-none disabled:opacity-40">
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-margin">{error}</p>}
      </div>

      {active.length === 0 && <p className="mb-4 text-sm text-pencil">Empty. Tell Tally something about your week.</p>}

      {MEMORY_CATEGORIES.map((c) => {
        const group = active.filter((m) => m.category === c);
        if (group.length === 0) return null;
        return (
          <section key={c} className="mb-4">
            <h2 className="font-display mb-1 text-2xl">{c}</h2>
            <ul className="marker-box divide-y-2 divide-ink/10 p-2">
              {group.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-2">
                  <input
                    value={drafts[m.id] ?? m.content}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    onBlur={() => saveDraft(m)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="flex-1 bg-transparent text-base focus:border-b-2 focus:border-ink focus:outline-none"
                    aria-label="memory"
                  />
                  <button onClick={() => patch(m.id, { archived: true })} className="btn-paper px-2 py-1 text-xs" title="archive">
                    hide
                  </button>
                  <button onClick={() => remove(m.id)} className="btn-paper px-2 py-1 text-xs" aria-label="delete">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {archived.length > 0 && (
        <section className="mb-4">
          <button onClick={() => setShowArchived((s) => !s)} className="font-display text-lg text-pencil">
            {showArchived ? "▾" : "▸"} archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="marker-box mt-1 divide-y-2 divide-ink/10 p-2 opacity-70">
              {archived.map((m) => (
                <li key={m.id} className="flex items-center gap-2 p-2 text-sm">
                  <span className="flex-1">
                    <span className="text-pencil">[{m.category}]</span> {m.content}
                  </span>
                  <button onClick={() => patch(m.id, { archived: false })} className="btn-paper px-2 py-1 text-xs">
                    restore
                  </button>
                  <button onClick={() => remove(m.id)} className="btn-paper px-2 py-1 text-xs" aria-label="delete">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

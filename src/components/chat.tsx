"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import clsx from "clsx";
import type { WireMessage } from "@/lib/agent/history";

type Msg = WireMessage & { pending?: boolean };

export function Chat({ initialMessages }: { initialMessages: WireMessage[] }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialMessages.length < 30);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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

  async function send() {
    const body = text.trim();
    if (busy || (!body && !pendingPhoto)) return;
    setBusy(true);
    setError("");
    const clientMsgId = nanoid();
    const shown = pendingPhoto ? `[photo] ${body}`.trim() : body;
    const tempId = -Date.now();
    setMessages((m) => [
      ...m,
      { id: tempId, channel: "web", role: "user", content: shown, results: [], createdAt: "", pending: true },
    ]);
    const form = new FormData();
    if (body) form.set("text", body);
    if (pendingPhoto) form.set("photo", pendingPhoto);
    form.set("clientMsgId", clientMsgId);
    setText("");
    clearPhoto();

    const res = await fetch("/api/chat", { method: "POST", body: form }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok || !data?.reply) {
      setError(data?.error ?? "Couldn't reach the coach — try again");
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(body);
      return;
    }
    setMessages((m) => [
      ...m.map((x) => (x.id === tempId ? { ...x, pending: false } : x)),
      { id: tempId - 1, channel: "web", role: "assistant", content: data.reply, results: data.results ?? [], createdAt: "" },
    ]);
  }

  async function loadMore() {
    const oldest = messages.find((m) => m.id > 0)?.id;
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    const res = await fetch(`/api/chat?before=${oldest}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoadingMore(false);
    const older: WireMessage[] = data?.messages ?? [];
    if (older.length < 30) setExhausted(true);
    setMessages((m) => [...older, ...m]);
  }

  return (
    <div>
      {!exhausted && (
        <button onClick={loadMore} disabled={loadingMore} className="btn-paper mb-3 w-full py-1 text-sm disabled:opacity-40">
          {loadingMore ? "…" : "earlier"}
        </button>
      )}

      <ol className="space-y-3">
        {messages.length === 0 && (
          <li className="text-sm text-pencil">Nothing yet. Try “log 20 pushups”, “what should I do today?”, or “put a run on Thursday at 6:30am”.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={clsx(
                "max-w-[88%] px-3 py-2",
                m.role === "user" ? "bg-ink text-paper" : "marker-box",
                m.pending && "opacity-50",
              )}
            >
              {m.role === "assistant" && m.channel === "telegram" && (
                <p className="font-display text-xs text-margin">via Telegram</p>
              )}
              <p className="whitespace-pre-wrap leading-snug">{m.content}</p>
              {m.results.length > 0 && (
                <ul className="mt-2 border-t-2 border-ink/20 pt-1 text-sm text-pencil">
                  {m.results.map((r, i) => (
                    <li key={i} className="whitespace-pre-wrap">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
        {busy && (
          <li className="flex justify-start">
            <div className="marker-box px-3 py-2 font-marker text-pencil">…</div>
          </li>
        )}
      </ol>
      <div ref={bottomRef} />

      <div className="marker-box sticky bottom-20 mt-4 bg-paper p-3">
        {photoUrl && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="attached" className="h-14 w-14 border-2 border-ink object-cover" />
            <p className="flex-1 text-xs text-pencil">Add a caption, or send as-is.</p>
            <button onClick={clearPhoto} className="btn-paper px-2 py-1 text-xs" aria-label="remove photo">
              ✕
            </button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Talk to Tally"
          className="w-full resize-none border-b-2 border-ink bg-transparent text-lg focus:outline-none"
        />
        <div className="mt-2 flex gap-2">
          <button onClick={send} disabled={busy || (!text.trim() && !pendingPhoto)} className="btn-ink flex-1 px-4 py-2 text-xl leading-none disabled:opacity-40">
            Send
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-paper px-4 py-2 text-xl leading-none" aria-label="attach photo">
            📷
          </button>
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
        </div>
        {error && <p className="mt-2 text-sm text-margin">{error}</p>}
      </div>
    </div>
  );
}

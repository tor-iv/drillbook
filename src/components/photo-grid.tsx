"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import clsx from "clsx";

type Photo = { id: number; takenAt: string; caption: string | null };

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState<number[]>([]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/photos", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError("Upload failed — try again");
  }

  function toggleCompare(id: number) {
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  }

  const comparing = compare.length === 2 ? photos.filter((p) => compare.includes(p.id)) : null;

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ink mb-4 w-full px-4 py-3 text-xl leading-none">
        {busy ? "uploading…" : "+ add today's pic"}
      </button>
      {error && <p className="mb-3 text-sm text-margin">{error}</p>}

      {comparing && (
        <div className="marker-box mb-4 p-2">
          <div className="grid grid-cols-2 gap-2">
            {comparing
              .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
              .map((p) => (
                <figure key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${p.id}/file`} alt={`progress ${p.takenAt}`} className="w-full" />
                  <figcaption className="font-display mt-1 text-center text-sm">{p.takenAt}</figcaption>
                </figure>
              ))}
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-pencil">No pics yet. First one is the baseline — take it today.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => toggleCompare(p.id)}
              className={clsx("relative border-2", compare.includes(p.id) ? "border-margin" : "border-ink")}
              aria-pressed={compare.includes(p.id)}
              aria-label={`photo from ${p.takenAt}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${p.id}/file`} alt={`progress ${p.takenAt}`} className="aspect-[3/4] w-full object-cover" />
              <span className="font-display absolute bottom-0 left-0 bg-ink px-1 text-xs text-paper">{p.takenAt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

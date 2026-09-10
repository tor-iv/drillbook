"use client";

import { useState } from "react";

type Device = { id: number; name: string; createdAt: string; lastSeenAt: string | null };

export function DeviceTokens({ initial }: { initial: Device[] }) {
  const [devices, setDevices] = useState(initial);
  const [error, setError] = useState("");

  async function revoke(id: number) {
    const res = await fetch(`/api/auth/device?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't revoke");
    setDevices((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div className="marker-box p-4 text-sm">
      <h3 className="font-display text-lg leading-none">Signed-in devices</h3>
      <p className="mt-1 text-pencil">The iPhone and Watch apps sign in with the PIN and get their own key. Revoke one here to log it out.</p>
      {devices.length === 0 ? (
        <p className="mt-2 text-pencil">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y-2 divide-ink/10">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <span className="flex-1">
                {d.name}
                <span className="ml-2 text-xs text-pencil">{d.lastSeenAt ? `seen ${d.lastSeenAt.slice(0, 10)}` : `added ${d.createdAt.slice(0, 10)}`}</span>
              </span>
              <button onClick={() => revoke(d.id)} className="btn-paper px-2 py-1 text-xs">
                revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-margin">{error}</p>}
    </div>
  );
}

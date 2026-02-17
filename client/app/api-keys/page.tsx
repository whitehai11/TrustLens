"use client";

import { useEffect, useState } from "react";

type ApiKeyView = { id: string; plan: string; isActive: boolean; keyMasked: string };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);

  useEffect(() => {
    const token = window.localStorage.getItem("trustlens_token");
    if (!token) return;

    fetch("http://localhost:4000/api/me", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    })
      .then((r) => r.json())
      .then((data) => setKeys(Array.isArray(data?.apiKeys) ? data.apiKeys : []));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">My API Keys</h1>
      <div className="mt-8 space-y-3 rounded-3xl bg-white/95 p-6 shadow-soft">
        {keys.length === 0 ? (
          <p className="text-sm text-slate-500">No API keys available.</p>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-mono text-sm text-slate-800">{k.keyMasked}</p>
              <p className="mt-1 text-xs uppercase text-slate-500">{k.plan} • {k.isActive ? "Active" : "Disabled"}</p>
            </div>
          ))
        )}
      </div>
    </main>
  );
}

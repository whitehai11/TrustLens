"use client";

import { useEffect, useMemo, useState } from "react";

type UsagePoint = { day: string; total: number };
type Ticket = { id: string; subject: string; status: string; updatedAt: string };

export default function DashboardPage() {
  const [usage, setUsage] = useState<UsagePoint[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [apiKeys, setApiKeys] = useState<Array<{ keyMasked: string; plan: string }>>([]);

  useEffect(() => {
    const token = window.localStorage.getItem("trustlens_token");
    if (!token) return;

    Promise.all([
      fetch("http://localhost:4000/api/usage", { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }).then((r) => r.json()),
      fetch("http://localhost:4000/api/tickets", { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }).then((r) => r.json()),
      fetch("http://localhost:4000/api/me", { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }).then((r) => r.json())
    ]).then(([usageData, ticketData, me]) => {
      setUsage(Array.isArray(usageData) ? usageData : []);
      setTickets(Array.isArray(ticketData) ? ticketData : []);
      setApiKeys((me?.apiKeys || []).map((k: any) => ({ keyMasked: k.keyMasked, plan: k.plan })));
    });
  }, []);

  const usageMax = useMemo(() => Math.max(1, ...usage.map((u) => u.total)), [usage]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft lg:col-span-2">
          <h2 className="text-lg font-semibold">API usage (30 days)</h2>
          <div className="mt-6 flex h-56 items-end gap-2 overflow-hidden">
            {usage.map((p) => (
              <div key={p.day} className="group flex-1">
                <div
                  className="w-full rounded-t-md bg-slate-900/85 transition group-hover:bg-slate-700"
                  style={{ height: `${Math.max(8, (p.total / usageMax) * 200)}px` }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">API Keys</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {apiKeys.length === 0 ? <p>No keys yet.</p> : apiKeys.map((k) => <p key={k.keyMasked}><span className="font-mono">{k.keyMasked}</span> ({k.plan})</p>)}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold">Tickets</h2>
        <div className="mt-4 space-y-3">
          {tickets.length === 0 ? <p className="text-sm text-slate-500">No tickets found.</p> : tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-100 p-4">
              <p className="font-medium">{t.subject}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{t.status}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

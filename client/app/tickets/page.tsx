"use client";

import { useEffect, useState } from "react";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  reporterEmail?: string;
  updatedAt: string;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("trustlens_token");
    if (!token) {
      setError("Login required to view your tickets.");
      return;
    }

    fetch("http://localhost:4000/api/tickets", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    })
      .then((r) => r.json())
      .then((data) => setTickets(Array.isArray(data) ? data : []))
      .catch(() => setError("Unable to load tickets."));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">Tickets</h1>
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      <div className="mt-8 space-y-4">
        {tickets.map((t) => (
          <article key={t.id} className="rounded-3xl bg-white/95 p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{t.subject}</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{t.status}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{t.message}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

export default function StatusPage() {
  const [status, setStatus] = useState("Checking...");

  useEffect(() => {
    fetch("http://localhost:4000/health")
      .then((r) => r.json())
      .then((data) => setStatus(`Operational: ${data.service}`))
      .catch(() => setStatus("Server offline"));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">Status</h1>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-lg text-slate-700">{status}</p>
      </div>
    </main>
  );
}
"use client";

import { FormEvent, useEffect, useState } from "react";
import { reportDomain } from "@/lib/api";

const categories = [
  "Phishing",
  "Investment scam",
  "Fake crypto platform",
  "Tech support scam",
  "Romance scam",
  "Marketplace fraud",
  "Impersonation",
  "Job scam",
  "Malware delivery",
  "Clone website"
];

export default function ReportDomainPage() {
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [evidenceLink, setEvidenceLink] = useState("");
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("trustlens_user");
    setIsLoggedIn(Boolean(raw));
    const fromQuery = new URLSearchParams(window.location.search).get("domain");
    if (fromQuery) setDomain(fromQuery.toLowerCase());
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const token = window.localStorage.getItem("trustlens_token") || undefined;
    const user = window.localStorage.getItem("trustlens_user");

    try {
      await reportDomain({
        domain,
        category,
        reason: category,
        details: description,
        evidenceLink: evidenceLink || undefined,
        reporterEmail: user ? undefined : email,
        token
      });
      setStatus("Report submitted successfully.");
      setDomain("");
      setDescription("");
      setEvidenceLink("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Report Domain</h1>
      <p className="mt-3 text-slate-600">Submit suspicious domains to help improve community safety.</p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl bg-white/95 p-6 shadow-soft">
        <input
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Domain"
          className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <textarea
          required
          minLength={20}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Description"
          className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
        />
        <input
          value={evidenceLink}
          onChange={(e) => setEvidenceLink(e.target.value)}
          placeholder="Evidence link (optional)"
          className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
        />
        {!isLoggedIn && (
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (required if not logged in)"
            className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
          />
        )}
        <button disabled={busy} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
          {busy ? "Submitting..." : "Submit Report"}
        </button>
        {status && <p className="text-sm text-slate-600">{status}</p>}
      </form>
    </main>
  );
}

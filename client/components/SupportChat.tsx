"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createSupportTicket } from "@/lib/api";

type SessionUser = {
  email: string;
  role: "USER" | "ADMIN";
};

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const token = useMemo(() => (typeof window !== "undefined" ? window.localStorage.getItem("trustlens_token") || undefined : undefined), []);

  useEffect(() => {
    const raw = window.localStorage.getItem("trustlens_user");
    if (raw) {
      const parsed = JSON.parse(raw) as SessionUser;
      setUser(parsed);
      setEmail(parsed.email);
    }
  }, []);

  useEffect(() => {
    if (open) {
      panelRef.current?.scrollTo({ top: panelRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [open, status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    setStatus(null);

    try {
      await createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        reporterEmail: user ? undefined : email.trim(),
        token
      });
      setStatus("Ticket created. Support will reply soon.");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open support chat"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 animate-fadeUp items-center justify-center rounded-full bg-slate-900 text-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-xl"
      >
        ?
      </button>
      <div
        className={`fixed bottom-24 right-6 z-40 w-[22rem] rounded-2xl bg-white p-4 shadow-soft transition duration-300 ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"}`}
        aria-hidden={!open}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Support</h3>
          <button onClick={() => setOpen(false)} aria-label="Close support chat" className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100">
            x
          </button>
        </div>
        <div ref={panelRef} className="max-h-72 overflow-y-auto">
          <form onSubmit={submit} className="space-y-3">
            {!user && (
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
              />
            )}
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
            />
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              rows={4}
              className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-slate-300"
            />
            <button
              disabled={busy}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? "Sending..." : "Create Ticket"}
            </button>
            {status && <p className="text-xs text-slate-600">{status}</p>}
          </form>
        </div>
      </div>
    </>
  );
}

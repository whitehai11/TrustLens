"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserMenu } from "./UserMenu";

type SessionUser = {
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";
};

export function Navbar() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const syncUser = () => {
      const raw = window.localStorage.getItem("trustlens_user");
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    syncUser();
    const token = window.localStorage.getItem("trustlens_token");
    if (token) {
      void fetch("http://localhost:4000/api/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        cache: "no-store"
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (!me?.email || !me?.role) return;
          const normalized = { email: String(me.email), role: String(me.role) as SessionUser["role"] };
          window.localStorage.setItem("trustlens_user", JSON.stringify(normalized));
          setUser(normalized);
        })
        .catch(() => undefined);
    }

    const onStorage = () => syncUser();
    const onAuthChanged = () => syncUser();

    window.addEventListener("storage", onStorage);
    window.addEventListener("trustlens-auth-changed", onAuthChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("trustlens-auth-changed", onAuthChanged as EventListener);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">TrustLens Project</Link>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <Link href="/education" className="transition hover:text-slate-900">Education</Link>
          <Link href="/domain-check" className="transition hover:text-slate-900">Domain Check</Link>
          <Link href="/report-domain" className="transition hover:text-slate-900">Report Domain</Link>
        </div>
        <div>
          {!user ? (
            <Link href="/login" className="rounded-full border border-slate-300 px-4 py-2 text-xs font-medium transition hover:border-slate-900 hover:text-slate-900">
              Login
            </Link>
          ) : (
            <UserMenu user={user} />
          )}
        </div>
      </nav>
    </header>
  );
}

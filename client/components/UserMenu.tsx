"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SessionUser = {
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";
};

type UserMenuProps = {
  user: SessionUser;
};

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  async function logout() {
    try {
      await fetch("http://localhost:4000/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // Continue local logout even if network request fails.
    }
    window.localStorage.removeItem("trustlens_token");
    window.localStorage.removeItem("trustlens_user");
    window.dispatchEvent(new Event("trustlens-auth-changed"));
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const initial = user.email.slice(0, 1).toUpperCase();
  const isStaff = user.role === "MODERATOR" || user.role === "ADMIN" || user.role === "SUPERADMIN";
  const links =
    isStaff
      ? [
          { href: "/admin", label: "Admin Panel" },
          { href: "/admin/threat-graph", label: "Threat Graph" },
          { href: "/admin#users", label: "User Management" },
          { href: "/admin#api-keys", label: "API Keys Management" },
          { href: "/admin#reports", label: "Reports Moderation" },
          { href: "/tickets", label: "Tickets" }
        ]
      : [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/api-keys", label: "My API Keys" },
          { href: "/tickets", label: "Tickets" }
        ];

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700 shadow-sm transition hover:scale-105"
      >
        {initial}
      </button>
      <div
        role="menu"
        className={`absolute right-0 mt-3 min-w-56 origin-top-right rounded-2xl bg-white p-2 shadow-soft transition duration-150 ${open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}
      >
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
        <button
          role="menuitem"
          onClick={logout}
          className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

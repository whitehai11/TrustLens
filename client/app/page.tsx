"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatCounter } from "@/components/StatCounter";
import { getStats, StatsResponse } from "@/lib/api";

const HomeEducationPreview = dynamic(() => import("@/components/HomeEducationPreview").then((m) => m.HomeEducationPreview));
const TrustBadgeSection = dynamic(() => import("@/components/TrustBadgeSection").then((m) => m.TrustBadgeSection));

const emptyStats: StatsResponse = {
  reports_24h: 0,
  reports_7d: 0,
  reports_30d: 0,
  reports_1y: 0,
  total_domains_checked: 0
};

export default function HomePage() {
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [err, setErr] = useState<string | null>(null);
  const [heroShift, setHeroShift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getStats();
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setErr("Stats unavailable. Start server on port 4000.");
      }
    };

    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const transform = useMemo(() => ({ transform: `translate3d(${heroShift.x}px, ${heroShift.y}px, 0)` }), [heroShift]);

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
      <section
        className="relative overflow-hidden rounded-3xl bg-white/90 px-8 py-12 shadow-soft animate-fadeUp md:px-12 md:py-16"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 10;
          setHeroShift({ x, y });
        }}
        onMouseLeave={() => setHeroShift({ x: 0, y: 0 })}
      >
        <div
          style={transform}
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(15,23,42,0.12),_rgba(15,23,42,0)_70%)] transition-transform duration-300"
        />
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">TrustLens Project</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight tracking-tight text-slate-900 md:text-7xl">
          Understand Online Risk Before It Understands You.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
          TrustLens Project analyzes domain behavior, scam signals and abuse patterns to provide transparent risk intelligence.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/domain-check" className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-700">
            Check a Domain
          </Link>
          <Link href="/report-domain" className="rounded-full bg-slate-100 px-6 py-3 text-sm font-medium text-slate-800 transition hover:-translate-y-0.5 hover:bg-slate-200">
            Report a Domain
          </Link>
        </div>
      </section>

      <section className="mt-20 animate-fadeUp">
        {err && <p className="mb-5 text-sm text-rose-600">{err}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCounter value={stats.reports_24h} label="Reports 24h" />
          <StatCounter value={stats.reports_7d} label="Reports 7d" />
          <StatCounter value={stats.reports_30d} label="Reports 30d" />
          <StatCounter value={stats.reports_1y} label="Reports 1y" />
          <StatCounter value={stats.total_domains_checked} label="Domains Checked" />
        </div>
      </section>

      <HomeEducationPreview />
      <TrustBadgeSection />
    </main>
  );
}
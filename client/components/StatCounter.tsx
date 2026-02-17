"use client";

import { useEffect, useMemo, useState } from "react";

export function StatCounter({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(0);
  const duration = 900;

  useEffect(() => {
    const start = performance.now();
    const from = display;

    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(from + (value - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const formatted = useMemo(() => display.toLocaleString(), [display]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-1">
      <div className="text-3xl font-semibold tracking-tight text-slate-900">{formatted}</div>
      <div className="mt-2 text-sm text-slate-500">{label}</div>
    </div>
  );
}
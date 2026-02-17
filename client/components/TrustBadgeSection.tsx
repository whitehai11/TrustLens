export function TrustBadgeSection() {
  return (
    <section className="mt-24 animate-fadeUp rounded-3xl bg-white/95 p-10 shadow-soft">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Trust Badge</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">How TrustLens scores are built</h2>
      <p className="mt-4 max-w-3xl text-slate-600">
        TrustLens combines risk heuristics, abuse signals, and historical trend indicators into one transparent score. Every check
        shows confidence and factor-level explanations so you can understand why a domain is flagged.
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-900">Risk Factors</p>
          <p className="mt-2 text-sm text-slate-600">Keyword abuse, structure anomalies, and phishing-like patterns.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-900">Abuse Signals</p>
          <p className="mt-2 text-sm text-slate-600">Indicators commonly linked to fraud, malware delivery, and fake offers.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-900">Trend Context</p>
          <p className="mt-2 text-sm text-slate-600">Stability and drift patterns that help prioritize responses.</p>
        </div>
      </div>
    </section>
  );
}

import { getTransparencyStats } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TransparencyPage() {
  const data = await getTransparencyStats();

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Transparency Dashboard</h1>
      <p className="mt-3 text-slate-600">Operational metrics from TrustLens internal systems.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total domains analyzed" value={data.total_domains_analyzed} />
        <StatCard label="Total reports submitted" value={data.total_reports_submitted} />
        <StatCard label="Reports approved" value={data.reports_approved} />
        <StatCard label="Reports rejected" value={data.reports_rejected} />
        <StatCard label="Verified domains count" value={data.verified_domains_count} />
        <StatCard label="Open disputes" value={data.open_disputes} />
        <StatCard label="Abuse flags generated" value={data.abuse_flags_generated} />
        <StatCard label="Average risk score" value={data.average_risk_score.toFixed(2)} />
      </section>

      <section className="mt-10 rounded-3xl bg-white/95 p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-slate-900">Top 10 TLD Risk Ratios</h2>
        <p className="mt-2 text-sm text-slate-600">{data.note}</p>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">TLD</th>
                <th>Total</th>
                <th>High</th>
                <th>Critical</th>
                <th>Risk ratio</th>
              </tr>
            </thead>
            <tbody>
              {data.top_tld_risk_ratios.map((row) => (
                <tr key={row.tld} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">.{row.tld}</td>
                  <td>{row.totalDomains}</td>
                  <td>{row.highRiskCount}</td>
                  <td>{row.criticalCount}</td>
                  <td>{(row.tldRiskRatio * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 rounded-3xl bg-white/95 p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-slate-900">How TrustLens Works</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
          <li>Heuristic modules analyze impersonation, lexical patterns, domain age, infrastructure, and abuse indicators.</li>
          <li>Community feedback is moderated and weighted before it contributes to public reputation outcomes.</li>
          <li>Ownership verification confirms technical domain control but does not bypass risk controls.</li>
          <li>Risk and reputation are continuously recomputed as new logs, reports, and moderation actions arrive.</li>
        </ul>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/95 p-5 shadow-soft">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

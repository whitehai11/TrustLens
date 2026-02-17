export default function ApiDocsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">API</h1>
      <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-slate-700"><code className="font-mono">POST http://localhost:4000/api/domain/check</code> with header <code className="font-mono">x-api-key</code>.</p>
        <p className="text-slate-700"><code className="font-mono">POST http://localhost:4000/api/domain/report</code> with bearer token.</p>
        <p className="text-slate-700"><code className="font-mono">GET http://localhost:4000/api/stats</code> for live public telemetry.</p>
      </div>
    </main>
  );
}
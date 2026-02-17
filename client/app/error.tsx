"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="mt-3 text-slate-600">Please try again.</p>
      <button onClick={reset} className="mt-8 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
        Retry
      </button>
    </main>
  );
}

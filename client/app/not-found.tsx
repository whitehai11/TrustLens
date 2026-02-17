import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-4 text-slate-600">The page you requested does not exist.</p>
      <Link href="/" className="mt-8 inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
        Back to Home
      </Link>
    </main>
  );
}

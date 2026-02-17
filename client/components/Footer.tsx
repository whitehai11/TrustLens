import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative z-10 mt-20 bg-white/80 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-600 md:flex-row">
        <div>{`© ${new Date().getFullYear()} TrustLens Project`}</div>
        <div className="flex items-center gap-5">
          <Link href="/domain-check" className="transition hover:text-slate-900">Domain Check</Link>
          <Link href="/report-domain" className="transition hover:text-slate-900">Report Domain</Link>
          <Link href="/transparency" className="transition hover:text-slate-900">Transparency</Link>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/api-docs" className="transition hover:text-slate-900">API</Link>
          <Link href="/status" className="transition hover:text-slate-900">Status</Link>
          <Link href="/disclaimer" className="transition hover:text-slate-900">Disclaimer</Link>
          <Link href="/impressum" className="transition hover:text-slate-900">Impressum</Link>
          <Link href="/datenschutz" className="transition hover:text-slate-900">Datenschutz</Link>
        </div>
      </div>
    </footer>
  );
}


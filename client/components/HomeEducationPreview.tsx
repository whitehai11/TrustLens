import Link from "next/link";
import { articles } from "@/lib/articles";

export function HomeEducationPreview() {
  return (
    <section className="mt-24 animate-fadeUp">
      <div className="flex items-end justify-between">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Education Library</h2>
        <Link href="/education" className="text-sm text-slate-600 transition hover:text-slate-900">
          View all articles
        </Link>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {articles.slice(0, 6).map((article) => (
          <Link
            key={article.slug}
            href={`/education/${article.slug}`}
            className="rounded-2xl bg-white/95 p-6 shadow-soft transition hover:-translate-y-1"
          >
            <h3 className="text-lg font-semibold text-slate-900">{article.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{article.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

import Link from "next/link";
import { articles } from "@/lib/articles";

export default function EducationIndex() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight">Education</h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        Long-form threat guides focused on recognizable scam workflows, detection methods, and practical prevention.
      </p>
      <div className="mt-10 grid gap-4">
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/education/${article.slug}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-1"
          >
            <h2 className="text-xl font-semibold text-slate-900">{article.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{article.excerpt}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
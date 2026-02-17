import { notFound } from "next/navigation";
import { getArticleBySlug } from "@/lib/articles";

export default async function EducationArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return notFound();

  const paragraphs = article.content.split("\n\n").filter(Boolean);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{article.title}</h1>
      <p className="mt-3 text-sm uppercase tracking-[0.18em] text-slate-500">Threat Education</p>
      <article className="mt-10 space-y-7">
        {paragraphs.map((paragraph, idx) => (
          <p key={idx} className="text-lg leading-8 text-slate-700">
            {paragraph}
          </p>
        ))}
      </article>
    </main>
  );
}
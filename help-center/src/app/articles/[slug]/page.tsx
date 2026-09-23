// One article. Everything the Salesforce connector will index lives inside <article>:
// title, visible tags row (so categories are searchable as keywords), summary, question, body.
import { notFound } from "next/navigation";
import Link from "next/link";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { getArticle, getArticles, categoryNames, conceptLabels } from "@/lib/contentful";

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getArticles()).map((a) => ({ slug: a.fields.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle((await params).slug);
  return { title: a ? `${a.fields.title} · Brightline Solar Help` : "Not found", description: a?.fields.summary };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const [a, labels] = await Promise.all([getArticle((await params).slug), conceptLabels()]);
  if (!a) notFound();
  const tags = categoryNames(a, labels);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-amber-700 hover:underline">← All articles</Link>
      <article id="article" className="prose prose-zinc mt-4 max-w-none">
        <p className="!mb-1 text-xs uppercase tracking-wide text-zinc-500">{a.fields.articleType ?? "FAQ"}</p>
        <h1 className="!mt-0">{a.fields.title}</h1>
        {tags.length > 0 && (
          <p className="!mt-0 text-sm text-zinc-500">Topics: {tags.join(", ")}</p>
        )}
        {a.fields.summary && <p className="lead">{a.fields.summary}</p>}
        {a.fields.question && (
          <section>
            <h2>Question</h2>
            {documentToReactComponents(a.fields.question)}
          </section>
        )}
        {a.fields.body && (
          <section>
            {a.fields.question && <h2>Answer</h2>}
            {documentToReactComponents(a.fields.body)}
          </section>
        )}
        {a.fields.audience && <p className="text-sm text-zinc-500">Audience: {a.fields.audience}</p>}
      </article>
    </main>
  );
}

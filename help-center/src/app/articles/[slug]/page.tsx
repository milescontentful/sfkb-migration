// One article. Everything the Salesforce connector should index lives inside <article>:
// title, record type, Topics (taxonomy), Keywords (visible, so they are searchable), summary, body.
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticle, getArticles, topicNames, conceptLabels } from "@/lib/contentful";
import RichText from "@/components/RichText";

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
  const topics = topicNames(a, labels);
  const keywords = a.fields.keywords ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-amber-700 hover:underline">← All articles</Link>
      <article id="article" className="mt-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{a.fields.recordType}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{a.fields.title}</h1>
        {topics.length > 0 && <p className="mt-2 text-sm text-zinc-500">Topics: {topics.join(", ")}</p>}
        {keywords.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {keywords.map((k) => <span key={k} className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{k}</span>)}
          </p>
        )}
        <p className="mt-4 text-lg text-zinc-700">{a.fields.summary}</p>
        <div className="mt-6"><RichText doc={a.fields.bodyCopy} /></div>
        <p className="mt-8 text-xs text-zinc-400">Published {new Date(a.fields.publishDate).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
      </article>
    </main>
  );
}

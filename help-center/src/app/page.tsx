// Help center home: search box + every public article, grouped by record type.
import Link from "next/link";
import { getArticles, topicNames, conceptLabels, RECORD_TYPES } from "@/lib/contentful";
import SearchBox from "@/components/SearchBox";

export const revalidate = 60;

export default async function Home() {
  const [articles, labels] = await Promise.all([getArticles(), conceptLabels()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Brightline Solar Help Center</h1>
      <p className="mt-2 text-zinc-600">Answers written in Contentful, searched by Salesforce.</p>
      <div className="mt-6"><SearchBox /></div>

      {articles.length === 0 && (
        <p className="mt-10 rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-500">
          No public articles published yet.
        </p>
      )}

      {RECORD_TYPES.map((t) => {
        const list = articles.filter((a) => a.fields.recordType === t);
        if (!list.length) return null;
        return (
          <section key={t} className="mt-10">
            <h2 className="text-xl font-semibold">{t}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {list.map((a) => (
                <li key={a.sys.id} className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-amber-400">
                  <Link href={`/articles/${a.fields.slug}`} className="font-medium text-amber-700 hover:underline">
                    {a.fields.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{a.fields.summary}</p>
                  {topicNames(a, labels).length > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">{topicNames(a, labels).join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

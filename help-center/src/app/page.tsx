// Help center home: search box + every published article, grouped by type.
import Link from "next/link";
import { getArticles, categoryNames, conceptLabels } from "@/lib/contentful";
import SearchBox from "@/components/SearchBox";

export const revalidate = 60;

export default async function Home() {
  const [articles, labels] = await Promise.all([getArticles(), conceptLabels()]);
  // Lets a Salesforce search hit (keyed by SF article Id) jump to the Contentful page.
  const bySfId = Object.fromEntries(
    articles.filter((a) => a.fields.sfArticleId).map((a) => [a.fields.sfArticleId!, { slug: a.fields.slug, title: a.fields.title }]),
  );
  const types = ["FAQ", "Procedure", "News"];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Brightline Solar Help Center</h1>
      <p className="mt-2 text-zinc-600">Answers written in Contentful, searched by Salesforce.</p>
      <div className="mt-6"><SearchBox articlesBySfId={bySfId} /></div>

      {articles.length === 0 && (
        <p className="mt-10 rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-500">
          No articles published yet. Run the migration app to bring them over from Salesforce Knowledge.
        </p>
      )}

      {types.map((t) => {
        const list = articles.filter((a) => (a.fields.articleType ?? "FAQ") === t);
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
                  {a.fields.summary && <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{a.fields.summary}</p>}
                  {categoryNames(a, labels).length > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">{categoryNames(a, labels).join(" · ")}</p>
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

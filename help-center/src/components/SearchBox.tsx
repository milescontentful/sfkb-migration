"use client";
// Search box for the help center. Talks only to our own /api/search route.
// `articlesBySfId` lets a Salesforce hit link to the Contentful page for that article.
import { useEffect, useState } from "react";
import type { SearchHit } from "@/app/api/search/route";

type Props = { articlesBySfId: Record<string, { slug: string; title: string }> };

export default function SearchBox({ articlesBySfId }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Search after the user pauses typing for 400ms.
  useEffect(() => {
    if (q.trim().length < 3) { setHits(null); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&k=8`);
      setHits((await r.json()).hits ?? []);
      setBusy(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="w-full max-w-2xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask a question, e.g. why is my bill higher than the estimate?"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      {busy && <p className="mt-2 text-sm text-zinc-500">Searching…</p>}
      {hits && !busy && (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {hits.length === 0 && <li className="p-4 text-sm text-zinc-500">No matches.</li>}
          {hits.map((h) => {
            const a = articlesBySfId[h.sourceId];
            const href = h.sourceId.startsWith("http") ? h.sourceId : a ? `/articles/${a.slug}` : undefined;
            const title = a?.title ?? h.snippet.split("\n")[0];
            return (
              <li key={h.sourceId} className="p-4">
                {href ? (
                  <a href={href} className="font-medium text-amber-700 hover:underline">{title}</a>
                ) : (
                  <span className="font-medium">{title}</span>
                )}
                <p className="mt-1 text-sm text-zinc-600">{h.snippet}</p>
                <p className="mt-1 text-xs text-zinc-400">match {Math.round(h.score * 100)}%</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

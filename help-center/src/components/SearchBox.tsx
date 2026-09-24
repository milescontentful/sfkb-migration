"use client";
// Search box for the help center. Talks only to our own /api/search route.
// Today the index is the Salesforce Knowledge one, whose hits are Salesforce records, so results
// show title + snippet without a link. Once the index is built from this site's sitemap, each hit's
// sourceId is a page URL and becomes the link.
import { useEffect, useState } from "react";
import type { SearchHit } from "@/app/api/search/route";

export default function SearchBox() {
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
        placeholder="Ask a question, e.g. how do I reset my password?"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      {busy && <p className="mt-2 text-sm text-zinc-500">Searching…</p>}
      {hits && !busy && (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {hits.length === 0 && <li className="p-4 text-sm text-zinc-500">No matches.</li>}
          {hits.map((h) => {
            const [first, ...rest] = h.snippet.split("\n");
            const title = h.title ?? first;
            const body = h.title ? h.snippet : rest.join(" ");
            return (
              <li key={h.sourceId} className="p-4">
                {h.url ? (
                  <a href={h.url} className="font-medium text-amber-700 hover:underline">{title}</a>
                ) : (
                  <span className="font-medium">{title}</span>
                )}
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{body}</p>
                <p className="mt-1 text-xs text-zinc-400">{h.source === "contentful" ? "keyword match" : `match ${Math.round(h.score * 100)}%`}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

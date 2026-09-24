// The ONLY place the site talks to Salesforce.
// The browser calls /api/search?q=... ; this route holds the Salesforce secret, runs a
// vector search against the Data 360 Search Index, and hands back tidy results.
//
// Knobs (k, minScore) are read from the query string so a Contentful config app can
// drive them later without touching this file.
import { NextRequest, NextResponse } from "next/server";

const SF = process.env.SF_DOMAIN!.replace(/\/$/, "");
const INDEX = process.env.SF_SEARCH_INDEX ?? "KA_Brightline_KB";

// ponytail: token cached in module memory; fine on Vercel (each instance re-fetches once).
// Salesforce may expire it early (INVALID_SESSION_ID): on a 401 we refetch once and retry.
let cached: { token: string; exp: number } | null = null;
async function sfToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.exp) return cached.token;
  const r = await fetch(`${SF}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_CLIENT_ID!,
      client_secret: process.env.SF_CLIENT_SECRET!,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`SF token failed: ${JSON.stringify(j)}`);
  cached = { token: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return j.access_token;
}

export type SearchHit = {
  sourceId: string; // Knowledge article Id today; page URL once the web connector is live
  score: number;
  snippet: string;
  url?: string; // set when the hit maps to a page on this site
  title?: string;
};

// Public Contentful articles — a hit only becomes a result if a page for it exists on this site.
// Keyed by slug AND by title: after a webhook re-publish, Salesforce gives the article a new version
// Id, so for the ~15-30 min until the index re-runs the chunk's Id is orphaned in the snapshot. The
// chunk text still starts with the article title, so the title lookup keeps the link alive.
// ponytail: one small lookup cached for 60s; fine at demo scale.
type PublicIndex = { slugs: Set<string>; slugByTitle: Map<string, string> };
let pubCache: { at: number; idx: PublicIndex } | null = null;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function publicArticles(): Promise<PublicIndex> {
  if (pubCache && Date.now() - pubCache.at < 60_000) return pubCache.idx;
  const c = await fetch(`https://cdn.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${process.env.CONTENTFUL_ENVIRONMENT ?? "master"}/entries?content_type=article&fields.channelVisibility=Public&select=fields.slug,fields.title&limit=1000`,
    { headers: { Authorization: `Bearer ${process.env.CONTENTFUL_DELIVERY_TOKEN}` } }).then((r) => r.json()).catch(() => ({ items: [] }));
  const items: { fields: { slug: string; title: string } }[] = c.items ?? [];
  pubCache = { at: Date.now(), idx: { slugs: new Set(items.map((e) => e.fields.slug)), slugByTitle: new Map(items.map((e) => [norm(e.fields.title), e.fields.slug])) } };
  return pubCache.idx;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const k = Math.min(Number(req.nextUrl.searchParams.get("k") ?? 10), 50);
  const minScore = Number(req.nextUrl.searchParams.get("minScore") ?? 0);
  if (!q) return NextResponse.json({ hits: [] });

  // Data 360 SQL. Ask for extra chunks (k*3) because several chunks can come from one article;
  // we collapse to one hit per source below. The join to Data 360's own copy of Knowledge gives
  // each chunk its article's URL name and title from the SAME snapshot the index was built from,
  // so Salesforce version churn (the webhook replaces versions) can never orphan a hit.
  const sql = `SELECT v.score__c, c.SourceRecordId__c, c.Chunk__c, k.ssot__URL__c, k.ssot__Name__c
    FROM vector_search(table(${INDEX}_index__dlm), '${q.replace(/'/g, "''")}', '', ${k * 3}) v
    JOIN ${INDEX}_chunk__dlm c ON v.RecordId__c = c.RecordId__c
    LEFT JOIN ssot__KnowledgeArticleVersion__dlm k ON c.SourceRecordId__c = k.ssot__Id__c`;

  const query = async (token: string) => fetch(`${SF}/services/data/v62.0/ssot/query-sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  let [r, pub] = await Promise.all([query(await sfToken()), publicArticles()]);
  if (r.status === 401) r = await query(await sfToken(true));
  const j = await r.json();
  if (!Array.isArray(j.data)) return NextResponse.json({ error: j }, { status: 502 });

  // One hit per source, best score wins, then apply the knobs.
  const best = new Map<string, SearchHit>();
  for (const [score, sourceId, chunk, urlName, title] of j.data as [number, string, string, string | null, string | null][]) {
    if (!best.has(sourceId) || best.get(sourceId)!.score < score) {
      const text = String(chunk);
      const firstLine = text.split("\n")[0];
      // 1) page URL (future web index) 2) snapshot URL name 3) title match (orphaned chunk during re-index)
      const slug = urlName && pub.slugs.has(urlName) ? urlName : pub.slugByTitle.get(norm(title ?? firstLine));
      const url = sourceId.startsWith("http") ? sourceId : slug ? `/articles/${slug}` : undefined;
      best.set(sourceId, { sourceId, score, snippet: text.slice(0, 240), url, title: title ?? (slug ? firstLine : undefined) });
    }
  }
  // Contentful is the source of truth: only show hits that map to a page on this site.
  // Index rows with no Contentful counterpart (legacy Salesforce fixtures) are dropped.
  const hits = [...best.values()]
    .filter((h) => h.url)
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return NextResponse.json({ hits, index: INDEX });
}

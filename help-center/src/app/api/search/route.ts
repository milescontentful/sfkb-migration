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
let cached: { token: string; exp: number } | null = null;
async function sfToken(): Promise<string> {
  if (cached && Date.now() < cached.exp) return cached.token;
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
};

// Knowledge version Id → this site's article URL, for articles the webhook pushed into Knowledge.
// A Knowledge article maps to a page when its UrlName equals a public Contentful slug.
// ponytail: two small lookups cached for 60s; fine at demo scale.
let urlMap: { at: number; map: Map<string, string> } | null = null;
async function knowledgeUrlMap(token: string): Promise<Map<string, string>> {
  if (urlMap && Date.now() - urlMap.at < 60_000) return urlMap.map;
  const slugs = new Set<string>();
  const c = await fetch(`https://cdn.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${process.env.CONTENTFUL_ENVIRONMENT ?? "master"}/entries?content_type=article&fields.channelVisibility=Public&select=fields.slug&limit=1000`,
    { headers: { Authorization: `Bearer ${process.env.CONTENTFUL_DELIVERY_TOKEN}` } }).then((r) => r.json()).catch(() => ({ items: [] }));
  for (const e of c.items ?? []) slugs.add(e.fields.slug);
  const q = encodeURIComponent("SELECT Id, UrlName FROM Knowledge__kav WHERE PublishStatus='Online'");
  const k = await fetch(`${SF}/services/data/v62.0/query?q=${q}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ records: [] }));
  const map = new Map<string, string>();
  for (const r of k.records ?? []) if (slugs.has(r.UrlName)) map.set(r.Id, `/articles/${r.UrlName}`);
  urlMap = { at: Date.now(), map };
  return map;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const k = Math.min(Number(req.nextUrl.searchParams.get("k") ?? 10), 50);
  const minScore = Number(req.nextUrl.searchParams.get("minScore") ?? 0);
  if (!q) return NextResponse.json({ hits: [] });

  // Data 360 SQL. Ask for extra chunks (k*3) because several chunks can come from one article;
  // we collapse to one hit per source below.
  const sql = `SELECT v.score__c, c.SourceRecordId__c, c.Chunk__c
    FROM vector_search(table(${INDEX}_index__dlm), '${q.replace(/'/g, "''")}', '', ${k * 3}) v
    JOIN ${INDEX}_chunk__dlm c ON v.RecordId__c = c.RecordId__c`;

  const token = await sfToken();
  const [r, urls] = await Promise.all([
    fetch(`${SF}/services/data/v62.0/ssot/query-sql`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    }),
    knowledgeUrlMap(token),
  ]);
  const j = await r.json();
  if (!Array.isArray(j.data)) return NextResponse.json({ error: j }, { status: 502 });

  // One hit per source, best score wins, then apply the knobs.
  const best = new Map<string, SearchHit>();
  for (const [score, sourceId, chunk] of j.data as [number, string, string][]) {
    if (!best.has(sourceId) || best.get(sourceId)!.score < score) {
      const url = sourceId.startsWith("http") ? sourceId : urls.get(sourceId);
      best.set(sourceId, { sourceId, score, snippet: String(chunk).slice(0, 240), url });
    }
  }
  const hits = [...best.values()]
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return NextResponse.json({ hits, index: INDEX });
}

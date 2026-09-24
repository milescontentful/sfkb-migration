// Contentful → Salesforce search index, one article at a time.
//
// Contentful calls this route when an `article` entry is published or unpublished.
// The search index can only be fed by a Salesforce data stream, so this route hands the article to
// the stream that feeds it. Today that stream is the Knowledge object (the Data Library index
// re-syncs published Knowledge roughly every 15 min). The Knowledge record is a delivery pipe, not
// a place anyone edits; Contentful stays the source of truth.
//
// ponytail: `sink` is the one function to swap when the Ingestion API becomes available —
// everything above it (auth, fetch, flatten to HTML) stays the same.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "contentful";
import { documentToHtmlString, type Options } from "@contentful/rich-text-html-renderer";
import { BLOCKS, INLINES, type Document } from "@contentful/rich-text-types";

const SF = process.env.SF_DOMAIN!.replace(/\/$/, "");
const API = `${SF}/services/data/v62.0`;
const cda = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  environment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
  accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Salesforce helpers ----------
let cached: { token: string; exp: number } | null = null;
async function sfToken(force = false) {
  if (!force && cached && Date.now() < cached.exp) return cached.token;
  const r = await fetch(`${SF}/services/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SF_CLIENT_ID!, client_secret: process.env.SF_CLIENT_SECRET! }),
  });
  const j = await r.json(); if (!j.access_token) throw new Error(`SF token: ${JSON.stringify(j)}`);
  cached = { token: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return j.access_token;
}
// Salesforce can expire a session before our 50-min cache does (seen 2026-09-24: every call 401
// INVALID_SESSION_ID). On 401, fetch a fresh token and retry once.
async function sf(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await sfToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 401 && retry) { await sfToken(true); return sf(path, init, false); }
  const text = await r.text(); const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`SF ${init.method ?? "GET"} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return body;
}
const soql = async (q: string) => (await sf(`/query?q=${encodeURIComponent(q)}`)).records as any[];

// ---------- Contentful article → one flat HTML document ----------
// Embedded entries become plain text so the index sees their words, same as the public page.
const html: Options = {
  renderNode: {
    [BLOCKS.EMBEDDED_ENTRY]: (n) => embedText(n.data.target),
    [INLINES.EMBEDDED_ENTRY]: (n) => embedText(n.data.target),
    [BLOCKS.EMBEDDED_ASSET]: (n) => `<p>[image: ${n.data.target?.fields?.title ?? ""}]</p>`,
    [INLINES.ENTRY_HYPERLINK]: (n, next) => `<a href="/articles/${n.data.target?.fields?.slug ?? ""}">${next(n.content)}</a>`,
  },
};
function embedText(e: any): string {
  const f = e?.fields ?? {}; const t = e?.sys?.contentType?.sys?.id;
  const rt = (d?: Document) => (d ? documentToHtmlString(d, html) : "");
  switch (t) {
    case "infoPanel": return `<p><b>${f.type ?? "Note"}:</b></p>${rt(f.text)}`;
    case "image": return `<p>[image: ${f.altText ?? f.footnote ?? ""}]</p>`;
    case "codeEmbed": return `<pre>${escape(f.code ?? "")}</pre>`;
    case "videoEmbed": return `<p>[video]</p>`;
    case "accordion": return `<h3>${f.headline ?? ""}</h3>${rt(f.bodyCopy)}`;
    case "accordions": return (f.accordions ?? []).map(embedText).join("");
    case "card": return rt(f.cardBody);
    case "collection": return (f.items ?? []).map(embedText).join("");
    case "button": case "linkText": case "link": return `<p>${f.title ?? ""}</p>`;
    default: return "";
  }
}
const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

async function conceptNotations(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const r = await fetch(`https://cdn.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${process.env.CONTENTFUL_ENVIRONMENT ?? "master"}/taxonomy/concepts?limit=1000`,
    { headers: { Authorization: `Bearer ${process.env.CONTENTFUL_DELIVERY_TOKEN}` } });
  const j = await r.json();
  const byId = new Map((j.items ?? []).map((c: any) => [c.sys.id, c.notations?.[0]]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as string[];
}

export type FlatArticle = { slug: string; title: string; summary: string; bodyHtml: string; categories: string[] };

async function flatten(entryId: string): Promise<FlatArticle | null> {
  const e: any = await cda.withoutUnresolvableLinks.getEntry(entryId, { include: 4 }).catch(() => null);
  if (!e || e.sys.contentType.sys.id !== "article" || e.fields.channelVisibility !== "Public") return null;
  const f = e.fields;
  const categories = await conceptNotations((e.metadata?.concepts ?? []).map((c: any) => c.sys.id));
  const head = [
    f.keywords?.length ? `<p><b>Keywords:</b> ${f.keywords.join(", ")}</p>` : "",
    categories.length ? `<p><b>Topics:</b> ${categories.join(", ")}</p>` : "",
  ].join("");
  return { slug: f.slug, title: f.title, summary: f.summary ?? "", bodyHtml: head + documentToHtmlString(f.bodyCopy, html), categories };
}

// ---------- The sink: upsert into Knowledge and publish ----------
// ponytail: every article lands as the "News" record type (Abstract__c + Body__c). Good enough for
// indexing; map recordType → SF record types if anyone ever reads these in Salesforce.
const NEWS_RT = "012ak00000DBeykAAD";
async function sink(a: FlatArticle) {
  const existing = await soql(`SELECT Id, KnowledgeArticleId, PublishStatus FROM Knowledge__kav WHERE UrlName='${a.slug}' AND PublishStatus IN ('Draft','Online') ORDER BY PublishStatus LIMIT 2`);
  const draft = existing.find((r) => r.PublishStatus === "Draft"); const online = existing.find((r) => r.PublishStatus === "Online");
  let id: string;
  if (draft) id = draft.Id;
  else if (online) id = (await sf(`/knowledgeManagement/articleVersions/masterVersions`, { method: "POST", body: JSON.stringify({ articleId: online.KnowledgeArticleId }) })).id;
  else id = (await sf(`/sobjects/Knowledge__kav`, { method: "POST", body: JSON.stringify({ Title: a.title, UrlName: a.slug, RecordTypeId: NEWS_RT }) })).id;
  await sf(`/sobjects/Knowledge__kav/${id}`, { method: "PATCH", body: JSON.stringify({ Title: a.title, Summary: a.summary.slice(0, 1000), Abstract__c: a.summary, Body__c: a.bodyHtml, IsVisibleInPkb: true }) });
  // Data categories: wipe + re-add on the draft (only drafts accept category edits).
  for (const s of await soql(`SELECT Id FROM Knowledge__DataCategorySelection WHERE ParentId='${id}'`)) await sf(`/sobjects/Knowledge__DataCategorySelection/${s.Id}`, { method: "DELETE" });
  for (const c of a.categories) await sf(`/sobjects/Knowledge__DataCategorySelection`, { method: "POST", body: JSON.stringify({ ParentId: id, DataCategoryGroupName: "Products", DataCategoryName: c }) });
  await sf(`/knowledgeManagement/articleVersions/masterVersions/${id}`, { method: "PATCH", body: JSON.stringify({ publishStatus: "Online" }) });
  return { sfVersionId: id, action: online ? "new-version" : draft ? "published-draft" : "created" };
}
async function retire(slug: string) {
  const online = await soql(`SELECT Id FROM Knowledge__kav WHERE UrlName='${slug}' AND PublishStatus='Online' LIMIT 1`);
  if (!online.length) return { action: "nothing-online" };
  await sf(`/knowledgeManagement/articleVersions/masterVersions/${online[0].Id}`, { method: "PATCH", body: JSON.stringify({ publishStatus: "Archived" }) });
  return { sfVersionId: online[0].Id, action: "archived" };
}

// Contentful is the source of truth. Unpublish/delete webhooks arrive WITHOUT fields (a DeletedEntry),
// so instead of guessing the slug we reconcile: every Online Knowledge article whose UrlName is not
// a currently-published Public Contentful slug gets archived. Idempotent; archive is reversible.
// ponytail: archived articles still count toward the Dev Edition cap — scripts/purge-archived-knowledge.sh
// (run by a human) does the irreversible delete + recycle-bin empty.
async function reconcile(dry: boolean) {
  const slugs = new Set<string>();
  for (let skip = 0; ; skip += 1000) {
    const page = await cda.getEntries({ content_type: "article", "fields.channelVisibility": "Public", select: ["fields.slug"], limit: 1000, skip });
    for (const e of page.items) slugs.add((e.fields as { slug: string }).slug);
    if (page.items.length < 1000) break;
  }
  const online = await soql(`SELECT Id, UrlName, Title FROM Knowledge__kav WHERE PublishStatus='Online'`);
  const stale = online.filter((r) => !slugs.has(r.UrlName));
  if (!dry) for (const r of stale) await sf(`/knowledgeManagement/articleVersions/masterVersions/${r.Id}`, { method: "PATCH", body: JSON.stringify({ publishStatus: "Archived" }) });
  return { action: dry ? "reconcile-dry" : "reconciled", contentfulPublic: slugs.size, knowledgeOnline: online.length, archived: stale.length, sample: stale.slice(0, 5).map((r) => r.UrlName) };
}

// ---------- Route ----------
export async function POST(req: NextRequest) {
  if (req.headers.get("x-webhook-secret") !== process.env.CONTENTFUL_WEBHOOK_SECRET) return NextResponse.json({ error: "bad secret" }, { status: 401 });
  const topic = req.headers.get("x-contentful-topic") ?? "";
  const body = await req.json().catch(() => ({}));
  const entryId: string | undefined = body?.sys?.id;
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (!entryId) return NextResponse.json({ error: "no entry id" }, { status: 400 });
  if (body?.sys?.contentType?.sys?.id && body.sys.contentType.sys.id !== "article") return NextResponse.json({ ignored: body.sys.contentType.sys.id });

  try {
    if (/publish$/i.test(topic) && !/unpublish$/i.test(topic)) {
      const a = await flatten(entryId);
      if (!a) { // not public any more (or not an article) → make sure it's out of the index
        const slug = body?.fields?.slug?.["en-US"]; return NextResponse.json({ entryId, topic, ...(slug ? await retire(slug) : { action: "skipped" }) });
      }
      if (dry) return NextResponse.json({ entryId, topic, dry: true, preview: { ...a, bodyHtml: a.bodyHtml.slice(0, 400) + "…", bodyChars: a.bodyHtml.length } });
      return NextResponse.json({ entryId, topic, slug: a.slug, ...(await sink(a)) });
    }
    if (/unpublish$|delete$|archive$/i.test(topic)) {
      return NextResponse.json({ entryId, topic, ...(await reconcile(dry)) });
    }
    return NextResponse.json({ entryId, topic, action: "ignored-topic" });
  } catch (e: any) {
    return NextResponse.json({ entryId, topic, error: e.message }, { status: 502 });
  }
}

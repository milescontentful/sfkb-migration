// One Contentful client for the whole site.
// Reads PUBLISHED content only (delivery token) — this is what the public site and
// the Salesforce web connector both see, so the sitemap and the search index agree.
import { createClient, type Entry, type EntryFieldTypes } from "contentful";

const SPACE = process.env.CONTENTFUL_SPACE_ID!;
const ENV = process.env.CONTENTFUL_ENVIRONMENT ?? "master";
const CDA_TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN!;

const client = createClient({ space: SPACE, environment: ENV, accessToken: CDA_TOKEN });

// Field shape mirrors the knowledgeArticle content type. Categories are NOT a field:
// they are taxonomy concepts on entry.metadata.concepts (scheme "Products (Salesforce KB)").
export type ArticleSkeleton = {
  contentTypeId: "knowledgeArticle";
  fields: {
    title: EntryFieldTypes.Symbol;
    slug: EntryFieldTypes.Symbol;
    summary?: EntryFieldTypes.Text;
    articleType?: EntryFieldTypes.Symbol; // FAQ | Procedure | News
    question?: EntryFieldTypes.RichText;
    body?: EntryFieldTypes.RichText;
    audience?: EntryFieldTypes.Symbol;
    sfArticleId?: EntryFieldTypes.Symbol;
  };
};
export type Article = Entry<ArticleSkeleton, "WITHOUT_UNRESOLVABLE_LINKS", string>;

// NOTE (2026-09-23): the content type id below is a placeholder. Miles is loading a custom
// content model into master; update CONTENT_TYPE + the fields above once it lands.
const CONTENT_TYPE = "knowledgeArticle";

export async function getArticles(): Promise<Article[]> {
  // ponytail: 1000 is the CDA page max; add paging when the KB passes that.
  try {
    const res = await client.withoutUnresolvableLinks.getEntries<ArticleSkeleton>({
      content_type: CONTENT_TYPE,
      order: ["fields.title"],
      limit: 1000,
    });
    return res.items;
  } catch {
    return []; // content type not there yet → empty site, not a crashed one
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const res = await client.withoutUnresolvableLinks.getEntries<ArticleSkeleton>({
      content_type: CONTENT_TYPE,
      "fields.slug": slug,
      limit: 1,
    });
    return res.items[0] ?? null;
  } catch {
    return null;
  }
}

// Concept id -> human label, from the Delivery API's read-only taxonomy endpoint.
// Fetched once per render pass (Next caches fetch() for the revalidate window).
export async function conceptLabels(): Promise<Record<string, string>> {
  const r = await fetch(
    `https://cdn.contentful.com/spaces/${SPACE}/environments/${ENV}/taxonomy/concepts?limit=1000`,
    { headers: { Authorization: `Bearer ${CDA_TOKEN}` }, next: { revalidate: 300 } },
  );
  if (!r.ok) return {};
  const j = await r.json();
  return Object.fromEntries((j.items ?? []).map((c: { sys: { id: string }; prefLabel: Record<string, string> }) => [c.sys.id, c.prefLabel["en-US"]]));
}

// The article's category labels — rendered as a visible "Topics" row so they are searchable.
export function categoryNames(a: Article, labels: Record<string, string>): string[] {
  const ids = (a.metadata?.concepts ?? []).map((c) => c.sys.id);
  return ids.map((id) => labels[id] ?? id);
}

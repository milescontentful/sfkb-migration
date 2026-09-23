// One Contentful client for the whole site.
// Reads PUBLISHED content only (delivery token) — this is what the public site and
// the Salesforce web connector both see, so the sitemap and the search index agree.
import { createClient, type Entry, type EntryFieldTypes } from "contentful";

const SPACE = process.env.CONTENTFUL_SPACE_ID!;
const ENV = process.env.CONTENTFUL_ENVIRONMENT ?? "master";
const CDA_TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN!;

const client = createClient({ space: SPACE, environment: ENV, accessToken: CDA_TOKEN });

// Miles's custom model (loaded 2026-09-23). Only the fields the site reads are typed;
// entries embedded inside bodyCopy (info panels, images, code, video, accordions, cards)
// are handled loosely in components/RichText.tsx.
export type ArticleSkeleton = {
  contentTypeId: "article";
  fields: {
    title: EntryFieldTypes.Symbol;
    slug: EntryFieldTypes.Symbol;
    publishDate: EntryFieldTypes.Date;
    summary: EntryFieldTypes.Text;
    bodyCopy: EntryFieldTypes.RichText;
    keywords?: EntryFieldTypes.Array<EntryFieldTypes.Symbol>;
    recordType: EntryFieldTypes.Symbol; // FAQ | How To | Technical Doc | Troubleshooting
    channelVisibility: EntryFieldTypes.Symbol; // Public | Customer | Partner | Internal
  };
};
export type Article = Entry<ArticleSkeleton, "WITHOUT_UNRESOLVABLE_LINKS", string>;
export const RECORD_TYPES = ["FAQ", "How To", "Technical Doc", "Troubleshooting"];

// Public site = Public channel only. Anything else never reaches the sitemap or the index.
const PUBLIC = { content_type: "article", "fields.channelVisibility": "Public", include: 4 } as const;

export async function getArticles(): Promise<Article[]> {
  // ponytail: 1000 is the CDA page max; add paging when the KB passes that.
  try {
    const res = await client.withoutUnresolvableLinks.getEntries<ArticleSkeleton>({ ...PUBLIC, order: ["fields.title"], limit: 1000 });
    return res.items;
  } catch {
    return []; // model missing or misnamed → empty site, not a crashed one
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const res = await client.withoutUnresolvableLinks.getEntries<ArticleSkeleton>({ ...PUBLIC, "fields.slug": slug, limit: 1 });
    return res.items[0] ?? null;
  } catch {
    return null;
  }
}

// Concept id -> human label, from the Delivery API's read-only taxonomy endpoint.
export async function conceptLabels(): Promise<Record<string, string>> {
  const r = await fetch(
    `https://cdn.contentful.com/spaces/${SPACE}/environments/${ENV}/taxonomy/concepts?limit=1000`,
    { headers: { Authorization: `Bearer ${CDA_TOKEN}` }, next: { revalidate: 300 } },
  );
  if (!r.ok) return {};
  const j = await r.json();
  return Object.fromEntries((j.items ?? []).map((c: { sys: { id: string }; prefLabel: Record<string, string> }) => [c.sys.id, c.prefLabel["en-US"]]));
}

// Taxonomy concepts on the entry → labels. Rendered as a visible "Topics" row so they are searchable.
export function topicNames(a: Article, labels: Record<string, string>): string[] {
  return (a.metadata?.concepts ?? []).map((c) => labels[c.sys.id] ?? c.sys.id);
}

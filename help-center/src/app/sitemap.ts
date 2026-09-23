// The sitemap IS the search index scope: every published article lands here automatically,
// and the Salesforce Web Content (Sitemap) connector reads exactly this list.
import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/contentful";

export const revalidate = 60; // rebuild at most once a minute

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://servicenext.colorfuldemo.com";
  const articles = await getArticles();
  return [
    { url: base, lastModified: new Date() },
    ...articles.map((a) => ({
      url: `${base}/articles/${a.fields.slug}`,
      lastModified: new Date(a.sys.updatedAt),
    })),
  ];
}

// Renders an article body, including the entries Miles's model lets editors embed in it.
// Every embed renders as real text on the page (not an iframe of Contentful), because the
// Salesforce web connector indexes what it can read in the HTML.
import { documentToReactComponents, type Options } from "@contentful/rich-text-react-renderer";
import { BLOCKS, INLINES, type Document } from "@contentful/rich-text-types";
import type { ReactNode } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Embedded = { sys: { contentType?: { sys: { id: string } } }; fields: any } | undefined;

// Where a link-ish entry (button, hyperlink, menu item, link) points.
function hrefOf(entry: any): string | undefined {
  const t = entry?.fields?.link;
  const type = t?.sys?.contentType?.sys?.id;
  if (type === "article" && t.fields?.slug) return `/articles/${t.fields.slug}`;
  if (type === "page" && t.fields?.slug) return `/${t.fields.slug}`;
  if (type === "externalLink") return t.fields?.link;
  if (typeof t === "string") return t;
  return undefined;
}

function Embed({ entry }: { entry: Embedded }): ReactNode {
  const type = entry?.sys?.contentType?.sys?.id;
  const f = entry?.fields ?? {};
  switch (type) {
    case "infoPanel":
      return (
        <aside className="not-prose my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">{f.type}</p>
          {f.text && <RichText doc={f.text} compact />}
        </aside>
      );
    case "image": {
      const url = f.image?.fields?.file?.url;
      return url ? (
        <figure className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https:${url}?w=1200&fm=webp`} alt={f.altText ?? ""} className="rounded-lg" />
          {f.footnote && <figcaption className="mt-1 text-sm text-zinc-500">{f.footnote}</figcaption>}
        </figure>
      ) : null;
    }
    case "codeEmbed":
      return <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100"><code>{f.code}</code></pre>;
    case "videoEmbed":
      return <div className="not-prose my-6 aspect-video overflow-hidden rounded-lg [&>iframe]:h-full [&>iframe]:w-full" dangerouslySetInnerHTML={{ __html: f.embedCode ?? "" }} />;
    case "accordion":
      return (
        <details className="not-prose my-2 rounded-lg border border-zinc-200 bg-white p-3">
          <summary className="cursor-pointer font-medium">{f.headline}</summary>
          <div className="prose prose-zinc mt-2 max-w-none text-sm">{f.bodyCopy && <RichText doc={f.bodyCopy} compact />}</div>
        </details>
      );
    case "accordions":
      return <div className="my-4">{(f.accordions ?? []).map((a: any, i: number) => <Embed key={i} entry={a} />)}</div>;
    case "card": {
      const href = f.buttons?.[0] ? hrefOf(f.buttons[0]) : undefined;
      return (
        <div className="not-prose rounded-xl border border-zinc-200 bg-white p-4">
          {f.cardBody && <div className="prose prose-zinc max-w-none text-sm"><RichText doc={f.cardBody} compact /></div>}
          {(f.buttons ?? []).map((b: any, i: number) => (
            <a key={i} href={hrefOf(b) ?? href ?? "#"} className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline">{b?.fields?.title} →</a>
          ))}
        </div>
      );
    }
    case "collection":
      return <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">{(f.items ?? []).map((it: any, i: number) => <Embed key={i} entry={it} />)}</div>;
    case "button":
    case "linkText":
    case "link":
      return <a href={hrefOf(entry) ?? "#"} className="font-medium text-amber-700 hover:underline">{f.title ?? f.internalTitle}</a>;
    default:
      // ponytail: unknown embed types render nothing but say so in dev, so a hollow page is visible.
      return process.env.NODE_ENV === "development" ? <p className="text-xs text-red-500">[unrendered embed: {type}]</p> : null;
  }
}

const options: Options = {
  renderNode: {
    [BLOCKS.EMBEDDED_ENTRY]: (node) => <Embed entry={node.data.target} />,
    [INLINES.EMBEDDED_ENTRY]: (node) => <Embed entry={node.data.target} />,
    [INLINES.ENTRY_HYPERLINK]: (node, children) => {
      const t = node.data.target;
      const href = t?.sys?.contentType?.sys?.id === "article" ? `/articles/${t.fields?.slug}` : "#";
      return <a href={href}>{children}</a>;
    },
    [BLOCKS.EMBEDDED_ASSET]: (node) => {
      const url = node.data.target?.fields?.file?.url;
      // eslint-disable-next-line @next/next/no-img-element
      return url ? <img src={`https:${url}?w=1200&fm=webp`} alt={node.data.target?.fields?.title ?? ""} className="rounded-lg" /> : null;
    },
  },
};

export default function RichText({ doc, compact = false }: { doc: Document; compact?: boolean }) {
  return <div className={compact ? "" : "prose prose-zinc max-w-none"}>{documentToReactComponents(doc, options)}</div>;
}

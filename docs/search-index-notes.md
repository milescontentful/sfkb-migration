# Search index notes — Contentful as source of truth, Salesforce as the search engine

_Written 2026-09-23 during hackathon day 1. Observed = we ran it and saw it. Reasoned = from docs or table shapes, not yet run._

## The product names
- **Data 360 Vector Database** (formerly Data Cloud Vector Database) — the storage half.
- **Search Index** — the feature configured on top of it (vector, keyword, or hybrid).
- **Agentforce Data Library** — a wrapper that auto-creates a Search Index from Knowledge or files. Our current index `KA_Brightline_KB` came from a Data Library.

## What is observed (2026-09-23)
- The existing connected-app token (scope `api` only) can run Data 360 SQL: `POST /services/data/v62.0/ssot/query-sql`.
- Index tables exist: `KA_Brightline_KB_index__dlm` (596 rows, one per chunk, holds `VectorEmbedding__c` + `SourceRecordId__c`) and `KA_Brightline_KB_chunk__dlm` (holds `Chunk__c` text, `Citations__c`, `ChunkSequenceNumber__c`).
- Vector search works and ranks correctly:
  ```sql
  SELECT v.score__c, c.Chunk__c
  FROM vector_search(table(KA_Brightline_KB_index__dlm), '<user query>', '', 3) v
  JOIN KA_Brightline_KB_chunk__dlm c ON v.RecordId__c = c.RecordId__c
  ```
  "why is my monthly bill higher than the proposal estimate" → correct article first, score 0.909.
- Data Library index re-syncs published Knowledge roughly every 15 minutes (doc-sourced, NOT measured).

## Decision: Method 1 — Salesforce reads the website (chosen 2026-09-23)
Contentful → Vercel help center (renders articles, publishes `sitemap.xml`) → Data 360 **Web Content (Sitemap) connector** pulls every page in the sitemap → Search Index built on that → agent + page search read it. The Knowledge object is NOT in the loop.

Alternatives kept in reserve:
- Method 2: push via Data 360 Ingestion API into a custom table + Search Index (Contentful-first, instant, most setup, untested).
- Method 3: Knowledge as plumbing via Contentful webhook → Vercel route → `Knowledge__kav` upsert+publish (tested today, ~1 hr to wire; needs Knowledge licensed).

**Verified 2026-09-23:** both connectors are available in this org — `GET /services/data/v62.0/ssot/connectors` lists `uEkSitemap` "Web Content (Sitemap)" and `uEkWebsite` "Web Content (Crawler)" among 103 connectors. Still unverified: refresh interval; page/size limits. Requirements: pages public (no login), `robots.txt` allows the Salesforce bot, HTML/PDF only.

## "Can we search and get articles back? Is all public content indexed?"
- Results come back as **chunks with the source page URL**. Group chunks by URL → one result per article, link straight to the Contentful-rendered page. (Reasoned from the table shape; the Knowledge-based version of this was observed.)
- "All public content" = **every URL listed in the sitemap**, nothing more, nothing less. Pages not in the sitemap are invisible to the index; pages behind login can't be read. So the sitemap IS the index scope — make the site generate it from Contentful automatically.

## What text is searchable (Method 1)
- The connector indexes the page's **rendered visible text** — title, headings, body — as one blob, chunked. Observed on the Knowledge index: top chunk = title + opening body in one piece.
- **Keywords / tags: only if rendered on the page.** The connector does not read Contentful fields, and reading hidden `<meta>` tags is unconfirmed. Render tags as a visible row under the title so they become body text.
- Exact-match needs (part numbers, error codes) → build the index as **hybrid** (vector + keyword). Decide before the first build; it is a rebuild to change.
- Set the connector's "Included Page Element" to the article container so nav/footer text is not indexed.

## Config app — knobs to expose (for later)
The search box calls a Vercel route; the route reads these from Contentful (app installation parameters or a `searchConfig` entry) and applies them per query.

| Knob | Where applied | Status |
|---|---|---|
| Result count (`k`) | query | observed |
| Minimum score threshold | query (filter on `score__c`) | observed (score returned) |
| Language / path / category filter | query `WHERE` on joined metadata | reasoned |
| Fields to return (title, snippet, URL, full chunk) | query | reasoned |
| Keyword-vs-meaning lean | query, only if index built as **hybrid** | reasoned |
| Boost / pin / demote after ranking | Vercel route code | trivial |

Hackathon minimum: result count, min score, language filter.

Knobs that live in Salesforce and require an index rebuild (display-only in the config app): chunk size/overlap, embedding model, index type (vector/keyword/hybrid), which page element the connector reads, sitemap URL patterns, refresh schedule. No public API found for changing these.

Honest limit: this is retrieval tuning (filters, thresholds, counts, reordering), not relevance training. You cannot teach the index "article X is the answer to question Y".

## Taxonomy: SF data categories → Contentful concepts (done 2026-09-23)
- SF side: one data category group **Products**, 10 categories, every one of the 100 articles carries exactly one.
- Contentful side: 10 org-level taxonomy **concepts** `sfkb-partner-api … sfkb-profile`, label = category name with spaces, **notation = exact SF DataCategoryName** (the migration's matching key).
- Grouped under concept scheme **`cs-sfkb-products`** "Products (Salesforce KB)"; `knowledgeArticle` is bound to the SCHEME via `metadata.taxonomy`, so any concept added to the scheme later is automatically allowed on articles. Entries carry concepts in `metadata.concepts`.
- The org was at its cap of 20 schemes; on 2026-09-23 Miles had four stale ones deleted (Marketing asset, Event type, Region, Owners — 38 concepts, none shared) to make room. 16 + this one = 17 of 20 now.
- `knowledgeCategory` content type and the `categories` field were retired (omit → remove → publish).
- Site reads labels from the Delivery API `…/taxonomy/concepts` endpoint (`conceptLabels()` in `help-center/src/lib/contentful.ts`).

## Prior art inside Contentful
- Confluence: "Agentforce + Contentful Dreamforce PoC — Architecture Spec" (John Peden; Joe Meersman built the original Agentforce grounding repo). Their approach ≈ Method 2 (Data 360 reads Contentful metadata). Slack: #tmp-agentforce-web-poc.

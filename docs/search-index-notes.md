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

## Webhook → Knowledge → index (LIVE 2026-09-23)
- Contentful webhook "Search index sync (Salesforce)" (`24yPZnjjUsxilzIPi2I4Y2`) → `POST /api/webhooks/contentful` on the Vercel site. Article entries only; publish/unpublish/delete/archive; `x-webhook-secret` header.
- Publish: fetch published entry (Public channel only) → one HTML doc (Keywords + Topics lines, then body with embedded entries as text) → upsert `Knowledge__kav` (UrlName = slug, News record type, data categories = concept notations) → publish. Unpublish → Archived. `?dry=1` previews without writing. `sink()` is the swap point for the Ingestion API later.
- Search hits whose Knowledge UrlName matches a public Contentful slug link to `/articles/<slug>`.
- Observed 22:48Z: first real publish created `ka0ak000002gOBFAA2` with categories Login, Profile.
- Dev Edition cap facts (observed): 100 articles incl. archived; archiving does NOT free a slot; delete the master `KnowledgeArticle` (kA0), not the version; then empty the recycle bin; the counter lags ~5–10 s (first create after the delete still failed, retry succeeded).
- ⚠ Webhook secret reached prod via `vercel deploy -e` (per-deployment). Run `help-center/vercel-env.sh` once to make it permanent.

## Measured 2026-09-23 evening: publish → searchable
| Hop | Observed |
|---|---|
| Contentful publish → webhook → Knowledge write | seconds (100 publishes, 99 ok + 1 cap error) |
| Knowledge → Data 360 snapshot (`ssot__KnowledgeArticleVersion__dlm`) | stream `Knowledge_kav_Home` runs every ~10–15 min (23:09 run processed 198 = 99 removed + 99 added) |
| Snapshot → search index `KA_Brightline_KB` | did NOT run on its own (last self-run 09-13); manual **Rebuild** 23:12 → READY 23:17 = 5 min for 100 articles / 936 index rows |
| End to end for "Resetting your password" | published 22:48Z → searchable 23:17Z = 29 min, only because of the manual rebuild |

- Webhook "new-version" writes replace the Online version IN PLACE with a new `ka0` Id (VersionNumber and LastPublishedDate unchanged; LastModifiedDate moves). The index keys chunks by that Id, so after a stream refresh every pre-existing chunk is orphaned until the index re-runs → the site showed **zero results for ~8 min** (23:09–23:17). Production fix options: (a) trigger the index run right after the stream (no public API found — the UI Rebuild is Aura action `SemanticSearch.refreshSearchIndex`), (b) Ingestion API path (available in this org's Setup menu), (c) let the site fall back to snippet-only results when a chunk can't be resolved.
- Search route now joins chunks → snapshot for URL name + title, and only returns hits whose URL name is a public Contentful slug. Verified: "how do I reset my password" → 1 linked hit (85%), billing → 3 linked hits, inverter → 3 linked hits; 100/100 articles indexed and aligned, 0 orphan chunks.

## Could the index be faster on a paid edition? (research sweep 2026-09-24, UNVERIFIED)
A 5-angle research sweep gathered 108 sourced claims; the adversarial verification pass was cut short (network outage, then closed by Miles). Treat these as "a source said so", not confirmed. Full raw findings: session workflow `wf_1fd68c47-0b9` journal.
- **CRM stream hop (Knowledge → Data 360):** CRM streams have a free, automatic streaming (CDC-based) mode, but only for objects on Salesforce's supported list; Knowledge article versions are reportedly *unsupported* → batch-only in every edition, same ~10-min platform cycle. `isAccelerationEnabled` is reportedly the Zero-Copy/federation caching flag, irrelevant here. "Run data stream now" API is rejected for CRM streams; only the UI Refresh Now exists.
- **Search index hop:** documented as "incremental and continuous", no cadence number published; community reports 5–15 min after the stream. No API/Apex trigger; Rebuild is a full reprocess and costs credits; Summer '26 adds rebuild-without-downtime.
- **Faster path = Ingestion API:** streaming ingestion documented at ~3 min processing (+~30 s cache), available in Developer Edition, removes the CRM stream hop; requires a custom search index + custom retriever (Data Library won't auto-build on it). Sub-second "real-time" ingestion exists but feeds the real-time layer, not the search index.
- **Dev Edition specifics:** docs reportedly say scheduled refreshes are off ("0 per day"), 1 data space, 10 GB, ~1,000 queries/day; the CRM incremental sync we observed runs anyway. A paid org likely does not speed the Knowledge hop but lifts the caps.
- **Credits:** rebuilds reprocess everything; unstructured processing metered per MB; streaming pipelines billed higher per row than batch.
Decision 2026-09-24: parked. Demo rule stands — publish ≥30 min ahead, or stream (~15 min) + Rebuild (5 min).

## 2026-09-24 morning: content swap Brightline → ZoomInfo (observed)
- Contentful master: 100 Brightline articles deleted, 20 ZoomInfo `article` entries published (no taxonomy concepts on them).
- Webhook: all 26 morning publishes 502'd — Salesforce had expired the route's cached session (`INVALID_SESSION_ID`); routes now refetch on 401 and retry. The 74 unpublish + 100 delete events were no-ops (Contentful sends them without fields) → route now **reconciles** on unpublish/delete (archive Knowledge articles not published in Contentful).
- Ran: reconcile (100 archived) → purge (100 masters deleted, bin emptied) → resync (20 created, 0 failed) between 15:00Z and 15:03Z. Knowledge = exactly Contentful's 20 public articles.
- Stream last ran 14:59:07Z (before the swap); waiting for the next run, then Rebuild.

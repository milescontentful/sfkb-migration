# Hackathon prep — reviewed 2026-09-13

**Event:** "Flying into the Clouds" SE hackathon, Denver office, **Wed Sep 23 – Thu Sep 24** (Envoy badge Sep 22–24).
**Rule (Brett, #hackathon-2026-us, Aug 19):** plan as much as you want, **NO BUILDING until in person.**
**Team sheet:** Team 6 = Mike + Miles. Uri sits alone in Team 7 on the sheet — fix if he's with us.
**Unknown:** judging criteria and demo length. Not posted anywhere Glean can see. Ask Brett.

## Foundation status (2026-09-13 evening)

| Item | Status |
|---|---|
| Agent re-verified | ✅ observed in builder Preview: "How do I get an API token…" → routed General FAQ → AnswerQuestionsWithKnowledge → **Output Evaluation: GROUNDED**, client_credentials + 1-hour token |
| Target space | ✅ created **`01 - Brightline Solar` = `3m1ne1iyqxvp`** (MS Sandbox org, empty on purpose); IDs in `.env.local` |
| App Definition | ✅ created **`43KDrwm5xKCtTQV6E93kHD`** "Salesforce Knowledge Migration", src `http://localhost:3000`, locations app-config + page ("Salesforce Migration" nav item) + entry-sidebar. Swap src to the Vercel URL on demo day |
| Fixture swap | ✅ done 2026-09-13 — org at 100 Online, dump census img=2 pre=6 style=5 table=48. Gotcha: the 100-article cap counts the recycle bin; `Database.emptyRecycleBin` was needed between remove and reload (`sf-kb-seed/out/swap/`) |
| Team access | ✅ Uriel = Contentful space admin · ✅ Mike = Contentful org invite sent (open) · ✅ GitHub push invites to `mpalazzo-dl` + `uriel-reyes` · ✅ Mike's Salesforce user + password email · ⏸ Uriel's Salesforce user (license counter lag) and Mike's space-admin (after he accepts) → `bash scripts/invite-team-2.sh` |

## What is verified live today (observed, not reasoned)

| Check | Result |
|---|---|
| Salesforce client-credentials token | works |
| `Knowledge__kav` Online articles | 100 |
| GitHub `main` | matches local, no branches/PRs, nobody else has pushed |
| Fixtures `sf-kb-seed/out/dump/` | 100 articles, 100 category links, 184 HTML files |
| Contentful target space | **does not exist yet** (checked all 39 spaces) |
| Agentforce agent + Data Library index | **not re-verified since Aug 22** — needs a 5-min browser check (builder API objects not visible via CLI) |

## The hollow spot: fixtures don't exercise the transform rules

`contentful-model.json` promises five transforms. The 100 articles actually in the org only cover two.

| Transform rule | Articles in corpus (300) | Articles loaded in org (100) |
|---|---|---|
| `<table>` → Rich Text table | 120 | 42 ✅ |
| `/articles/Knowledge/{slug}` → entry-hyperlink | 155 | 55 ✅ (14 of 59 targets point outside the loaded 100 → good "broken reference" demo) |
| `<pre>` → code block | 6 | **0** |
| strip `style=` / `<font>` | 5 | **0** |
| `<img>` → Asset | 2 | **0** |

Every loaded article has exactly one category (flat, no parent chain exercised).

**Fix (Salesforce side, allowed now, ~30 min):** archive ~8 loaded FAQ articles, load the 6 `<pre>`, 5 `style=`, 2 `<img>` articles (13 slugs, some overlap) from the corpus, publish, re-run `dump.js`. Then the demo's "before/after" view has something to show for every rule.

## Foundation you can lay before the 23rd (not "building in Contentful")

1. **Fix the fixture gap above** and re-dump.
2. **Re-verify the agent** in the builder simulator (4 test questions in `agent-build-notes.md`). Data Cloud trial features in Dev Edition can lapse.
3. **Decide the app shape** (this is the big one — team decision, then it's just typing):
   - **Recommended:** one Next.js app, deployable to Vercel. API routes proxy Salesforce (client credentials) and call the CMA. Pages = the offer doc's six steps: Connect → Inventory → Map → Run (progress/errors/skipped) → Report → Before/After. Wrap later in an App Framework page location if wanted.
   - Alternative: App Framework app from day one. Costs a backend anyway (browser can't call Salesforce directly) → App Functions. Slower to stand up in 2 days.
4. **HTML→Rich Text path — decided 2026-09-13.** Contentful has NO official HTML→Rich Text library (only `@contentful/rich-text-from-markdown`; internal Jira CCS-2753 for HTML tooling is On Hold). PS's Migration Guidance deck teaches turndown → Markdown → Rich Text, but that chain drops **tables**, our most common feature (42 of 100 loaded articles). Community `contentful-html-rich-text-converter` exists but was last published Jan 2023.
   **Decision:** write our own ~100-line walker: `htmlparser2` → emit `@contentful/rich-text-types` nodes (table, code, hyperlink/entry-hyperlink, embedded-asset-block). Test it against all 184 fixture HTML files on day one. Fallback if short on time: the 2023 community package.
5. **Create the empty target space + CMA token** and put `CONTENTFUL_SPACE_ID` / `CONTENTFUL_MANAGEMENT_TOKEN` in `.env.local`. An empty space is setup; the app creating the content types live *is* part of the demo.
6. **Write the demo script** (allowed): the "One KB, Two Brains" one-pager already has the narrative. Turn it into a 5-minute run: source inventory → mapping → run → report → one article before/after → agent answering the same article in Salesforce.
7. **Ask Brett:** judging criteria, demo slot length, whether pre-existing Salesforce setup counts as "building" (it's data seeding; say so up front).
8. **Day-before checklist:** token curl, `sf org list`, agent simulator, `npm run dev` on a blank scaffold, Vercel login, Contentful login.

## Architecture (decided 2026-09-13 — "as hosted as possible")

**Shape:** a Contentful App Framework app whose frontend AND its one backend route live in a single Next.js repo on Vercel.

| Piece | Where it runs | Why |
|---|---|---|
| `app-config` location | Vercel (iframe in Contentful) | Collects SF My Domain + Consumer Key + Secret + "use sample export" toggle → saved as installation parameters |
| `page` location | Vercel (iframe) | The wizard: Inventory → Map → Run → Report → Before/After. First step checks for `knowledgeArticle`/`knowledgeCategory` and offers **Create model** from `contentful-model.json` |
| `entry-sidebar` on knowledgeArticle (optional) | Vercel (iframe) | Shows SF lineage: article id, version, last synced |
| `/api/sf` route | Vercel serverless | The ONLY backend. Token exchange + describe + paged SOQL. Exists because the browser can't call Salesforce (CORS + secret) |
| Contentful writes | **browser, via `sdk.cma`** | User-scoped client from the App SDK — no tokens stored anywhere; progress UI is free because the browser drives the loop |
| HTML → Rich Text | browser | htmlparser2 walker (item 4) runs client-side |
| Sample export mode | bundled static JSON from `out/dump/` | Wifi/org-outage insurance; also matches the offer's "ingest an export" |

**Constraints that shape the code:**
- Never run the whole migration inside one API call: Vercel routes time out in seconds. The page loops over batches.
- CMA rate limit ≈ 7 req/s → limiter with concurrency ~5. 100 articles × ~3 calls ≈ 1 min. Good progress-bar length.
- Next.js must NOT set `X-Frame-Options: DENY` (default doesn't). HTTPS required (Vercel gives it).
- App SDK only in client components (`'use client'`), init on mount, wrap in `SDKProvider` from `@contentful/react-apps-toolkit`. Styling = Forma 36.
- Installation params are readable by anyone with CMA access to the space. Fine for the demo; say "production: Function secret store" in the pitch.
- Local dev: `npm run dev` + app definition pointed at `http://localhost:3000`; switch to the Vercel URL for the demo.

**Stretch ("even more hosted"):** move `/api/sf` into a Contentful Function called via an App Action (Cloudflare Worker, short execution limit — the batching already fits). Then Vercel is static-only, or drop Vercel and `npm run upload` to Contentful hosting. Sync-back = a Function on `appevent.handler` (Entry publish) writing to `Knowledge__kav`.

**Team split:** Miles = SF proxy + extract/transform/upsert pipeline · Mike = App Framework shell + F36 wizard + Vercel · Uri = report + before/after + help-center page w/ agent embed + pitch.

**Setup records (not code) that can exist before the 23rd:** empty space `01 - Brightline Solar` (plain create, NOT stamped from baseline — the app creates the model live); App Definition with locations app-config + page + entry-sidebar and frontend URL placeholder; Vercel project linked to the GitHub repo.

## Scope tiers for the 2 days

- **Must (day 1):** Connect + Inventory + Map + Run against the real org → entries + categories in Contentful, upsert by `sfArticleId`, publish iff Online. Progress + error + skipped counts on screen.
- **Should (day 2 AM):** Migration report (counts, unmapped fields, 14 broken references), before/after view of one article, cross-link second pass.
- **Could (day 2 PM):** minimal help-center page reading from Contentful; Agentforce chat embed snippet on it.
- **Cut unless ahead:** sync-back to `Knowledge__kav`, locales, image assets (only if fixture fix lands).

## Inputs the app team already has

- `sf-kb-seed/out/dump/` — articles.json, categories.json, describe.json, html/
- `docs/contentful-model.json` — two content types, per-record-type mapping, transform rules
- `.env.local` — SF_DOMAIN, SF_CLIENT_ID, SF_CLIENT_SECRET (working), ANTHROPIC_API_KEY (for AI-suggested mappings if we want that differentiator)
- Architecture one-pager: https://claude.ai/code/artifact/6be7e0da-f5f4-46bc-be80-593578c0e6f0
- Offer doc (defines the six things the app must show): https://app.glean.com/library/e2b21fabfaf94a6691d4b0e94fc70cb8

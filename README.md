# sfkb-migration — Salesforce Knowledge → Contentful

Hackathon project: one knowledge base, two surfaces. A fictional company
(**Brightline Solar**) has ~300 Knowledge articles in Salesforce. An Agentforce
agent answers support questions from them inside Salesforce; a Contentful sync
app migrates the same articles into Contentful to power the public help center.

Deal context: Salesforce's acquisition of Contentful (signed 2026-06-01) —
this demo shows the two products working as one content pipeline.

## What's here

| Path | What it is |
|---|---|
| `docs/RUNBOOK.md` | The full agent-executable runbook (8 phases, verify checks) |
| `docs/org.md` | Dev org URL + username (no secrets) |
| `docs/contentful-model.json` | Target Contentful content types + field mapping + transform rules |
| `sf-kb-seed/` | Salesforce DX project: Knowledge schema, corpus, load scripts |
| `sf-kb-seed/corpus/brightline-kb.json` | The article corpus (seed 36, LLM-expanded to ~300) |

## Quick start

1. `npm i -g @salesforce/cli`
2. `sf org login web --alias kb` (org URL in `docs/org.md`)
3. Follow `docs/RUNBOOK.md` phase by phase — every step has a verify check.

Secrets (Connected App consumer key/secret, Anthropic API key) live in
`.env.local`, which is gitignored — ask Miles for values.

## Mike & Uriel — start here (updated 2026-09-13)

**Read `docs/hackathon-prep.md` first.** It has the event facts, what is verified live,
the architecture we decided on, the scope tiers for the two days, and the team split.

**Rule:** Brett's hackathon rule is *no building until we're in person* (Sep 23–24, Denver).
Everything in this repo so far is data seeding, setup records, and decisions — the app
itself starts on the 23rd.

**What already exists for you:**

| Thing | Where | Notes |
|---|---|---|
| Salesforce dev org, 100 published Knowledge articles | URL in `docs/org.md` | You'll get a password-setup email once Miles runs `scripts/invite-team.sh` |
| Agentforce agent "Brightline Support" | Agentforce Studio in that org | Answers from the KB; verified grounded on 2026-09-13 |
| Contentful target space `01 - Brightline Solar` | space ID `3m1ne1iyqxvp` | **Empty on purpose** — the app creates the content model live in the demo |
| Contentful App Definition "Salesforce Knowledge Migration" | ID `43KDrwm5xKCtTQV6E93kHD` | Locations: app-config, page, entry-sidebar. Frontend URL is `localhost:3000` until we deploy |
| Fixtures (offline copy of the 100 articles) | `sf-kb-seed/out/dump/` | 100 articles + categories + 178 HTML files; covers tables, cross-links, code blocks, inline styles, images |
| Target content model + field mapping | `docs/contentful-model.json` | Two content types; the app's mapping step should reproduce this |
| Salesforce Connected App creds | `.env.local` (gitignored) | Ask Miles; the app's settings screen takes these |

**The one thing to know about the source data:** this Developer Edition org caps Knowledge
at exactly 100 articles, and the cap counts articles in the recycle bin. The full 300-article
corpus lives in `sf-kb-seed/corpus/`.

## Status (2026-09-13)

- ✅ Salesforce side complete (Phases 0–7 below) and re-verified 2026-09-13
- ✅ Fixtures swapped so every transform rule has a real case (img=2, pre=6, style=5, table=48)
- ✅ Contentful target space + App Definition created (empty, by design)
- ✅ Architecture decided — see `docs/hackathon-prep.md`
- ⏭ Phase 8 (the app) starts in person on 2026-09-23

## Status (2026-08-22)

- ✅ Phases 0–2: Knowledge enabled, schema deployed & verified
- ✅ Phase 3: corpus expanded to 300 articles (`corpus/brightline-kb.json`)
- ✅ Phase 4: **100 articles loaded, categorized, and published (Online)** —
  this Developer Edition org caps Knowledge at 100 articles, so the loaded set
  is a proportional sample of the 300-article corpus (56 FAQ / 28 News / 16 Procedure)
- ✅ Phase 5: Connected App live, client-credentials OAuth verified end-to-end
- ✅ Phase 6: JSON fixtures dumped via the Connected App →
  **`sf-kb-seed/out/dump/`** (committed — this + `contentful-model.json` is the
  app team's input: 100 articles, 100 category links, per-field HTML)
- ✅ Phase 7a: Einstein + Agentforce enabled, Data Cloud provisioned
- ✅ Phases 7b–7e: **Brightline Support agent live and answering from the KB**
  (new Agentforce Builder — see `docs/agent-build-notes.md` for the build story
  and the one non-obvious step: the Data Library panel in the builder's Explorer)
- ⏭ Phase 8 (the deliverable): Contentful sync app — all inputs ready in
  `sf-kb-seed/out/dump/` + `docs/contentful-model.json` + `.env.local` creds

## Target architecture (decided 2026-08-22)

**"One KB, Two Brains"** — Contentful becomes the content home (authoring,
taxonomy/topic pages, locales); Salesforce keeps the retrieval index and agent the
customer already owns, fed by a **sync-back** of published entries into
`Knowledge__kav` (the reverse of the extract pipeline in this repo), with the
Agentforce chat widget embedded on the Contentful help center. Full one-pager with
diagrams, option comparison, watchouts, and the localization story:
https://claude.ai/code/artifact/6be7e0da-f5f4-46bc-be80-593578c0e6f0

**Resume point:** Salesforce side is 100% done. Next session starts Phase 8 —
build the Contentful sync app against `out/dump/` fixtures, then reverse it per
the architecture above.

Gotchas hit & fixed (already patched in this repo): `Knowledge__kav` object XML
needed `deploymentStatus` + `sharingModel`; bulk CSV rows containing CRLF fail
LF-mode ingest jobs; `publish-drafts.apex` referenced `IsMasterLanguage`, which
doesn't exist in single-language orgs.

## Help center site (added 2026-09-23)

`help-center/` is the public Next.js site: Contentful is the source of truth, Salesforce Data 360 is the search engine.

- **Live:** https://servicenext.colorfuldemo.com (Vercel project `servicenext`, team `contentful-apps`)
- **Run locally:** `cd help-center && npm install && npm run dev` — needs `help-center/.env.local` (ask Miles; never committed)
- **Search box** → `/api/search` → vector search on the Data 360 index named in `SF_SEARCH_INDEX`
- **Sitemap** (`/sitemap.xml`) lists every published article — it is the scope of the Salesforce Web Content (Sitemap) connector
- **Taxonomy:** SF data categories = Contentful taxonomy concepts `sfkb-*` (notation = SF category name) in scheme `cs-sfkb-products`. Bind it to the article type in Miles's custom model when that lands.
- **Content model:** the space is EMPTY on purpose (2026-09-23) — Miles is loading a custom model into `master`. `docs/contentful-model.json` is the earlier plan, superseded. `help-center/src/lib/contentful.ts` has a placeholder content type id to update.
- `help-center/scripts/seed-from-salesforce.mjs` — reference plumbing (SF → rich text → CMA upsert), not to be run as-is.
- Design notes and the config-app knob list: `docs/search-index-notes.md`

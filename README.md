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

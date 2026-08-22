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
- ✅ Phase 5: Connected App live, client-credentials OAuth verified end-to-end
- ✅ Phase 7a: Einstein + Agentforce enabled, Data Cloud permsets in place
- 🔄 Phase 3: corpus expansion running (target 300 articles)
- ⏭ Phases 4, 6, 7b–7e: bulk load → publish → fixtures → Data Library → agent
- ⏭ Phase 8 (the deliverable): Contentful sync app

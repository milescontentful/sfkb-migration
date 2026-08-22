# sf-kb-seed: Lightning Knowledge test schema + corpus

## 1. Deploy the schema (2 min)
Prereq: Lightning Knowledge already enabled in the org; Salesforce CLI installed (`npm i -g @salesforce/cli`).

    sf org login web --alias kb
    sf project deploy start --target-org kb
    sf org assign permset --name KB_Seed_Fields --target-org kb

This creates:
- Rich text fields: Question__c, Answer__c (FAQ); Procedure_Body__c (Procedure); Abstract__c, Body__c (News)
- Text field: Procedure_Audience__c
- Record types: FAQ, Procedure, News
- Data category group "Products" (Billing > Invoices/Payments, Account, API), assigned to Knowledge
- Permission set making all of the above visible

After deploy, drag the new fields onto the page layouts (Object Manager -> Knowledge -> Page Layouts) so they show in the UI. Fields are already API-accessible.

## 2. Generate + import the corpus (5 min)
The corpus is a realistic KB for a fictional company, **Brightline Solar** (residential solar + monitoring app + partner API): 36 hand-written articles in `corpus/brightline-kb.json` across FAQ (Question/Answer), Procedure (body + audience), and News (abstract + body), with a 5-group category tree, cross-links between articles, tables, code blocks, inline images, and inline styles. To grow it to a few hundred *distinct* articles, run the LLM expander first (idempotent, resumable):

    ANTHROPIC_API_KEY=sk-... node scripts/expand-corpus.js --target 300

It works through a topic plan (10 categories x ~7 subjects x FAQ/Procedure/News), generates 2 articles per call with cross-links to existing slugs, and appends to `corpus/brightline-kb.json`. ~150 API calls for 300 articles; a few minutes and roughly $2-4 on Sonnet. Review a sample before importing. `--synthetic N` is still available for pure volume (cloned variants).
Get the three RecordTypeIds: `sf data query -q "SELECT Id, DeveloperName FROM RecordType WHERE SobjectType='Knowledge__kav'" -o kb`

    RT_FAQ=012... RT_PROCEDURE=012... RT_NEWS=012... node scripts/generate-corpus.js --synthetic 100

Upload `out/articles.zip` at Setup -> Import Articles. Check the import email for the status.

## 3. Publish the drafts
    sf apex run --file scripts/publish-drafts.apex -o kb
Re-run until it reports 0 published (it does 200 per run).

## 4. Dump JSON fixtures for the Contentful app
    SF_DOMAIN=https://yourorg.my.salesforce.com SF_CLIENT_ID=... SF_CLIENT_SECRET=... node scripts/dump.js

Writes out/dump/{describe,articles,categories}.json and out/dump/html/*.html.

## 5. Target Contentful model
`contentful-model.json` holds the two content types, the per-record-type field mapping, and the transform rules. It's the spec the app's Discover/mapping step should reproduce.

# RUNBOOK: Salesforce Knowledge → Contentful demo environment

Agent-executable. Each step is tagged **[CLI]** (Salesforce CLI / Node, no browser), **[PW]** (Playwright, UI-only), or **[MANUAL]** (human decision). Every step has a **Verify** check; do not proceed until it passes. Run from the `sf-kb-seed/` project root.

## Context
- Org: Agentforce Developer Edition (username ends `@agentforce.com`). Lightning Knowledge enabled; user has Knowledge User + Manage Salesforce Knowledge. Data Cloud + Agentforce available in this org type.
- Goal: a realistic 300-article KB for fictional **Brightline Solar** in `Knowledge__kav`, an Agentforce agent answering from it, a Connected App for client-credentials OAuth, and JSON fixtures for the Contentful sync app.
- Deal context: Salesforce acquisition of Contentful signed 2026-06-01, closing Q3 FY27. Do not scrape help.salesforce.com; use Brightline content. Post-close, request an SDO for real Salesforce data.

## Repo map
```
force-app/                 metadata: Knowledge fields, record types, data categories, permset, KnowledgeSettings, ConnectedApp
corpus/brightline-kb.json  36 seed articles (FAQ/Procedure/News)
scripts/expand-corpus.js   LLM expander → ~300 distinct articles (needs ANTHROPIC_API_KEY)
scripts/generate-bulk-csv.js  corpus → CSV for `sf data import bulk` (pure CLI path)
scripts/join-categories.js    inserted Ids → Knowledge__DataCategorySelection CSV
scripts/publish-drafts.apex   publish all drafts
scripts/generate-corpus.js    corpus → Import Articles zip (UI fallback path)
scripts/dump.js               org → JSON fixtures for the Contentful app
contentful-model.json         target content types + field mapping + transform rules
```

---

## Phase 0 — Tooling [CLI]
```bash
npm i -g @salesforce/cli
sf --version
sf org login web --alias kb --set-default          # opens browser once; reuse alias everywhere
sf org display -o kb --json | jq -r .result.instanceUrl  # note the My Domain URL
```
**Verify:** `sf org list` shows `kb` connected.

---

## Phase 1 — Enable Knowledge (if not already) 
### 1a [CLI] Try metadata first
```bash
sf project deploy start -o kb -m KnowledgeSettings
```
**Verify:** `sf data query -o kb -q "SELECT COUNT() FROM Knowledge__kav"` returns a count (0 is fine). If the object doesn't exist, go to 1b.

### 1b [PW] Fallback: UI enable
- URL: `{instanceUrl}/lightning/setup/KnowledgeSettings/home`
- Click **Enable Salesforce Knowledge** (or **Enable Lightning Knowledge**), accept the confirmation checkbox, **Save**.
- This is irreversible; intended.
**Verify:** same query as 1a. Also `sf sobject describe -s Knowledge__kav -o kb --json | jq .result.name` → `Knowledge__kav`.

### 1c [CLI] Ensure your user is a Knowledge User
```bash
sf data query -o kb -q "SELECT Id, UserPermissionsKnowledgeUser FROM User WHERE Username='$(sf org display -o kb --json | jq -r .result.username)'"
# if false:
sf data update record -o kb -s User -w "Username=<username>" -v "UserPermissionsKnowledgeUser=true"
```

---

## Phase 2 — Deploy schema [CLI]
```bash
sf project deploy start -o kb -d force-app/main/default/objects force-app/main/default/datacategorygroups force-app/main/default/permissionsets
sf org assign permset -o kb --name KB_Seed_Fields
```
If the DataCategoryGroup deploy fails (it is the flakiest type), deploy objects + permsets alone and do 2b.

### 2b [PW] Data categories fallback
- URL: `{instanceUrl}/lightning/setup/DataCategorySetup/home`
- New group **Products** (API name `Products`). Add categories in this tree:
  - Billing → Invoices, Payments, Financing
  - Account → Login, Profile
  - Monitoring_App (label "Monitoring App") → Alerts, Reports
  - Installation → Scheduling, Permits
  - Partner_API (label "Partner API")
- Save, then under **Data Category Assignments** assign group to Knowledge.

**Verify:**
```bash
sf data query -o kb -q "SELECT Id, DeveloperName FROM RecordType WHERE SobjectType='Knowledge__kav'" --json > out/recordtypes.json
jq '.result.records | length' out/recordtypes.json     # expect 3
sf sobject describe -s Knowledge__kav -o kb --json | jq '[.result.fields[] | select(.custom) | .name]'   # 6 fields
sf data query -o kb -q "SELECT DataCategoryGroupName FROM Knowledge__DataCategorySelection LIMIT 1"      # no error = group assigned
```

### 2c [PW] Optional: page layouts
Fields are API-accessible without this; only needed to see them in the UI.
- URL: `{instanceUrl}/lightning/setup/ObjectManager/Knowledge__kav/PageLayouts/view`
- Open **Knowledge Layout**, drag Question, Answer, Procedure Body, Procedure Audience, Abstract, Body into the layout, Save.

---

## Phase 3 — Build the corpus [CLI]
### 3a Expand to ~300 articles (optional but recommended)
```bash
ANTHROPIC_API_KEY=sk-... node scripts/expand-corpus.js --target 300
```
Resumable; re-run until it reports target reached. ~150 API calls.
**Verify:** `jq '.articles | length' corpus/brightline-kb.json` ≥ 300. Spot-check 10 articles for consistency (menu paths like "Billing → Invoices", fees, product names "Brightline Home", "Partner API").

### 3b Generate bulk CSV
```bash
node scripts/generate-bulk-csv.js --rt out/recordtypes.json
```
**Verify:** `out/bulk/articles.csv` exists; row count = articles + 1.

---

## Phase 4 — Load articles [CLI]
```bash
sf data import bulk -o kb -s Knowledge__kav -f out/bulk/articles.csv --wait 10
```
**Verify:** `sf data query -o kb -q "SELECT COUNT() FROM Knowledge__kav WHERE PublishStatus='Draft'"` ≈ corpus size. If rows fail on `UrlName` uniqueness, the corpus has duplicate slugs: `jq '.articles[].slug' corpus/brightline-kb.json | sort | uniq -d`.

### 4b Categories
```bash
sf data query -o kb -q "SELECT Id, UrlName FROM Knowledge__kav WHERE PublishStatus='Draft' AND IsLatestVersion=true" --json > out/inserted.json
node scripts/join-categories.js out/inserted.json
sf data import bulk -o kb -s Knowledge__DataCategorySelection -f out/bulk/categories.csv --wait 10
```
**Verify:** `sf data query -o kb -q "SELECT COUNT() FROM Knowledge__DataCategorySelection"` ≈ corpus size.

### 4c Publish
```bash
for i in 1 2 3; do sf apex run -o kb --file scripts/publish-drafts.apex; done
```
Each run publishes up to 200. Loop until debug log says `Published 0`.
**Verify:** `sf data query -o kb -q "SELECT COUNT() FROM Knowledge__kav WHERE PublishStatus='Online'"` = corpus size.

### 4d [PW] Fallback: Import Articles wizard (only if bulk insert is blocked)
```bash
RT_FAQ=$(jq -r '.result.records[]|select(.DeveloperName=="FAQ").Id' out/recordtypes.json) \
RT_PROCEDURE=$(jq -r '.result.records[]|select(.DeveloperName=="Procedure").Id' out/recordtypes.json) \
RT_NEWS=$(jq -r '.result.records[]|select(.DeveloperName=="News").Id' out/recordtypes.json) \
node scripts/generate-corpus.js
```
- URL: `{instanceUrl}/lightning/setup/KnowledgeImportArticles/home` → upload `out/articles.zip` → Import. Status arrives by email. Then 4c.

---

## Phase 5 — Connected App for the Contentful sync
### 5a [CLI] Deploy
Edit `force-app/main/default/connectedApps/Contentful_KB_Sync.connectedApp-meta.xml`: set `contactEmail`. Then:
```bash
sf project deploy start -o kb -m ConnectedApp:Contentful_KB_Sync
```
### 5b [PW] Read secret + set Run-As user (UI-only)
- URL: `{instanceUrl}/lightning/setup/NavigationMenus/home` is NOT it; go to `{instanceUrl}/lightning/setup/ConnectedApplication/home` → **Contentful KB Sync** → **Manage Consumer Details** (may prompt for a verification code sent by email) → capture **Consumer Key** and **Consumer Secret**.
- Back on the app → **Manage** → **Edit Policies** → Client Credentials Flow → **Run As**: pick your admin user (or a dedicated integration user with Knowledge User + Read on Knowledge__kav) → Save.
- If **Enable Client Credentials Flow** is unchecked on the app (metadata flag sometimes ignored), edit the app and check it.
- Allow ~5 minutes for propagation before the first token call.

**Verify:**
```bash
curl -s -X POST "{instanceUrl}/services/oauth2/token" -d grant_type=client_credentials -d client_id=$SF_CLIENT_ID -d client_secret=$SF_CLIENT_SECRET | jq .access_token
```
Store `SF_DOMAIN`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET` in a password manager; these are what the Contentful app's config screen will ask for.

---

## Phase 6 — JSON fixtures for the Contentful app [CLI]
```bash
SF_DOMAIN={instanceUrl} SF_CLIENT_ID=... SF_CLIENT_SECRET=... node scripts/dump.js
```
**Verify:** `out/dump/articles.json` count = Online articles; `out/dump/html/` has one file per rich-text field per article; `out/dump/describe.json` lists the 6 custom fields. Hand `out/dump/` + `contentful-model.json` to the app team.

---

## Phase 7 — Agentforce agent on the same KB
All UI; there is no reliable metadata path for Data Libraries or agent activation yet.

### 7a [PW] Prerequisites
- `{instanceUrl}/lightning/setup/EinsteinSetup/home` → turn on **Einstein** (generative AI).
- `{instanceUrl}/lightning/setup/EinsteinCopilot/home` (Agentforce Agents) → **Enable Agentforce** if the toggle is present.
- `{instanceUrl}/lightning/setup/DataCloudSetup/home` → confirm Data Cloud shows as provisioned. Assign yourself the **Data Cloud Admin** permission set: `sf org assign permset -o kb --name DataCloudAdmin` (name may vary; list with `sf data query -o kb -q "SELECT Name FROM PermissionSet WHERE Name LIKE '%DataCloud%'"`).

### 7b [PW] Data Library
- URL: `{instanceUrl}/lightning/setup/EinsteinDataLibrary/home` → **New** → name `Brightline KB` → source **Knowledge**.
- Content fields: Title, Summary, Question__c, Answer__c, Procedure_Body__c, Body__c. (Omit Abstract__c; duplicates Summary.)
- Leave data category filter empty for the main demo (make a second library filtered to Billing later if you want the "scoped agent" demo).
- Save. Wait for **Search Index status = Ready** (check the Search Index tab; index is named `KA_Brightline_KB`). 10–20 min for 300 articles.
**Verify [PW]:** Data Explorer → DLO `Knowledge_Kav_Home` shows rows ≈ corpus size.

### 7c [PW] Agent
- `{instanceUrl}/lightning/setup/EinsteinCopilot/home` → **New Agent** → **Agentforce Service Agent**.
- Name: `Brightline Support`. Role/company description: "Brightline Solar is a residential solar installer. Customers use the Brightline Home app for production monitoring, billing, alerts and battery control; partners use the Partner API."
- Topics: deselect Case Management / Account Management; keep **General FAQ** (contains **Answer Questions with Knowledge**). Attach Data Library `Brightline KB`.
- Save → **Activate**.

### 7d [CLI] Permissions the agent user needs (the #1 failure cause)
```bash
sf data query -o kb -q "SELECT Id, Username FROM User WHERE Name LIKE '%Agentforce%' OR Username LIKE '%agent%'"
# Grant Read on Knowledge__kav to that user via permset, and ensure it has the PSG:
sf data query -o kb -q "SELECT Id, DeveloperName FROM PermissionSetGroup WHERE DeveloperName LIKE '%AgentforceServiceAgent%'"
```
Assign `AgentforceServiceAgentUserPsg` and a permset granting Read on Knowledge__kav to the agent user (Setup → Users → agent user → Permission Set Groups, or `sf org assign permset --on-behalf-of <agent username>`).

### 7e [MANUAL] Demo script (Agent Builder preview)
1. "Why is my bill higher than my proposal said?" → expect utility true-up + 85% threshold.
2. "My app shows a red dot, what do I do?" → expect alert table + inverter restart steps.
3. "How do I get an API token?" → expect client credentials endpoint.
4. "Can I pay off my loan early?" → expect re-amortization vs term reduction.
If the agent says it can't find an answer: (a) confirm articles are **Online** not Draft, (b) rebuild the search index, (c) re-check 7d.

---

## Phase 8 — Contentful side (hackathon deliverable, not part of this runbook)
Inputs produced above: `out/dump/`, `contentful-model.json`, Connected App credentials. Flow: app-config screen takes My Domain + Consumer Key + Secret → backend runs describe → user maps fields → extract (SOQL/Bulk) → transform (HTML→Rich Text, images→Assets, `/articles/Knowledge/{slug}` links→entry-hyperlinks, categories→`knowledgeCategory` entries) → upsert by `sfArticleId` → publish if Online.

Narrative: one `Knowledge__kav`, two surfaces. Agentforce answers support questions in Salesforce; Contentful renders the public help center; the sync keeps them aligned.

---

## Playwright notes
- Log in once via `sf org open -o kb --url-only` → gives a frontdoor URL with a session; navigate Playwright to it to skip MFA. Regenerate per run (short-lived).
- Lightning Setup pages render in iframes for Classic-era pages (Knowledge Settings, Data Category Setup, Connected App details). Use `frameLocator('iframe[title*="Setup"]')` or `page.frames()` and match on URL containing `/setup/`.
- Prefer `getByRole('button', { name: /enable|save|new/i })` over CSS; Lightning DOM class names change per release.
- After Save actions, wait for network idle plus a `toast` (`.slds-notify`) or re-query via CLI rather than trusting the DOM.
- Connected App "Manage Consumer Details" may trigger an email verification code; pause for human input there.

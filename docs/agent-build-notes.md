# Agent build notes — 2026-08-22 (new Agentforce Builder)

The runbook's Phase 7 was written for the classic agent wizard. This org (Winter '27 /
v67) has **replaced it with the new Agentforce Builder** (Agent Script based). What that
changed, what's done, and the one open blocker.

## Done and verified
- Agent **Brightline Support** (`Brightline_Support`) exists, created from the
  Agentforce Service Agent template. Project ID `1bYak000000OKNNEA4`.
- Brightline company context + welcome message set; router trimmed to exactly
  **General FAQ / Escalation / Off Topic** (Case/Account/Reservation/Delivery/Order
  Inquiries and Ambiguous Question removed). **Compiles with zero errors.**
- Data library **Brightline KB** (`Brightline_KB`) — index status **Ready**,
  retriever `KA_Brightline_KB_1Cx_tM532a1e337` (asset `1Cxak000000K2iPCAS`).
- Agent user (`brightline_support…@….ext`) has `AgentforceServiceAgentUserPsg`,
  `AgentforceServiceAgentSecureBase`, and `KB_Seed_Fields` (Read + all fields on
  `Knowledge__kav`).

## Open blocker: RAG feature assignment
The GeneralFAQ knowledge action fails at runtime: *missing RAG feature configuration*.
Root cause (confirmed three ways): `ragFeatureConfigId` must be the developer name of a
**GenAiRetrievalConfig** record, which Salesforce only creates when a data library is
**formally assigned to an agent feature** — and the Brightline KB library still shows
**Feature Assignments: Unassigned**. Writing the library API name or the retriever API
name into the script does not work; the record must exist first.

Paths tried that do NOT create the assignment in this release:
- Agent Script edit (both `Brightline_KB` and retriever API name) → runtime failure
- Builder → Add Resource → "Add from Asset Library" (subagents only) / "Add
  connections" (channels only)
- Data library row menu (Edit/Delete only), header menu, Studio agent list
- Commit Version (goes through with clean compile, but assignment stays Unassigned;
  version label also still shows Draft — possibly async)
- The builder's own dev agent states the assignment "cannot be done through Agent
  Script or this authoring agent"

## Next things to try (human eyes, ~10 min)
1. In Agentforce Builder, look for a **Data Libraries / Grounding** panel — possibly an
   icon-only sidebar or under the GeneralFAQ action node's config (click the action
   card → gear). A human may spot what DOM snapshots missed.
2. After ANY successful assignment: run
   `SELECT Id, DeveloperName FROM GenAiRetrievalConfig` (Developer Console — object is
   not visible to the API user via CLI), put that DeveloperName into
   `rag_feature_config_id` in the agent script, Save, Reset Simulator, re-test.
3. If the panel genuinely doesn't exist in this release, this is a product gap for
   script-created agents — check release notes / open a case, or demo the
   Salesforce→Contentful sync (the actual deliverable) with the agent teased separately.

## Demo test script (once retrieval works)
1. "Why is my monthly bill higher than the estimate in my proposal?" → utility true-up + 85% threshold
2. "My app shows a red dot, what do I do?" → alert table + inverter restart
3. "How do I get an API token?" → client credentials endpoint
4. "Can I pay off my loan early?" → re-amortization vs term reduction

#!/usr/bin/env node
// REFERENCE ONLY — DO NOT RUN AGAINST THE DEMO SPACE.
// Ran once on 2026-09-23 (100 articles in, then deleted the same day): Miles is loading his own
// custom content model, so the `knowledgeArticle` shape this targets no longer exists.
// Kept because the plumbing is what the migration app needs: Salesforce client-credentials token,
// paged SOQL, data-category → taxonomy concept tagging, HTML → rich text, idempotent CMA upsert
// keyed on entry id sf-<KnowledgeArticleId>, publish.
//
// Run from help-center/:  node scripts/seed-from-salesforce.mjs [--dry]
// Reads: help-center/.env.local (Salesforce + space), ~/.contentfulrc.json (CMA token),
//        docs/contentful-model.json (field mapping per record type).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import TurndownService from "turndown";
import { richTextFromMarkdown } from "@contentful/rich-text-from-markdown";

const here = path.dirname(new URL(import.meta.url).pathname);
const env = Object.fromEntries(
  fs.readFileSync(path.join(here, "..", ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const CMA = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".contentfulrc.json"), "utf8")).managementToken;
const model = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "docs", "contentful-model.json"), "utf8"));
const DRY = process.argv.includes("--dry");
const SF = env.SF_DOMAIN.replace(/\/$/, "");
const SPACE = env.CONTENTFUL_SPACE_ID, ENV = env.CONTENTFUL_ENVIRONMENT ?? "master";
const CT_BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Salesforce ----------
async function sfToken() {
  const r = await fetch(`${SF}/services/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.SF_CLIENT_ID, client_secret: env.SF_CLIENT_SECRET }),
  });
  const j = await r.json(); if (!j.access_token) throw new Error(JSON.stringify(j)); return j.access_token;
}
async function soql(token, q) {
  let url = `${SF}/services/data/v62.0/query?q=${encodeURIComponent(q)}`, out = [];
  while (url) {
    const j = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j[0]?.errorCode) throw new Error(JSON.stringify(j));
    out.push(...j.records); url = j.nextRecordsUrl ? `${SF}${j.nextRecordsUrl}` : null;
  }
  return out;
}

// ---------- HTML -> Rich Text (stopgap quality: headings, paragraphs, lists, bold, links) ----------
const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
td.remove(["style", "script"]);
async function htmlToRichText(html) {
  if (!html) return undefined;
  const md = td.turndown(html);
  // Unsupported nodes (images, tables, raw html) become null and are dropped — the real converter handles them.
  return richTextFromMarkdown(md, async () => null);
}

// ---------- Contentful ----------
const cma = (p, init = {}) => fetch(`${CT_BASE}${p}`, {
  ...init, headers: { Authorization: `Bearer ${CMA}`, "Content-Type": "application/vnd.contentful.management.v1+json", ...(init.headers ?? {}) },
});
async function upsertEntry(id, fields, concepts) {
  const cur = await cma(`/entries/${id}`); const version = cur.status === 200 ? (await cur.json()).sys.version : undefined;
  const body = { fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { "en-US": v }])),
                 metadata: { tags: [], concepts: concepts.map((c) => ({ sys: { type: "Link", linkType: "TaxonomyConcept", id: c } })) } };
  const r = await cma(`/entries/${id}`, { method: "PUT", body: JSON.stringify(body),
    headers: { "X-Contentful-Content-Type": "knowledgeArticle", ...(version ? { "X-Contentful-Version": String(version) } : {}) } });
  const j = await r.json(); if (!j.sys?.version) throw new Error(`${id}: ${JSON.stringify(j).slice(0, 300)}`);
  await sleep(150);
  const p = await cma(`/entries/${id}/published`, { method: "PUT", headers: { "X-Contentful-Version": String(j.sys.version) } });
  if (p.status !== 200) throw new Error(`${id} publish: ${(await p.text()).slice(0, 300)}`);
  await sleep(150);
  return version ? "updated" : "created";
}

// ---------- main ----------
const token = await sfToken();
const sfFields = new Set([...Object.keys(model.fieldMapping._common), ...["FAQ", "News", "Procedure"].flatMap((t) => Object.keys(model.fieldMapping[t]))]);
const articles = await soql(token, `SELECT Id, ${[...sfFields].join(", ")} FROM Knowledge__kav WHERE PublishStatus='Online' AND Language='en_US'`);
const cats = await soql(token, "SELECT ParentId, DataCategoryName FROM Knowledge__DataCategorySelection");
const catsByArticle = new Map(); for (const c of cats) catsByArticle.set(c.ParentId, [...(catsByArticle.get(c.ParentId) ?? []), c.DataCategoryName]);
const conceptId = (sfName) => `sfkb-${sfName.toLowerCase().replace(/_/g, "-")}`;
const get = (rec, p) => p.split(".").reduce((o, k) => o?.[k], rec);
console.log(`${articles.length} online articles, ${cats.length} category selections${DRY ? " (dry run)" : ""}`);

const tally = { created: 0, updated: 0, failed: 0, byType: {} };
for (const a of articles) {
  const type = get(a, "RecordType.DeveloperName");
  const mapping = { ...model.fieldMapping._common, ...(model.fieldMapping[type] ?? {}) };
  const fields = {};
  for (const [sf, cf] of Object.entries(mapping)) {
    const v = get(a, sf); if (v == null) continue;
    fields[cf] = ["question", "body"].includes(cf) ? await htmlToRichText(v) : v;
  }
  if (typeof fields.sfLastPublished === "string") fields.sfLastPublished = fields.sfLastPublished.slice(0, 10);
  const concepts = (catsByArticle.get(a.Id) ?? []).map(conceptId);
  const id = `sf-${a.KnowledgeArticleId}`;
  tally.byType[type] = (tally.byType[type] ?? 0) + 1;
  if (DRY) { console.log(`${id} ${type} "${fields.title}" slug=${fields.slug} concepts=${concepts.join(",")} fields=${Object.keys(fields).join(",")}`); continue; }
  try { tally[await upsertEntry(id, fields, concepts)]++; process.stdout.write("."); }
  catch (e) { tally.failed++; console.error(`\nFAIL ${e.message}`); }
}
console.log("\n", tally);

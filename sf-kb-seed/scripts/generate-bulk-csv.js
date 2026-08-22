#!/usr/bin/env node
// CLI-only alternative to Import Articles: emits CSVs for `sf data import bulk`.
// Usage: node scripts/generate-bulk-csv.js --rt out/recordtypes.json [--synthetic N]
// Outputs: out/bulk/articles.csv (Knowledge__kav insert, HTML inline), out/bulk/categories.csv (after insert)
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const rtFile = arg('--rt'); if (!rtFile) { console.error('--rt out/recordtypes.json required (from sf data query --json)'); process.exit(1); }
const rtJson = JSON.parse(fs.readFileSync(rtFile)); const recs = rtJson.result ? rtJson.result.records : rtJson;
const RT = Object.fromEntries(recs.map(r => [r.DeveloperName, r.Id]));
const synthetic = parseInt(arg('--synthetic', '0'), 10);
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'corpus', 'brightline-kb.json')));
const articles = [...corpus.articles];
for (let i = 0; i < synthetic; i++) { const s = corpus.articles[i % corpus.articles.length]; articles.push({ ...s, slug: `${s.slug}-copy-${i}`, title: `${s.title} (variant ${i})` }); }
const OUT = path.join(__dirname, '..', 'out', 'bulk'); fs.mkdirSync(OUT, { recursive: true });
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cols = ['Title','UrlName','Summary','Language','RecordTypeId','Question__c','Answer__c','Procedure_Body__c','Procedure_Audience__c','Abstract__c','Body__c'];
const rows = articles.map(a => ({ Title: a.title, UrlName: a.slug, Summary: a.summary, Language: 'en_US', RecordTypeId: RT[a.type],
  Question__c: a.type === 'FAQ' ? a.question : '', Answer__c: a.type === 'FAQ' ? a.answer : '',
  Procedure_Body__c: a.type === 'Procedure' ? a.body : '', Procedure_Audience__c: a.type === 'Procedure' ? a.audience : '',
  Abstract__c: a.type === 'News' ? a.abstract : '', Body__c: a.type === 'News' ? a.body : '' }));
fs.writeFileSync(path.join(OUT, 'articles.csv'), [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
// category map by UrlName; categories.csv is built after insert by join-categories.js
fs.writeFileSync(path.join(OUT, 'slug-category.json'), JSON.stringify(Object.fromEntries(articles.map(a => [a.slug, a.category])), null, 2));
console.log(`Wrote ${rows.length} rows -> out/bulk/articles.csv`);
if (Object.values(RT).length < 3) console.warn('WARNING: fewer than 3 record types found');

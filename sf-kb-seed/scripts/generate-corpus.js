#!/usr/bin/env node
// Builds an "Import Articles" zip from corpus/brightline-kb.json (a realistic KB for a
// fictional solar company) and optionally pads it with --synthetic N extra articles.
// Usage: RT_FAQ=012.. RT_PROCEDURE=012.. RT_NEWS=012.. node scripts/generate-corpus.js [--synthetic 150]
// Output: out/articles.zip  -> upload at Setup -> Import Articles
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const RT = { FAQ: process.env.RT_FAQ, Procedure: process.env.RT_PROCEDURE, News: process.env.RT_NEWS };
const synthetic = parseInt((process.argv.indexOf('--synthetic') > -1 && process.argv[process.argv.indexOf('--synthetic') + 1]) || '0', 10);
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'corpus', 'brightline-kb.json')));
const OUT = path.join(__dirname, '..', 'out'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'html'), { recursive: true });

const articles = [...corpus.articles];
// Optional synthetic padding to test volume/rate limits; clones real articles with new slugs
for (let i = 0; i < synthetic; i++) {
  const src = corpus.articles[i % corpus.articles.length];
  articles.push({ ...src, slug: `${src.slug}-copy-${i}`, title: `${src.title} (variant ${i})` });
}

const cols = ['isMasterLanguage','Title','Summary','UrlName','RecordTypeId','Products','Question__c','Answer__c','Procedure_Body__c','Procedure_Audience__c','Abstract__c','Body__c'];
const rows = articles.map(a => {
  const r = Object.fromEntries(cols.map(c => [c, '']));
  r.isMasterLanguage = 1; r.Title = a.title; r.Summary = a.summary; r.UrlName = a.slug;
  r.RecordTypeId = RT[a.type] || '012XXXXXXXXXXXXXXX'; r.Products = a.category;
  const w = (f, html) => { const p = `html/${a.slug}-${f}.html`; fs.writeFileSync(path.join(OUT, p), html); r[f] = p; };
  if (a.type === 'FAQ') { w('Question__c', a.question); w('Answer__c', a.answer); }
  if (a.type === 'Procedure') { w('Procedure_Body__c', a.body); r.Procedure_Audience__c = a.audience || ''; }
  if (a.type === 'News') { w('Abstract__c', a.abstract); w('Body__c', a.body); }
  return r;
});
const esc = v => `"${String(v).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(OUT, 'articles.csv'), [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
fs.writeFileSync(path.join(OUT, 'articles.properties'), 'DateFormat=yyyy-MM-dd\nCSVEncoding=UTF-8\nCSVSeparator=,\nRTAEncoding=UTF-8\n');
execSync(`cd "${OUT}" && zip -qr articles.zip articles.csv articles.properties html`);
console.log(`Wrote ${rows.length} articles (${corpus.articles.length} real + ${synthetic} synthetic) -> out/articles.zip`);
if (Object.values(RT).some(v => !v)) console.warn('WARNING: set RT_FAQ / RT_PROCEDURE / RT_NEWS env vars (RecordTypeIds) before importing.');

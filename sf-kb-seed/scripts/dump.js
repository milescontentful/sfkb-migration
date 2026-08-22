#!/usr/bin/env node
// Dumps Knowledge articles + categories + describe to out/dump/ as JSON fixtures.
// Env: SF_DOMAIN=https://yourorg.my.salesforce.com SF_CLIENT_ID=... SF_CLIENT_SECRET=...
const fs = require('fs'); const path = require('path');
const D = path.join(__dirname, '..', 'out', 'dump'); fs.mkdirSync(path.join(D, 'html'), { recursive: true });
const V = 'v62.0';
(async () => {
  const tok = await (await fetch(`${process.env.SF_DOMAIN}/services/oauth2/token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SF_CLIENT_ID, client_secret: process.env.SF_CLIENT_SECRET }) })).json();
  if (!tok.access_token) throw new Error(JSON.stringify(tok));
  const base = tok.instance_url, H = { Authorization: `Bearer ${tok.access_token}` };
  const get = async u => (await fetch(u.startsWith('http') ? u : base + u, { headers: H })).json();
  const soql = async q => { let r = await get(`/services/data/${V}/query?q=${encodeURIComponent(q)}`), out = r.records;
    while (!r.done) { r = await get(r.nextRecordsUrl); out = out.concat(r.records); } return out; };

  const describe = await get(`/services/data/${V}/sobjects/Knowledge__kav/describe`);
  fs.writeFileSync(path.join(D, 'describe.json'), JSON.stringify(describe, null, 2));
  const rich = describe.fields.filter(f => f.type === 'textarea' && f.htmlFormatted).map(f => f.name);
  const custom = describe.fields.filter(f => f.custom).map(f => f.name);
  const fields = ['Id','KnowledgeArticleId','Title','UrlName','Summary','Language','VersionNumber','PublishStatus','IsLatestVersion','LastPublishedDate','RecordType.DeveloperName', ...custom];
  const articles = await soql(`SELECT ${fields.join(',')} FROM Knowledge__kav WHERE IsLatestVersion=true`);
  for (const a of articles) for (const f of rich) if (a[f]) fs.writeFileSync(path.join(D, 'html', `${a.Id}-${f}.html`), a[f]);
  fs.writeFileSync(path.join(D, 'articles.json'), JSON.stringify(articles, null, 2));
  const cats = await soql(`SELECT Id, ParentId, DataCategoryGroupName, DataCategoryName FROM Knowledge__DataCategorySelection`);
  fs.writeFileSync(path.join(D, 'categories.json'), JSON.stringify(cats, null, 2));
  console.log(`articles=${articles.length} categories=${cats.length} richTextFields=${rich.join(',')}`);
})();

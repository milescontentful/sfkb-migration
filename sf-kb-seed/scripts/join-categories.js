#!/usr/bin/env node
// After articles are inserted: join inserted Ids to categories -> out/bulk/categories.csv
// Usage: node scripts/join-categories.js out/inserted.json   (from: sf data query -q "SELECT Id, UrlName FROM Knowledge__kav WHERE PublishStatus='Draft'" --json)
const fs = require('fs'), path = require('path');
const q = JSON.parse(fs.readFileSync(process.argv[2])); const recs = q.result ? q.result.records : q;
const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'out', 'bulk', 'slug-category.json')));
const norm = c => c.replace(/ /g, '_'); // Data category API names: "Partner API" -> Partner_API
const rows = recs.filter(r => map[r.UrlName]).map(r => `${r.Id},Products,${norm(map[r.UrlName])}`);
fs.writeFileSync(path.join(__dirname, '..', 'out', 'bulk', 'categories.csv'), ['ParentId,DataCategoryGroupName,DataCategoryName', ...rows].join('\n'));
console.log(`Wrote ${rows.length} category rows -> out/bulk/categories.csv`);

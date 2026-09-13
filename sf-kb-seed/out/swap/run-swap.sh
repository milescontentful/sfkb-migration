#!/usr/bin/env bash
# Swap 12 loaded FAQ articles (chosen because nothing links to them) for the 12 corpus articles
# that carry <pre>, style=, or <img>, so every transform rule in docs/contentful-model.json has a
# real fixture in the org. Run from anywhere:  bash sf-kb-seed/out/swap/run-swap.sh
# Steps 1–2 change the org (archive + remove 12 articles; corpus + old dump stay in git).
set -euo pipefail
cd "$(dirname "$0")/../.."          # -> sf-kb-seed/
W=out/swap

echo "== 1 archive 12 Online articles"
sf apex run -o kb --file $W/archive.apex | grep -E 'Archived|Exception' || true

echo "== 2 remove the 12 archived articles (frees the Dev Edition 100-article cap)"
sf apex run -o kb --file $W/delete-archived.apex | grep -E 'Deleted|Exception' || true

echo "== 3 load the 12 feature articles"
sf data import bulk -o kb -s Knowledge__kav -f $W/add-articles.csv --wait 10

echo "== 4 categories"
sf data query -o kb -q "SELECT Id, UrlName FROM Knowledge__kav WHERE PublishStatus='Draft' AND IsLatestVersion=true" --json > $W/inserted.json
node -e "
const fs=require('fs');
const q=JSON.parse(fs.readFileSync('$W/inserted.json'));
const m=JSON.parse(fs.readFileSync('$W/add-slug-category.json'));
const rows=q.result.records.filter(r=>m[r.UrlName]).map(r=>r.Id+',Products,'+m[r.UrlName].replace(/ /g,'_'));
fs.writeFileSync('$W/add-categories.csv',['ParentId,DataCategoryGroupName,DataCategoryName',...rows].join('\n'));
console.log('category rows='+rows.length)"
sf data import bulk -o kb -s Knowledge__DataCategorySelection -f $W/add-categories.csv --wait 10

echo "== 5 publish"
sf apex run -o kb --file scripts/publish-drafts.apex | grep -E 'Published|Exception' || true

echo "== 6 verify (expect Online 100)"
sf data query -o kb -q "SELECT PublishStatus, COUNT(Id) n FROM Knowledge__kav WHERE IsLatestVersion=true GROUP BY PublishStatus"

echo "== 7 re-dump fixtures"
set -a; source ../.env.local; set +a
node scripts/dump.js
cd out/dump/html
echo "fixture census: img=$(grep -l '<img' * | wc -l) pre=$(grep -l '<pre' * | wc -l) style=$(grep -l 'style=' * | wc -l) table=$(grep -l '<table' * | wc -l)"
echo "expect: img=2 pre=6 style=5 (before the swap all three were 0)"

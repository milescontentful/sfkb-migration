#!/usr/bin/env bash
# Resume the swap after steps 1–2 (archive + remove) already ran on 2026-09-13.
# The first attempt at step 3 failed with "Article limit exceeded" because the 12 removed
# articles were still in the recycle bin and count toward the 100-article cap.
# Run from anywhere:  bash sf-kb-seed/out/swap/run-swap-resume.sh
set -euo pipefail
cd "$(dirname "$0")/../.."          # -> sf-kb-seed/
W=out/swap

echo "== 2b purge recycle bin (frees the cap)"
sf apex run -o kb --file $W/purge-recycle-bin.apex | grep -E 'Purged|Exception' || true

echo "== 3 load the 12 feature articles"
sf data import bulk -o kb -s Knowledge__kav -f $W/add-articles.csv --wait 10 --json \
  | jq -c '{status: .result.status, ok: .result.successfulRecords, failed: .result.failedRecords, job: .result.jobId}'

echo "== 4 categories"
sf data query -o kb -q "SELECT Id, UrlName FROM Knowledge__kav WHERE PublishStatus='Draft' AND IsLatestVersion=true" --json > $W/inserted.json
node -e "
const fs=require('fs');
const q=JSON.parse(fs.readFileSync('$W/inserted.json'));
const m=JSON.parse(fs.readFileSync('$W/add-slug-category.json'));
const rows=q.result.records.filter(r=>m[r.UrlName]).map(r=>r.Id+',Products,'+m[r.UrlName].replace(/ /g,'_'));
fs.writeFileSync('$W/add-categories.csv',['ParentId,DataCategoryGroupName,DataCategoryName',...rows].join('\n'));
console.log('category rows='+rows.length)"
sf data import bulk -o kb -s Knowledge__DataCategorySelection -f $W/add-categories.csv --wait 10 --json \
  | jq -c '{status: .result.status, ok: .result.successfulRecords, failed: .result.failedRecords}'

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

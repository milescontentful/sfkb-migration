#!/usr/bin/env bash
# Permanently delete every ARCHIVED Salesforce Knowledge article and empty the recycle bin.
#
# Why: the webhook archives Knowledge articles that Contentful no longer publishes (reversible),
# but the Dev Edition 100-article cap counts archived articles and the recycle bin, so new
# Contentful articles cannot be created until the archived ones are purged. This is the
# irreversible half, kept in a script a human runs on purpose.
# Run from repo root:  bash scripts/purge-archived-knowledge.sh
set -uo pipefail
ROWS=$(sf data query -o kb --all-rows -q "SELECT KnowledgeArticleId, UrlName FROM Knowledge__kav WHERE PublishStatus='Archived' AND IsDeleted=false" --json | jq -c '.result.records[]')
N=$(echo "$ROWS" | grep -c . || true); echo "archived articles to purge: $N"
[ "$N" -gt 0 ] || { echo "nothing to purge"; exit 0; }
ok=0; fail=0
while IFS= read -r row; do
  KA=$(echo "$row" | jq -r .KnowledgeArticleId)
  if sf data delete record -o kb -s KnowledgeArticle -i "$KA" --json | jq -e '.result.success' >/dev/null; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $(echo "$row" | jq -r .UrlName)"; fi
done <<< "$ROWS"
echo "deleted=$ok failed=$fail"
cat > /tmp/empty-bin.apex <<'EOF'
Database.emptyRecycleBin([SELECT Id FROM KnowledgeArticle WHERE IsDeleted=true ALL ROWS]);
System.debug('bin emptied');
EOF
sf apex run -o kb --file /tmp/empty-bin.apex | grep -E 'bin emptied|Exception' || true
sf data query -o kb --all-rows -q "SELECT PublishStatus, COUNT(Id) n FROM Knowledge__kav GROUP BY PublishStatus" --json | jq -c '[.result.records[] | {s: .PublishStatus, n}]'
echo "Free slots = 100 - Online. Wait ~10 s, then re-sync Contentful → Knowledge: bash scripts/resync-contentful-to-knowledge.sh"

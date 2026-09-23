#!/usr/bin/env bash
# Dev Edition caps Knowledge at 100 articles (archived ones and the recycle bin count too).
# Claude already ARCHIVED the oldest non-password article on 2026-09-23:
#   ka0ak0000026JgBAAU "Battery Alert Thresholds Updated…" (battery-alert-threshold-updates-alerts-2026)
# This deletes its master record and empties the recycle bin, which frees the slot.
# Approved by Miles. Run from anywhere:  bash scripts/free-one-knowledge-slot.sh
set -uo pipefail
KA=$(sf data query -o kb -q "SELECT KnowledgeArticleId FROM Knowledge__kav WHERE Id='ka0ak0000026JgBAAU'" --json | jq -r '.result.records[0].KnowledgeArticleId')
echo "deleting master article $KA"
sf data delete record -o kb -s KnowledgeArticle -i "$KA" --json | jq -c '{success: .result.success, err: (.message // .result.errors)}'
cat > /tmp/empty-bin.apex <<'EOF'
Database.emptyRecycleBin([SELECT Id FROM KnowledgeArticle WHERE IsDeleted=true ALL ROWS]);
System.debug('bin emptied');
EOF
sf apex run -o kb --file /tmp/empty-bin.apex | grep -E 'bin emptied|Exception' || true
sf data query -o kb -q "SELECT PublishStatus, COUNT(Id) n FROM Knowledge__kav GROUP BY PublishStatus" --json | jq -c '[.result.records[] | {s: .PublishStatus, n}]'
echo "expected: Online=99 and no Archived. Tell Claude to fire the publish."

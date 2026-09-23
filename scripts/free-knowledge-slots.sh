#!/usr/bin/env bash
# Free Salesforce Knowledge slots so NEW Contentful articles can be created by the webhook.
#
# Why: the Dev Edition org caps Knowledge at 100 articles and it is FULL (99 harvested + 1).
# A brand-new Contentful article (a slug Salesforce has never seen) makes the webhook CREATE an
# article, and Salesforce answers "Article limit exceeded". Editing an existing article is fine
# (the webhook writes a new version, no new slot). Archived articles and the recycle bin still
# count, so this script archives, deletes the MASTER record, and empties the bin.
#
# Usage (from repo root):   bash scripts/free-knowledge-slots.sh <slug> [<slug> ...]
#   e.g. bash scripts/free-knowledge-slots.sh restart-inverter set-up-autopay
# Pick slugs you will NOT need tomorrow. Also unpublish/delete the same articles in Contentful
# afterwards, or they will still show on the site (and a later re-publish would re-create them).
# Salesforce's cap counter lags ~5-10 s after a delete: wait a moment before the first new publish.
set -uo pipefail
[ $# -ge 1 ] || { echo "usage: $0 <slug> [<slug> ...]"; exit 1; }
cd "$(dirname "$0")/../help-center"; set -a; . ./.env.local; set +a
D=${SF_DOMAIN#https://}; AT=$(curl -s -X POST "https://$D/services/oauth2/token" -d grant_type=client_credentials -d client_id="$SF_CLIENT_ID" -d client_secret="$SF_CLIENT_SECRET" | jq -r .access_token)
A="https://$D/services/data/v62.0"; H=(-H "Authorization: Bearer $AT" -H "Content-Type: application/json")

for slug in "$@"; do
  ROW=$(sf data query -o kb --all-rows -q "SELECT Id, KnowledgeArticleId, PublishStatus, Title FROM Knowledge__kav WHERE UrlName='$slug' AND IsDeleted=false ORDER BY VersionNumber DESC LIMIT 1" --json | jq -c '.result.records[0] // empty')
  [ -z "$ROW" ] && { echo "-- $slug: not found in Knowledge, skipping"; continue; }
  ID=$(echo "$ROW" | jq -r .Id); KA=$(echo "$ROW" | jq -r .KnowledgeArticleId); ST=$(echo "$ROW" | jq -r .PublishStatus)
  echo "-- $slug: $(echo "$ROW" | jq -r .Title) [$ST]"
  if [ "$ST" = "Online" ]; then
    curl -s -o /dev/null -w '   archive HTTP%{http_code}\n' -X PATCH "${H[@]}" "$A/knowledgeManagement/articleVersions/masterVersions/$ID" -d '{"publishStatus":"Archived"}'
  fi
  sf data delete record -o kb -s KnowledgeArticle -i "$KA" --json | jq -r '"   delete master: " + (if .result.success then "ok" else (.message // (.result.errors|tostring)) end)'
done

cat > /tmp/empty-bin.apex <<'EOF'
Database.emptyRecycleBin([SELECT Id FROM KnowledgeArticle WHERE IsDeleted=true ALL ROWS]);
System.debug('bin emptied');
EOF
sf apex run -o kb --file /tmp/empty-bin.apex | grep -E 'bin emptied|Exception' || true
sf data query -o kb -q "SELECT PublishStatus, COUNT(Id) n FROM Knowledge__kav GROUP BY PublishStatus" --json | jq -c '[.result.records[] | {s: .PublishStatus, n}]'
echo "free slots = 100 - Online count above. Wait ~10 s before publishing a new article."

#!/usr/bin/env bash
# Dev Edition caps Knowledge at 100 articles and the org holds exactly 100. This frees ONE slot so
# the Contentful → Knowledge webhook can create its first article: it archives and deletes the
# oldest Online article (skipping anything password-related) and empties the recycle bin, which
# the cap also counts. Approved by Miles 2026-09-23. Run from repo root:  bash scripts/free-one-knowledge-slot.sh
set -uo pipefail
cd "$(dirname "$0")/../help-center"; set -a; . ./.env.local; set +a
D=${SF_DOMAIN#https://}; AT=$(curl -s -X POST "https://$D/services/oauth2/token" -d grant_type=client_credentials -d client_id="$SF_CLIENT_ID" -d client_secret="$SF_CLIENT_SECRET" | jq -r .access_token)
A="https://$D/services/data/v62.0"; H=(-H "Authorization: Bearer $AT" -H "Content-Type: application/json")

V=$(sf data query -o kb -q "SELECT Id, Title, UrlName, CreatedDate FROM Knowledge__kav WHERE PublishStatus='Online' AND (NOT Title LIKE '%assword%') ORDER BY CreatedDate ASC, Title ASC LIMIT 1" --json | jq -c '.result.records[0] | {Id, Title, UrlName, CreatedDate}')
echo "removing: $V"; ID=$(echo "$V" | jq -r .Id)
curl -s -o /dev/null -w 'archive HTTP%{http_code}\n' -X PATCH "${H[@]}" "$A/knowledgeManagement/articleVersions/masterVersions/$ID" -d '{"publishStatus":"Archived"}'
curl -s -w 'delete HTTP%{http_code}\n' -X DELETE "${H[@]}" "$A/sobjects/Knowledge__kav/$ID" | head -c 300; echo
cat > /tmp/empty-bin.apex <<'EOF'
Database.emptyRecycleBin([SELECT Id FROM Knowledge__kav WHERE IsDeleted=true ALL ROWS]);
System.debug('bin emptied');
EOF
sf apex run -o kb --file /tmp/empty-bin.apex | grep -E 'bin emptied|Exception' || true
sf data query -o kb -q "SELECT PublishStatus, COUNT(Id) n FROM Knowledge__kav GROUP BY PublishStatus" --json | jq -c '[.result.records[] | {s: .PublishStatus, n}]'
echo "expected: Online=99. Now re-run the webhook test."

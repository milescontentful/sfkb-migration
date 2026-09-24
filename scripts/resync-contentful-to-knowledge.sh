#!/usr/bin/env bash
# Re-fire the publish webhook for every Public, published Contentful article, so Knowledge (and
# therefore the search index) catches up after a bulk change or after the cap blocked publishes.
# Safe to re-run: existing slugs get a new version, new slugs get created (needs free slots).
# Run from repo root:  bash scripts/resync-contentful-to-knowledge.sh [--dry]
set -uo pipefail
cd "$(dirname "$0")/../help-center"; set -a; . ./.env.local; set +a
DRY=${1:-}; URL="${NEXT_PUBLIC_SITE_URL:-https://servicenext.colorfuldemo.com}/api/webhooks/contentful"; [ "$DRY" = "--dry" ] && URL="$URL?dry=1"
TOK=$(jq -r .managementToken ~/.contentfulrc.json)
IDS=$(curl -s -H "Authorization: Bearer $TOK" "https://api.contentful.com/spaces/$CONTENTFUL_SPACE_ID/environments/${CONTENTFUL_ENVIRONMENT:-master}/entries?content_type=article&fields.channelVisibility=Public&limit=1000&select=sys.id,sys.publishedAt" | jq -r '.items[] | select(.sys.publishedAt) | .sys.id')
echo "articles to sync: $(echo "$IDS" | grep -c .)"
ok=0; fail=0
while IFS= read -r id; do
  R=$(curl -s -X POST "$URL" -H "x-webhook-secret: $CONTENTFUL_WEBHOOK_SECRET" -H 'x-contentful-topic: ContentManagement.Entry.publish' -H 'Content-Type: application/json' -d "{\"sys\":{\"id\":\"$id\",\"contentType\":{\"sys\":{\"id\":\"article\"}}}}")
  if echo "$R" | jq -e '.error == null' >/dev/null 2>&1; then ok=$((ok+1)); printf '.'; else fail=$((fail+1)); echo; echo "FAIL $id: $(echo "$R" | jq -r '.error' | cut -c1-160)"; fi
  sleep 0.3
done <<< "$IDS"
echo; echo "synced=$ok failed=$fail"
echo "Next: the Knowledge stream picks these up within ~15 min; then Data 360 → Search Index → KA_Brightline_KB → Rebuild (5 min)."

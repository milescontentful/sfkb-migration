#!/usr/bin/env bash
# Push every variable in help-center/.env.local to the Vercel project (production), then deploy.
# Run from help-center/:  bash vercel-env.sh
# Uses the VERCEL_TOKEN from your shell (the one that can see the contentful-apps team).
set -uo pipefail
cd "$(dirname "$0")"
while IFS== read -r k v; do
  [ -z "$k" ] && continue
  case "$k" in \#*|VERCEL_OIDC_TOKEN) continue;; esac   # skip the lines `vercel link` adds
  printf '%s' "$v" | vercel env add "$k" production --scope contentful-apps --force 2>&1 | grep -oE 'Added|Updated|Error.*' | head -1 | sed "s/^/$k: /"
done < .env.local
echo "== deploy"
vercel deploy --prod --yes --scope contentful-apps 2>&1 | grep -E 'https://|Error' | tail -3

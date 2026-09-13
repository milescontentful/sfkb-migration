#!/usr/bin/env bash
# Follow-up to invite-team.sh (2026-09-13). What the first run left undone:
#   - Uriel's Salesforce user failed with "License Limit Exceeded" although 3 of 4 licenses are used
#     (the counter lags a few seconds after a user is created) -> retry
#   - Mike's Contentful org invitation was sent (id 034ojpp1usxsTacmZjDgkL); the API rejected the
#     "add to space in the same call" key -> add him as space admin AFTER he accepts the invite
# Run from repo root:  bash scripts/invite-team-2.sh
set -uo pipefail

echo "== Uriel: Salesforce user (retry)"
PROFILE=$(sf data query -o kb -q "SELECT Id FROM Profile WHERE Name='System Administrator'" --json | jq -r '.result.records[0].Id')
U='uriel.reyes@contentful.com.brightline'
sf data create record -o kb -s User -v "FirstName='Uriel' LastName='Reyes' Email='uriel.reyes@contentful.com' Username='$U' Alias='ureyes' ProfileId='$PROFILE' TimeZoneSidKey='America/New_York' LocaleSidKey='en_US' EmailEncodingKey='UTF-8' LanguageLocaleKey='en_US' UserPermissionsKnowledgeUser=true" --json | jq -c '{id: .result.id, err: (.message // .result.errors)}'
sf org assign permset -o kb --name KB_Seed_Fields --on-behalf-of "$U" 2>&1 | grep -iE 'success|already|error' || true
cat > /tmp/reset-uriel.apex <<'EOF'
for (User u : [SELECT Id FROM User WHERE Username = 'uriel.reyes@contentful.com.brightline']) { System.resetPassword(u.Id, true); }
System.debug('reset email sent');
EOF
sf apex run -o kb --file /tmp/reset-uriel.apex | grep -E 'reset email|Exception' || true

echo "== Mike: Contentful space admin (works once he has accepted the org invite email)"
TOK=$(jq -r .managementToken ~/.contentfulrc.json); SP=3m1ne1iyqxvp
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/vnd.contentful.management.v1+json" \
  "https://api.contentful.com/spaces/$SP/space_memberships" \
  -d '{"admin":true,"email":"mike.palazzo@contentful.com","roles":[]}' | jq -c '{id: .sys.id, admin, err: .message}'
echo "(if err says the user is not in the organization yet, re-run this script after Mike accepts)"

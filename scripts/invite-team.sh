#!/usr/bin/env bash
# Give Mike Palazzo and Uriel Reyes access to everything the hackathon build touches:
#   1. Contentful space 01 - Brightline Solar (3m1ne1iyqxvp) as space admins
#   2. The Salesforce dev org (System Administrator + Knowledge user + KB_Seed_Fields)
#   3. This GitHub repo (push access)
# Run from repo root:  bash scripts/invite-team.sh
# Every step is safe to re-run; "already exists" responses are expected on a second run.
set -uo pipefail

TOK=$(jq -r .managementToken ~/.contentfulrc.json)
ORG=0EJtkVUGWJCta9Kk8Q3ZCB; SP=3m1ne1iyqxvp
CT=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/vnd.contentful.management.v1+json")

echo "== 1a Contentful: Uriel (already an org member) -> space admin"
curl -s -X POST "${CT[@]}" "https://api.contentful.com/spaces/$SP/space_memberships" \
  -d '{"admin":true,"email":"uriel.reyes@contentful.com","roles":[]}' | jq -c '{id: .sys.id, admin, err: .message}'

echo "== 1b Contentful: Mike (not in the org yet) -> org invitation + space admin"
curl -s -X POST "${CT[@]}" "https://api.contentful.com/organizations/$ORG/invitations" \
  -d '{"firstName":"Mike","lastName":"Palazzo","email":"mike.palazzo@contentful.com","role":"member","spaceInvitations":[{"spaceId":"'$SP'","admin":true}]}' \
  | jq -c '{id: .sys.id, status: .sys.status, err: .message}'

echo "== 2 Salesforce dev org users (2 of 4 Salesforce licenses free)"
PROFILE=$(sf data query -o kb -q "SELECT Id FROM Profile WHERE Name='System Administrator'" --json | jq -r '.result.records[0].Id')
for who in "Mike|Palazzo|mike.palazzo@contentful.com|mpalazzo" "Uriel|Reyes|uriel.reyes@contentful.com|ureyes"; do
  IFS='|' read -r FIRST LAST EMAIL ALIAS <<< "$who"
  USERNAME="$EMAIL.brightline"          # usernames are global across Salesforce; the real email is taken by Contentful's own org
  echo "-- $USERNAME"
  sf data create record -o kb -s User -v "FirstName='$FIRST' LastName='$LAST' Email='$EMAIL' Username='$USERNAME' Alias='$ALIAS' ProfileId='$PROFILE' TimeZoneSidKey='America/New_York' LocaleSidKey='en_US' EmailEncodingKey='UTF-8' LanguageLocaleKey='en_US' UserPermissionsKnowledgeUser=true" --json | jq -c '{id: .result.id, err: (.message // .result.errors)}'
  sf org assign permset -o kb --name KB_Seed_Fields --on-behalf-of "$USERNAME" 2>&1 | grep -iE 'success|already|error' || true
done
echo "-- send both a password-setup email"
cat > /tmp/reset-team.apex <<'EOF'
for (User u : [SELECT Id FROM User WHERE Username IN ('mike.palazzo@contentful.com.brightline','uriel.reyes@contentful.com.brightline')]) {
  System.resetPassword(u.Id, true);
}
System.debug('reset emails sent');
EOF
sf apex run -o kb --file /tmp/reset-team.apex | grep -E 'reset emails|Exception' || true

echo "== 3 GitHub collaborators (handles verified by name + company on the profile)"
for gh_user in mpalazzo-dl uriel-reyes; do
  gh api -X PUT "repos/milescontentful/sfkb-migration/collaborators/$gh_user" -f permission=push --jq '"\(.invitee.login // "already a collaborator") invited"' 2>&1 | tail -1
done

echo
echo "Done. Mike gets a Contentful org invite email; both get a Salesforce password-setup email and a GitHub invite."
echo "Login URL for Salesforce: https://orgfarm-ded8b55b3b-dev-ed.develop.my.salesforce.com"

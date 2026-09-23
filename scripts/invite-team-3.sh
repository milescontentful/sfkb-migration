#!/usr/bin/env bash
# Add Kate Eyler-Werve (SE, kate.eyler-werve@contentful.com, GitHub k-e-w) to the hackathon build (2026-09-23):
#   1. Contentful org invite + space admin on 01 - Brightline Solar (3m1ne1iyqxvp)
#   2. Push access to this GitHub repo
#   3. Salesforce dev org: System Administrator + Knowledge user + KB_Seed_Fields (uses the last of 4 licenses)
# Run from repo root:  bash scripts/invite-team-3.sh   (safe to re-run)
set -uo pipefail

TOK=$(jq -r .managementToken ~/.contentfulrc.json)
ORG=0EJtkVUGWJCta9Kk8Q3ZCB; SP=3m1ne1iyqxvp
CT=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/vnd.contentful.management.v1+json")

echo "== 1a Contentful: space admin (works only if Kate is already in the org)"
curl -s -X POST "${CT[@]}" "https://api.contentful.com/spaces/$SP/space_memberships" \
  -d '{"admin":true,"email":"kate.eyler-werve@contentful.com","roles":[]}' | jq -c '{id: .sys.id, admin, err: .message}'

echo "== 1b Contentful: org invitation (expected 'already a member' error if 1a worked)"
curl -s -X POST "${CT[@]}" "https://api.contentful.com/organizations/$ORG/invitations" \
  -d '{"firstName":"Kate","lastName":"Eyler-Werve","email":"kate.eyler-werve@contentful.com","role":"member"}' \
  | jq -c '{id: .sys.id, status: .sys.status, err: .message}'
echo "(if 1a errored and 1b sent an invite: re-run this script after Kate accepts the email; 1a will then succeed)"

echo "== 2 GitHub collaborator k-e-w (profile name verified: Kate Eyler-Werve)"
gh api -X PUT "repos/milescontentful/sfkb-migration/collaborators/k-e-w" -f permission=push --jq '"\(.invitee.login // "already a collaborator") invited"' 2>&1 | tail -1

echo "== 3 Salesforce dev org: Kate as System Administrator (last free license)"
PROFILE=$(sf data query -o kb -q "SELECT Id FROM Profile WHERE Name='System Administrator'" --json | jq -r '.result.records[0].Id')
U='kate.eyler-werve@contentful.com.brightline'   # usernames are global across Salesforce; the real email is taken by Contentful's own org
sf data create record -o kb -s User -v "FirstName='Kate' LastName='Eyler-Werve' Email='kate.eyler-werve@contentful.com' Username='$U' Alias='keylerw' ProfileId='$PROFILE' TimeZoneSidKey='America/New_York' LocaleSidKey='en_US' EmailEncodingKey='UTF-8' LanguageLocaleKey='en_US' UserPermissionsKnowledgeUser=true" --json | jq -c '{id: .result.id, err: (.message // .result.errors)}'
echo "(2026-09-23: 'License Limit Exceeded' is a HARD cap at 3 Salesforce-license users, not a lag. UserLicense reports 3/4 but the 4th is unusable."
echo " Uriel's user was never created for the same reason. Free a license (deactivate a user) before re-running.)"
sf org assign permset -o kb --name KB_Seed_Fields --on-behalf-of "$U" 2>&1 | grep -iE 'success|already|error' || true
cat > /tmp/reset-kate.apex <<'APEX'
for (User u : [SELECT Id FROM User WHERE Username = 'kate.eyler-werve@contentful.com.brightline']) { System.resetPassword(u.Id, true); }
System.debug('reset email sent');
APEX
sf apex run -o kb --file /tmp/reset-kate.apex | grep -E 'reset email|Exception' || true

echo
echo "Done. Kate gets a Contentful org invite, a GitHub invite, and a Salesforce password-setup email."
echo "Salesforce login URL: https://orgfarm-ded8b55b3b-dev-ed.develop.my.salesforce.com"

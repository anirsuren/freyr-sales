#!/bin/bash
# Repairs the GitHub↔AWS trust for auto-deploys. The original setup pinned an
# outdated certificate thumbprint, so AWS refused GitHub's identity token
# ("web identity token could not be validated"). This registers BOTH current
# GitHub OIDC thumbprints (and creates the provider/role if missing).
# Paste into CloudShell:
#   curl -fsSL https://raw.githubusercontent.com/anirsuren/freyr-sales/main/deploy/fix-oidc-trust.sh | bash
set -euo pipefail
export AWS_PAGER=""
ACCOUNT="602367507820"
PROVIDER_URL="token.actions.githubusercontent.com"
PROVIDER_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/$PROVIDER_URL"
T1="6938fd4d98bab03faadb97b34396831e3780aea1"
T2="1c58a3a8518e8759bf075b76b750d4f2df264fcd"

echo "== Checking the OIDC provider =="
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "Provider exists — refreshing its certificate thumbprints."
  aws iam update-open-id-connect-provider-thumbprint \
    --open-id-connect-provider-arn "$PROVIDER_ARN" \
    --thumbprint-list "$T1" "$T2"
else
  echo "Provider missing — creating it."
  aws iam create-open-id-connect-provider \
    --url "https://$PROVIDER_URL" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "$T1" "$T2" >/dev/null
fi
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" \
  --query '{clientIds:ClientIDList,thumbprints:ThumbprintList}' --output json

echo "== Checking the deploy role =="
if aws iam get-role --role-name freyr-sales-github-deploy >/dev/null 2>&1; then
  echo "Role exists."
  aws iam get-role --role-name freyr-sales-github-deploy \
    --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition' --output json
else
  echo "ROLE IS MISSING — the earlier setup did not complete. Run this next:"
  echo "  curl -fsSL https://raw.githubusercontent.com/anirsuren/freyr-sales/main/deploy/setup-github-oidc.sh | bash"
  exit 1
fi
printf '\n\033[1;32mTrust repaired — tell Claude "done" and the deploy re-runs itself.\033[0m\n'

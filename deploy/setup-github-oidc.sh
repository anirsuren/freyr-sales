#!/bin/bash
# ONE-TIME setup — after this, every push to main deploys itself via GitHub
# Actions and nobody pastes into CloudShell again.
#
# What it creates (idempotent — safe to re-run):
#   1. An IAM OIDC identity provider for GitHub Actions.
#   2. A deploy role (freyr-sales-github-deploy) that ONLY the main branch of
#      github.com/anirsuren/freyr-sales can assume — no access keys anywhere,
#      nothing that can expire or leak. Forks and pull requests cannot use it.
#   3. A least-privilege policy: push images to the freyr-sales ECR repo,
#      register task definitions, roll the one ECS service, and pass the two
#      roles the task definition already uses.
#
# Usage (paste into CloudShell as Freyr-Sales-Dev / Infra_Engineer, us-east-1):
#   curl -fsSL https://raw.githubusercontent.com/anirsuren/freyr-sales/main/deploy/setup-github-oidc.sh | bash
set -euo pipefail
export AWS_PAGER=""

REGION="us-east-1"
ACCOUNT="602367507820"
REPO_SUB="repo:anirsuren/freyr-sales:ref:refs/heads/main"
ROLE="freyr-sales-github-deploy"
ECR_REPO="freyr-sales"
CLUSTER="freyr-sales-cluster"
SERVICE="freyr-sales-svc"
FAMILY="freyr-sales"
PROVIDER_URL="token.actions.githubusercontent.com"
PROVIDER_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/$PROVIDER_URL"

step() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }

step "1/4 GitHub OIDC identity provider"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "Already exists — keeping it."
else
  aws iam create-open-id-connect-provider \
    --url "https://$PROVIDER_URL" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
  echo "Created."
fi

step "2/4 Deploy role (main branch of anirsuren/freyr-sales only)"
TRUST=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$PROVIDER_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "$PROVIDER_URL:aud": "sts.amazonaws.com",
        "$PROVIDER_URL:sub": "$REPO_SUB"
      }
    }
  }]
}
JSON
)
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$TRUST"
  echo "Role exists — trust policy refreshed."
else
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document "$TRUST" \
    --description "GitHub Actions deploys freyr-sales on push to main (OIDC, no stored keys)" >/dev/null
  echo "Created."
fi

step "3/4 Least-privilege deploy policy"
# The task definition's own roles must be passable to ECS by the deployer.
TD=$(aws ecs describe-task-definition --task-definition "$FAMILY" --query taskDefinition --output json)
TASK_ROLE=$(echo "$TD" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('taskRoleArn') or '')")
EXEC_ROLE=$(echo "$TD" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('executionRoleArn') or '')")
PASS_ARNS=$(python3 - "$TASK_ROLE" "$EXEC_ROLE" <<'PY'
import json,sys
arns=[a for a in sys.argv[1:] if a]
print(json.dumps(arns if arns else ["arn:aws:iam::602367507820:role/nonexistent-placeholder"]))
PY
)
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrLogin", "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Sid": "EcrPush", "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:DescribeImages",
                 "ecr:GetDownloadUrlForLayer","ecr:InitiateLayerUpload","ecr:UploadLayerPart",
                 "ecr:CompleteLayerUpload","ecr:PutImage"],
      "Resource": "arn:aws:ecr:$REGION:$ACCOUNT:repository/$ECR_REPO" },
    { "Sid": "EcsRead", "Effect": "Allow",
      "Action": ["ecs:DescribeTaskDefinition","ecs:DescribeServices"], "Resource": "*" },
    { "Sid": "EcsDeploy", "Effect": "Allow",
      "Action": "ecs:RegisterTaskDefinition", "Resource": "*" },
    { "Sid": "EcsRoll", "Effect": "Allow",
      "Action": "ecs:UpdateService",
      "Resource": "arn:aws:ecs:$REGION:$ACCOUNT:service/$CLUSTER/$SERVICE" },
    { "Sid": "PassTaskRoles", "Effect": "Allow",
      "Action": "iam:PassRole", "Resource": $PASS_ARNS,
      "Condition": { "StringEquals": { "iam:PassedToService": "ecs-tasks.amazonaws.com" } } }
  ]
}
JSON
)
aws iam put-role-policy --role-name "$ROLE" --policy-name deploy --policy-document "$POLICY"
echo "Policy attached."

step "4/4 Done"
echo "Role ARN: arn:aws:iam::$ACCOUNT:role/$ROLE"
printf '\n\033[1;32mThat was the last manual deploy step ever. From now on, every push to\nmain builds, deploys, health-checks, and rolls back automatically.\033[0m\n'

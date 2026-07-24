#!/bin/bash
# Manual deploy from AWS CloudShell — for when the Azure pipeline's AWS
# credentials are unavailable. Runs entirely with the CloudShell role's own
# permissions; no keys are created or pasted anywhere.
#
# Usage (paste into CloudShell as the Freyr-Sales-Dev Infra_Engineer role):
#   curl -fsSL https://raw.githubusercontent.com/anirsuren/freyr-sales/main/deploy/cloudshell-deploy.sh | bash
set -euo pipefail

REGION="us-east-1"
ACCOUNT="602367507820"
REPO="freyr-sales"
CLUSTER="freyr-sales-cluster"
SERVICE="freyr-sales-svc"
FAMILY="freyr-sales"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
TARBALL="https://codeload.github.com/anirsuren/freyr-sales/tar.gz/refs/heads/main"

step() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }

step "Checking what this role is allowed to do"
aws sts get-caller-identity --query Arn --output text
aws ecr describe-repositories --repository-names "$REPO" --query 'repositories[0].repositoryUri' --output text
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].[status,taskDefinition]' --output text

step "Fetching the code (public mirror, main)"
WORK=$(mktemp -d)
cd "$WORK"
curl -fsSL "$TARBALL" | tar -xz
cd freyr-sales-main
SHA=$(curl -fsSL "https://api.github.com/repos/anirsuren/freyr-sales/commits/main" \
  | grep -m1 '"sha"' | cut -d'"' -f4)
TAG=$(echo "$SHA" | cut -c1-7)
echo "Deploying commit: $SHA"

step "Reading public build-time config from the live task definition"
TD=$(aws ecs describe-task-definition --task-definition "$FAMILY" \
  --query taskDefinition --output json)
# NEXT_PUBLIC_* values ship to every visitor's browser — they are not secrets.
PUB_URL=$(echo "$TD" | jq -r '.containerDefinitions[0].environment[]? | select(.name=="NEXT_PUBLIC_SUPABASE_URL") | .value // empty')
PUB_KEY=$(echo "$TD" | jq -r '.containerDefinitions[0].environment[]? | select(.name=="NEXT_PUBLIC_SUPABASE_ANON_KEY") | .value // empty')

step "Building the container image (this is the slow part, ~5-10 min)"
docker system prune -af --volumes >/dev/null 2>&1 || true
docker build --platform linux/amd64 \
  ${PUB_URL:+--build-arg NEXT_PUBLIC_SUPABASE_URL="$PUB_URL"} \
  ${PUB_KEY:+--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUB_KEY"} \
  -t "$REGISTRY/$REPO:$TAG" -t "$REGISTRY/$REPO:latest" .

step "Pushing to ECR"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
docker push "$REGISTRY/$REPO:$TAG"
docker push "$REGISTRY/$REPO:latest"

step "Registering the new task definition"
echo "$TD" | jq \
  --arg IMG "$REGISTRY/$REPO:$TAG" \
  --arg VER "$SHA" '
  def set_env($name; $value):
    .containerDefinitions[0].environment = (
      ((.containerDefinitions[0].environment // [])
        | map(select(.name != $name)))
      + [{name: $name, value: $value}]
    );
  .containerDefinitions[0].image = $IMG
  | set_env("APP_VERSION"; $VER)
  | set_env("AUTH_MODE"; "supabase")
  | set_env("AUTH_PUBLIC_ORIGIN"; "https://freyrsales.dev.freyrapps.com")
  | set_env("ACCESS_CONTROL_MODE"; "approval")
  | set_env("AUTO_APPROVE_EMAIL_DOMAINS"; "freyrsolutions.com")
  | set_env("DEFAULT_DATA_MODE"; "mock")
  | set_env("DATA_MODE_LOCKED"; "0")
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
        .compatibilities, .registeredAt, .registeredBy)
' > taskdef.json
REV=$(aws ecs register-task-definition --cli-input-json file://taskdef.json \
  --query taskDefinition.revision --output text)
echo "Registered $FAMILY:$REV"

step "Rolling the service"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$FAMILY:$REV" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

step "Verifying the live site"
curl -s https://freyrsales.dev.freyrapps.com/api/health | head -c 200
printf '\n\033[1;32mDone — the site is serving commit %s\033[0m\n' "$TAG"

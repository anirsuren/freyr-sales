#!/bin/bash
# Manual deploy from AWS CloudShell — for when the Azure pipeline's AWS
# credentials are unavailable. Runs entirely with the CloudShell role's own
# permissions; no keys are created or pasted anywhere.
#
# Usage (paste into CloudShell as the Freyr-Sales-Dev Infra_Engineer role):
#   curl -fsSL https://raw.githubusercontent.com/anirsuren/freyr-sales/main/deploy/cloudshell-deploy.sh | bash
#
# IMPORTANT — why this deploy inherits the auth config instead of setting it:
# The health endpoint (app/api/health) returns 503 in production unless every
# secret for the *current* AUTH_MODE is present. An earlier version of this
# script forced AUTH_MODE=supabase + ACCESS_CONTROL_MODE=approval, which demand
# secrets (AUTH_COOKIE_SECRET, FREYR_WORKSPACE_ID) the live environment does not
# have — so the new task flagged itself unhealthy and ECS rolled it back. We now
# change ONLY the image, the version stamp, and the mock/live toggle settings,
# inheriting the live task definition's proven-healthy auth environment verbatim.
set -euo pipefail
export AWS_PAGER=""

REGION="us-east-1"
ACCOUNT="602367507820"
REPO="freyr-sales"
CLUSTER="freyr-sales-cluster"
SERVICE="freyr-sales-svc"
FAMILY="freyr-sales"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
TARBALL="https://codeload.github.com/anirsuren/freyr-sales/tar.gz/refs/heads/main"

# Pinned to the release image that is already built and sitting in ECR, so the
# common case skips the slow (~10 min) rebuild. If that image is ever missing,
# the script rebuilds it from the same commit automatically.
TAG="b9e517a"
SHA="b9e517abf60f51756dd333c1b7cee96d17037328"

step() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }

step "Checking what this role is allowed to do"
aws sts get-caller-identity --query Arn --output text
aws ecr describe-repositories --repository-names "$REPO" --query 'repositories[0].repositoryUri' --output text
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].[status,taskDefinition]' --output text

step "Making sure the release image is in ECR"
if aws ecr describe-images --repository-name "$REPO" --image-ids imageTag="$TAG" \
     --region "$REGION" >/dev/null 2>&1; then
  echo "Image $REPO:$TAG already present — skipping build/push (fast path)."
else
  step "Image not found — building it from commit $SHA (~5-10 min)"
  WORK=$(mktemp -d); cd "$WORK"
  curl -fsSL "$TARBALL" | tar -xz
  cd freyr-sales-main
  TD_BUILD=$(aws ecs describe-task-definition --task-definition "$FAMILY" \
    --query taskDefinition --output json)
  # NEXT_PUBLIC_* values ship to every visitor's browser — they are not secrets.
  PUB_URL=$(echo "$TD_BUILD" | jq -r '.containerDefinitions[0].environment[]? | select(.name=="NEXT_PUBLIC_SUPABASE_URL") | .value // empty')
  PUB_KEY=$(echo "$TD_BUILD" | jq -r '.containerDefinitions[0].environment[]? | select(.name=="NEXT_PUBLIC_SUPABASE_ANON_KEY") | .value // empty')
  docker system prune -af --volumes >/dev/null 2>&1 || true
  docker build --platform linux/amd64 \
    ${PUB_URL:+--build-arg NEXT_PUBLIC_SUPABASE_URL="$PUB_URL"} \
    ${PUB_KEY:+--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUB_KEY"} \
    -t "$REGISTRY/$REPO:$TAG" -t "$REGISTRY/$REPO:latest" .
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$REGISTRY"
  docker push "$REGISTRY/$REPO:$TAG"
  docker push "$REGISTRY/$REPO:latest"
fi

step "Registering the new task definition (new image + version + toggle; auth inherited)"
TD=$(aws ecs describe-task-definition --task-definition "$FAMILY" \
  --query taskDefinition --output json)
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
  | set_env("DEFAULT_DATA_MODE"; "mock")
  | set_env("DATA_MODE_LOCKED"; "0")
  | set_env("AUTO_APPROVE_EMAIL_DOMAINS"; "freyrsolutions.com")
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
        .compatibilities, .registeredAt, .registeredBy)
' > taskdef.json
REV=$(aws ecs register-task-definition --cli-input-json file://taskdef.json \
  --query taskDefinition.revision --output text)
echo "Registered $FAMILY:$REV"

step "Rolling the service"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$FAMILY:$REV" --force-new-deployment \
  --health-check-grace-period-seconds 180 >/dev/null
echo "Waiting for the new task to pass its health checks and stabilize (~3-5 min)..."
if aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"; then
  echo "Service reached a steady state."
else
  echo "WARNING: the service did not stabilize cleanly. Checking live status below."
fi

step "Verifying the live site"
sleep 8
LIVE=$(curl -s https://freyrsales.dev.freyrapps.com/api/health || true)
echo "$LIVE"
if echo "$LIVE" | grep -q "$SHA"; then
  printf '\n\033[1;32mDone — the site is now serving commit %s\033[0m\n' "$TAG"
else
  printf '\n\033[1;33mThe rollout finished but the live version has not flipped yet.\n'
  printf 'If it still shows the old version in a minute, the new task likely failed\n'
  printf 'its health check again — run this to see why:\033[0m\n'
  printf '  aws ecs describe-services --cluster %s --services %s --region %s --query "services[0].events[:6].message" --output text\n' "$CLUSTER" "$SERVICE" "$REGION"
fi

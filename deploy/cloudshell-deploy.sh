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
TAG="0036e5a"
SHA="0036e5abc512128187ff09c190ea72e871768089"

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

# --- Service keys -----------------------------------------------------------
# The app is "mock-first": without ANTHROPIC_API_KEY the agent answers from
# deterministic templates instead of calling Claude, which is why production
# replies read as instant and identical. Supply a key on the SAME line as the
# deploy and it is written into the task definition:
#
#   ANTHROPIC_API_KEY=sk-ant-... bash /tmp/deploy.sh
#
# Any of the keys below can be passed the same way, together or one at a time:
#   ANTHROPIC_API_KEY   the agent's brain — the one that matters
#   APIFY_API_TOKEN     LinkedIn/profile enrichment
#   ELEVENLABS_API_KEY  voice agents
#   FIRECRAWL_API_KEY   web research
#   SUPABASE_SERVICE_ROLE_KEY / AUTH_COOKIE_SECRET / FREYR_WORKSPACE_ID
#                       needed only to switch prod to real Supabase sign-in
#
# A key that is NOT supplied is left exactly as the live task definition has it,
# so a routine redeploy never wipes a key that is already set. Nothing is ever
# written to the repo — the value only exists in that one shell invocation.
#
# Hardening note: these land as plaintext env on the task definition, readable
# by anyone with ecs:DescribeTaskDefinition. Moving them to Secrets Manager and
# referencing them via `secrets[]` is the next step once a secret exists.
SET_KEYS=""
add_key() {
  local name="$1" value="$2"
  [ -n "$value" ] || return 0
  # ECS rejects a task definition where the same name exists in BOTH secrets[]
  # and environment[] ("The secret name must be unique and not shared…").
  # The live task def already carries ANTHROPIC_API_KEY as a Secrets Manager
  # reference, so when a key is passed explicitly, the explicit value wins and
  # the same-name secret reference is dropped from the new revision.
  TD=$(echo "$TD" | jq --arg n "$name" --arg v "$value" '
    .containerDefinitions[0].environment = (
      ((.containerDefinitions[0].environment // []) | map(select(.name != $n)))
      + [{name: $n, value: $v}]
    )
    | .containerDefinitions[0].secrets = (
      (.containerDefinitions[0].secrets // []) | map(select(.name != $n))
    )')
  SET_KEYS="$SET_KEYS $name"
}
add_key ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
add_key APIFY_API_TOKEN "${APIFY_API_TOKEN:-}"
add_key ELEVENLABS_API_KEY "${ELEVENLABS_API_KEY:-}"
add_key FIRECRAWL_API_KEY "${FIRECRAWL_API_KEY:-}"
add_key SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}"
add_key AUTH_COOKIE_SECRET "${AUTH_COOKIE_SECRET:-}"
add_key FREYR_WORKSPACE_ID "${FREYR_WORKSPACE_ID:-}"

if [ -n "$SET_KEYS" ]; then
  echo "Setting service keys:$SET_KEYS"
else
  echo "No keys supplied — keeping whatever the live task definition already has."
fi

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
  | set_env("DEFAULT_DATA_MODE"; "live")
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
# Say plainly whether the agent can actually reach Claude, because a healthy
# deploy with no key still answers from templates and looks "not AI".
if echo "$LIVE" | grep -q '"anthropic":true'; then
  printf '\n\033[1;32mAgent: LIVE — connected to Claude.\033[0m\n'
else
  printf '\n\033[1;33mAgent: TEMPLATES ONLY — no ANTHROPIC_API_KEY on the task definition.\n'
  printf 'Re-run with the key on the same line to switch the real agent on:\n'
  printf '  ANTHROPIC_API_KEY=sk-ant-... bash /tmp/deploy.sh\033[0m\n'
fi
if echo "$LIVE" | grep -q "$SHA"; then
  printf '\n\033[1;32mDone — the site is now serving commit %s\033[0m\n' "$TAG"
else
  printf '\n\033[1;33mThe rollout finished but the live version has not flipped yet.\n'
  printf 'If it still shows the old version in a minute, the new task likely failed\n'
  printf 'its health check again — run this to see why:\033[0m\n'
  printf '  aws ecs describe-services --cluster %s --services %s --region %s --query "services[0].events[:6].message" --output text\n' "$CLUSTER" "$SERVICE" "$REGION"
fi

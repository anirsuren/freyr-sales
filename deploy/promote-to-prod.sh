#!/usr/bin/env bash
# THE ONLY ROAD TO PRODUCTION.
#
# Anir, Aug 27, the day prod went live: "We should never push it into the
# production environment without my explicit permission... only when I say
# 'push it to production.'" A bare "deploy" or "push it" means DEV.
#
# This script is the enforcement, same shape as .githooks/pre-push: the
# approval must ride on the invocation itself —
#
#   FREYR_PROD_DEPLOY_APPROVED=yes deploy/promote-to-prod.sh <sha-tag>
#
# Setting that variable is a statement that Anir said yes to THIS prod
# deploy, in the message before it. Never export it into the shell, never
# script around this file with raw aws calls.
#
# What it does: copies the already-built image for <sha-tag> from the dev
# account's ECR to prod's (prod never builds; it promotes what dev proved),
# registers a task-definition revision pointing at it, rolls the service,
# and verifies /api/health serves that exact sha.
set -euo pipefail

DEV_ACCOUNT="602367507820"
PROD_ACCOUNT="966427768186"
REGION="us-east-1"
REPO="freyr-sales"
CLUSTER="freyr-sales-cluster"
SERVICE="freyr-sales-svc"
FAMILY="freyr-sales"
HEALTH="https://freyrsales.freyrapps.com/api/health"
PROD_PROFILE="${PROD_PROFILE:-966427768186_Infra_Engineer}"
DEV_PROFILE="${DEV_PROFILE:-602367507820_Infra_Engineer}"

if [ "${FREYR_PROD_DEPLOY_APPROVED:-}" != "yes" ]; then
  echo "REFUSED: this rolls PRODUCTION (freyrsales.freyrapps.com)." >&2
  echo "Run only after Anir approves THIS deploy, as:" >&2
  echo "  FREYR_PROD_DEPLOY_APPROVED=yes $0 <sha-tag>" >&2
  exit 1
fi

TAG="${1:?usage: FREYR_PROD_DEPLOY_APPROVED=yes $0 <sha-tag>}"
AWS="${AWS_BIN:-aws}"

echo "== promoting ${REPO}:${TAG} dev -> prod =="

# 1. Ferry the image. crane/docker if present; else in-registry copy fails
#    fast with a clear message rather than half-deploying.
SRC="${DEV_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:${TAG}"
DST="${PROD_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:${TAG}"
if $AWS ecr describe-images --profile "$PROD_PROFILE" --region "$REGION" \
     --repository-name "$REPO" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
  echo "image already in prod ECR - skipping copy"
elif command -v crane >/dev/null 2>&1; then
  $AWS ecr get-login-password --profile "$DEV_PROFILE" --region "$REGION" | crane auth login "${DEV_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com" -u AWS --password-stdin
  $AWS ecr get-login-password --profile "$PROD_PROFILE" --region "$REGION" | crane auth login "${PROD_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com" -u AWS --password-stdin
  crane copy "$SRC" "$DST"
elif command -v docker >/dev/null 2>&1; then
  $AWS ecr get-login-password --profile "$DEV_PROFILE" --region "$REGION" | docker login --username AWS --password-stdin "${DEV_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
  docker pull "$SRC"
  docker tag "$SRC" "$DST"
  $AWS ecr get-login-password --profile "$PROD_PROFILE" --region "$REGION" | docker login --username AWS --password-stdin "${PROD_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
  docker push "$DST"
else
  echo "Need crane or docker to ferry the image (and valid DEV creds)." >&2
  exit 1
fi

# 2. New task-def revision: image + APP_VERSION change, EVERYTHING else
#    (auth env, secrets) inherited verbatim from the live prod revision.
FULLSHA="$TAG"
TD=$($AWS ecs describe-task-definition --profile "$PROD_PROFILE" --region "$REGION" \
      --task-definition "$FAMILY" --query taskDefinition --output json)
echo "$TD" | python3 -c "
import json,sys
td=json.load(sys.stdin)
c=td['containerDefinitions'][0]
c['image']='$DST'
env={e['name']:e['value'] for e in c.get('environment',[])}
env['APP_VERSION']='$FULLSHA'
c['environment']=[{'name':k,'value':v} for k,v in env.items()]
for k in ('taskDefinitionArn','revision','status','requiresAttributes','compatibilities','registeredAt','registeredBy'):
    td.pop(k,None)
print(json.dumps(td))
" > /tmp/prod-taskdef.json
REV=$($AWS ecs register-task-definition --profile "$PROD_PROFILE" --region "$REGION" \
      --cli-input-json file:///tmp/prod-taskdef.json --query taskDefinition.revision --output text)
echo "registered ${FAMILY}:${REV}"

# 3. Roll and wait.
$AWS ecs update-service --profile "$PROD_PROFILE" --region "$REGION" \
  --cluster "$CLUSTER" --service "$SERVICE" --task-definition "${FAMILY}:${REV}" \
  --force-new-deployment >/dev/null
$AWS ecs wait services-stable --profile "$PROD_PROFILE" --region "$REGION" \
  --cluster "$CLUSTER" --services "$SERVICE"

# 4. Believe the site, not the rollout.
for i in $(seq 1 30); do
  LIVE=$(curl -s --max-time 15 "$HEALTH" || true)
  if echo "$LIVE" | grep -q "\"version\":\"$TAG"; then
    echo "PROD LIVE: $LIVE" | head -c 300; echo
    exit 0
  fi
  sleep 10
done
echo "Rollout finished but the live version never flipped - ECS likely rolled back." >&2
exit 1

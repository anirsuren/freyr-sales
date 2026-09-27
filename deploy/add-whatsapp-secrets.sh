#!/usr/bin/env bash
#
# WHATSAPP KEYS INTO THE RUNTIME SECRET, THEN INTO THE TASK DEFINITION.
#
# The containers read every secret from ONE Secrets Manager JSON
# (freyr-sales/runtime) through `secrets[]` entries on the task definition.
# A key that is mapped but missing from the JSON stops the task from starting,
# so this script does both halves in order: write the values into the secret,
# then register a task-definition revision that maps them, then roll the
# service. Nothing is written to the repo; the values live only in this shell.
#
#   Dev (account 602367507820):
#     WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=... WHATSAPP_ACCESS_TOKEN=... \
#     WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_BUSINESS_NUMBER=+1555... \
#     FREYR_DEPLOY_APPROVED=yes deploy/add-whatsapp-secrets.sh dev
#
#   Production (account 966427768186), its own explicit yes:
#     ... FREYR_PROD_DEPLOY_APPROVED=yes deploy/add-whatsapp-secrets.sh prod
#
# Rolling the service is a deployment and needs Anir's yes for THAT
# environment, exactly like deploy.yml and promote-to-prod.sh.
set -euo pipefail

ENVIRONMENT="${1:?usage: $0 dev|prod}"
REGION="us-east-1"
CLUSTER="freyr-sales-cluster"
SERVICE="freyr-sales-svc"
FAMILY="freyr-sales"
SECRET_ID="${SECRET_ID:-freyr-sales/runtime}"

case "$ENVIRONMENT" in
  dev)
    PROFILE="${DEV_PROFILE:-602367507820_Infra_Engineer}"
    if [ "${FREYR_DEPLOY_APPROVED:-}" != "yes" ]; then
      echo "Refusing: FREYR_DEPLOY_APPROVED=yes must be on this invocation (Anir's yes for a dev roll)." >&2
      exit 1
    fi
    ;;
  prod)
    PROFILE="${PROD_PROFILE:-966427768186_Infra_Engineer}"
    if [ "${FREYR_PROD_DEPLOY_APPROVED:-}" != "yes" ]; then
      echo "Refusing: FREYR_PROD_DEPLOY_APPROVED=yes must be on this invocation (Anir's explicit 'push it to production')." >&2
      exit 1
    fi
    ;;
  *) echo "usage: $0 dev|prod" >&2; exit 1 ;;
esac

KEYS=(WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_BUSINESS_NUMBER)
for key in "${KEYS[@]}"; do
  if [ -z "${!key:-}" ]; then
    echo "Missing $key in the environment. Pass all five; see docs/whatsapp-agent.md." >&2
    exit 1
  fi
done

aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

echo "1/3 Writing the keys into $SECRET_ID ($ENVIRONMENT)"
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_ID" --query ARN --output text)
MERGED="$CURRENT"
for key in "${KEYS[@]}"; do
  MERGED=$(echo "$MERGED" | jq --arg k "$key" --arg v "${!key}" '. + {($k): $v}')
done
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$MERGED" >/dev/null

echo "2/3 Registering a task-definition revision that maps them"
TD=$(aws ecs describe-task-definition --task-definition "$FAMILY" --query taskDefinition)
for key in "${KEYS[@]}"; do
  TD=$(echo "$TD" | jq --arg n "$key" --arg from "${SECRET_ARN}:${key}::" '
    .containerDefinitions[0].secrets = (
      ((.containerDefinitions[0].secrets // []) | map(select(.name != $n)))
      + [{name: $n, valueFrom: $from}]
    )
    | .containerDefinitions[0].environment = (
      (.containerDefinitions[0].environment // []) | map(select(.name != $n))
    )')
done
NEW=$(echo "$TD" | jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)')
REV=$(aws ecs register-task-definition --cli-input-json "$NEW" --query 'taskDefinition.revision' --output text)
echo "    registered ${FAMILY}:${REV}"

echo "3/3 Rolling $SERVICE to ${FAMILY}:${REV}"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --task-definition "${FAMILY}:${REV}" >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
echo "Done. Check https://<host>/api/health, then save the webhook URL in the Meta app (docs/whatsapp-agent.md step 5)."

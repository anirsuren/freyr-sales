# Vertex AI setup for Freyr Sales

The application can use Vertex AI without moving its AWS ECS hosting or its
Supabase records. Vertex is the reasoning provider; existing application tools
remain the permission-aware source of structured sales data.

## Google Cloud project

- Project: `sound-fastness-480519-a6` (`My First Project`)
- Vertex/Agent Platform API: enabled on September 21, 2026
- Default model: `gemini-3.5-flash`
- Default model location: `global`
- Service account: `freyr-sales-vertex@sound-fastness-480519-a6.iam.gserviceaccount.com`
- AWS identity pool/provider: `freyr-sales-aws` / `freyr-sales-ecs`
- Authorized AWS task role: `arn:aws:iam::602367507820:role/freyr-sales-ecs-task-role`

The application uses the current Google Gen AI SDK (`@google/genai`) and the
stable Vertex `v1` API.

## Local authentication

Install the Google Cloud CLI and create Application Default Credentials:

```bash
gcloud auth application-default login
gcloud config set project sound-fastness-480519-a6
```

Set these values in `.env.local`:

```dotenv
GOOGLE_CLOUD_PROJECT=sound-fastness-480519-a6
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_ENTERPRISE=true
VERTEX_AI_MODEL=gemini-3.5-flash
```

Leave `AGENT_PROVIDER=anthropic` while validating the connection. Then run:

```bash
npm run vertex:verify
```

The command must print `Vertex AI is ready` before changing the provider to
`AGENT_PROVIDER=vertex`.

## AWS ECS production authentication

Production must use Google Workload Identity Federation. Do not download a
service-account private key.

The cloud identity is configured. The provider accepts only AWS account
`602367507820` and role `freyr-sales-ecs-task-role`; the service account grants
that role `roles/iam.workloadIdentityUser`. `deploy/gcp-aws-wif.json` is the
generated external-account configuration and contains no private key.

For the first deployment:

1. Keep `AGENT_PROVIDER=anthropic`.
2. Keep `VERTEX_VERIFY_ON_STARTUP=1` for the first ECS task start.
3. Inspect `/api/health`; `vertexBrain` must report `working`.
4. Switch `AGENT_PROVIDER=vertex` only after the ECS verification passes.

Never broaden the service-account binding to the whole AWS account. If the ECS
task role changes, update both the provider condition and the binding.

## State on September 26, 2026

- The dev pipeline (`.github/workflows/deploy.yml`) and the prod promotion
  (`deploy/promote-to-prod.sh`) now set the Google variables and
  `AGENT_PROVIDER=vertex` on every deploy. Before this, the pipeline inherited
  the environment from the live task, so the settings added to
  `deploy/ecs-task-definition.json` on Sep 21 never reached a running service
  and `/api/health` kept reporting `vertexBrain: not configured`.
- A failed Vertex call falls back to Anthropic for that one question
  (`lib/agentProvider.ts`), so a broken federation shows as `vertexBrain:
  failing` on `/api/health` while the agent keeps answering. Each answer says
  which provider wrote it (`source`).
- Both services run on **Fargate**. Google's auth library finds the AWS role
  through the three `AWS_*` environment variables or the EC2 metadata address;
  Fargate provides neither, it hands task credentials out at
  `169.254.170.2` through `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`. The
  startup bridge in `lib/ecsAwsCredentials.ts` reads that endpoint, places the
  credentials in the environment and renews them ahead of expiry, so the
  federation file's metadata addresses are never used on ECS. Without it,
  Vertex could not sign in on either service regardless of the trust rule.
- Production has its own provider. A Google AWS provider is bound to one AWS
  account, so the pool `freyr-sales-aws` now holds two: `freyr-sales-ecs`
  (dev, `602367507820`) and `freyr-sales-ecs-prod` (prod, `966427768186`),
  each accepting only `freyr-sales-ecs-task-role`. The service account's
  `roles/iam.workloadIdentityUser` binding is by `attribute.aws_role`, so it
  covers both. Created on September 26, 2026.
- Each environment ships its own credential config in the image:
  `deploy/gcp-aws-wif.json` (dev provider) and `deploy/gcp-aws-wif-prod.json`
  (prod provider). They differ only in `audience` and contain no key. The
  dev pipeline points `GOOGLE_APPLICATION_CREDENTIALS` at the first, the prod
  promotion at the second.
- First deploy of each environment proves the federation: `/api/health` must
  report `vertexBrain: working`. If it reports `failing`, the agent keeps
  answering through the Anthropic fallback and the health line names the
  cause.

## Cutover and rollback

`AGENT_PROVIDER` is the only provider switch. `anthropic` preserves the current
agent. `vertex` sends the same permission-filtered read tools to Gemini through
Vertex AI. Rolling back is an environment change to `anthropic`; no application
data or retrieval index is modified.

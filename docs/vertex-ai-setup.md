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

## Cutover and rollback

`AGENT_PROVIDER` is the only provider switch. `anthropic` preserves the current
agent. `vertex` sends the same permission-filtered read tools to Gemini through
Vertex AI. Rolling back is an environment change to `anthropic`; no application
data or retrieval index is modified.

# freyr-sales → AWS Migration — Design / Spec

- **Date:** 2026-07-03
- **Author:** Kevin Wang (with Claude Code)
- **Status:** Draft — awaiting review
- **Source repo/branch:** Azure DevOps `FreyrDevOps/Freyr-Unified-RIMS` → repo `freyr-documentation` → branch **`freyrsales`** (Next.js app at repo root)
- **AWS target:** account **338736353119**, region **us-east-1** (SSO profile `338736353119_Infra_Engineer`)

---

## 1. Goal

Move `freyr-sales` (a Next.js 14 App Router app currently on Vercel) to AWS, running as a **container on ECS Fargate behind an Application Load Balancer**. Keep all external managed services (Supabase, Anthropic, etc.) exactly as-is. Ship first on the **raw ALB URL over HTTP**; add a custom domain + HTTPS as a later, documented step.

### Hard constraints
- **Dedicated, isolated infrastructure only.** Create brand-new resources for this app. Do **not** reuse, reference, or modify any existing infrastructure in account 338736353119 — including the VPC, subnets, clusters, roles, or anything else. No Terraform `data` lookups against existing resources.
- **No data migration.** Supabase (Postgres + auth) and all third-party APIs stay external and unchanged; the app reaches them via environment variables/secrets.
- **Trial account; future move.** Account `338736353119` is a **trial**. The infra will later be moved or duplicated into a new AWS account, so account-specific values (account ID, region, the `oneRIMS-Dev` pipeline connection, the Terraform state bucket) are kept as config — the move is a swap, not a rewrite.

---

## 2. App profile (what drives the design)

| Aspect | Finding | Implication |
|---|---|---|
| Framework | Next.js **14.2.35**, App Router | Needs a running Node server (SSR) |
| API surface | ~40 route handlers under `app/api/**` | Dynamic server — not static-exportable |
| **Streaming** | **SSE** streaming powers the AI agent | **Decisive** — target must stream, not buffer |
| Runtime | Node.js only; **no middleware, no edge runtime** | Plain container works; no adapter needed |
| External deps | Supabase, Anthropic, Apify, Firecrawl, Resend/SMTP, Telegram | All via env vars/secrets |
| Image optimization | **No `next/image` usage** | No `sharp`/native-module concerns in the container |
| Node engine | not pinned (`package.json` has no `engines`) | We standardize on **Node 20 LTS** |

### Why a container (and not the "simpler" managed options)
The agent's SSE streaming rules out the two lowest-effort AWS paths:
- **AWS App Runner** — does not support SSE (open item on AWS's own roadmap; AWS's stated workaround is "use ECS/ALB").
- **AWS Amplify Hosting** — buffers SSR/API responses; streaming works in `next dev` but is delivered all-at-once once deployed.

A container runs `next start` (via the standalone server) exactly like Vercel and local dev — no proxy buffering, no adapter quirks. It also matches how Freyr already ships the Data Hub module (ECS Fargate/ECR).

---

## 3. Target architecture

```
                         Internet
                            │  HTTP :80   (HTTPS :443 added later)
                            ▼
        ┌──────────────────────────────────────────────┐
        │  ALB  (internet-facing, public subnets)        │
        │  · listener :80 → target group                 │
        │  · idle_timeout = 300s   (keeps SSE alive)     │
        │  · SG: inbound 80 from 0.0.0.0/0               │
        └───────────────────────┬────────────────────────┘
                                ▼ (target type: ip, port 3000)
        ┌──────────────────────────────────────────────┐
        │  ECS Fargate service  (private subnets)        │
        │  · task: Next.js standalone container :3000    │◄── image: ECR (freyr-sales)
        │  · cpu 512 / mem 1024 · desired count 1        │◄── secrets: Secrets Manager
        │  · SG: inbound 3000 from ALB SG only           │──► logs: CloudWatch /ecs/freyr-sales
        └───────────────────────┬────────────────────────┘
                                ▼ (outbound via NAT gateway)
     Supabase · Anthropic · Resend · Apify · Firecrawl · Telegram   (external, unchanged)
```

All resources live in a **new dedicated VPC** and are named/tagged for this app.

---

## 4. Resource inventory (all newly created, dedicated)

**Naming prefix:** `freyr-sales-*` · **Tags on everything:** `Application=freyr-sales`, `ManagedBy=Terraform`, `Environment=production`

### 4.1 Networking (dedicated VPC)
- VPC `freyr-sales-vpc`, CIDR `10.42.0.0/16`
- 2 **public** subnets (`10.42.0.0/24`, `10.42.1.0/24`) in `us-east-1a`/`1b` — for the ALB + NAT
- 2 **private** subnets (`10.42.10.0/24`, `10.42.11.0/24`) — for Fargate tasks
- Internet Gateway; **1 NAT Gateway** (single, in AZ-a, to control cost) for task egress to Supabase/Anthropic
- Route tables: public → IGW, private → NAT

> **Cost lever:** the single NAT gateway is ~$33/mo and is the largest line item. Alternative (documented, not default): place tasks in public subnets with `assign_public_ip=true` and a tight SG, dropping NAT entirely (~$40/mo total). Default keeps tasks private for cleaner isolation.

### 4.2 Container registry
- ECR private repo `freyr-sales` (image scan on push, lifecycle policy: keep last 10 images)

### 4.3 Compute
- ECS cluster `freyr-sales-cluster` (Fargate)
- Task definition family `freyr-sales`: **cpu 512 (0.25→0.5 vCPU), memory 1024 MiB**, `awsvpc`, Fargate
- Service `freyr-sales-svc`: desired count **1**, deployment circuit breaker + auto-rollback, health-check grace 60s

### 4.4 Load balancing
- ALB `freyr-sales-alb` (internet-facing) in public subnets
- Target group `freyr-sales-tg`: target type **ip**, port 3000, HTTP, health check **`/api/health`** (200), interval 30s
- Listener **:80** → forward to TG (HTTPS/redirect added in the domain phase)
- **`idle_timeout = 300`** so long-lived SSE connections aren't cut at the 60s default

### 4.5 Config & secrets
- Secrets Manager secret **`freyr-sales/runtime`** (JSON) holding runtime secrets; individual keys injected into the task via `secrets[].valueFrom`
- Non-secret config passed as plain task `environment`

| Secret (Secrets Manager) | Non-secret env (task def) | Build arg (baked into client) |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `NODE_ENV=production` | `NEXT_PUBLIC_SUPABASE_URL` |
| `ANTHROPIC_API_KEY` | `EMAIL_FROM` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `APIFY_API_TOKEN` | `NEXT_PUBLIC_SUPABASE_URL` * | |
| `FIRECRAWL_API_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` * | |
| `RESEND_API_KEY` | feature flags: `AGENT_FORCE_MOCK`, `CUSTOMER_ANALYSIS_LIVE` | |
| `SMTP_URL` | | |
| `TELEGRAM_BOT_TOKEN` | | |
| `TELEGRAM_CHAT_ID` | | |

> \* `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**, so they MUST be passed as Docker **build args**. They are also set as runtime env for any server-side reads. They are not secret (the anon key is public by design).

### 4.6 IAM (dedicated roles)
- `freyr-sales-ecs-execution-role` — pull from ECR, read the `freyr-sales/runtime` secret, write CloudWatch logs
- `freyr-sales-ecs-task-role` — minimal/empty (app calls no AWS APIs)
- **CI deployer identity** — **reuses the existing Azure DevOps AWS service connection `oneRIMS-Dev`** for this trial account; no new CI IAM user or key is created. That connection's identity must allow ECR auth+push, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:Describe*`, and `iam:PassRole` on the execution + task roles (verify before first run — see §6).

### 4.7 Logging
- CloudWatch log group `/ecs/freyr-sales` (retention 30 days), `awslogs` driver

---

## 5. Container design

Add `output: 'standalone'` to `next.config.mjs`, then a multi-stage Dockerfile:

1. **deps** — `node:20-bookworm-slim`, `npm ci`
2. **builder** — copy source, set `NEXT_PUBLIC_*` from `ARG`s, `npm run build` → produces `.next/standalone`
3. **runner** — `node:20-bookworm-slim`, **non-root** user, copy `.next/standalone` + `.next/static` + `public`; `ENV PORT=3000 HOSTNAME=0.0.0.0`; `EXPOSE 3000`; `CMD ["node","server.js"]`

Supporting files: `.dockerignore` (exclude `node_modules`, `.next`, `.git`, tests, `*.md`), and a new **`app/api/health/route.ts`** returning `200 {status:"ok"}` for the ALB health check.

**Build gotchas baked in:**
- Always build `--platform linux/amd64` (Fargate is amd64; matters for local builds on Kevin's Apple-Silicon Mac — the ADO ubuntu agents are amd64 natively).
- `next.config.mjs` currently sets `eslint.ignoreDuringBuilds: true` (kept — build won't fail on lint).

---

## 6. CI/CD — Azure DevOps Pipeline

`azure-pipelines.yml` at the repo root on branch `freyrsales`.

- **Trigger:** push to `freyrsales`
- **Agent pool:** `ubuntu-latest` (Microsoft-hosted; amd64, Docker preinstalled)
- **Variable group** `freyr-sales-ci`: `AWS_REGION`, `ECR_REPO`, `ECR_REGISTRY`, `ECS_CLUSTER`, `ECS_SERVICE`, `TASK_FAMILY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Steps:** checkout → AWS auth → `docker login` to ECR → `docker build --platform linux/amd64` (with `NEXT_PUBLIC_*` build args), tag `:$(short-sha)` + `:latest` → push → register new task-def revision → `aws ecs update-service --force-new-deployment` → `aws ecs wait services-stable`

**Infra is applied out-of-band** (Terraform run locally with the SSO profile) for the initial stand-up; the pipeline only builds and deploys the app image. An optional separate infra pipeline can come later.

### Pipeline → AWS authentication (resolved)

Use the **existing Azure DevOps AWS service connection `oneRIMS-Dev`** as the pipeline's `awsCredentials`. No new IAM user, access key, or service connection is created.

- **Scope:** `oneRIMS-Dev` is authorized for **this trial account (338736353119) only.** When the infra is moved/duplicated to a new AWS account, swap it for that account's service connection — it is the one account-specific pipeline input besides `ECR_REGISTRY` and `AWS_REGION`.
- **Verify before the first deploy** — the identity behind `oneRIMS-Dev` must allow: `ecr:GetAuthorizationToken` + ECR push, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:DescribeServices`, and `iam:PassRole` on `freyr-sales-ecs-execution-role` and `freyr-sales-ecs-task-role`. If it is a broad Dev identity this is likely already covered; otherwise the first run fails with an explicit `AccessDenied` and you attach the reference policy shown in the plan's Task 12.

> **Prerequisite:** the **AWS Toolkit for Azure DevOps** extension must be installed in the `FreyrDevOps` org (it provides the `AWSShellScript` task), the `oneRIMS-Dev` connection must be authorized for this pipeline, and you need permission to create the variable group.

---

## 7. Terraform layout

Flat module in `terraform/` on branch `freyrsales`:

```
terraform/
  providers.tf   # aws provider, region, default_tags, profile
  backend.tf     # S3 backend (see bootstrap below)
  variables.tf   # region, cidr, image tag, sizing, secret ARNs
  network.tf     # VPC, subnets, IGW, NAT, route tables
  ecr.tf         # repository + lifecycle policy
  secrets.tf     # Secrets Manager secret (value populated out-of-band)
  iam.tf         # execution role, task role, CI deployer
  logs.tf        # CloudWatch log group
  ecs.tf         # cluster, task definition, service
  alb.tf         # ALB, target group, listener, security groups
  outputs.tf     # alb_dns_name, ecr_repo_url, cluster/service names
```

**State backend (bootstrap):** create a dedicated S3 bucket `freyr-sales-tfstate-338736353119` (versioned + encrypted) and DynamoDB lock table `freyr-sales-tf-lock` via a one-time CLI step, then point `backend.tf` at them. (Local state is the fallback for a first bootstrap if preferred.)

**Secret values:** Terraform creates the *empty* secret container; the actual values (pulled from Vercel) are written once via `aws secretsmanager put-secret-value` so plaintext never lands in Terraform state or the repo.

---

## 8. Deferred (documented, not in first cut)

- **Custom domain + HTTPS** — ACM cert (DNS-validated), `:443` listener, `:80→:443` redirect, DNS record → ALB. Wire in once the hostname is chosen.
- **CloudFront + WAF** — optional CDN for `_next/static` + edge protection.
- **Autoscaling** — target-tracking on CPU / ALB request-count-per-target.
- **Vercel decommission** — after AWS is verified and traffic is cut over.

---

## 9. Cost estimate (us-east-1, rough monthly)

| Item | ~USD/mo |
|---|---|
| ALB | 18–22 |
| Fargate (1 × 0.5 vCPU / 1 GB, 24×7) | ~18 |
| NAT gateway | ~33 |
| CloudWatch logs + ECR + Secrets Manager | ~5 |
| **Total** | **~$75–80** |

Dropping NAT (public-subnet option) brings it to **~$40/mo**.

---

## 10. Prerequisites & assumptions

1. **AWS creds** valid (SSO `Infra_Engineer`) at apply time — refreshed ✅.
2. **Env values from Vercel** — export the real values for every key in §4.5 to load into Secrets Manager. (This is the one input only you can provide.)
3. **Azure DevOps** — AWS Toolkit extension installed; permission to add pipeline, service connection, variable group.
4. **Terraform** ≥ 1.6 and AWS CLI installed locally for the initial apply.
5. Initial task sizing 0.5 vCPU / 1 GB, desired count 1 — tune after load is observed.

## 11. Open decisions (please confirm during review)

- [ ] **Environment label** — `production` vs `poc`/`staging` for tags/naming?
- [x] **CI→AWS auth** — RESOLVED: reuse the existing `oneRIMS-Dev` ADO service connection (this trial account only; swap when moving accounts).
- [ ] **NAT vs public-subnet** — keep private subnets + NAT (default), or save ~$33/mo with the public-subnet option?
- [ ] **Terraform state** — S3 backend (recommended) or local state to start?
- [ ] Who provides the **Vercel env values** and when?

---

## 12. Success criteria

- App reachable at the **ALB DNS name over HTTP**; login and core pages render (SSR).
- **Agent chat streams token-by-token** through the ALB (SSE not buffered) — the make-or-break check.
- API routes reach Supabase/Anthropic successfully (egress via NAT works).
- A push to `freyrsales` triggers the pipeline and rolls out a new task revision with zero manual steps.
- **Zero** existing account resources created, modified, or referenced.

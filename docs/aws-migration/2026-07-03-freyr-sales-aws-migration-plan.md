# freyr-sales AWS Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the `freyr-sales` Next.js app as a container on AWS ECS Fargate behind an ALB, reachable on the raw ALB URL, deployed via an Azure DevOps pipeline.

**Architecture:** Multi-stage Docker image (Next.js standalone) in ECR → ECS Fargate service in a dedicated new VPC → internet-facing ALB (HTTP :80, SSE-friendly idle timeout). Supabase/Anthropic/etc. stay external, reached via NAT; secrets live in Secrets Manager. Infra is Terraform (applied locally for bootstrap); app image builds/deploys via Azure DevOps.

**Tech Stack:** Next.js 14, Docker, Terraform ≥1.6, AWS (ECS Fargate, ECR, ALB, VPC, Secrets Manager, CloudWatch, IAM), Azure DevOps Pipelines + AWS Toolkit extension.

**Companion spec:** `docs/aws-migration/2026-07-03-freyr-sales-aws-migration-spec.md`

## Global Constraints

- **AWS account `338736353119`, region `us-east-1`, CLI profile `338736353119_Infra_Engineer`** — used verbatim everywhere.
- **Dedicated infra only.** Every resource is newly created and named `freyr-sales-*`. **Never** reference or modify existing resources; **no** Terraform `data` lookups against existing infra. Guard: every `terraform plan`/`apply` must show **`0 to change, 0 to destroy`** — only additions.
- **Tags on all resources:** `Application=freyr-sales`, `ManagedBy=Terraform`, `Environment=production` (via provider `default_tags`).
- **Node 20**; all container builds use **`--platform linux/amd64`**.
- **`NEXT_PUBLIC_*` values are Docker build args** (inlined into the browser bundle at build time).
- **Secrets never enter Terraform state or the repo** — the secret container is created empty by Terraform; values are written via CLI from a gitignored file.
- Work happens on branch **`freyrsales`** of the ADO repo `freyr-documentation`. Repo root = app root.
- **Do not push to `origin` or commit secret/state files.** Local commits only unless the reviewer says otherwise.
- **Pipeline auth:** reuse the existing ADO service connection **`oneRIMS-Dev`** (no new IAM user/key). **Trial account** — account ID `338736353119`, region `us-east-1`, `oneRIMS-Dev`, and the state-bucket name are the only values to change when the infra is later moved/duplicated to a new AWS account.

---

## File Structure

```
freyr-documentation/            (branch: freyrsales)
├── Dockerfile                  # NEW — multi-stage standalone build
├── .dockerignore               # NEW
├── next.config.mjs             # MODIFY — add output: 'standalone'
├── app/api/health/route.ts     # NEW — ALB health check endpoint
├── azure-pipelines.yml         # NEW — build → push → deploy
└── terraform/                  # NEW
    ├── .gitignore
    ├── providers.tf
    ├── backend.tf
    ├── variables.tf
    ├── terraform.tfvars.example
    ├── network.tf
    ├── ecr.tf
    ├── logs.tf
    ├── secrets.tf
    ├── iam.tf
    ├── alb.tf
    ├── ecs.tf
    └── outputs.tf
```

---

## Task 1: Containerize the app

**Files:**
- Modify: `next.config.mjs`
- Create: `Dockerfile`, `.dockerignore`, `app/api/health/route.ts`

**Produces:** a runnable image `freyr-sales:local`; a `GET /api/health` → `200 {"status":"ok"}` endpoint used by the ALB.

- [ ] **Step 1: Add standalone output to `next.config.mjs`**

Add `output: 'standalone',` inside the `nextConfig` object (keep the existing `reactStrictMode` and `eslint` keys):

```js
const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
};
```

- [ ] **Step 2: Create the health route** `app/api/health/route.ts`

```ts
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ status: 'ok' }, { status: 200 })
}
```

- [ ] **Step 3: Ensure a `public/` dir exists** (Next standalone build + Dockerfile copy expect it)

```bash
cd /Users/kevin/freyrsales/freyr-documentation
[ -d public ] || { mkdir -p public && touch public/.gitkeep; }
```

- [ ] **Step 4: Create `.dockerignore`**

```
node_modules
.next
.git
.gitignore
npm-debug.log
Dockerfile
.dockerignore
terraform
docs
tests
playwright.config.ts
**/*.md
.env*
.vercel
```

- [ ] **Step 5: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Step 6: Build the image locally (amd64)**

```bash
cd /Users/kevin/freyrsales/freyr-documentation
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" \
  -t freyr-sales:local .
```
Expected: build completes; final stage copies `.next/standalone`, `.next/static`, `public`.

- [ ] **Step 7: Smoke-test the container boots + health responds**

```bash
docker run --rm -d --name fs -p 3000:3000 freyr-sales:local
sleep 5
curl -fsS http://localhost:3000/api/health   # expect: {"status":"ok"}
docker rm -f fs
```
Expected: `{"status":"ok"}`. (Full app pages need real env; boot + health is the gate here.)

- [ ] **Step 8: Commit (local only)**

```bash
git add next.config.mjs Dockerfile .dockerignore app/api/health/route.ts public/.gitkeep
git commit -m "build: containerize freyr-sales for AWS (standalone + health route)"
```

---

## Task 2: Terraform bootstrap (state backend + provider)

**Files:**
- Create: `terraform/providers.tf`, `terraform/backend.tf`, `terraform/variables.tf`, `terraform/terraform.tfvars.example`, `terraform/.gitignore`

**Produces:** S3 state bucket `freyr-sales-tfstate-338736353119`, lock table `freyr-sales-tf-lock`, an initialized Terraform working dir.

- [ ] **Step 1: Create the state bucket + lock table (one-time)**

```bash
export AWS_PROFILE=338736353119_Infra_Engineer
export AWS_REGION=us-east-1
aws s3api create-bucket --bucket freyr-sales-tfstate-338736353119 --region us-east-1
aws s3api put-bucket-versioning --bucket freyr-sales-tfstate-338736353119 \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket freyr-sales-tfstate-338736353119 \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws dynamodb create-table --table-name freyr-sales-tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region us-east-1
```
Expected: bucket + table created (these two are the only "manual" resources; they are still dedicated to this app).

- [ ] **Step 2: `terraform/.gitignore`**

```
.terraform/
*.tfstate
*.tfstate.*
*.tfvars
!*.tfvars.example
taskdef.json
secret.json
```

- [ ] **Step 3: `terraform/providers.tf`**

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
  default_tags {
    tags = {
      Application = "freyr-sales"
      ManagedBy   = "Terraform"
      Environment = var.environment
    }
  }
}
```

- [ ] **Step 4: `terraform/backend.tf`**

```hcl
terraform {
  backend "s3" {
    bucket         = "freyr-sales-tfstate-338736353119"
    key            = "freyr-sales/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "freyr-sales-tf-lock"
    encrypt        = true
  }
}
```

- [ ] **Step 5: `terraform/variables.tf`**

```hcl
variable "region"       { default = "us-east-1" }
variable "aws_profile"  { default = "338736353119_Infra_Engineer" }
variable "environment"  { default = "production" }

variable "vpc_cidr"             { default = "10.42.0.0/16" }
variable "azs"                  { default = ["us-east-1a", "us-east-1b"] }
variable "public_subnet_cidrs"  { default = ["10.42.0.0/24", "10.42.1.0/24"] }
variable "private_subnet_cidrs" { default = ["10.42.10.0/24", "10.42.11.0/24"] }

variable "image_tag"     { default = "latest" }
variable "desired_count" { default = 1 }
variable "task_cpu"      { default = 512 }
variable "task_memory"   { default = 1024 }

# non-secret runtime config (public values)
variable "next_public_supabase_url"      {}
variable "next_public_supabase_anon_key" {}
variable "email_from" { default = "" }
```

- [ ] **Step 6: `terraform/terraform.tfvars.example`** (copy to `terraform.tfvars`, which is gitignored)

```hcl
next_public_supabase_url      = "https://YOUR-PROJECT.supabase.co"
next_public_supabase_anon_key = "eyJ...your-anon-key..."
email_from                    = "sales@yourdomain.com"
```

- [ ] **Step 7: Initialize Terraform**

```bash
cd /Users/kevin/freyrsales/freyr-documentation/terraform
cp terraform.tfvars.example terraform.tfvars   # then edit with real public values
terraform init
```
Expected: "Terraform has been successfully initialized!" with the S3 backend.

- [ ] **Step 8: Commit (local only — tfvars/state excluded by .gitignore)**

```bash
git add terraform/.gitignore terraform/providers.tf terraform/backend.tf terraform/variables.tf terraform/terraform.tfvars.example
git commit -m "infra: terraform bootstrap (s3 backend, provider, variables)"
```

---

## Task 3: Terraform networking (dedicated VPC)

**Files:** Create `terraform/network.tf`

**Produces:** `aws_vpc.main`, `aws_subnet.public[*]`, `aws_subnet.private[*]`, `aws_nat_gateway.nat` — referenced by ALB and ECS tasks.

- [ ] **Step 1: `terraform/network.tf`**

```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "freyr-sales-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "freyr-sales-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "freyr-sales-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]
  tags = { Name = "freyr-sales-private-${count.index}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "freyr-sales-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "freyr-sales-nat" }
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = { Name = "freyr-sales-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = { Name = "freyr-sales-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
```

- [ ] **Step 2: Validate**

```bash
cd /Users/kevin/freyrsales/freyr-documentation/terraform
terraform validate && terraform fmt
```
Expected: "Success! The configuration is valid."

- [ ] **Step 3: Commit** — `git add terraform/network.tf && git commit -m "infra: dedicated VPC, subnets, NAT"`

---

## Task 4: Terraform ECR + CloudWatch logs

**Files:** Create `terraform/ecr.tf`, `terraform/logs.tf`

**Produces:** `aws_ecr_repository.app` (`.repository_url`, `.arn`), `aws_cloudwatch_log_group.app`.

- [ ] **Step 1: `terraform/ecr.tf`**

```hcl
resource "aws_ecr_repository" "app" {
  name                 = "freyr-sales"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}
```

- [ ] **Step 2: `terraform/logs.tf`**

```hcl
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/freyr-sales"
  retention_in_days = 30
}
```

- [ ] **Step 3: Validate + commit**

```bash
terraform validate
git add terraform/ecr.tf terraform/logs.tf && git commit -m "infra: ECR repo + CloudWatch log group"
```

---

## Task 5: Terraform IAM + Secrets container

**Files:** Create `terraform/iam.tf`, `terraform/secrets.tf`

**Produces:** `aws_iam_role.execution`, `aws_iam_role.task`, `aws_secretsmanager_secret.runtime` (`.arn`). (No CI IAM user — the pipeline reuses the existing `oneRIMS-Dev` ADO service connection; see Task 12.)

- [ ] **Step 1: `terraform/secrets.tf`**

```hcl
resource "aws_secretsmanager_secret" "runtime" {
  name        = "freyr-sales/runtime"
  description = "Runtime secrets for freyr-sales (values set out-of-band via CLI)"
}
```

- [ ] **Step 2: `terraform/iam.tf`**

```hcl
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "freyr-sales-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "freyr-sales-read-secret"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.runtime.arn]
    }]
  })
}

resource "aws_iam_role" "task" {
  name               = "freyr-sales-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# NOTE: no CI IAM user is created. The Azure DevOps pipeline authenticates via the
# existing "oneRIMS-Dev" service connection (see Task 12). If that connection's
# identity lacks deploy permissions, attach the reference policy shown in Task 12.
```

- [ ] **Step 3: Validate + commit**

```bash
terraform validate
git add terraform/iam.tf terraform/secrets.tf && git commit -m "infra: IAM roles, CI user, secrets container"
```

---

## Task 6: Terraform ALB + security groups

**Files:** Create `terraform/alb.tf`

**Consumes:** `aws_vpc.main`, `aws_subnet.public[*]`.
**Produces:** `aws_lb.alb` (`.dns_name`), `aws_lb_target_group.app` (`.arn`), `aws_security_group.svc`, `aws_lb_listener.http`.

- [ ] **Step 1: `terraform/alb.tf`**

```hcl
resource "aws_security_group" "alb" {
  name        = "freyr-sales-alb-sg"
  description = "ALB ingress"
  vpc_id      = aws_vpc.main.id
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "freyr-sales-alb-sg" }
}

resource "aws_security_group" "svc" {
  name        = "freyr-sales-svc-sg"
  description = "Fargate service ingress from ALB only"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "app port from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "freyr-sales-svc-sg" }
}

resource "aws_lb" "alb" {
  name               = "freyr-sales-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300
  tags               = { Name = "freyr-sales-alb" }
}

resource "aws_lb_target_group" "app" {
  name                 = "freyr-sales-tg"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  deregistration_delay = 30
  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
```

- [ ] **Step 2: Validate + commit**

```bash
terraform validate
git add terraform/alb.tf && git commit -m "infra: ALB, target group, security groups"
```

---

## Task 7: Terraform ECS (cluster, task def, service) + outputs

**Files:** Create `terraform/ecs.tf`, `terraform/outputs.tf`

**Consumes:** execution/task roles, log group, secret ARN, ECR repo URL, target group, private subnets, svc SG.
**Produces:** `aws_ecs_cluster.main`, `aws_ecs_task_definition.app`, `aws_ecs_service.app`; outputs `alb_dns_name`, `ecr_repo_url`, `cluster_name`, `service_name`, `task_family`.

- [ ] **Step 1: `terraform/ecs.tf`**

```hcl
resource "aws_ecs_cluster" "main" {
  name = "freyr-sales-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "freyr-sales"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "freyr-sales"
    image        = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "NEXT_PUBLIC_SUPABASE_URL", value = var.next_public_supabase_url },
      { name = "NEXT_PUBLIC_SUPABASE_ANON_KEY", value = var.next_public_supabase_anon_key },
      { name = "EMAIL_FROM", value = var.email_from }
    ]
    secrets = [
      { name = "SUPABASE_SERVICE_ROLE_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:SUPABASE_SERVICE_ROLE_KEY::" },
      { name = "ANTHROPIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:ANTHROPIC_API_KEY::" },
      { name = "APIFY_API_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:APIFY_API_TOKEN::" },
      { name = "FIRECRAWL_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:FIRECRAWL_API_KEY::" },
      { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RESEND_API_KEY::" },
      { name = "SMTP_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:SMTP_URL::" },
      { name = "TELEGRAM_BOT_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:TELEGRAM_BOT_TOKEN::" },
      { name = "TELEGRAM_CHAT_ID", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:TELEGRAM_CHAT_ID::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "freyr-sales-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.svc.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "freyr-sales"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.http]

  # The Azure DevOps pipeline updates the task-def revision; don't let TF revert it.
  lifecycle {
    ignore_changes = [task_definition]
  }
}
```

- [ ] **Step 2: `terraform/outputs.tf`**

```hcl
output "alb_dns_name" { value = aws_lb.alb.dns_name }
output "ecr_repo_url" { value = aws_ecr_repository.app.repository_url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "service_name" { value = aws_ecs_service.app.name }
output "task_family"  { value = aws_ecs_task_definition.app.family }
```

- [ ] **Step 3: Validate + commit**

```bash
terraform validate && terraform fmt
git add terraform/ecs.tf terraform/outputs.tf && git commit -m "infra: ECS cluster, task definition, service, outputs"
```

---

## Task 8: First apply — stand up infra with 0 running tasks

**Consumes:** all Terraform from Tasks 2–7.
**Produces:** live AWS infra (VPC, ALB, ECR, roles, secret, cluster, service with 0 tasks).

- [ ] **Step 1: Plan and confirm it only ADDS (isolation guard)**

```bash
cd /Users/kevin/freyrsales/freyr-documentation/terraform
terraform plan -var desired_count=0 -out tfplan
```
Expected: `Plan: N to add, 0 to change, 0 to destroy.` **If anything shows change/destroy, STOP** — it means an existing resource is being touched.

- [ ] **Step 2: Apply**

```bash
terraform apply tfplan
```
Expected: apply completes; outputs print `alb_dns_name`, `ecr_repo_url`, etc.

- [ ] **Step 3: Record outputs**

```bash
terraform output
```
Save `alb_dns_name` and `ecr_repo_url` for the next tasks.

---

## Task 9: Populate runtime secrets (from Vercel values)

**Consumes:** `aws_secretsmanager_secret.runtime` (created in Task 8).

- [ ] **Step 1: Create a local `secret.json`** (in `terraform/`, gitignored) with the real Vercel values. **All 8 keys must be present** — use an empty string for any unused service, or the task will fail to start.

```json
{
  "SUPABASE_SERVICE_ROLE_KEY": "...",
  "ANTHROPIC_API_KEY": "...",
  "APIFY_API_TOKEN": "...",
  "FIRECRAWL_API_KEY": "...",
  "RESEND_API_KEY": "...",
  "SMTP_URL": "...",
  "TELEGRAM_BOT_TOKEN": "...",
  "TELEGRAM_CHAT_ID": "..."
}
```

- [ ] **Step 2: Put the secret value, then delete the file**

```bash
export AWS_PROFILE=338736353119_Infra_Engineer
aws secretsmanager put-secret-value --secret-id freyr-sales/runtime \
  --secret-string file://secret.json --region us-east-1
rm -f secret.json
```

- [ ] **Step 3: Verify keys exist (values redacted)**

```bash
aws secretsmanager get-secret-value --secret-id freyr-sales/runtime \
  --query SecretString --output text --region us-east-1 | jq 'keys'
```
Expected: array of the 8 key names.

---

## Task 10: Build and push the first image (manual bootstrap)

**Consumes:** `ecr_repo_url` from Task 8.
**Produces:** `:latest` image in ECR that the service can pull.

- [ ] **Step 1: Log in to ECR**

```bash
export AWS_PROFILE=338736353119_Infra_Engineer
REG=338736353119.dkr.ecr.us-east-1.amazonaws.com
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$REG"
```
Expected: "Login Succeeded".

- [ ] **Step 2: Build (amd64) with real public build args + push**

```bash
cd /Users/kevin/freyrsales/freyr-documentation
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ...anon..." \
  -t "$REG/freyr-sales:latest" .
docker push "$REG/freyr-sales:latest"
```

- [ ] **Step 3: Verify the image is in ECR**

```bash
aws ecr describe-images --repository-name freyr-sales --region us-east-1 \
  --query 'imageDetails[].imageTags'
```
Expected: shows `latest`.

---

## Task 11: Bring the service up + verify (incl. SSE)

**Consumes:** image (Task 10), secrets (Task 9), infra (Task 8).
**Produces:** a running task serving traffic on the ALB URL. **This is the make-or-break verification.**

- [ ] **Step 1: Scale to 1 task**

```bash
cd /Users/kevin/freyrsales/freyr-documentation/terraform
terraform apply -var desired_count=1 -auto-approve
```
Expected: `0 to add, 1 to change` (service desired_count), `0 to destroy`.

- [ ] **Step 2: Wait for the service to stabilize**

```bash
export AWS_PROFILE=338736353119_Infra_Engineer
aws ecs wait services-stable --cluster freyr-sales-cluster --services freyr-sales-svc --region us-east-1
aws ecs describe-services --cluster freyr-sales-cluster --services freyr-sales-svc \
  --region us-east-1 --query 'services[0].{running:runningCount,desired:desiredCount}'
```
Expected: `running=1, desired=1`. If the task is crash-looping, check `aws logs tail /ecs/freyr-sales --follow`.

- [ ] **Step 3: Health check through the ALB**

```bash
ALB=$(terraform output -raw alb_dns_name)
curl -i "http://$ALB/api/health"
```
Expected: `HTTP/1.1 200` and `{"status":"ok"}`.

- [ ] **Step 4: Load the app in a browser**

Open `http://<alb_dns_name>/` → the login page renders (SSR working).

- [ ] **Step 5: Verify SSE streaming (the critical check)**

Log in and use the **AI agent chat**; confirm the response streams **token-by-token** (not one delayed dump). This proves the ALB (idle_timeout 300 + no buffering) passes SSE end-to-end. Cross-check server logs:

```bash
aws logs tail /ecs/freyr-sales --since 10m --region us-east-1
```
Expected: request logs for the agent endpoint, no 5xx.

---

## Task 12: Azure DevOps pipeline (automated deploys)

**Files:** Create `azure-pipelines.yml` (repo root)

**Manual prerequisites in Azure DevOps** (document who did these):
1. Ensure the **AWS Toolkit for Azure DevOps** extension is installed in the `FreyrDevOps` org (provides the `AWSShellScript` task).
2. Reuse the **existing AWS service connection `oneRIMS-Dev`** (valid for this trial account `338736353119` only) and authorize this pipeline to use it. **No new IAM user or access key is created.**
   - **Verify its identity can deploy.** It needs ECR push + `ecs:RegisterTaskDefinition`/`ecs:UpdateService`/`ecs:DescribeServices` + `iam:PassRole` on the two task roles. If the first run fails with `AccessDenied`, attach this policy to the connection's underlying IAM identity:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Sid": "EcrAuth", "Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"], "Resource": "*" },
         { "Sid": "EcrPush", "Effect": "Allow",
           "Action": ["ecr:BatchCheckLayerAvailability","ecr:CompleteLayerUpload","ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart","ecr:BatchGetImage","ecr:DescribeImages"],
           "Resource": "arn:aws:ecr:us-east-1:338736353119:repository/freyr-sales" },
         { "Sid": "EcsDeploy", "Effect": "Allow",
           "Action": ["ecs:RegisterTaskDefinition","ecs:DescribeTaskDefinition","ecs:DescribeServices","ecs:UpdateService"],
           "Resource": "*" },
         { "Sid": "PassRoles", "Effect": "Allow", "Action": ["iam:PassRole"],
           "Resource": ["arn:aws:iam::338736353119:role/freyr-sales-ecs-execution-role","arn:aws:iam::338736353119:role/freyr-sales-ecs-task-role"] }
       ]
     }
     ```
3. Create a **variable group** `freyr-sales-ci` with: `AWS_REGION=us-east-1`, `ECR_REGISTRY=338736353119.dkr.ecr.us-east-1.amazonaws.com`, `ECR_REPO=freyr-sales`, `ECS_CLUSTER=freyr-sales-cluster`, `ECS_SERVICE=freyr-sales-svc`, `TASK_FAMILY=freyr-sales`, `NEXT_PUBLIC_SUPABASE_URL=...`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`.

- [ ] **Step 1: Create `azure-pipelines.yml`**

```yaml
trigger:
  branches:
    include:
      - freyrsales

pool:
  vmImage: ubuntu-latest

variables:
  - group: freyr-sales-ci

steps:
  - task: AWSShellScript@1
    displayName: Build, push, and deploy
    inputs:
      awsCredentials: 'oneRIMS-Dev'   # existing connection; trial account 338736353119 only — swap when moving accounts
      regionName: '$(AWS_REGION)'
      scriptType: 'inline'
      inlineScript: |
        set -euo pipefail
        TAG=$(echo "$(Build.SourceVersion)" | cut -c1-7)
        IMAGE="$(ECR_REGISTRY)/$(ECR_REPO)"

        aws ecr get-login-password --region "$(AWS_REGION)" \
          | docker login --username AWS --password-stdin "$(ECR_REGISTRY)"

        docker build --platform linux/amd64 \
          --build-arg NEXT_PUBLIC_SUPABASE_URL="$(NEXT_PUBLIC_SUPABASE_URL)" \
          --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(NEXT_PUBLIC_SUPABASE_ANON_KEY)" \
          -t "$IMAGE:$TAG" -t "$IMAGE:latest" .
        docker push "$IMAGE:$TAG"
        docker push "$IMAGE:latest"

        TD=$(aws ecs describe-task-definition --task-definition "$(TASK_FAMILY)" \
              --query 'taskDefinition' --output json)
        echo "$TD" | jq --arg IMG "$IMAGE:$TAG" '
          .containerDefinitions[0].image=$IMG
          | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,
                .compatibilities,.registeredAt,.registeredBy)' > taskdef.json
        REV=$(aws ecs register-task-definition --cli-input-json file://taskdef.json \
              --query 'taskDefinition.revision' --output text)

        aws ecs update-service --cluster "$(ECS_CLUSTER)" --service "$(ECS_SERVICE)" \
          --task-definition "$(TASK_FAMILY):$REV" --force-new-deployment
        aws ecs wait services-stable --cluster "$(ECS_CLUSTER)" --services "$(ECS_SERVICE)"
```

- [ ] **Step 2: Commit and push the branch to trigger the pipeline**

```bash
git add azure-pipelines.yml
git commit -m "ci: Azure DevOps build-and-deploy pipeline"
# push only after reviewer confirms the pipeline/service-connection are set up:
# git push origin freyrsales
```

- [ ] **Step 3: Verify the pipeline deploys a new revision**

In Azure DevOps, confirm the run succeeds. Then:
```bash
aws ecs describe-services --cluster freyr-sales-cluster --services freyr-sales-svc \
  --region us-east-1 --query 'services[0].taskDefinition'
```
Expected: a revision number higher than the Terraform-created one; app still healthy on the ALB URL.

---

## Task 13: Final verification & handoff

- [ ] **Step 1: Isolation audit — only freyr-sales resources exist in state**

```bash
cd /Users/kevin/freyrsales/freyr-documentation/terraform
terraform state list
```
Expected: every entry is a `freyr-sales-*` resource created by this plan. Confirm no pre-existing resources were imported/modified.

- [ ] **Step 2: Functional checklist**
  - [ ] `http://<alb_dns_name>/api/health` → 200
  - [ ] Login + SSR pages render
  - [ ] **Agent chat streams token-by-token** (SSE OK)
  - [ ] An API route that hits Supabase returns data (egress via NAT OK)
  - [ ] CloudWatch `/ecs/freyr-sales` shows app logs, no repeated 5xx
  - [ ] Push to `freyrsales` → pipeline auto-deploys

- [ ] **Step 3: Document the live URL + deferred items** in the spec's §8 (domain/HTTPS, autoscaling, CloudFront/WAF, Vercel decommission).

---

## Self-Review (author)

- **Spec coverage:** every §4 resource has a Terraform task (3–7); container/§5 → Task 1; CI/§6 → Task 12; state backend/§7 → Task 2; SSE success criterion/§12 → Task 11 Step 5 + Task 13. ✅
- **Ordering:** secret container (T5) before values (T9); ECR (T4) + image (T10) before service scale-up (T11); service created at count 0 (T8) to avoid pulling a nonexistent image. ✅
- **Isolation guard:** `plan` must show `0 to change, 0 to destroy` (T8) and `state list` is all `freyr-sales-*` (T13). ✅
- **Name consistency:** cluster `freyr-sales-cluster`, service `freyr-sales-svc`, family `freyr-sales`, container `freyr-sales`, secret `freyr-sales/runtime` — identical across `ecs.tf`, outputs, pipeline variable group, and CLI verifications. ✅
- **Secrets hygiene:** secret values only via `file://secret.json` (gitignored, deleted after); `terraform.tfvars`/state/`taskdef.json` gitignored; no secret in the image or repo. ✅

# Freyr Sales Intelligence

Internal sales-enablement workspace for Freyr Solutions. It combines an
offerings repository, account/contact intelligence, matched pitch generation,
human-reviewed agent actions, pipeline, campaigns, and voice workflows.

## Workspace modes

- **Mock mode (default):** the complete seeded showcase. External provider keys
  are never consumed in this mode.
- **Clean mode:** no sample companies, offerings, campaigns, calls, recordings,
  teammates, analytics, or knowledge-base content. Users can follow onboarding
  and create their own records. Until PostgreSQL is configured, clean-mode data
  is process-local and must not be treated as durable.

Switch modes in **Settings → Workspace**. There is intentionally no billing UI.

New team members start at `/onboarding`. The setup hub walks them through the
workspace mode, profile, offering repository, customer/contact import, first
human-approved pitch, and Entra-managed team access. `/import` accepts the
approved offering workbook and an accounts/contacts CSV template.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:smoke
npm run test:e2e
npm audit --omit=dev
```

## Production deployment

The agreed topology is Azure DevOps for internal source control/CI and AWS for
runtime. The app builds as a non-root standalone container via `Dockerfile`.
Deployment handoff and the ECS task template are in [`deploy/`](deploy/README.md).

Before production, Freyr infrastructure must provide:

- HTTPS/ACM and the approved `freyrapps.com` hostname.
- ALB OIDC authentication against Freyr Microsoft Entra ID.
- Private ECS networking and AWS Secrets Manager.
- A durable PostgreSQL database with both SQL migrations applied.
- Approved Azure DevOps repository access and ECR service connection.

Never send API keys in Teams/chat or commit `.env.local`.
Production fails closed when identity headers are absent and defaults to Clean
mode in the ECS task template. Mock mode must be enabled deliberately for demos.

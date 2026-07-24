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

The first approved sign-in automatically starts a role-aware, interactive
product tour. It opens each available feature, spotlights the relevant control,
requires an explicit Next/Back choice, and saves progress to the user's account.
The permanent **Product tour** link in the sidebar and account menu opens the
tour hub at `/onboarding`, where a completed or skipped tour can be replayed.
`/import` accepts the approved offering workbook and an accounts/contacts CSV
template.

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
npm run test:onboarding
npm run test:e2e
npm audit --omit=dev
```

## Production deployment

The agreed topology is Azure DevOps for internal source control/CI and AWS for
runtime. The app builds as a non-root standalone container via `Dockerfile`.
Deployment handoff and the ECS task template are in [`deploy/`](deploy/README.md).

Before production, Freyr infrastructure must provide:

- HTTPS/ACM and the approved `freyrapps.com` hostname.
- Exactly one authentication edge: Supabase login with a forward-only ALB
  listener (`AUTH_MODE=supabase`), or ALB Microsoft Entra OIDC
  (`AUTH_MODE=aws-alb`). Do not enable both.
- Private ECS networking and AWS Secrets Manager.
- A production Supabase/PostgreSQL database with migrations `001` through `009`
  applied in order.
- For Supabase login, confirmed-email enforcement, the exact production Site
  URL/login redirect allowlist, production SMTP, the invite-only Before User
  Created hook finalized by migration `009`, per-user tour state from migration
  `008`, a stable workspace UUID, and the first-owner invitation bootstrap
  described in the deployment handoff. Invited users may use any valid email
  domain; an uninvited identity receives no workspace access.
- Approved Azure DevOps repository access and ECR service connection.

Never send API keys in Teams/chat or commit `.env.local`.
Production fails closed when identity headers are absent and defaults to Clean
mode in the ECS task template. Mock mode must be enabled deliberately for demos.

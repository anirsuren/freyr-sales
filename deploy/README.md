# Freyr AWS deployment handoff

The application runtime is AWS; Azure DevOps is source control and CI. The
pipeline verifies every commit and publishes an immutable container image.

Required before production traffic:

1. Give Anir access to the `Freyr-Sales` Azure DevOps project/repository.
2. Create an Azure DevOps AWS service connection named `freyr-sales-aws`. Its
   role needs ECR push access plus permission to read/register ECS task
   definitions and update the configured ECS service.
3. Render `ecs-task-definition.json` with the account's ECS roles, ECR image,
   region, and a Secrets Manager JSON secret ARN. Never place credentials in
   pipeline variables or chat.
4. Put ECS tasks in private subnets. The security group must accept port 8080
   only from the ALB security group.
5. Add an HTTPS listener with an ACM certificate for
   `freyrsales.dev.freyrapps.com`; redirect HTTP to HTTPS.
6. Choose exactly one authentication topology:
   - For the Supabase email/password login shipped in the task template, set
     `AUTH_MODE=supabase` and make the HTTPS listener's application action
     **forward directly to the target group**. Do not add an ALB
     `authenticate-oidc` action in front of it.
   - To retain Microsoft Entra authentication at the load balancer, configure
     the listener's `authenticate-oidc` action followed by the forward action
     and set `AUTH_MODE=aws-alb`.

   Do not combine ALB OIDC with `AUTH_MODE=supabase`: that creates two login
   walls and also prevents unauthenticated provider webhooks from reaching the
   application. In either topology, keep the ECS task private and allow port
   8080 only from the ALB security group.
7. Set the target-group health path to `/api/health` and enable deployment
   rollback/circuit breaker.
8. Apply every SQL migration in filename order, from
   `001_initial_schema.sql` through the migration numbered `012`, to the
   approved Supabase/PostgreSQL service before starting the live task.
   Migration 006 is required for provider-aware Supabase identities, and
   migration 007 introduces the original auth hook. Migration 008 stores
   versioned product-tour progress for each approved workspace member, and
   migration 009 replaces the original domain policy with an invite-only auth
   hook. Migration 010 adds stable member IDs to record ownership, and
   migration 012 makes the inviter-selected full name the member’s canonical
   audit identity. The offering catalog is hydrated from its durable row when
   each ECS task starts.
9. Store all provider and database credentials in AWS Secrets Manager and rotate
   any value previously pasted into chat.
10. Run an authenticated mock-mode smoke test after deploying the current AWS
    sales-demo release. Before a business-data launch, deploy a separately
    reviewed live-mode task definition and run the live-mode smoke test against
    that release.

## Supabase authentication setup

For `AUTH_MODE=supabase`, configure the production Supabase project before
deploying:

1. In **Authentication → Providers → Email**, enable email/password sign-in and
   turn on **Confirm email**. Do not disable confirmation for production:
   bootstrap-owner access is matched by verified email address.
2. In **Authentication → URL Configuration**, set the production Site URL to
   `https://freyrsales.dev.freyrapps.com` and add
   `https://freyrsales.dev.freyrapps.com/login` to the redirect allow list.
   Substitute the final approved hostname if it changes, and avoid broad
   wildcard redirects. Keep localhost redirects limited to a development
   project.
3. Configure production SMTP so confirmation messages are sent from the
   approved Freyr sender instead of the development mail service.
4. Apply migrations `001` through `012` in order. Migration `008` creates the
   service-role-only, per-user product-tour state table. Migration `009`
   replaces the earlier domain guard with an invitation check. In
   **Authentication → Auth Hooks**, configure **Before User Created** to use the
   Postgres function `public.freyr_before_user_created`. The hook allows any
   syntactically valid email domain only when that exact normalized address has
   a pending, unexpired workspace invitation. This prevents the public Supabase
   signup API from bypassing the application's invitation check. Migrations
   `010` through `012` add stable ownership, agent-run creator IDs, and
   inviter-controlled canonical names.

The JSON secret referenced by `APP_SECRETS_ARN` must contain all of these keys:

- `NEXT_PUBLIC_SUPABASE_URL`: the production Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the project's public anon key. It is injected
  at both image-build time and task runtime.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key. Never expose it
  to browser code, logs, pipeline output, or chat.
- `AUTH_COOKIE_SECRET`: a cryptographically random value with at least 32 bytes
  of entropy. Keep it identical across all running tasks and rolling
  deployments; changing it signs every user out.
- `FREYR_WORKSPACE_ID`: one UUID chosen once for this production workspace.
  Keep it stable across deployments and task replacements.
- `OWNER_EMAILS`: a comma-separated bootstrap allowlist. Initially set it to
  the exact verified email address(es) that may create the first administrator.
- `RESEND_API_KEY`: the server-only Resend key used for workspace invitations.
  It also delivers feedback and bug reports. Deployments are blocked if the
  live task has no binding for this key.
  Invitation delivery is transactional and remains active while the UI is
  showing mock data.

The optional `EMAIL_FROM` task environment variable may override the default
`Freyr <sales@freyrsolutions.com>` sender. Whichever address is used must be
verified with the email provider before inviting users.

Feedback and bug reports are delivered to `anir.s@freyrsolutions.com` by default. Set
`FEEDBACK_RECIPIENT_EMAIL` on the task to change the support recipient without
changing application code.

The Azure DevOps variable group must also provide
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the container
build, because Next.js embeds those public values in the login page. Never add
`SUPABASE_SERVICE_ROLE_KEY` to build arguments; it belongs only in the ECS task
secret bindings.

The task environment must set `AUTH_MODE=supabase`,
`ACCESS_CONTROL_MODE=approval`, and
`AUTH_PUBLIC_ORIGIN=https://freyrsales.dev.freyrapps.com`. The public origin is
the fixed, browser-facing HTTPS origin used for authentication redirects and
email callbacks; never derive it from proxy headers. Email domains are not an
authorization boundary: the exact normalized address must match a pending,
unexpired invitation. The application fails its production health check when
required authentication configuration is absent or the approval
tables/migration are not reachable.

### First-owner bootstrap

`OWNER_EMAILS` is a temporary bootstrap mechanism, not an ongoing owner group.
Because migration 009 also protects the public Supabase signup API, seed the
first invitation before the owner signs up:

1. Choose the permanent `FREYR_WORKSPACE_ID`, apply the migrations, and
   upsert that UUID into `workspaces`.
2. Insert a pending, unexpired `workspace_invitations` row for the intended
   owner's exact normalized email with `app_role = 'admin'`. `invited_by` may
   be null for this one bootstrap record.
3. Deploy with only that same exact email in `OWNER_EMAILS`.
4. Have the owner sign up with the invited address, click the Supabase
   confirmation email, and sign in.
5. Verify an active `app_users` row exists for `FREYR_WORKSPACE_ID` with
   `auth_provider = 'supabase'` and `app_role = 'admin'`.
6. Set the existing `OWNER_EMAILS` JSON secret value to an empty string and
   replace the ECS tasks. Keep the JSON key present because the task definition
   references it.

After bootstrap, owners must invite every additional user from **Settings →
Team**. The invitation may use any valid email domain and expires after 14
days. The application emails the recipient a prefilled signup link through
Resend. A person without a matching live invitation cannot create an account
or receive an application access grant.

## Access-control settings

Invite-only access uses these deployment settings:

- `AUTH_COOKIE_SECRET`: signs both the login and workspace-access cookies.
- `FREYR_WORKSPACE_ID`: binds approvals to the deterministic production
  workspace.
- `ACCESS_CONTROL_MODE=approval`: keep enabled after migrations, identity
  configuration, service-role access, and the cookie secret are verified.

Unknown identities receive no application access grant. An owner grants access
by creating a 14-day invitation for the exact email in Settings → Team; email
domain alone never grants access. Catalog editors may maintain offerings and
sales materials but cannot manage workspace access or security. Sales reps can
view offerings and use them in pitches without editing the catalog.

## Data-mode release policy

The current AWS sales-demo task deliberately sets `DEFAULT_DATA_MODE=mock` and
`DATA_MODE_LOCKED=1`. Authentication, verified-email signup, invitations, and
per-user onboarding remain real, while the CRM records shown in the product are
the complete sample workspace. Settings keeps Mock Mode visible for product-tour
guidance, labels it as deployment controlled, and does not allow a browser to
switch the running service to live data.

For a business-data launch, use a separate reviewed task definition with
`DEFAULT_DATA_MODE=live` and `DATA_MODE_LOCKED=1`. Do not unlock data mode on a
shared or multi-task ECS service: every task and every signed-in browser must
resolve the same deployment-controlled mode.

The deployment stage builds and pushes the immutable commit image, registers a
new revision of the existing task family, updates the configured existing ECS
service, and waits for the service to become stable. `APP_VERSION` is set to the
full source commit so `/api/health` can prove which release is running. The
pipeline preserves the existing task environment and Secrets Manager bindings;
it does not create a new cluster, service, or deployment topology.

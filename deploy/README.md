# Freyr AWS deployment handoff

The application runtime is AWS; Azure DevOps is source control and CI. The
pipeline verifies every commit and publishes an immutable container image.

Required before production traffic:

1. Give Anir access to the `Freyr-Sales` Azure DevOps project/repository.
2. Create an Azure DevOps Docker service connection named by
   `AWS_ECR_DOCKER_SERVICE_CONNECTION` with push-only access to the ECR repo.
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
   `001_initial_schema.sql` through `006_supabase_auth.sql`, to the approved
   Supabase/PostgreSQL service before starting the live task. Migration 006 is
   required for provider-aware Supabase identities. The offering catalog is
   hydrated from its durable row when each ECS task starts.
9. Store all provider and database credentials in AWS Secrets Manager and rotate
   any value previously pasted into chat.
10. Run a live-mode smoke test after deploy. Use a separate mock-configured demo
    task or local environment for demonstrations.

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
3. Apply migrations `001` through `006` in order and confirm that
   `006_supabase_auth.sql` completed successfully.

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

The Azure DevOps variable group must also provide
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the container
build, because Next.js embeds those public values in the login page. Never add
`SUPABASE_SERVICE_ROLE_KEY` to build arguments; it belongs only in the ECS task
secret bindings.

The task environment must set `AUTH_MODE=supabase` and
`ACCESS_CONTROL_MODE=approval`. The application fails its production health
check when required authentication configuration is absent or the approval
tables/migration are not reachable.

### First-owner bootstrap

`OWNER_EMAILS` is a temporary bootstrap mechanism, not an ongoing owner group:

1. Deploy with only the intended first owner's exact email in `OWNER_EMAILS`.
2. Have that owner sign up, click the Supabase confirmation email, and sign in.
3. Verify an active `app_users` row exists for `FREYR_WORKSPACE_ID` with
   `auth_provider = 'supabase'` and `app_role = 'admin'`.
4. Set the existing `OWNER_EMAILS` JSON secret value to an empty string and
   replace the ECS tasks. Keep the JSON key present because the task definition
   references it.

After bootstrap, owners should invite or approve every additional user from
**Settings → Access**. A person who can authenticate but has not been approved
sees the access-pending page and receives no application data.

## Access-control settings

Invite-only access uses these deployment settings:

- `AUTH_COOKIE_SECRET`: signs both the login and workspace-access cookies.
- `FREYR_WORKSPACE_ID`: binds approvals to the deterministic production
  workspace.
- `ACCESS_CONTROL_MODE=approval`: keep enabled after migrations, identity
  configuration, service-role access, and the cookie secret are verified.

Unknown identities create an access request and see no application data.
An owner approves or rejects the request in Settings → Access. Owners can also
pre-approve an identity by creating a 14-day invitation in Settings → Team.
Catalog editors may maintain offerings and sales materials but cannot manage
workspace access or security. Sales reps can view offerings and use them in
pitches without editing the catalog.

The current sales-demo task sets `DEFAULT_DATA_MODE=mock` and
`DATA_MODE_LOCKED=0`. It opens with the complete sample workspace and allows
the Settings toggle to switch between mock and the clean Supabase-backed real
workspace. Before a production launch, use a separate task definition with
`DEFAULT_DATA_MODE=live` and `DATA_MODE_LOCKED=1` so every task uses the same
deployment-controlled mode.

The deployment stage builds and pushes the immutable commit image, registers a
new revision of the existing task family, updates the configured existing ECS
service, and waits for the service to become stable. `APP_VERSION` is set to the
full source commit so `/api/health` can prove which release is running. The
pipeline preserves the existing task environment and Secrets Manager bindings;
it does not create a new cluster, service, or deployment topology.

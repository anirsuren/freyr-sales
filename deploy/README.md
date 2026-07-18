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
6. Configure ALB OIDC authentication against Freyr's Microsoft Entra tenant,
   then set `AUTH_MODE=aws-alb`. Keep `/api/health` available only to the ALB.
   Authentication alone is not workspace access: after the database migration
   and owner bootstrap below are ready, set `ACCESS_CONTROL_MODE=approval`.
7. Set the target-group health path to `/api/health` and enable deployment
   rollback/circuit breaker.
8. Apply every SQL migration, including `004_invite_only_access.sql`, to the
   approved PostgreSQL service before starting the live task. The offering
   catalog is hydrated from that durable row when each ECS task starts.
9. Store all provider and database credentials in AWS Secrets Manager and rotate
   any value previously pasted into chat.
10. Run a live-mode smoke test after deploy. Use a separate mock-configured demo
    task or local environment for demonstrations.

Invite-only access requires these deployment secrets/settings:

- `AUTH_COOKIE_SECRET`: a randomly generated value of at least 32 characters.
- `OWNER_EMAILS`: the comma-separated identities allowed to bootstrap the first
  workspace administrator. Remove temporary addresses after the owner signs in.
- `FREYR_WORKSPACE_ID`: the production workspace UUID. Setting this avoids any
  ambiguity if the database later contains multiple workspaces.
- `ACCESS_CONTROL_MODE=approval`: enable only after the migration, SSO headers,
  service-role database access, owner email, and cookie secret are verified.

Unknown SSO identities create an access request and see no application data.
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

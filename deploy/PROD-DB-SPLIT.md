# Splitting prod onto its own database

Dev and prod share one Supabase project. The clone is DONE and verified; this
file is what remains. Status as of Sep 5 2026.

## Where the three values actually live  (corrected Sep 5)

An earlier version of this file said "change three keys in prod's secret".
That was wrong, and it matters: only ONE of the three is in Secrets Manager.

| Value | Where it lives in prod |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets Manager `freyr-sales/runtime` |
| `NEXT_PUBLIC_SUPABASE_URL` | **plain env in the ECS task definition** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **plain env in the ECS task definition** |

So the cutover is: one secret edit + one new task-definition revision.
Cluster `freyr-sales-cluster`, service `freyr-sales-svc`, family `freyr-sales`.

## New project

`Freyr Sales Prod` — ref `kthwujrkgmpvrfcghqib`, pooler
`aws-0-us-east-2.pooler.supabase.com`. (The old project pools through
`aws-0-ca-central-1`; they are in different regions, which is why any script
that talks to both needs two hosts.)

Values are staged in `.env.local` under `FREYR_PROD_SUPABASE_*`. The running
app never reads those; they exist for the migration scripts.

## Done and verified

- **Schema** — all 24 migrations replayed; zero column drift vs live.
- **Data** — all 30 public tables. Verified by SHA-256 of every row, not just
  counts: every table byte-identical except `app_users.last_seen_at`, which
  moves because people are still using dev. The delta re-run handles it.
- **Logins** — 43 users + 43 identities, `encrypted_password` byte-identical,
  so everyone signs in with their existing password. SSO/SAML rows copied.
- **Storage** — both buckets with their config, 187 objects, 363 MB. The three
  largest re-downloaded from the new project and byte-checked.
- **Auth config** — all 243 settings copied via the Management API: six email
  templates, SMTP, OTP length/expiry, rate limits. Two set deliberately to
  PROD values rather than copied: `site_url` and `uri_allow_list`. Copying
  dev's would have sent every prod password-reset link to the dev site.
- **Absolute URL rewrite** — the market-intel feed stored 51 headshot URLs
  hardcoded to the old project. Rewritten to the new ref and verified serving.
  This runs as part of `clone-db.mjs`, after every data copy, because a delta
  copy re-introduces them.

## BLOCKER: the new project cannot send email

Proven, not assumed: a real `POST /auth/v1/recover` returns
`500 Error sending recovery email`.

The Management API returns `smtp_pass` encrypted per-project, so copying it
writes a dead value. The real SES SMTP password is stored nowhere retrievable.
Both repair routes are closed:

- **New SES credential** — needs `iam:CreateUser` / `iam:CreateAccessKey`.
  The `Infra_Engineer` role is denied both, via CLI *and* in the console.
  Needs someone with IAM rights.
- **Resend instead** — `notifications.freyrsolutions.com` shows
  `status=failed` in Resend, so it cannot send from that sender either.

Until this is fixed, cutting over would regress prod: no password resets, no
invites, no signup confirmations. Everything else is ready.

## Remaining steps

1. **Fix email** (above). Then re-test with a real `recover` call.
2. **Delta copy** — `node clone-db.mjs data && node clone-db.mjs auth &&
   node clone-storage.mjs`. Idempotent; moves only what changed. The rewrite
   phase runs automatically with `data`.
3. **Verify** — `node verify-full.mjs` (row counts, auth tables, every storage
   object by name+size, spot downloads, a password-hash spot check). Exits 1
   on any mismatch. Then `node checksum.mjs` for content hashes.
4. **Repoint prod** — secret edit + task-def revision per the table above.
5. **Roll and check** — `/api/health` reports the new database reachable,
   sign in as a real account, open a sales material end to end.

## Known differences that are NOT bugs

- **Everyone gets logged out once.** `auth.refresh_tokens` was deliberately not
  copied, so existing sessions do not carry. Credentials are unchanged.
- **One passkey dies.** WebAuthn credentials are bound to an origin, and one is
  registered against `freyrsales.dev.freyrapps.com`. That user re-registers a
  passkey on prod; password sign-in is unaffected.
- **RLS is enabled on the new project** (auto-enable event trigger), including
  on `record_assignments` where live has it off. Harmless: every data read uses
  the service-role key, which bypasses RLS. No client code reads tables with
  the anon key.
- **`auto_join_domains` exists in the clone but not in live.** Migration 013
  creates it; live drifted. It is only read by `freyr_before_user_created`,
  which is disabled in both. The clone is the more correct of the two.

## Landmines worth knowing

- **`DATA_MODE_LOCKED=0` + `DEFAULT_DATA_MODE=mock` in prod.** Today the cookie
  decides and anything not literally "mock" resolves to live, so real users see
  real data. Flip that lock to `1` and every user instantly sees mock data.
- **Prod's AWS account has no SES identity.** `notifications.freyrsolutions.com`
  is verified only in the dev account (602367507820), so prod email runs through
  dev's SES. Independent of this migration, but it means "prod is separate from
  dev" is not yet true for email.
- **26 env vars the app reads are absent from prod**, including
  `PERPLEXITY_API_KEY` (Market Intel refresh), `HUBSPOT_ACCESS_TOKEN`,
  `SALESFORCE_CLIENT_ID` and `NEXT_PUBLIC_RELEASE_MODE`. Most degrade quietly
  rather than failing. `AUTH_SESSION_SECRET` is absent but falls back to
  `AUTH_COOKIE_SECRET`, which prod has, so sessions are correctly signed.

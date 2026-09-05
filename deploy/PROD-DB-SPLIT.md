# Splitting prod onto its own database

Today dev and prod share one Supabase project. The plan: clone that project,
point PROD at the clone, dev keeps the original. This file is the whole
procedure — after tonight's prep, **no code changes and no variable renames
are needed**. The app reads exactly three values:

    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY

Nothing in the codebase hardcodes the project ref, a supabase.co URL, or the
workspace id (audited Sep 5; the clone keeps the same row ids, so
FREYR_WORKSPACE_ID does not change).

## Why one image can serve two databases (fixed Sep 5)

`NEXT_PUBLIC_*` values are baked into the browser bundle at BUILD time, and
prod runs the image ferried from dev's ECR. Three screens created browser-side
Supabase clients from baked values — login, reset-password, the SSO card — so
after the split, prod's login would have quietly authenticated against DEV's
database. All three now receive the URL and anon key from their server parent
at request time, with the baked value only as a fallback. This is what makes
the split an env-vars-only operation.

## The steps

1. **Clone the project** (Supabase dashboard backup/restore, or pg_dump + a
   storage copy). The clone must carry, at minimum:
   - every `public` table — `offering_catalog_state` holds most of the app
   - `auth.users` and identities — otherwise nobody can sign in
   - BOTH storage buckets: `offering-materials` (the app now SERVES all sales
     materials from this — Freya.Docs is write-only archive since Sep 5) and
     `market-intel-photos`

2. **Verify the clone** before touching prod:

       SOURCE_URL=... SOURCE_KEY=... TARGET_URL=... TARGET_KEY=... \
       node scripts/prod-split/verify-clone.mjs

   It compares row counts, auth users and bucket contents, and refuses on any
   mismatch.

3. **Repoint prod.** In the PROD account (966427768186), edit the one Secrets
   Manager JSON `freyr-sales/runtime` and change exactly three keys to the
   clone's values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. Nothing else moves.

4. **Roll prod** (a new task-def revision so the fresh secrets are read), then
   check https://freyrsales.freyrapps.com/api/health says database reachable,
   sign in as a real account, and open one sales material end to end.

5. **After the split**, dev writes stop reaching prod. Two ongoing syncs to
   decide a cadence for:
   - Freya.Docs archive copies: uploads land in the environment's own Docs
     instance; `scripts/qa/copy-docs.mjs` mirrors the bytes across
     (`--to prod` for the dev→prod direction) so both archives stay complete.
   - Any catalogue content authored in dev that prod should show: that is now
     a deliberate export/import, not automatic.

## What deliberately does NOT change

- `deploy/promote-to-prod.sh` and the image ferry: unchanged, that is the point.
- `FREYR_WORKSPACE_ID`: same value in both, the clone keeps row ids.
- Freya.Docs credentials per environment: already separate, already in each
  account's own secret.

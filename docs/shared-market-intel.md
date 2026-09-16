# Shared Real-mode Market Intel

Both environments use production as the canonical Market Intel store. Configure
these server-only settings when the pending release is deployed:

- `MARKET_INTEL_SUPABASE_URL`: production Supabase URL.
- `MARKET_INTEL_SUPABASE_SERVICE_ROLE_KEY`: production service-role secret, injected through the deployment secret store.
- `MARKET_INTEL_WORKSPACE_ID`: production Freyr workspace UUID (required on development for member matching).

Set the same Market Intel settings in development and production. Do not replace
the ordinary Supabase/auth settings. Do not reuse the local migration credential
variables implicitly. This change is opt-in; until configured each environment
continues using its own database. Supplying only half the connection settings
fails rather than silently reading or writing a different database.

Shared: companies, people, tracking edits/deletions, lists and stars, feeds,
collection checkpoints, provider configuration, usage accounting and refresh
locks. Existing production data is authoritative; this does not overwrite it
with development snapshots. Mock tracking remains on the local database.
Other CRM data and authentication remain local to each deployment.

Users are matched from a verified local member scope to an active production
member with the same email within the configured workspace. Missing or ambiguous
members fail rather than creating another list or borrowing another user's list.
Local directory IDs are used to display matching followers' names and avatars.

Only production runs the daily automatic collection. Development/local retain
the automatic-collection hard stop. Explicit onboarding and manual refreshes
still work against the shared store and shared accounting/locks.

Verification before activation: typecheck and isolated config tests. After the
user authorizes deployment, configure the settings and verify read-only company,
tracking and feed results from both sites. No production configuration, data
migration, or deployment was performed as part of this local change.

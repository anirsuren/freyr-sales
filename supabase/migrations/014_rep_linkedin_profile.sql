-- The agent drafts in the rep's voice, but all it knew was a name and a job
-- title, so everything it wrote read generically. The rep pastes a LinkedIn URL
-- in Settings > Profile; the enrichment run fills in the rest and the agent
-- reads it as identity context. The photo replaces the initials circle.
--
-- Additive and idempotent — safe to run against a live database, and safe to
-- run twice. Mock mode never touches these columns.

alter table if exists public.agent_prefs
  add column if not exists linkedin_url text,
  add column if not exists linkedin_headline text,
  add column if not exists linkedin_about text,
  add column if not exists linkedin_photo text,
  add column if not exists linkedin_synced_at timestamptz;

comment on column public.agent_prefs.linkedin_url is
  'Rep-supplied LinkedIn profile URL. Source for enrichment; never auto-scraped without it.';
comment on column public.agent_prefs.linkedin_headline is
  'Enriched from linkedin_url. Fed to the agent so drafts sound like this rep.';
comment on column public.agent_prefs.linkedin_photo is
  'Enriched avatar URL. Falls back to initials when absent.';

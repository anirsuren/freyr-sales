-- USAGE COUNTERS, ON THE USER'S OWN ROW.
--
-- A sales head asked (Suren, Aug 13) for a monthly note to each rep: files
-- opened, files downloaded, times signed in. None of it was recorded — the app
-- knew only `last_seen_at`, one timestamp overwritten on every visit, which
-- cannot answer "how many times" about anything.
--
-- Three integers on app_users rather than an events table (Anir: "it's not that
-- serious. If you have a user in the row in Supabase, everything should be
-- there"). The question this answers is "how many, this month, per person" —
-- a counter answers it exactly, in the row already being read, with no join and
-- nothing to prune. The monthly job reads the three numbers, sends them, and
-- zeroes them for the next period.

alter table public.app_users
  add column if not exists login_count       integer     not null default 0,
  add column if not exists files_opened      integer     not null default 0,
  add column if not exists files_downloaded  integer     not null default 0,
  -- When the current counting period began, so the email can say what window
  -- the numbers cover instead of implying a calendar month it may not match.
  add column if not exists usage_period_start timestamptz not null default now();

-- Atomic increment. Doing this as read-then-write from the app would drop
-- counts whenever two requests land together, which for "files opened" is the
-- normal case rather than the rare one.
create or replace function public.bump_usage(
  p_user_id uuid,
  p_field   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field = 'login' then
    update public.app_users set login_count = login_count + 1 where id = p_user_id;
  elsif p_field = 'open' then
    update public.app_users set files_opened = files_opened + 1 where id = p_user_id;
  elsif p_field = 'download' then
    update public.app_users set files_downloaded = files_downloaded + 1 where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.bump_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text) to service_role;

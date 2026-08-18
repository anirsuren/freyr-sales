-- A FOURTH NUMBER ON THE PERSON'S ROW (Anir, Aug 18: "I want to add something
-- about interactions with the AI agent for the monthly email thing").
--
-- Same shape as 021: a counter on app_users, bumped atomically whenever the
-- person asks the agent something, read and zeroed by the monthly email job.

alter table public.app_users
  add column if not exists agent_interactions integer not null default 0;

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
  elsif p_field = 'agent' then
    update public.app_users set agent_interactions = agent_interactions + 1 where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.bump_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text) to service_role;

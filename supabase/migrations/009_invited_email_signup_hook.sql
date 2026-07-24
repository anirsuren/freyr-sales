-- Make Supabase Auth account creation invitation-only for every email domain.
-- Workspace access remains a separate decision: this hook only permits Auth to
-- create the identity when a server-created, unexpired invitation exists.

CREATE OR REPLACE FUNCTION public.freyr_before_user_created(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_email TEXT := event->'user'->>'email';
  email TEXT := pg_catalog.lower(pg_catalog.btrim(
    coalesce(raw_email, '')
  ));
  local_part TEXT := pg_catalog.split_part(email, '@', 1);
  valid_email BOOLEAN :=
    raw_email IS NOT NULL
    AND raw_email = pg_catalog.btrim(raw_email)
    AND pg_catalog.length(email) <= 254
    AND pg_catalog.length(local_part) BETWEEN 1 AND 64
    AND email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND local_part !~ '(^\.|\.\.|\.$)';
BEGIN
  IF valid_email AND EXISTS (
    SELECT 1
    FROM public.workspace_invitations AS invitation
    WHERE pg_catalog.lower(pg_catalog.btrim(invitation.email)) = email
      AND invitation.status = 'pending'
      AND invitation.expires_at > pg_catalog.now()
  ) THEN
    RETURN '{}'::JSONB;
  END IF;

  -- Keep malformed, uninvited, expired, and revoked addresses
  -- indistinguishable to callers of the public Supabase signup API.
  RETURN pg_catalog.jsonb_build_object(
    'error',
    pg_catalog.jsonb_build_object(
      'http_code', 403,
      'message', 'Account creation requires a valid invitation.'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.freyr_before_user_created(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.freyr_before_user_created(JSONB)
  TO supabase_auth_admin;

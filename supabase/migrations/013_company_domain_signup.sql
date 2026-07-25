-- Let colleagues on an approved company domain create their own Auth identity.
--
-- Migration 009 made Supabase Auth account creation invitation-only for every
-- address. That predates the company-domain auto-join the app now advertises on
-- /login ("your @freyrsolutions.com email is already your account"), so a real
-- colleague was rejected by this hook with "Account creation requires a valid
-- invitation" no matter what the application allowed. The application decision
-- and the database decision have to agree; this makes the database match.
--
-- Outsiders are unchanged: they still need a server-created, unexpired
-- invitation. Workspace access also remains a separate decision — creating an
-- Auth identity is not the same as being an approved workspace member
-- (lib/accessStore.resolveWorkspaceAccess still gates that).

CREATE TABLE IF NOT EXISTS public.auto_join_domains (
  domain TEXT PRIMARY KEY
    CHECK (domain = lower(btrim(domain)) AND domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep this list in step with the AUTO_APPROVE_EMAIL_DOMAINS environment
-- variable on the ECS task definition. Both must name the same domains.
INSERT INTO public.auto_join_domains (domain)
VALUES ('freyrsolutions.com')
ON CONFLICT (domain) DO NOTHING;

-- Only Supabase Auth reads this through the hook below.
REVOKE ALL ON TABLE public.auto_join_domains FROM PUBLIC, anon, authenticated;

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
  domain_part TEXT := pg_catalog.split_part(email, '@', 2);
  valid_email BOOLEAN :=
    raw_email IS NOT NULL
    AND raw_email = pg_catalog.btrim(raw_email)
    AND pg_catalog.length(email) <= 254
    AND pg_catalog.length(local_part) BETWEEN 1 AND 64
    AND email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND local_part !~ '(^\.|\.\.|\.$)';
BEGIN
  -- A colleague on an approved company domain: their address is their account.
  IF valid_email AND EXISTS (
    SELECT 1
    FROM public.auto_join_domains AS allowed
    WHERE allowed.domain = domain_part
  ) THEN
    RETURN '{}'::JSONB;
  END IF;

  -- Everyone else still needs a live invitation.
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
GRANT SELECT ON TABLE public.auto_join_domains TO supabase_auth_admin;

-- Reject non-Freyr identities inside Supabase Auth itself. This runs before
-- auth.users is written, so the public anon signup endpoint cannot bypass the
-- application's registration route.
CREATE OR REPLACE FUNCTION public.freyr_before_user_created(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  email TEXT := lower(coalesce(event->'user'->>'email', ''));
  local_part TEXT := split_part(email, '@', 1);
  domain_part TEXT := split_part(email, '@', 2);
  at_count INTEGER := length(email) - length(replace(email, '@', ''));
BEGIN
  IF at_count = 1
    AND local_part <> ''
    AND local_part !~ '[[:space:]]'
    AND domain_part = 'freyrsolutions.com'
  THEN
    RETURN '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Use your @freyrsolutions.com company email.'
    )
  );
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.freyr_before_user_created(JSONB)
  TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.freyr_before_user_created(JSONB)
  FROM anon, authenticated, public;

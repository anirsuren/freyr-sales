-- Generic identity mapping for database-backed Supabase authentication.
-- Keeps entra_object_id for backward compatibility with existing deployments
-- while making the real key provider-aware.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS provider_subject TEXT;

UPDATE app_users
SET provider_subject = entra_object_id
WHERE provider_subject IS NULL;

CREATE OR REPLACE FUNCTION sync_app_user_provider_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.provider_subject := NEW.entra_object_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_provider_subject_sync ON app_users;
CREATE TRIGGER app_users_provider_subject_sync
  BEFORE INSERT OR UPDATE OF entra_object_id ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_app_user_provider_subject();

ALTER TABLE app_users
  ALTER COLUMN provider_subject SET NOT NULL;

-- Keep the legacy workspace + subject constraint so deployments that still
-- write entra_object_id remain fail-closed on cross-provider collisions.
CREATE INDEX IF NOT EXISTS idx_app_users_provider_subject
  ON app_users (workspace_id, auth_provider, provider_subject);

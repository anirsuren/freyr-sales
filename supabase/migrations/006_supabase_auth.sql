-- Generic identity mapping for database-backed Supabase authentication.
-- Keeps entra_object_id for backward compatibility with existing deployments
-- while making the real key provider-aware.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS provider_subject TEXT;

UPDATE app_users
SET provider_subject = entra_object_id
WHERE provider_subject IS NULL;

ALTER TABLE app_users
  ALTER COLUMN provider_subject SET NOT NULL;

-- The original identity uniqueness did not include the provider. Keep the
-- compatibility column but make collisions provider-aware from this point on.
ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_workspace_id_entra_object_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_provider_subject
  ON app_users (workspace_id, auth_provider, provider_subject);

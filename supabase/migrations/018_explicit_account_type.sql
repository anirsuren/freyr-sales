-- Every workspace account is explicitly classified. Runtime code must never
-- guess whether an account is real from its name or email address.

ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS account_type TEXT;

-- Existing accounts are real unless they are one of the known QA accounts.
UPDATE public.app_users
SET account_type = 'real'
WHERE account_type IS NULL;

UPDATE public.app_users
SET account_type = 'test'
WHERE LOWER(COALESCE(email, '')) IN (
  'anir.s+test2@freyrsolutions.com',
  'anir.s+test3@freyrsolutions.com',
  'anir.s+test4@freyrsolutions.com'
);

-- The actual Anir account is explicitly real.
UPDATE public.app_users
SET account_type = 'real'
WHERE LOWER(COALESCE(email, '')) = 'anir.s@freyrsolutions.com';

ALTER TABLE IF EXISTS public.app_users
  ALTER COLUMN account_type SET DEFAULT 'real',
  ALTER COLUMN account_type SET NOT NULL;

ALTER TABLE IF EXISTS public.app_users
  DROP CONSTRAINT IF EXISTS app_users_account_type_check;

ALTER TABLE IF EXISTS public.app_users
  ADD CONSTRAINT app_users_account_type_check
  CHECK (account_type IN ('real', 'test'));

CREATE INDEX IF NOT EXISTS idx_app_users_workspace_account_type_active
  ON public.app_users (workspace_id, account_type, active);

COMMENT ON COLUMN public.app_users.account_type IS
  'Required account classification. Real mode exposes only real accounts; test accounts remain available for QA/mock workflows.';

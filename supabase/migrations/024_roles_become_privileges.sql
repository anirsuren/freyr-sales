-- ROLES BECOME PRIVILEGES
--
-- Suren, Aug 29: "these are the roles from now on. I need this executed...
-- we are removing sales rep. Sales rep is now BD member. Owner is the new
-- manager." And, on how far it goes: "it shouldn't say sales rep or anything
-- anywhere -- not in the database, the code, the app. Don't cut any corners."
--
--   rep / sales      -> bd_member
--   manager / editor -> bd_owner
--   solutions        -> sol_member
--   admin            -> admin        (unchanged)
--
-- The application's normalizer still ACCEPTS every old spelling on read, so
-- this migration and the deploy do not have to land in the same second: a row
-- that is still 'rep' signs in as a BD Member either way. This makes the
-- stored value match the vocabulary rather than relying on that translation
-- forever.
--
-- Invitations carry the same value and are migrated with the same map.

BEGIN;

-- The CHECK constraints from 002/004 name the ORIGINAL vocabulary
-- ('sales','editor','admin') and would refuse every new value. Drop whatever
-- is there by name-independent lookup, migrate, then put a constraint back
-- that names the current four.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('app_users'::regclass, 'workspace_invitations'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%app_role%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

UPDATE app_users SET app_role = 'bd_member' WHERE app_role IN ('rep', 'sales');
UPDATE app_users SET app_role = 'bd_owner'  WHERE app_role IN ('manager', 'editor');
UPDATE app_users SET app_role = 'sol_member' WHERE app_role IN ('solutions', 'solution');

-- Pending invitations carry the same value and must land on the new one, or
-- somebody invited yesterday joins tomorrow as a role that no longer exists.
UPDATE workspace_invitations SET app_role = 'bd_member' WHERE app_role IN ('rep', 'sales');
UPDATE workspace_invitations SET app_role = 'bd_owner'  WHERE app_role IN ('manager', 'editor');
UPDATE workspace_invitations SET app_role = 'sol_member' WHERE app_role IN ('solutions', 'solution');

ALTER TABLE app_users
  ADD CONSTRAINT app_users_app_role_check
  CHECK (app_role IN ('bd_member', 'bd_owner', 'sol_member', 'admin'));

ALTER TABLE workspace_invitations
  ADD CONSTRAINT workspace_invitations_app_role_check
  CHECK (app_role IN ('bd_member', 'bd_owner', 'sol_member', 'admin'));

COMMIT;

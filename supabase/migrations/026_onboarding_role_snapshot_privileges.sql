-- 022 FIXED THIS ONCE. 024 BROKE IT AGAIN.
--
-- Aug 14, in production: every rep and manager saw "Could not save onboarding
-- progress" on every step of the tour, because the role rename had left this
-- CHECK on the old spellings. 022 widened it to
-- ('rep','manager','admin','sales','editor').
--
-- 024 then renamed the vocabulary again -- rep -> bd_member, manager ->
-- bd_owner, solutions -> sol_member -- and rewrote the CHECKs on app_users and
-- invitations. It did not touch this table, so the app has been writing
-- role_snapshot='bd_member' into a column that only accepts the words from
-- before that rename. Every onboarding write from anybody who is not an admin
-- fails 23514 -> 503, and the guided walkthrough cannot be skipped or
-- completed: it reopens on every page load, forever (found Aug 30 signing in
-- as a fresh BD Member).
--
-- Widen, never narrow. Rows written before either rename still carry 'sales',
-- 'editor', 'rep' and 'manager' and have to stay valid.
ALTER TABLE public.user_onboarding_states
  DROP CONSTRAINT IF EXISTS user_onboarding_states_role_snapshot_check;

ALTER TABLE public.user_onboarding_states
  ADD CONSTRAINT user_onboarding_states_role_snapshot_check
  CHECK (role_snapshot IN (
    -- the vocabulary since 024
    'bd_member', 'bd_owner', 'sol_member', 'admin',
    -- everything that ever meant one of those, so old rows stay valid
    'rep', 'manager', 'sales', 'editor', 'solutions'
  ));

-- The role rename (rep / manager / admin) left this CHECK behind on the old
-- spellings, so every onboarding save from a manager or rep failed with
-- 23514 and the tour showed "Could not save onboarding progress" on every
-- step (Haaris and Balraj, Aug 14, in production).
--
-- Widen it to accept the canonical names AND the legacy ones: rows written
-- before the rename still carry 'editor' / 'sales' and must stay valid.
ALTER TABLE public.user_onboarding_states
  DROP CONSTRAINT IF EXISTS user_onboarding_states_role_snapshot_check;

ALTER TABLE public.user_onboarding_states
  ADD CONSTRAINT user_onboarding_states_role_snapshot_check
  CHECK (role_snapshot IN ('rep', 'manager', 'admin', 'sales', 'editor'));

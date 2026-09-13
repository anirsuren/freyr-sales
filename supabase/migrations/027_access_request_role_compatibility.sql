-- Approval requests are not access grants. Accept existing legacy values while
-- allowing the current role names used when a member requests workspace access.
BEGIN;
ALTER TABLE public.access_requests
  DROP CONSTRAINT IF EXISTS access_requests_requested_role_check;
ALTER TABLE public.access_requests
  ADD CONSTRAINT access_requests_requested_role_check CHECK (
    requested_role IN ('sales', 'editor', 'rep', 'manager', 'admin',
                       'bd_member', 'bd_owner', 'sol_member')
  );
ALTER TABLE public.access_requests ALTER COLUMN requested_role SET DEFAULT 'bd_member';
COMMIT;

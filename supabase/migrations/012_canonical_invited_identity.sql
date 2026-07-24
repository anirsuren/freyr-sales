-- The workspace owner chooses the canonical member name at invitation time.
-- Supabase user_metadata is user-editable and must never become the durable
-- attribution identity for an approved workspace member.

ALTER TABLE workspace_invitations
  ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_display_name_length;

ALTER TABLE workspace_invitations
  ADD CONSTRAINT workspace_invitations_display_name_length
  CHECK (
    display_name IS NULL
    OR (
      length(btrim(display_name)) BETWEEN 2 AND 120
      AND display_name = btrim(display_name)
    )
  );

-- Attribute every new agent run to the signed workspace member that created
-- it. Legacy rows remain readable but are undoable only by a manager because
-- their creator cannot be proven safely.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID
    REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_creator
  ON agent_runs (workspace_id, created_by_user_id, created_at DESC);

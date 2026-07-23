-- Durable, versioned onboarding state for each approved workspace member.
-- A missing row represents "not_started"; only active states are persisted.
-- Keeping the tour version in the primary key preserves prior-version history
-- when a later release introduces a materially different onboarding flow.

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_workspace_user_id
  ON app_users (workspace_id, id);

CREATE TABLE IF NOT EXISTS user_onboarding_states (
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  role_snapshot TEXT NOT NULL
    CHECK (role_snapshot IN ('sales', 'editor', 'admin')),
  status TEXT NOT NULL
    CHECK (status IN ('in_progress', 'completed', 'skipped')),
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id, version),
  CONSTRAINT user_onboarding_states_member_fk
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES app_users (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT user_onboarding_states_completion_check
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT user_onboarding_states_skip_check
    CHECK ((status = 'skipped') = (skipped_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_states_user
  ON user_onboarding_states (user_id, version DESC);

ALTER TABLE user_onboarding_states ENABLE ROW LEVEL SECURITY;

-- No browser policies are intentionally created. The service-role-backed
-- application API is the only data path, matching the rest of the workspace
-- authorization schema.

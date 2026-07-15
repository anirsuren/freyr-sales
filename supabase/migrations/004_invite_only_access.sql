-- Invite-only workspace access. Authentication proves identity; these tables
-- decide whether that identity is allowed into a Freyr workspace.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'entra',
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  app_role TEXT NOT NULL CHECK (app_role IN ('sales', 'editor', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  auth_provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  requested_role TEXT NOT NULL DEFAULT 'sales'
    CHECK (requested_role IN ('sales', 'editor', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, auth_provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON access_requests (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_users_workspace_active
  ON app_users (workspace_id, active, created_at DESC);

ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- No browser policies are created. The application service role is the only
-- data path, so approval cannot be bypassed with the public Supabase key.

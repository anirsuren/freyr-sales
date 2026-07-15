-- Production foundation for Azure PostgreSQL / Supabase PostgreSQL.
-- Application authorization is enforced with Microsoft Entra ID at the web
-- tier; workspace_id prevents accidental cross-tenant joins and prepares the
-- schema for future RLS if the Supabase API is used directly.

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  entra_tenant_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entra_object_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  app_role TEXT NOT NULL CHECK (app_role IN ('sales', 'editor', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, entra_object_id)
);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id),
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS competitor TEXT,
  ADD COLUMN IF NOT EXISTS notes_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS account_deals JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_type TEXT,
  ADD COLUMN IF NOT EXISTS ownership TEXT,
  ADD COLUMN IF NOT EXISTS revenue TEXT,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offerings_in_use JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS offering_usage JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE pitch_sessions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id),
  ADD COLUMN IF NOT EXISTS pitch_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'in_review', 'approved', 'changes_requested')),
  ADD COLUMN IF NOT EXISTS reviewer TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('act', 'play', 'autopilot', 'plan')),
  title TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  company TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('handled', 'sent', 'escalated', 'mixed')),
  summary TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  interaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  reverted BOOLEAN NOT NULL DEFAULT FALSE,
  draft JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sequence_id TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  enrolled_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_prefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  focus_industry TEXT,
  only_mine BOOLEAN NOT NULL DEFAULT FALSE,
  autopilot_reengage BOOLEAN NOT NULL DEFAULT FALSE,
  autopilot_stabilize BOOLEAN NOT NULL DEFAULT FALSE,
  autopilot_max_value NUMERIC(14,2),
  draft_tone TEXT NOT NULL DEFAULT 'warm' CHECK (draft_tone IN ('warm', 'formal', 'brief')),
  autopilot_cadence TEXT NOT NULL DEFAULT 'off' CHECK (autopilot_cadence IN ('off', 'daily', 'weekly')),
  autopilot_last_run TIMESTAMPTZ,
  digest_cadence TEXT NOT NULL DEFAULT 'off' CHECK (digest_cadence IN ('off', 'daily', 'weekly')),
  digest_last_sent TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS draft_snippets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('me', 'agent')),
  text TEXT NOT NULL,
  source TEXT CHECK (source IN ('claude', 'mock')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offering_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS offering_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS customer_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  family TEXT NOT NULL,
  size TEXT NOT NULL,
  product_type TEXT,
  revenue TEXT,
  employees TEXT,
  operational_focus TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS offerings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  offering_name TEXT NOT NULL,
  offering_description TEXT NOT NULL DEFAULT '',
  offering_type_id UUID REFERENCES offering_types(id) ON DELETE SET NULL,
  offering_category_id UUID REFERENCES offering_categories(id) ON DELETE SET NULL,
  current_availability TEXT,
  availability_comments TEXT,
  poc TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, offering_name)
);

CREATE TABLE IF NOT EXISTS offering_customer_types (
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  customer_type_id UUID NOT NULL REFERENCES customer_types(id) ON DELETE CASCADE,
  PRIMARY KEY (offering_id, customer_type_id)
);

CREATE TABLE IF NOT EXISTS offering_markets (
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  PRIMARY KEY (offering_id, market_id)
);

CREATE TABLE IF NOT EXISTS offering_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  source_url TEXT,
  blob_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'approved', 'expired', 'rejected')),
  approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_url IS NOT NULL OR blob_path IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  error_code TEXT,
  error_message TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_customer ON agent_runs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_chats_customer ON agent_chats(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_offering ON offering_materials(offering_id, approval_status);

-- The browser never talks to these tables directly. Enabling RLS without
-- public policies fails closed for anon/authenticated API keys; the server-side
-- service role remains the only data path.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE freyr_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

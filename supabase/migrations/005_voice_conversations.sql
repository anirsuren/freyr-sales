-- Durable ElevenLabs call lifecycle. This is deliberately separate from CRM
-- interactions: a call exists while ringing/processing, then creates exactly
-- one interaction after analysis completes.

CREATE TABLE IF NOT EXISTS voice_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT UNIQUE,
  call_sid TEXT UNIQUE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (
    status IN ('initiated', 'in_progress', 'analyzing', 'completed', 'failed')
  ),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  company TEXT,
  external_number TEXT,
  offering_id TEXT,
  offering_name TEXT,
  category TEXT,
  outcome TEXT CHECK (outcome IN ('interested', 'follow_up', 'no_answer', 'declined')),
  summary TEXT,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dynamic_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_secs INTEGER,
  failure_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_conversations_status
  ON voice_conversations (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_conversations_contact
  ON voice_conversations (contact_id, created_at DESC);

ALTER TABLE voice_conversations ENABLE ROW LEVEL SECURITY;

-- No browser policy: only server routes using the service role may ingest or
-- read call data, keeping transcripts and caller information off the public key.

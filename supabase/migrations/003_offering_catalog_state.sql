-- Atomic durable state for the single-workspace Offerings release. The app
-- keeps a process-local read cache for synchronous server rendering, hydrates
-- it from this row at startup, and commits the full catalog on every mutation.
CREATE TABLE IF NOT EXISTS offering_catalog_state (
  id TEXT PRIMARY KEY,
  catalog JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE offering_catalog_state ENABLE ROW LEVEL SECURITY;

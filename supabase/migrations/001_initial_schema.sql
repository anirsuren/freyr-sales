-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Freyr knowledge base
CREATE TABLE freyr_knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_crawl_text TEXT,
  structured_kb JSONB,
  crawled_at TIMESTAMPTZ,
  page_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 0
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  website_url TEXT,
  raw_scrape TEXT,
  size_tier TEXT CHECK (size_tier IN ('small', 'mid', 'large')),
  industry TEXT,
  geography TEXT,
  enrichment_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  phone TEXT,
  raw_linkedin_data JSONB,
  job_title TEXT,
  role_bucket TEXT,
  career_summary TEXT,
  enrichment_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pitch sessions
CREATE TABLE pitch_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  contact_id UUID REFERENCES contacts(id),
  kb_version INTEGER,
  recommended_services JSONB,
  pitch_email TEXT,
  pitch_5min_script TEXT,
  pitch_call_script JSONB,
  additional_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interactions
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pitch_session_id UUID REFERENCES pitch_sessions(id),
  customer_id UUID REFERENCES customers(id),
  contact_id UUID REFERENCES contacts(id),
  outcome TEXT CHECK (outcome IN (
    'interested', 'not_interested', 'in_progress',
    'no_response', 'meeting_booked', 'ai_call_completed', 'ai_call_failed'
  )),
  notes TEXT,
  follow_up_date DATE,
  logged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_customer_id ON contacts(customer_id);
CREATE INDEX idx_pitch_sessions_customer_id ON pitch_sessions(customer_id);
CREATE INDEX idx_pitch_sessions_contact_id ON pitch_sessions(contact_id);
CREATE INDEX idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX idx_interactions_contact_id ON interactions(contact_id);

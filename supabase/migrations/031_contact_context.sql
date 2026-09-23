-- Contact details entered by the account team, separate from provider-enriched data.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS buying_role TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_notes TEXT;

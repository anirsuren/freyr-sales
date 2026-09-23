-- Key contacts are an account-level editorial choice, stored on each contact.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_key BOOLEAN;

-- Preserve the four people the existing Overview showed for each account.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at, id) AS position
  FROM contacts
)
UPDATE contacts AS contact
SET is_key = TRUE
FROM ranked
WHERE contact.id = ranked.id AND ranked.position <= 4 AND contact.is_key IS NULL;

UPDATE contacts SET is_key = FALSE WHERE is_key IS NULL;
ALTER TABLE contacts ALTER COLUMN is_key SET DEFAULT FALSE;
ALTER TABLE contacts ALTER COLUMN is_key SET NOT NULL;

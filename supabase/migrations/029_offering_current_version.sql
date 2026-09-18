-- Product offerings carry a release label separately from free-form
-- availability comments. Service offerings leave this blank.
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS current_version TEXT;

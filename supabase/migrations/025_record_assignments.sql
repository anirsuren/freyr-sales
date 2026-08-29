-- WHO A RECORD BELONGS TO, FOR EVERY MODULE AT ONCE.
--
-- Suren, Aug 29: "The moment he creates a customer, he becomes the owner of the
-- customer. When he assigns somebody as a member, that particular person can
-- actually start writing things... I have a customer and I am assigning a
-- customer to this business development group."
--
-- So a record needs two things it has never had: the people assigned to it, and
-- the group it was handed to. Ownership it already has, as `owner` on the row.
--
-- WHY ONE TABLE AND NOT A COLUMN ON EACH. Seven modules need this and they are
-- not stored alike: customers and contacts are real Postgres tables, while
-- contracts, leads, meetings and everything under solutioning live as JSON
-- blobs in a single state row. Adding columns would mean a migration per table
-- plus a normalizer change per blob, and every module that ships later would
-- have to remember to grow the same two fields. One key of (module, record_id)
-- covers all of them and covers the next one for free.
--
-- The rows are small and read as a whole map per module, so there is no need
-- for anything cleverer than the primary key.

create table if not exists record_assignments (
  module      text        not null,
  record_id   text        not null,
  -- The group this record was handed to. Its TYPE has to match what the module
  -- accepts (customers to a business development group, submissions to a
  -- solutioning one) — enforced in lib/recordScope, not here, because the group
  -- types live in the privileges state row rather than in a table.
  group_id    text,
  -- People the owner assigned. Names, matching how every record already stores
  -- `owner`, so the two can be compared without a join through app_users.
  members     jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (module, record_id)
);

-- Every read is "everything assigned in this module", so that is the index.
create index if not exists record_assignments_module_idx
  on record_assignments (module);

comment on table record_assignments is
  'Who each record belongs to: the group it was given to and the people assigned to it. Keyed by module + record id so one table serves customers, contracts, opportunities, leads, meetings and solutioning alike.';

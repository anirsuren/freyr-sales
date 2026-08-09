-- The FDL components a customer actually runs, and which version of each.
-- Suren, Aug 8: "from a customer side you should be able to connect customer
-- to all components — which release of the version of the component they are
-- connecting… any time I look at what software components the customer has,
-- I click on the customer."
--
-- Additive and defaulted, so existing rows are untouched and older app builds
-- keep working against the same table.
alter table public.customers
  add column if not exists digital_components jsonb not null default '[]'::jsonb;

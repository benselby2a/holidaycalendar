-- ---------------------------------------------------------------------------
-- Adds standard_items.shared: when true, adding the item from the picker puts
-- it on the trip's Shared list (one for everyone) instead of the adder's own
-- personal list.
--
-- This is a deliberate re-introduction of the idea the old applies_to column
-- carried, as a plain boolean with no check constraint. Additive and
-- independent of the other 2026-08-16 migrations, so it's safe to run
-- whether or not those have been applied yet.
-- ---------------------------------------------------------------------------
alter table packing_list.standard_items
  add column if not exists shared boolean not null default false;

-- ---------------------------------------------------------------------------
-- Part 2 of 2 (see 2026-08-16_favourites_reset.sql).
--
-- Drops the metadata the simplified catalogue no longer uses. RUN THIS ONLY
-- once the new app code is deployed and confirmed working on every device:
-- the sync layer upserts whole row objects, so any still-cached old JS
-- writing e.g. `seasons` after this runs would fail every write with a
-- "column does not exist" error rather than degrading gracefully.
--
-- Everything dropped here is either replaced by the favourites picker
-- (mandatory / enabled), replaced by the trip-length preset buttons on the
-- item rows (base_qty / per_day / max_qty), or simply gone from the UI
-- (seasons / trip_types / applies_to).
--
-- trip_meta itself is NOT dropped - the trip Notes field still lives there.
-- ---------------------------------------------------------------------------

-- The catalogue is now just name + category.
alter table packing_list.standard_items
  drop column if exists seasons,
  drop column if exists trip_types,
  drop column if exists mandatory,
  drop column if exists base_qty,
  drop column if exists per_day,
  drop column if exists max_qty,
  drop column if exists enabled,
  drop column if exists applies_to;

-- That index keyed on applies_to, which no longer exists - recreate it on
-- just household + name. Dropping the column would take the index with it
-- anyway; this makes the replacement explicit rather than silently losing
-- duplicate-name protection.
drop index if exists packing_list.standard_items_unique_per_household;
create unique index if not exists standard_items_unique_per_household
  on packing_list.standard_items(household_id, lower(name))
  where deleted_at is null;

-- Season / trip type are gone from the UI entirely.
alter table packing_list.trip_meta
  drop column if exists season,
  drop column if exists trip_types;

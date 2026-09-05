-- Adds multi-country support to a trip.
--
-- `country` (single value) is kept, not replaced: the packing app
-- (packing_list schema, a separate app in the same Supabase project) selects
-- it directly for the trip subtitle - pack.js:236 does
-- `.select("id,location,country,start_date,end_date,status")`. Dropping it
-- would break that app on its own release schedule, independent of this one.
--
-- `countries` is the new source of truth for anything that should show every
-- destination on a trip (the country map, a future multi-select UI).
-- `country` is kept in sync as countries[1] by the app on write, not by a
-- trigger - the app already builds both fields from the same form state, so
-- a DB-level sync mechanism would just be a second place for the same rule
-- to drift out of.
alter table holidaycalendar.holidays
  add column if not exists countries text[] not null default '{}';

-- Backfill existing rows from the single-value column, so nothing already
-- saved silently drops out of "countries visited" once the map switches over
-- to reading the new column.
update holidaycalendar.holidays
set countries = array[country]
where country is not null and country <> '' and countries = '{}';

-- Link packing_list.trips back to holidaycalendar.holidays so a trip
-- created via "Import from Calendar" can be traced to its source entry and
-- isn't re-imported as a duplicate.
-- Deliberately not a foreign key: holidaycalendar is a separate app's
-- schema/migrations, so this stays a loose reference, not a hard
-- cross-app dependency.
-- Safe to run multiple times.

alter table packing_list.trips
  add column if not exists source_holiday_id bigint;

create index if not exists trips_source_holiday_idx
  on packing_list.trips(source_holiday_id)
  where source_holiday_id is not null;

-- Read-only access into the Holiday Calendar app's schema, so the packing
-- list app can list "future trips" to import. holidaycalendar's own RLS
-- policies already allow this (`using (true)`, no role restriction), but
-- Postgres still requires an explicit GRANT before RLS is even evaluated,
-- and that schema's own migrations don't grant anything to anon/
-- authenticated for custom schemas. This only adds SELECT on `holidays`
-- (no write access), and is safe to re-run.
grant usage on schema holidaycalendar to authenticated;
grant select on holidaycalendar.holidays to authenticated;

notify pgrst, 'reload schema';

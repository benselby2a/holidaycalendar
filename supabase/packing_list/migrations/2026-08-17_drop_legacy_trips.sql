-- ---------------------------------------------------------------------------
-- Removes packing_list.trips and the trip_id columns that pointed at it.
--
-- 2026-08-08b_key_by_holiday_id.sql re-keyed this schema around
-- holidaycalendar.holidays.id and deliberately left both in place so nothing
-- existing was lost. They've been unread by the app ever since: trip_id is
-- absent from every query, and TABLE_ORDER in pack.js has no entry for trips.
--
-- Checked before dropping: the single remaining trips row ("Great British
-- Summer", 2026-08-23) carried source_holiday_id = 8, and holiday 8 holds the
-- live data - 32 packing items, 2 travellers, 9 trip days - under the same
-- name and start date. The only fields unique to the trips row were `season`
-- and `trip_types`, both of which the app dropped entirely when the Packing
-- Wizard was replaced by favourites.
--
-- Already applied by hand; recorded here so the repo matches the database.
-- schema.sql needed no change - it never defined either.
-- ---------------------------------------------------------------------------

-- Columns first: the foreign key to trips blocks dropping the table otherwise.
alter table packing_list.travellers    drop column if exists trip_id;
alter table packing_list.trip_days     drop column if exists trip_id;
alter table packing_list.packing_items drop column if exists trip_id;

drop table if exists packing_list.trips;

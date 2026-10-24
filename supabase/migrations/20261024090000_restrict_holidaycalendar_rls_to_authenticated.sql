-- The holidaycalendar schema's RLS policies were enabled but written as
-- `using (true)` with no role restriction, so they matched every role
-- including anon - anyone with the published anon key could read and write
-- real names, trip destinations/dates, and leave allowances with no login.
-- Re-create each policy scoped to authenticated only, same shape already
-- used by the savings, finance_app, daysout, and packing_list schemas.
--
-- Deliberately not touched here: the leftover public.people_allowance,
-- public.holidays, public.bank_holidays, public.people tables from before
-- this schema existed. They were never dropped by the migration that moved
-- the app over to holidaycalendar.*, but dropping them needs confirming
-- first that nothing still reads them - not done as a side effect of an RLS
-- fix.

drop policy if exists "allow all people" on holidaycalendar.people_allowance;
drop policy if exists "authenticated only" on holidaycalendar.people_allowance;
create policy "authenticated only" on holidaycalendar.people_allowance
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "allow all holidays" on holidaycalendar.holidays;
drop policy if exists "authenticated only" on holidaycalendar.holidays;
create policy "authenticated only" on holidaycalendar.holidays
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "allow all bank holidays" on holidaycalendar.bank_holidays;
drop policy if exists "authenticated only" on holidaycalendar.bank_holidays;
create policy "authenticated only" on holidaycalendar.bank_holidays
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "allow all people table" on holidaycalendar.people;
drop policy if exists "authenticated only" on holidaycalendar.people;
create policy "authenticated only" on holidaycalendar.people
  for all to authenticated
  using (true)
  with check (true);

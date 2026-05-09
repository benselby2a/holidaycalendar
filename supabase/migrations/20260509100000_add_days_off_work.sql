alter table public.holidays
add column if not exists days_off_work numeric;

update public.holidays
set days_off_work = days
where days_off_work is null;

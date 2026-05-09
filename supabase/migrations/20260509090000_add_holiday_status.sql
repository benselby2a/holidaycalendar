alter table public.holidays
add column if not exists status text not null default 'ideation';

alter table public.holidays
drop constraint if exists holidays_status_check;

alter table public.holidays
add constraint holidays_status_check
check (status in ('ideation','planning','booked','happened'));

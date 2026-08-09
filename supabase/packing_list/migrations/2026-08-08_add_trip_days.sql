-- Per-day trip itinerary: accommodation, transport, meals, morning/
-- afternoon/evening plans (or a single all-day entry spanning
-- morning+afternoon or the whole day), and general notes.
-- Safe to run multiple times.

create table if not exists packing_list.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references packing_list.trips(id) on delete cascade,
  household_id text not null,
  day_date date not null,
  accommodation text,
  transport text,
  breakfast text,
  lunch text,
  dinner text,
  notes text,
  plan_all_day boolean not null default false,
  plan_all_day_span text not null default 'morning_afternoon',
  plan_all_day_text text,
  plan_morning text,
  plan_afternoon text,
  plan_evening text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint trip_days_span_check check (plan_all_day_span in ('morning_afternoon', 'full_day'))
);

create unique index if not exists trip_days_trip_date_key
  on packing_list.trip_days(trip_id, day_date)
  where deleted_at is null;

create index if not exists trip_days_trip_idx
  on packing_list.trip_days(trip_id, day_date);

alter table packing_list.trip_days enable row level security;

drop policy if exists "household read trip_days" on packing_list.trip_days;
create policy "household read trip_days"
  on packing_list.trip_days
  for select
  to authenticated
  using (household_id = 'shared-household');

drop policy if exists "household write trip_days" on packing_list.trip_days;
create policy "household write trip_days"
  on packing_list.trip_days
  for all
  to authenticated
  using (household_id = 'shared-household')
  with check (household_id = 'shared-household');

grant select, insert, update, delete on packing_list.trip_days to authenticated, service_role;

notify pgrst, 'reload schema';

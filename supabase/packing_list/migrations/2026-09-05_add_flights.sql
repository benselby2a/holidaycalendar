-- ---------------------------------------------------------------------------
-- Flights either side of a trip, shown as their own section above the
-- itinerary grid.
--   leg = 'outbound' -> getting there, 'return' -> getting home
-- Departure/arrival are plain date + time, deliberately not timestamptz:
-- doing timezone-aware duration properly means resolving each airport code
-- to an IANA zone, which needs a real airport database this app doesn't
-- have. Kept as the wall-clock values off the boarding pass instead - the
-- app computes a naive (non-timezone-aware) duration from these, which is
-- exactly right for a same-timezone hop and only wrong by the zone
-- difference for a long-haul one. A separate arrival_date (rather than a
-- "+1/+2 days" offset next to arrival time) is how a red-eye landing the
-- next calendar day is represented - just pick the later date.
--
-- Matches every other packing_list table's shape (soft delete, updated_by,
-- household_id scoping) so it drops into the existing local-first sync
-- (enqueue/apiUpsert/mergeById/pullAll) with no special-casing.
-- ---------------------------------------------------------------------------
create table if not exists packing_list.flights (
  id uuid primary key default gen_random_uuid(),
  holiday_id bigint not null,
  household_id text not null,
  leg text not null default 'outbound',
  airline text,
  flight_number text,
  departure_airport text,
  departure_date date,
  departure_time time,
  arrival_airport text,
  arrival_date date,
  arrival_time time,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint flights_leg_check check (leg in ('outbound', 'return'))
);

create index if not exists flights_holiday_idx
  on packing_list.flights(holiday_id, leg, sort_order);

alter table packing_list.flights enable row level security;

drop policy if exists "household read flights" on packing_list.flights;
create policy "household read flights"
  on packing_list.flights for select to authenticated
  using (household_id = 'shared-household');

drop policy if exists "household write flights" on packing_list.flights;
create policy "household write flights"
  on packing_list.flights for all to authenticated
  using (household_id = 'shared-household')
  with check (household_id = 'shared-household');

grant select, insert, update, delete on packing_list.flights to authenticated, service_role;
revoke all on packing_list.flights from anon;

-- Nudge PostgREST to drop its cached schema so the new table is visible
-- immediately, without waiting for its next automatic refresh.
notify pgrst, 'reload schema';

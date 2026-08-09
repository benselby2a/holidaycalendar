-- Re-key packing_list around holidaycalendar.holidays.id instead of a
-- separate packing_list.trips table, so a trip's identity (name, dates,
-- destination) lives in exactly one place. This is additive and safe to
-- run multiple times:
--   - packing_list.trips is left in place, untouched, unused by new code.
--     Not dropped, so nothing existing is lost.
--   - trip_id columns become nullable; new rows use holiday_id instead.
--   - packing_list.trip_meta holds the packing-specific per-trip fields
--     that don't belong on holidaycalendar.holidays (season, trip_types,
--     notes) — one row per holiday_id. No "archived" here — holidaycalendar's
--     own `status` field already covers a trip's lifecycle.
--
-- holiday_id is a soft reference (no foreign key), same reasoning as the
-- existing source_holiday_id: holidaycalendar.holidays is owned by a
-- separate app/migration history, so this stays a plain bigint rather
-- than a hard cross-app dependency.

alter table packing_list.travellers alter column trip_id drop not null;
alter table packing_list.travellers add column if not exists holiday_id bigint;
create index if not exists travellers_holiday_idx
  on packing_list.travellers(holiday_id, sort_order, created_at);

alter table packing_list.trip_days alter column trip_id drop not null;
alter table packing_list.trip_days add column if not exists holiday_id bigint;
create unique index if not exists trip_days_holiday_date_key
  on packing_list.trip_days(holiday_id, day_date)
  where deleted_at is null and holiday_id is not null;
create index if not exists trip_days_holiday_idx
  on packing_list.trip_days(holiday_id, day_date);

alter table packing_list.packing_items alter column trip_id drop not null;
alter table packing_list.packing_items add column if not exists holiday_id bigint;
create index if not exists packing_items_holiday_idx
  on packing_list.packing_items(holiday_id, scope, category, sort_order);
create unique index if not exists packing_items_wizard_unique_holiday
  on packing_list.packing_items(holiday_id, standard_item_id, coalesce(traveller_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where standard_item_id is not null and deleted_at is null and holiday_id is not null;

create table if not exists packing_list.trip_meta (
  holiday_id bigint primary key,
  household_id text not null,
  season text not null default 'Any',
  trip_types text[] not null default '{}',
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table packing_list.trip_meta enable row level security;

drop policy if exists "household read trip_meta" on packing_list.trip_meta;
create policy "household read trip_meta"
  on packing_list.trip_meta
  for select
  to authenticated
  using (household_id = 'shared-household');

drop policy if exists "household write trip_meta" on packing_list.trip_meta;
create policy "household write trip_meta"
  on packing_list.trip_meta
  for all
  to authenticated
  using (household_id = 'shared-household')
  with check (household_id = 'shared-household');

grant select, insert, update, delete on packing_list.trip_meta to authenticated, service_role;

notify pgrst, 'reload schema';

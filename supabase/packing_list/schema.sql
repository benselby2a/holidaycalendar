-- Holiday Packing List schema.
-- Safe to run multiple times against a Supabase project.
--
-- Trip identity lives in holidaycalendar.holidays (a separate app/schema in
-- the same Supabase project) — there is no packing_list.trips table here.
-- Every trip-scoped table below keys off holiday_id (bigint), a soft
-- reference: no foreign key, since holidaycalendar owns that table's
-- migrations independently. This schema only reads holidaycalendar.holidays
-- (never writes it) and only for display — see the packing screen module
-- mounted inside the Holiday Calendar app for how holiday_id gets there.

create extension if not exists "pgcrypto";

create schema if not exists packing_list;

grant usage on schema packing_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trip meta: the packing-specific per-trip fields that don't belong on
-- holidaycalendar.holidays (just notes now). There's no
-- "archived" concept here — holidaycalendar's own `status` field already
-- covers a trip's lifecycle, and there's no separate packing-trips list to
-- hide things from any more.
-- ---------------------------------------------------------------------------
create table if not exists packing_list.trip_meta (
  holiday_id bigint primary key,
  household_id text not null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------------
-- Travellers (the people on a trip; owners of packed items)
-- ---------------------------------------------------------------------------
create table if not exists packing_list.travellers (
  id uuid primary key default gen_random_uuid(),
  holiday_id bigint not null,
  household_id text not null,
  name text not null,
  colour text,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travellers_holiday_idx
  on packing_list.travellers(holiday_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Trip days: one row per calendar date of a trip, holding that day's plan.
--   plan_all_day = false -> plan_morning/plan_afternoon/plan_evening are
--     each their own free-text entry
--   plan_all_day = true  -> plan_all_day_text is the entry, spanning either
--     morning+afternoon (plan_evening still stands alone) or the whole day
--     (plan_all_day_span = 'full_day', plan_evening unused)
-- Rows are created lazily by the app the first time a field on that date is
-- filled in, not pre-populated for every date in the trip's range.
-- ---------------------------------------------------------------------------
create table if not exists packing_list.trip_days (
  id uuid primary key default gen_random_uuid(),
  holiday_id bigint not null,
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

create unique index if not exists trip_days_holiday_date_key
  on packing_list.trip_days(holiday_id, day_date)
  where deleted_at is null;

create index if not exists trip_days_holiday_idx
  on packing_list.trip_days(holiday_id, day_date);

-- ---------------------------------------------------------------------------
-- Packing items
--   scope = 'personal' -> traveller_id owns and packs it (their individual list)
--   scope = 'shared'   -> one item for the whole trip; traveller_id is the
--                         person responsible for packing it (null = unassigned)
-- ---------------------------------------------------------------------------
create table if not exists packing_list.packing_items (
  id uuid primary key default gen_random_uuid(),
  holiday_id bigint not null,
  household_id text not null,
  name text not null,
  category text not null default 'Other',
  quantity integer not null default 1,
  scope text not null default 'personal',
  traveller_id uuid references packing_list.travellers(id) on delete set null,
  packed boolean not null default false,
  packed_at timestamptz,
  notes text,
  source text not null default 'manual',
  standard_item_id uuid,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint packing_items_scope_check check (scope in ('personal', 'shared'))
);

create index if not exists packing_items_holiday_idx
  on packing_list.packing_items(holiday_id, scope, category, sort_order);

create index if not exists packing_items_traveller_idx
  on packing_list.packing_items(traveller_id);

-- Stops the favourites picker adding the same catalogue item twice for
-- the same owner on one trip.
create unique index if not exists packing_items_wizard_unique
  on packing_list.packing_items(holiday_id, standard_item_id, coalesce(traveller_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where standard_item_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Standard items: the catalogue the favourites picker draws from. Just a
-- name and a category - quantity is chosen per trip on the item row itself
-- (+/- and the trip-length preset buttons), and relevance is expressed by
-- each user favouriting what they personally want, via item_favourites.
-- ---------------------------------------------------------------------------
create table if not exists packing_list.standard_items (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  name text not null,
  category text not null default 'Other',
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists standard_items_unique_per_household
  on packing_list.standard_items(household_id, lower(name))
  where deleted_at is null;

create index if not exists standard_items_household_idx
  on packing_list.standard_items(household_id, category, sort_order);

-- ---------------------------------------------------------------------------
-- Per-user favourites over the catalogue above.
--
-- Its own table rather than a boolean on standard_items because
-- standard_items is household-wide (shared between both accounts) - a column
-- there would make one person's favourites everyone's.
--
-- user_id is the Supabase auth user id, NOT traveller_id: travellers are
-- per-holiday rows, so a traveller id can't carry a favourite across trips.
-- ---------------------------------------------------------------------------
create table if not exists packing_list.item_favourites (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  standard_item_id uuid not null references packing_list.standard_items(id) on delete cascade,
  user_id text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists item_favourites_unique_active
  on packing_list.item_favourites(standard_item_id, user_id)
  where deleted_at is null;

create index if not exists item_favourites_user_idx
  on packing_list.item_favourites(household_id, user_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table packing_list.trip_meta enable row level security;
alter table packing_list.travellers enable row level security;
alter table packing_list.trip_days enable row level security;
alter table packing_list.packing_items enable row level security;
alter table packing_list.standard_items enable row level security;
alter table packing_list.item_favourites enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trip_meta', 'travellers', 'trip_days', 'packing_items', 'standard_items', 'item_favourites'] loop
    execute format('drop policy if exists "household read %1$s" on packing_list.%1$I', t);
    execute format(
      'create policy "household read %1$s" on packing_list.%1$I for select to authenticated using (household_id = ''shared-household'')',
      t
    );
    execute format('drop policy if exists "household write %1$s" on packing_list.%1$I', t);
    execute format(
      'create policy "household write %1$s" on packing_list.%1$I for all to authenticated using (household_id = ''shared-household'') with check (household_id = ''shared-household'')',
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema packing_list to authenticated, service_role;
revoke all on all tables in schema packing_list from anon;
revoke usage on schema packing_list from anon;

-- Realtime is optional; the app polls. Kept here so it matches the shopping list app.
do $$
begin
  alter publication supabase_realtime add table packing_list.packing_items;
exception
  when duplicate_object then null;
end $$;


-- Nudge PostgREST to drop its cached schema so new tables/columns/policies
-- are visible immediately, without waiting for its next automatic refresh.
-- The `packing_list` schema itself must still be added to "Exposed
-- schemas" in Project Settings -> API at least once — that part can't be
-- done from SQL.
notify pgrst, 'reload schema';

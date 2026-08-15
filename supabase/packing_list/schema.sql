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
-- holidaycalendar.holidays (season, trip type, notes). There's no
-- "archived" concept here — holidaycalendar's own `status` field already
-- covers a trip's lifecycle, and there's no separate packing-trips list to
-- hide things from any more.
-- ---------------------------------------------------------------------------
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

-- Stops the wizard creating the same default twice for the same owner.
create unique index if not exists packing_items_wizard_unique
  on packing_list.packing_items(holiday_id, standard_item_id, coalesce(traveller_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where standard_item_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Standard items: the configurable default library the wizard draws from.
--   quantity = base_qty + ceil(per_day * nights_or_days), capped by max_qty
--   applies_to = 'person' -> one personal item per selected traveller
--   applies_to = 'trip'   -> one shared item for the trip
--   seasons / trip_types: empty array or {Any} means "always applies"
-- ---------------------------------------------------------------------------
create table if not exists packing_list.standard_items (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  name text not null,
  category text not null default 'Other',
  applies_to text not null default 'person',
  base_qty integer not null default 1,
  per_day numeric not null default 0,
  max_qty integer not null default 0,
  seasons text[] not null default '{}',
  trip_types text[] not null default '{}',
  mandatory boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standard_items_applies_to_check check (applies_to in ('person', 'trip'))
);

create unique index if not exists standard_items_unique_per_household
  on packing_list.standard_items(household_id, lower(name), applies_to)
  where deleted_at is null;

create index if not exists standard_items_household_idx
  on packing_list.standard_items(household_id, category, sort_order);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table packing_list.trip_meta enable row level security;
alter table packing_list.travellers enable row level security;
alter table packing_list.trip_days enable row level security;
alter table packing_list.packing_items enable row level security;
alter table packing_list.standard_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trip_meta', 'travellers', 'trip_days', 'packing_items', 'standard_items'] loop
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

-- ---------------------------------------------------------------------------
-- Seed the default standard item library (idempotent).
-- Everything here is editable in the app under "Standard Items".
-- ---------------------------------------------------------------------------
insert into packing_list.standard_items
  (household_id, name, category, applies_to, base_qty, per_day, max_qty, seasons, trip_types, sort_order)
values
  -- Clothing, scaled by trip length
  ('shared-household', 'Underwear',            'Clothing',   'person', 0, 1,    14, '{}',         '{}',                        10),
  ('shared-household', 'Socks',                'Clothing',   'person', 0, 1,    14, '{}',         '{}',                        20),
  ('shared-household', 'T-Shirts',             'Clothing',   'person', 0, 1,    10, '{}',         '{}',                        30),
  ('shared-household', 'Trousers',             'Clothing',   'person', 0, 0.25,  4, '{}',         '{}',                        40),
  ('shared-household', 'Jumper',               'Clothing',   'person', 1, 0,     2, '{Winter,Autumn,Spring}', '{}',            50),
  ('shared-household', 'Shorts',               'Clothing',   'person', 0, 0.34,  4, '{Summer}',   '{}',                        60),
  ('shared-household', 'Pyjamas',              'Clothing',   'person', 1, 0,     2, '{}',         '{}',                        70),
  ('shared-household', 'Light Jacket',         'Clothing',   'person', 1, 0,     1, '{Spring,Autumn}', '{}',                   80),
  ('shared-household', 'Winter Coat',          'Clothing',   'person', 1, 0,     1, '{Winter}',   '{}',                        90),
  ('shared-household', 'Waterproof Jacket',    'Clothing',   'person', 1, 0,     1, '{}',         '{Hiking,Camping,Festival}', 100),
  ('shared-household', 'Smart Outfit',         'Clothing',   'person', 1, 0,     2, '{}',         '{City Break,Business}',     110),

  -- Footwear
  ('shared-household', 'Trainers',             'Footwear',   'person', 1, 0,     1, '{}',         '{}',                        200),
  ('shared-household', 'Flip Flops',           'Footwear',   'person', 1, 0,     1, '{Summer}',   '{Beach}',                   210),
  ('shared-household', 'Walking Boots',        'Footwear',   'person', 1, 0,     1, '{}',         '{Hiking,Camping}',          220),
  ('shared-household', 'Smart Shoes',          'Footwear',   'person', 1, 0,     1, '{}',         '{City Break,Business}',     230),

  -- Summer / beach
  ('shared-household', 'Swimwear',             'Beach',      'person', 2, 0,     2, '{Summer}',   '{}',                        300),
  ('shared-household', 'Sunglasses',           'Beach',      'person', 1, 0,     1, '{Summer}',   '{}',                        310),
  ('shared-household', 'Sun Hat',              'Beach',      'person', 1, 0,     1, '{Summer}',   '{Beach}',                   320),
  ('shared-household', 'Beach Towel',          'Beach',      'person', 1, 0,     1, '{Summer}',   '{Beach}',                   330),
  ('shared-household', 'Suncream',             'Beach',      'trip',   1, 0,     1, '{Summer}',   '{}',                        340),
  ('shared-household', 'After Sun',            'Beach',      'trip',   1, 0,     1, '{Summer}',   '{Beach}',                   350),
  ('shared-household', 'Snorkel Set',          'Beach',      'trip',   1, 0,     1, '{Summer}',   '{Beach}',                   360),

  -- Winter / ski
  ('shared-household', 'Thermals',             'Clothing',   'person', 0, 0.34,  3, '{Winter}',   '{Ski}',                     400),
  ('shared-household', 'Gloves',               'Clothing',   'person', 1, 0,     1, '{Winter}',   '{}',                        410),
  ('shared-household', 'Hat and Scarf',        'Clothing',   'person', 1, 0,     1, '{Winter}',   '{}',                        420),
  ('shared-household', 'Ski Goggles',          'Sports',     'person', 1, 0,     1, '{}',         '{Ski}',                     430),
  ('shared-household', 'Ski Jacket',           'Sports',     'person', 1, 0,     1, '{}',         '{Ski}',                     440),

  -- Toiletries
  ('shared-household', 'Toothbrush',           'Toiletries', 'person', 1, 0,     1, '{}',         '{}',                        500),
  ('shared-household', 'Toothpaste',           'Toiletries', 'trip',   1, 0,     1, '{}',         '{}',                        510),
  ('shared-household', 'Shampoo',              'Toiletries', 'trip',   1, 0,     1, '{}',         '{}',                        520),
  ('shared-household', 'Shower Gel',           'Toiletries', 'trip',   1, 0,     1, '{}',         '{}',                        530),
  ('shared-household', 'Deodorant',            'Toiletries', 'person', 1, 0,     1, '{}',         '{}',                        540),
  ('shared-household', 'Razor',                'Toiletries', 'person', 1, 0,     1, '{}',         '{}',                        550),
  ('shared-household', 'Hairbrush',            'Toiletries', 'person', 1, 0,     1, '{}',         '{}',                        560),

  -- Health
  ('shared-household', 'First Aid Kit',        'Health',     'trip',   1, 0,     1, '{}',         '{}',                        600),
  ('shared-household', 'Paracetamol',          'Health',     'trip',   1, 0,     1, '{}',         '{}',                        610),
  ('shared-household', 'Plasters',             'Health',     'trip',   1, 0,     1, '{}',         '{}',                        620),
  ('shared-household', 'Insect Repellent',     'Health',     'trip',   1, 0,     1, '{Summer}',   '{}',                        630),
  ('shared-household', 'Prescription Medication', 'Health',  'person', 1, 0,     1, '{}',         '{}',                        640),

  -- Tech
  ('shared-household', 'Phone Charger',        'Tech',       'person', 1, 0,     1, '{}',         '{}',                        700),
  ('shared-household', 'Power Bank',           'Tech',       'person', 1, 0,     1, '{}',         '{}',                        710),
  ('shared-household', 'Travel Adaptor',       'Tech',       'trip',   2, 0,     4, '{}',         '{}',                        720),
  ('shared-household', 'Headphones',           'Tech',       'person', 1, 0,     1, '{}',         '{}',                        730),
  ('shared-household', 'Camera',               'Tech',       'trip',   1, 0,     1, '{}',         '{}',                        740),

  -- Documents
  ('shared-household', 'Passport',             'Documents',  'person', 1, 0,     1, '{}',         '{}',                        800),
  ('shared-household', 'Travel Insurance',     'Documents',  'trip',   1, 0,     1, '{}',         '{}',                        810),
  ('shared-household', 'Boarding Passes',      'Documents',  'person', 1, 0,     1, '{}',         '{}',                        820),
  ('shared-household', 'Driving Licence',      'Documents',  'person', 1, 0,     1, '{}',         '{Road Trip}',               830),
  ('shared-household', 'Accommodation Details','Documents',  'trip',   1, 0,     1, '{}',         '{}',                        840),

  -- Camping / festival
  ('shared-household', 'Tent',                 'Other',      'trip',   1, 0,     1, '{}',         '{Camping,Festival}',        900),
  ('shared-household', 'Sleeping Bag',         'Other',      'person', 1, 0,     1, '{}',         '{Camping,Festival}',        910),
  ('shared-household', 'Torch',                'Other',      'trip',   1, 0,     2, '{}',         '{Camping,Festival,Hiking}', 920),
  ('shared-household', 'Reusable Water Bottle','Other',      'person', 1, 0,     1, '{}',         '{}',                        930),
  ('shared-household', 'Book',                 'Other',      'person', 1, 0,     2, '{}',         '{}',                        940),
  ('shared-household', 'Snacks',               'Food and Drink', 'trip', 1, 0,    1, '{}',         '{Road Trip,Camping}',       950)
on conflict do nothing;

-- Nudge PostgREST to drop its cached schema so new tables/columns/policies
-- are visible immediately, without waiting for its next automatic refresh.
-- The `packing_list` schema itself must still be added to "Exposed
-- schemas" in Project Settings -> API at least once — that part can't be
-- done from SQL.
notify pgrst, 'reload schema';

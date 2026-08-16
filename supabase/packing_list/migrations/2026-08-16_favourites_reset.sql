-- ---------------------------------------------------------------------------
-- Simplifies the packing catalogue down to "name + category + per-user
-- favourite", replacing the Packing Wizard's season/trip-type/quantity-rule
-- matching with a plain favourites picker.
--
-- Part 1 of 2. This one is additive + a deliberate data wipe, and is safe to
-- run BEFORE deploying the new app code (the columns the old code still
-- writes are all left in place here). The column drops live in
-- 2026-08-16b_drop_unused_columns.sql and should only run once the new UI
-- is confirmed working - the app's sync layer upserts whole row objects, so
-- dropping a column while any still-cached old JS is writing it would fail
-- every write.
-- ---------------------------------------------------------------------------

-- Start from scratch, per instruction. Hard delete rather than the app's
-- usual soft delete: these rows are being replaced wholesale, and leaving
-- ~100 soft-deleted rows behind would keep tripping the
-- standard_items_unique_per_household index (it only ignores rows where
-- deleted_at is null) when the same names get re-added by hand later.
delete from packing_list.standard_items
where household_id = 'shared-household';

-- ---------------------------------------------------------------------------
-- Per-user favourites.
--
-- Deliberately its own table rather than a boolean on standard_items:
-- standard_items is household-wide (shared between both accounts), so a
-- column there would make one person's favourites everyone's.
--
-- Keyed on user_id = the Supabase auth user id, NOT traveller_id: travellers
-- are per-holiday rows, so a traveller id can't carry a favourite from one
-- trip to the next.
--
-- Shape (surrogate id + household_id + deleted_at + updated_at) matches
-- every other table here on purpose, so the existing local-first sync
-- (enqueue/apiUpsert on_conflict=id, mergeById, pullAll) handles it with no
-- special cases. Unfavouriting is a soft delete, same as everything else.
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

alter table packing_list.item_favourites enable row level security;

drop policy if exists "household read item_favourites" on packing_list.item_favourites;
create policy "household read item_favourites"
  on packing_list.item_favourites for select to authenticated
  using (household_id = 'shared-household');

drop policy if exists "household write item_favourites" on packing_list.item_favourites;
create policy "household write item_favourites"
  on packing_list.item_favourites for all to authenticated
  using (household_id = 'shared-household')
  with check (household_id = 'shared-household');

grant select, insert, update, delete on packing_list.item_favourites to authenticated, service_role;
revoke all on packing_list.item_favourites from anon;

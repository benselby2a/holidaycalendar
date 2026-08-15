-- ---------------------------------------------------------------------------
-- Re-maps existing packing_list.standard_items rows still carrying the old
-- category/season/trip_type values onto the current lists (see pack.js's
-- CATEGORIES/SEASONS/TRIP_TYPES constants). Renaming those lists in the app
-- didn't touch already-stored rows, so items created before the rename kept
-- their old text verbatim - harmless for category (just an unrecognised
-- label), but seasons/trip_types are used to filter the Packing Wizard's
-- suggestions, so a row still tagged e.g. trip_types={'Beach'} would never
-- match any current trip (no trip can have trip_types containing the old
-- 'Beach' string any more) and silently stop being suggested at all. This
-- is what surfaced as "items in the database like swimwear with a category
-- of Beach and Summer" - both no longer valid values.
--
-- Category: 1:1 renames, except Sports/Beach (folded into Clothes, matching
-- how the new seed file categorises the same kind of items) and Kids (no
-- equivalent - falls back to Other).
--
-- Seasons: Summer -> Warm Climate, Winter -> Cool Climate (confident
-- mappings). Spring/Autumn are dropped rather than guessed onto one side -
-- an item only tagged one of those shoulder seasons ends up with no season
-- tag at all, i.e. "any climate", which is safer than picking the wrong one.
--
-- Trip types: Beach -> Beach Resort, City Break -> City, Business unchanged.
-- Ski/Hiking/Camping/Festival map onto the new outdoorsy/active types (see
-- the VALUES list below - several old types expand to more than one new
-- one). Road Trip has no equivalent and is dropped (item becomes
-- unrestricted rather than wrongly excluded from every current trip type).
--
-- Safe to re-run: every WHERE clause only matches rows still containing an
-- old value, so a second run is a no-op once the data's been migrated.
-- ---------------------------------------------------------------------------

-- Category ------------------------------------------------------------------
update packing_list.standard_items
set category = case category
    when 'Clothing' then 'Clothes'
    when 'Beach' then 'Clothes'
    when 'Sports' then 'Clothes'
    when 'Kids' then 'Other'
    when 'Food and Drink' then 'Food And Drink'
    else category
  end,
  updated_at = now()
where category in ('Clothing', 'Beach', 'Sports', 'Kids', 'Food and Drink');

-- Seasons ---------------------------------------------------------------
update packing_list.standard_items t
set seasons = coalesce(sub.new_seasons, '{}'),
    updated_at = now()
from (
  select t2.id,
         array_agg(distinct m.new_val) filter (where m.new_val is not null) as new_seasons
  from packing_list.standard_items t2
  cross join lateral unnest(t2.seasons) as raw_val
  left join (values
    ('Any', 'Any'),
    ('Summer', 'Warm Climate'),
    ('Winter', 'Cool Climate')
    -- Spring, Autumn intentionally absent -> dropped
  ) as m(old_val, new_val) on m.old_val = raw_val
  group by t2.id
) sub
where t.id = sub.id
  and t.seasons && array['Spring', 'Summer', 'Autumn', 'Winter']::text[];

-- Trip types ------------------------------------------------------------
update packing_list.standard_items t
set trip_types = coalesce(sub.new_types, '{}'),
    updated_at = now()
from (
  select t2.id,
         array_agg(distinct m.new_val) filter (where m.new_val is not null) as new_types
  from packing_list.standard_items t2
  cross join lateral unnest(t2.trip_types) as raw_val
  left join (values
    ('Beach', 'Beach Resort'),
    ('City Break', 'City'),
    ('Ski', 'Mountains'),
    ('Ski', 'Activities'),
    ('Hiking', 'Mountains'),
    ('Hiking', 'Nature/Safari'),
    ('Hiking', 'Activities'),
    ('Camping', 'Nature/Safari'),
    ('Camping', 'Activities'),
    ('Business', 'Business'),
    ('Festival', 'Activities')
    -- Road Trip intentionally absent -> dropped
  ) as m(old_val, new_val) on m.old_val = raw_val
  group by t2.id
) sub
where t.id = sub.id
  and t.trip_types && array['Beach', 'City Break', 'Ski', 'Hiking', 'Camping', 'Road Trip', 'Festival']::text[];

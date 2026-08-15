-- ---------------------------------------------------------------------------
-- Seeds packing_list.standard_items from the household's real packing lists
-- (several past trips' lists, pasted together and de-duplicated by hand).
-- Quantities from those lists (e.g. "Boxers x 8") were dropped on purpose -
-- every row here uses the flat defaults (base_qty 1, per_day N/A, no max)
-- so the Packing Wizard just offers each item once per traveller; per-day
-- scaling can be set later per item from Item Database if wanted.
--
-- One entry was left out on purpose: [redacted] was a one-off
-- note tied to a specific past trip, not a reusable item template.
-- Two names were cleaned up: "Drugs" -> "Medication", "Colin caterpillars"
-- -> "Colin the Caterpillar" (the M&S cake).
--
-- Idempotent - matches the household_id/lower(name)/applies_to unique
-- index, so re-running this file is a no-op the second time.
-- ---------------------------------------------------------------------------

insert into packing_list.standard_items
  (household_id, name, category, applies_to, base_qty, per_day, max_qty, seasons, trip_types)
values
  -- Clothes
  ('shared-household', 'Boxers',           'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Socks',            'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Sports Socks',     'Clothes', 'person', 1, 0, 0, '{}',                 '{Activities}'),
  ('shared-household', 'Walking Socks',    'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{Mountains,Nature/Safari}'),
  ('shared-household', 'T-Shirt',          'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Shirt',            'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Jeans',            'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Jumper',           'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Fleece',           'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{Mountains,Nature/Safari}'),
  ('shared-household', 'Coat',             'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Pyjamas',          'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Joggers',          'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Chinos',           'Clothes', 'person', 1, 0, 0, '{}',                 '{City,Business}'),
  ('shared-household', 'Trousers',         'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Walking Trousers', 'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{Mountains,Nature/Safari}'),
  ('shared-household', 'Shorts',           'Clothes', 'person', 1, 0, 0, '{Warm Climate}',     '{}'),
  ('shared-household', 'Running Shorts',   'Clothes', 'person', 1, 0, 0, '{}',                 '{Activities}'),
  ('shared-household', 'Swimming Shorts',  'Clothes', 'person', 1, 0, 0, '{Warm Climate}',     '{Beach Resort}'),
  ('shared-household', 'Running Top',      'Clothes', 'person', 1, 0, 0, '{}',                 '{Activities}'),
  ('shared-household', 'Sports Top',       'Clothes', 'person', 1, 0, 0, '{}',                 '{Activities}'),
  ('shared-household', 'Hat',              'Clothes', 'person', 1, 0, 0, '{}',                 '{}'),
  ('shared-household', 'Pacamac',          'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Raincoat',         'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Gloves',           'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Scarf',            'Clothes', 'person', 1, 0, 0, '{Cool Climate}',     '{}'),
  ('shared-household', 'Safari Shirt',     'Clothes', 'person', 1, 0, 0, '{Warm Climate}',     '{Nature/Safari}'),
  ('shared-household', 'Safari Trousers',  'Clothes', 'person', 1, 0, 0, '{Warm Climate}',     '{Nature/Safari}'),

  -- Footwear
  ('shared-household', 'Trainers',         'Footwear', 'person', 1, 0, 0, '{}',              '{}'),
  ('shared-household', 'Flip Flops',       'Footwear', 'person', 1, 0, 0, '{Warm Climate}',  '{Beach Resort}'),
  ('shared-household', 'Walking Trainers', 'Footwear', 'person', 1, 0, 0, '{}',              '{Mountains,Nature/Safari,Activities}'),
  ('shared-household', 'Walking Boots',    'Footwear', 'person', 1, 0, 0, '{Cool Climate}',  '{Mountains}'),
  ('shared-household', 'Slippers',         'Footwear', 'person', 1, 0, 0, '{Cool Climate}',  '{}'),
  ('shared-household', 'Shoes',            'Footwear', 'person', 1, 0, 0, '{}',              '{City,Business}'),

  -- Toiletries
  ('shared-household', 'Wash Bag',         'Toiletries', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Shampoo',          'Toiletries', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Shower Gel',       'Toiletries', 'person', 1, 0, 0, '{}', '{}'),

  -- Health
  ('shared-household', 'Medication',       'Health', 'person', 1, 0, 0, '{}', '{}'),

  -- Tech
  ('shared-household', 'Portable Speaker',    'Tech', 'trip',   1, 0, 0, '{}', '{}'),
  ('shared-household', 'Headphones',          'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Phone Charger',       'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'USB-C Cable',         'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'USB-A to C Cable',    'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'USB-3 Cable',         'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Power Adaptor',       'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Laptop',              'Tech', 'person', 1, 0, 0, '{}', '{Business}'),
  ('shared-household', 'AirPods',             'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'AirPods Max',         'Tech', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Headphone Cable',     'Tech', 'person', 1, 0, 0, '{}', '{}'),

  -- Documents
  ('shared-household', 'Passport',         'Documents', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Documents',        'Documents', 'trip',   1, 0, 0, '{}', '{}'),
  ('shared-household', 'Euros',            'Documents', 'person', 1, 0, 0, '{}', '{}'),

  -- Food And Drink
  ('shared-household', 'Water Bottle',           'Food And Drink', 'person', 1, 0, 0, '{}', '{}'),
  ('shared-household', 'Wine',                   'Food And Drink', 'trip',   1, 0, 0, '{}', '{}'),
  ('shared-household', 'Colin the Caterpillar',  'Food And Drink', 'trip',   1, 0, 0, '{}', '{}'),

  -- Other
  ('shared-household', 'Sunglasses',       'Other', 'person', 1, 0, 0, '{Warm Climate}', '{}'),
  ('shared-household', 'Book',             'Other', 'person', 1, 0, 0, '{}',             '{}'),
  ('shared-household', 'Linen Bag',        'Other', 'person', 1, 0, 0, '{}',             '{}'),
  ('shared-household', 'Goggles',          'Other', 'person', 1, 0, 0, '{Warm Climate}', '{Beach Resort,Activities}'),
  ('shared-household', 'Binoculars',       'Other', 'trip',   1, 0, 0, '{}',             '{Nature/Safari,Mountains}')
on conflict (household_id, lower(name), applies_to) where deleted_at is null
do nothing;

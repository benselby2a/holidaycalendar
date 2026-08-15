-- Adds the "mandatory" flag to packing_list.standard_items: items marked
-- mandatory are always suggested by the Packing Wizard and pre-checked,
-- regardless of season/trip type. Everything else is still shown (never
-- hidden by season/trip type - see the app's wizardRelevanceScore()) but
-- ranked by relevance and left unchecked, so the user opts in.
alter table packing_list.standard_items
  add column if not exists mandatory boolean not null default false;

# packing_list schema

Backs the packing/itinerary screen (`pack.js`/`pack.css`, mounted inline from
the main app when a trip's "PlanIt" link is clicked). Same Supabase project
as the rest of this app, separate `packing_list` schema — kept apart from
`supabase/migrations/` (this repo's own schema) since the two have
independent history and a different migration-file naming convention.

Originally developed in a standalone `packinglist` repo (a separate app that
read/wrote this same schema before the packing screen moved in here); moved
here on 2026-08-09 so the whole thing lives in one place. `schema.sql` is
the target state for a fresh install; `migrations/` are the incremental
diffs that got an already-provisioned project there without losing data —
run them in filename order.

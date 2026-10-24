# Holiday Calendar (GitHub Pages + Supabase)

A lightweight holiday planning web app with:
- allowance tracking per person (standard + additional)
- holiday entry with location, start/end, and people taking leave
- table view and calendar view
- highlighted UK (England & Wales) bank holidays and long weekends

## 1) Create Supabase tables

In Supabase SQL Editor, run, in order:
1. `supabase/migrate_to_cnkznpkvwoqxaiywwmhr.sql` - creates the `holidaycalendar` schema and its tables.
2. Every file under `supabase/migrations/`, oldest first - schema changes and RLS fixes applied since.

Each trip also has its own packing/itinerary screen (`pack.js`/`pack.css`,
opened from a trip's "PlanIt" link). It reads/writes a separate
`packing_list` schema in the same Supabase project — see
`supabase/packing_list/` for that schema's own SQL and migrations.

## 2) Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main` (or your default branch)
   - Folder: `/ (root)`
4. Save and wait for the Pages URL.

## 3) Connect app to Supabase

When you open the app first time:
1. Paste your Supabase project URL.
2. Paste your Supabase anon key.
3. Click **Connect**.

The values are stored in your browser local storage and used by the app to read/write your Supabase tables.

## Notes

- RLS policies on the `holidaycalendar` and `packing_list` schemas are
  scoped `to authenticated` - the published anon key alone cannot read or
  write any table. Any signed-in Supabase user can still read/write all of
  it, since there's no further per-user scoping - fine for a trusted
  household, but keep public sign-up disabled on the Supabase project.
- `data/world-50m.json` is Natural Earth country boundary data (via the `world-atlas` npm package, ISC-licensed) used to draw the Countries Visited map. It's bundled locally so the map works without any external CDN calls.

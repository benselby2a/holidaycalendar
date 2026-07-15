# Holiday Calendar (GitHub Pages + Supabase)

A lightweight holiday planning web app with:
- allowance tracking per person (standard + additional)
- holiday entry with location, start/end, and people taking leave
- table view and calendar view
- highlighted UK (England & Wales) bank holidays and long weekends

## 1) Create Supabase tables

In Supabase SQL Editor, run the SQL in:
- `supabase.sql`

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

- Current RLS policies in `supabase.sql` allow all users with the anon key to read/write.
- For private/shared household use this is usually OK, but for stronger security add auth and user-specific policies.
- `data/world-50m.json` is Natural Earth country boundary data (via the `world-atlas` npm package, ISC-licensed) used to draw the Countries Visited map. It's bundled locally so the map works without any external CDN calls.

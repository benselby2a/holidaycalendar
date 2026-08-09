-- Restrict packing_list tables to authenticated users only.
-- Previously the "shared-household" RLS policies granted both anon and
-- authenticated roles access; anon is now removed so every read/write
-- requires a signed-in Supabase Auth session, matching the app's auth gate.
-- Safe to run multiple times.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['trips', 'travellers', 'packing_items', 'standard_items'] loop
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

revoke all on all tables in schema packing_list from anon;
revoke usage on schema packing_list from anon;
grant select, insert, update, delete on all tables in schema packing_list to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

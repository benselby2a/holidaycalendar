alter table public.holidays
  alter column start_half set default 'am',
  alter column end_half set default 'pm';

update public.holidays
set start_half = coalesce(start_half, 'am'),
    end_half = coalesce(end_half, 'pm')
where start_half is null
   or end_half is null;

alter table public.holidays
  alter column start_half set not null,
  alter column end_half set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holidays_start_half_check'
  ) then
    alter table public.holidays
      add constraint holidays_start_half_check check (start_half in ('am', 'pm'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'holidays_end_half_check'
  ) then
    alter table public.holidays
      add constraint holidays_end_half_check check (end_half in ('am', 'pm'));
  end if;
end $$;

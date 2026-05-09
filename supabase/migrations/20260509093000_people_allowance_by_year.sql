alter table public.people_allowance
add column if not exists allowance_year integer;

update public.people_allowance
set allowance_year = extract(year from current_date)::integer
where allowance_year is null;

alter table public.people_allowance
alter column allowance_year set not null;

alter table public.people_allowance
drop constraint if exists people_allowance_name_key;

create unique index if not exists people_allowance_name_year_key
on public.people_allowance(name, allowance_year);

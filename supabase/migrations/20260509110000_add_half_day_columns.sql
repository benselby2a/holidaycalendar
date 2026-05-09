alter table public.holidays
add column if not exists start_half text,
add column if not exists end_half text;

update public.holidays
set start_half = coalesce(start_half, 'am'),
    end_half = coalesce(end_half, 'pm')
where start_half is null or end_half is null;

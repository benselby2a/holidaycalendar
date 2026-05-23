begin;

truncate table holidaycalendar.holidays, holidaycalendar.bank_holidays, holidaycalendar.people_allowance, holidaycalendar.people restart identity cascade;

insert into holidaycalendar.people (id, name, created_at) values
(1, 'Ben', '2026-05-09T11:44:33.161268+00:00'),
(2, 'Louise', '2026-05-09T11:44:33.161268+00:00');

insert into holidaycalendar.people_allowance (id, name, standard_days, additional_days, created_at, allowance_year) values
(4, 'Louise', 30, 5, '2026-05-09T07:26:41.972379+00:00', 2026),
(3, 'Ben', 28, 4, '2026-05-09T07:25:57.419651+00:00', 2026),
(6, 'Ben', 28, 5, '2026-05-10T10:24:19.376416+00:00', 2027),
(7, 'Louise', 30, 5, '2026-05-10T10:24:48.314551+00:00', 2027);

insert into holidaycalendar.bank_holidays (id, holiday_year, holiday_date, name, created_at) values
(1, 2026, '2026-01-01', 'New Year''s Day', '2026-05-09T11:44:38.390002+00:00'),
(2, 2026, '2026-04-02', 'Good Friday', '2026-05-09T11:44:38.390002+00:00'),
(3, 2026, '2026-04-05', 'Easter Monday', '2026-05-09T11:44:38.390002+00:00'),
(4, 2026, '2026-05-03', 'Early May Bank Holiday', '2026-05-09T11:44:38.390002+00:00'),
(5, 2026, '2026-05-24', 'Spring Bank Holiday', '2026-05-09T11:44:38.390002+00:00'),
(6, 2026, '2026-08-30', 'Summer Bank Holiday', '2026-05-09T11:44:38.390002+00:00'),
(7, 2026, '2026-12-25', 'Christmas Day', '2026-05-09T11:44:38.390002+00:00'),
(8, 2026, '2026-12-28', 'Boxing Day', '2026-05-09T11:44:38.390002+00:00'),
(9, 2027, '2027-01-01', 'New Year''s Day', '2026-05-09T11:58:35.52528+00:00'),
(10, 2027, '2027-03-26', 'Good Friday', '2026-05-09T11:58:35.52528+00:00'),
(11, 2027, '2027-03-28', 'Easter Monday', '2026-05-09T11:58:35.52528+00:00'),
(12, 2027, '2027-05-02', 'Early May Bank Holiday', '2026-05-09T11:58:35.52528+00:00'),
(13, 2027, '2027-05-30', 'Spring Bank Holiday', '2026-05-09T11:58:35.52528+00:00'),
(14, 2027, '2027-08-29', 'Summer Bank Holiday', '2026-05-09T11:58:35.52528+00:00'),
(15, 2027, '2027-12-27', 'Christmas Day', '2026-05-09T11:58:35.52528+00:00'),
(16, 2027, '2027-12-28', 'Boxing Day', '2026-05-09T11:58:35.52528+00:00'),
(17, 2028, '2028-01-03', 'New Year''s Day', '2026-05-09T11:58:38.700362+00:00'),
(18, 2028, '2028-04-13', 'Good Friday', '2026-05-09T11:58:38.700362+00:00'),
(19, 2028, '2028-04-16', 'Easter Monday', '2026-05-09T11:58:38.700362+00:00'),
(20, 2028, '2028-04-30', 'Early May Bank Holiday', '2026-05-09T11:58:38.700362+00:00'),
(21, 2028, '2028-05-28', 'Spring Bank Holiday', '2026-05-09T11:58:38.700362+00:00'),
(22, 2028, '2028-08-27', 'Summer Bank Holiday', '2026-05-09T11:58:38.700362+00:00'),
(23, 2028, '2028-12-25', 'Christmas Day', '2026-05-09T11:58:38.700362+00:00'),
(24, 2028, '2028-12-26', 'Boxing Day', '2026-05-09T11:58:38.700362+00:00'),
(25, 2025, '2025-01-01', 'New Year''s Day', '2026-05-09T13:21:25.592227+00:00'),
(26, 2025, '2025-04-17', 'Good Friday', '2026-05-09T13:21:25.592227+00:00'),
(27, 2025, '2025-04-20', 'Easter Monday', '2026-05-09T13:21:25.592227+00:00'),
(28, 2025, '2025-05-04', 'Early May Bank Holiday', '2026-05-09T13:21:25.592227+00:00'),
(29, 2025, '2025-05-25', 'Spring Bank Holiday', '2026-05-09T13:21:25.592227+00:00'),
(30, 2025, '2025-08-24', 'Summer Bank Holiday', '2026-05-09T13:21:25.592227+00:00'),
(31, 2025, '2025-12-25', 'Christmas Day', '2026-05-09T13:21:25.592227+00:00'),
(32, 2025, '2025-12-26', 'Boxing Day', '2026-05-09T13:21:25.592227+00:00'),
(33, 0, '1900-01-01', 'New Year''s Day', '2026-05-10T14:29:26.172412+00:00'),
(34, 0, '1900-04-07', 'Good Friday', '2026-05-10T14:29:26.172412+00:00'),
(35, 0, '1900-04-10', 'Easter Monday', '2026-05-10T14:29:26.172412+00:00'),
(36, 0, '1900-05-07', 'Early May Bank Holiday', '2026-05-10T14:29:26.172412+00:00'),
(37, 0, '1900-05-28', 'Spring Bank Holiday', '2026-05-10T14:29:26.172412+00:00'),
(38, 0, '1900-08-27', 'Summer Bank Holiday', '2026-05-10T14:29:26.172412+00:00'),
(39, 0, '1900-12-25', 'Christmas Day', '2026-05-10T14:29:26.172412+00:00'),
(40, 0, '1900-12-26', 'Boxing Day', '2026-05-10T14:29:26.172412+00:00');

insert into holidaycalendar.holidays (id, location, country, start_date, start_half, end_date, end_half, days, days_off_work, status, people_days, created_at) values
(12, 'East Wittering trip', 'United Kingdom', '2026-04-03', 'am', '2026-04-06', 'pm', 4, 0, 'happened', '{"Ben":0,"Louise":0}'::jsonb, '2026-05-09T07:39:26.633259+00:00'),
(10, 'Athens trip', 'Greece', '2026-10-03', 'am', '2026-10-11', 'pm', 5, 5, 'planning', '{"Ben":5,"Louise":5}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(2, 'Barbados', 'Barbados', '2026-03-21', 'am', '2026-03-29', 'pm', 5, 5, 'planning', '{"Ben":5,"Louise":5}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(1, 'Switzerland', 'Switzerland', '2026-01-09', 'am', '2026-01-12', 'pm', 2, 2, 'planning', '{"Ben":2,"Louise":2}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(11, 'Christmas', 'United Kingdom', '2026-12-24', 'am', '2026-12-26', 'pm', 3, 3, 'planning', '{"Ben":3,"Louise":3}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(3, 'Louise Day Off', 'United Kingdom', '2026-02-20', 'am', '2026-02-20', 'pm', 1, 1, 'happened', '{"Louise":1}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(4, 'Afternoon tea', 'United Kingdom', '2026-05-29', 'am', '2026-05-29', 'pm', 1, 1, 'booked', '{"Louise":1}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(6, 'Kenya', 'Kenya', '2026-07-03', 'am', '2026-07-15', 'pm', 9, 9, 'booked', '{"Ben":9,"Louise":9}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(8, 'Great British Summer', 'United Kingdom', '2026-08-23', 'am', '2026-08-31', 'pm', 5, 5, 'booked', '{"Ben":5,"Louise":5}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(9, 'Mi Scusi York', 'United Kingdom', '2026-09-11', 'am', '2026-09-13', 'pm', 0.5, 0.5, 'booked', '{"Ben":0.5,"Louise":0.5}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(7, 'Lymington birthday trip', 'United Kingdom', '2026-07-24', 'pm', '2026-07-26', 'pm', 2.5, 0.5, 'booked', '{"Ben":0.5,"Louise":0.5}'::jsonb, '2026-05-09T07:30:41.952117+00:00'),
(16, 'Europe', 'Spain', '2027-06-19', 'am', '2027-07-03', 'pm', 15, 10, 'planning', '{"Ben":10,"Louise":10}'::jsonb, '2026-05-10T10:26:13.758685+00:00'),
(17, 'Usa', 'United States', '2027-09-11', 'am', '2027-09-19', 'pm', 9, 5, 'planning', '{"Ben":5,"Louise":5}'::jsonb, '2026-05-10T10:26:57.970563+00:00'),
(18, 'Christmas', 'United Kingdom', '2027-12-20', 'am', '2027-12-22', 'pm', 3, 3, 'planning', '{"Ben":3,"Louise":3}'::jsonb, '2026-05-10T10:27:30.400061+00:00'),
(15, 'Sri Lanka', 'Sri Lanka', '2027-02-20', 'am', '2027-03-06', 'pm', 15, 10, 'planning', '{"Ben":10,"Louise":10}'::jsonb, '2026-05-10T10:24:01.536753+00:00'),
(5, 'Sissinghurst/Kent', 'United Kingdom', '2026-06-12', 'am', '2026-06-14', 'pm', 3, 1, 'booked', '{"Ben":1,"Louise":1}'::jsonb, '2026-05-09T07:30:41.952117+00:00');

select setval(pg_get_serial_sequence('holidaycalendar.people', 'id'), coalesce((select max(id) from holidaycalendar.people), 1), true);
select setval(pg_get_serial_sequence('holidaycalendar.people_allowance', 'id'), coalesce((select max(id) from holidaycalendar.people_allowance), 1), true);
select setval(pg_get_serial_sequence('holidaycalendar.bank_holidays', 'id'), coalesce((select max(id) from holidaycalendar.bank_holidays), 1), true);
select setval(pg_get_serial_sequence('holidaycalendar.holidays', 'id'), coalesce((select max(id) from holidaycalendar.holidays), 1), true);

commit;

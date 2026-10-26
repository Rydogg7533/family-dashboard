-- Only a birth year was kept, so the app could only ever say "7 or 8" and could not know a birthday.
-- birth_year stays and is kept in step with the date, so everything that reads it keeps working;
-- rows that predate this have no date and still fall back to the year.
alter table public.children add column if not exists birth_date date;
alter table public.profiles add column if not exists birth_date date;

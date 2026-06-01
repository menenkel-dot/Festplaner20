alter table public.festival_days
  add column if not exists reservation_times text[] not null default array['17:00 Uhr', '18:00 Uhr', '19:00 Uhr', '20:00 Uhr'];

alter table public.reservations
  add column if not exists table_ids integer[] not null default '{}',
  add column if not exists table_count integer not null default 1,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists guest_type text not null default 'private',
  add column if not exists club_name text;

alter table public.reservations
  add constraint reservations_table_count_check check (table_count > 0 and table_count <= 50) not valid;

alter table public.reservations
  add constraint reservations_guest_type_check check (guest_type in ('private', 'club')) not valid;

update public.reservations
set table_ids = array[table_id]
where table_ids = '{}';


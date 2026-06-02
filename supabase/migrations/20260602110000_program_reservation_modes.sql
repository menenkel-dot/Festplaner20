alter table public.program_items
  add column if not exists reservation_uses_tent_plan boolean not null default true,
  add column if not exists reservation_table_limit integer not null default 16 check (reservation_table_limit between 1 and 500);

drop index if exists public.reservations_active_table_idx;

create unique index if not exists reservations_active_table_time_idx
  on public.reservations (festival_id, date_label, time_label, table_id)
  where status in ('pending', 'confirmed');

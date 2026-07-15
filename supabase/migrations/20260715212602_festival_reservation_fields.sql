create table public.festival_reservation_fields (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  field_type text not null check (field_type in ('text', 'number', 'boolean')),
  help_text text check (help_text is null or char_length(help_text) <= 200),
  required boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0 and sort_order < 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index festival_reservation_fields_festival_id_idx
  on public.festival_reservation_fields (festival_id);

create unique index festival_reservation_fields_festival_label_idx
  on public.festival_reservation_fields (festival_id, lower(label));

create trigger festival_reservation_fields_set_updated_at
before update on public.festival_reservation_fields
for each row execute function public.set_updated_at();

alter table public.reservations
  add column club_reservation_answers jsonb not null default '[]'::jsonb;

alter table public.reservations
  add constraint reservations_club_reservation_answers_array_check
  check (jsonb_typeof(club_reservation_answers) = 'array');

alter table public.festival_reservation_fields enable row level security;

create policy "Club members can read festival reservation fields"
on public.festival_reservation_fields
for select to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_reservation_fields.festival_id
      and (
        (select private.is_system_admin())
        or private.is_club_member(festival.club_id)
      )
  )
);

create policy "Reservation users can insert festival reservation fields"
on public.festival_reservation_fields
for insert to authenticated
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_reservation_fields.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'reservations')
      )
  )
);

create policy "Reservation users can update festival reservation fields"
on public.festival_reservation_fields
for update to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_reservation_fields.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'reservations')
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_reservation_fields.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'reservations')
      )
  )
);

create policy "Reservation users can delete festival reservation fields"
on public.festival_reservation_fields
for delete to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_reservation_fields.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'reservations')
      )
  )
);

grant select, insert, update, delete on table public.festival_reservation_fields to authenticated;
grant select, insert, update, delete on table public.festival_reservation_fields to service_role;

create table if not exists public.club_contacts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  function_title text not null default '',
  last_name text not null,
  first_name text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_contacts_function_title_length check (char_length(function_title) <= 120),
  constraint club_contacts_last_name_length check (char_length(last_name) between 1 and 120),
  constraint club_contacts_first_name_length check (char_length(first_name) <= 120),
  constraint club_contacts_phone_length check (char_length(phone) <= 80),
  constraint club_contacts_email_length check (char_length(email) <= 320)
);

create index if not exists club_contacts_club_name_idx
  on public.club_contacts (club_id, lower(last_name), lower(first_name));

drop trigger if exists club_contacts_set_updated_at on public.club_contacts;
create trigger club_contacts_set_updated_at
before update on public.club_contacts
for each row execute function public.set_updated_at();

alter table public.club_contacts enable row level security;

grant select, insert, update, delete on table public.club_contacts to authenticated;

drop policy if exists "Contact users can manage club contacts" on public.club_contacts;
create policy "Contact users can manage club contacts"
on public.club_contacts
for all
to authenticated
using (
  (select private.is_system_admin())
  or private.has_club_permission(club_id, 'contacts')
)
with check (
  (select private.is_system_admin())
  or private.has_club_permission(club_id, 'contacts')
);

update public.app_roles
set permissions = array_append(permissions, 'contacts')
where lower(name) = 'admin'
  and not permissions @> array['contacts']::text[];

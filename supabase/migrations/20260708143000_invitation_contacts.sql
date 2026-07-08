create table if not exists public.invitation_contacts (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  club_name text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invitation_contacts_festival_id_idx
  on public.invitation_contacts (festival_id);

create unique index if not exists invitation_contacts_festival_email_key
  on public.invitation_contacts (festival_id, lower(email));

drop trigger if exists invitation_contacts_set_updated_at on public.invitation_contacts;
create trigger invitation_contacts_set_updated_at
before update on public.invitation_contacts
for each row execute function public.set_updated_at();

alter table public.invitation_contacts enable row level security;

grant select, insert, update, delete on table public.invitation_contacts to authenticated;

drop policy if exists "Invitation users can manage contacts by club" on public.invitation_contacts;

create policy "Invitation users can manage contacts by club"
on public.invitation_contacts
for all to authenticated
using (
  exists (
    select 1
    from public.festivals f
    where f.id = invitation_contacts.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(f.club_id, 'invitations')
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals f
    where f.id = invitation_contacts.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(f.club_id, 'invitations')
      )
  )
);

update public.app_roles
set permissions = array_append(permissions, 'invitations')
where lower(name) = 'admin'
  and not permissions @> array['invitations']::text[];

drop policy if exists "Club members can update club festivals" on public.festivals;

create policy "Club members can update club festivals"
on public.festivals
for update to authenticated
using (
  club_id is not null
  and (
    (select private.is_system_admin())
    or private.has_club_permission(club_id, 'info')
    or private.has_club_permission(club_id, 'costs')
    or private.has_club_permission(club_id, 'invitations')
  )
)
with check (
  club_id is not null
  and (
    (select private.is_system_admin())
    or private.has_club_permission(club_id, 'info')
    or private.has_club_permission(club_id, 'costs')
    or private.has_club_permission(club_id, 'invitations')
  )
);

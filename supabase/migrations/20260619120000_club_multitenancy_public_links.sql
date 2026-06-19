create schema if not exists private;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_roles
  add column if not exists club_id uuid references public.clubs(id) on delete cascade;

alter table public.festivals
  add column if not exists club_id uuid references public.clubs(id) on delete cascade;

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid references public.app_roles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table if not exists public.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.public_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  festival_id uuid not null references public.festivals(id) on delete cascade,
  type text not null check (type in ('helper_signup', 'guest_reservation')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  enabled boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_roles_club_id_idx on public.app_roles (club_id);
create index if not exists clubs_created_by_idx on public.clubs (created_by);
create index if not exists club_memberships_user_id_idx on public.club_memberships (user_id);
create index if not exists club_memberships_club_id_idx on public.club_memberships (club_id);
create index if not exists club_memberships_role_id_idx on public.club_memberships (role_id);
create index if not exists festivals_club_id_idx on public.festivals (club_id);
create index if not exists public_links_token_idx on public.public_links (token);
create index if not exists public_links_club_id_idx on public.public_links (club_id);
create unique index if not exists public_links_one_enabled_per_festival_type_idx
  on public.public_links (festival_id, type)
  where enabled and revoked_at is null;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.system_admins enable row level security;
alter table public.public_links enable row level security;

grant select, insert, update, delete on table
  public.clubs,
  public.club_memberships,
  public.system_admins,
  public.public_links
to authenticated;

create or replace function private.is_system_admin()
returns boolean
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.system_admins admin
    where admin.user_id = auth.uid()
  );
$$;

create or replace function private.is_club_member(club_id uuid)
returns boolean
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.club_memberships membership
    where membership.club_id = is_club_member.club_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function private.has_club_permission(club_id uuid, permission_name text)
returns boolean
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_system_admin()
    or exists (
      select 1
      from public.club_memberships membership
      join public.app_roles role on role.id = membership.role_id
      where membership.club_id = has_club_permission.club_id
        and membership.user_id = auth.uid()
        and role.club_id = membership.club_id
        and (
          lower(role.name) = 'admin'
          or role.permissions @> array[permission_name]::text[]
          or role.permissions @> array['users']::text[]
        )
    );
$$;

revoke all on function private.is_system_admin() from public;
revoke all on function private.is_club_member(uuid) from public;
revoke all on function private.has_club_permission(uuid, text) from public;
grant execute on function private.is_system_admin() to authenticated;
grant execute on function private.is_club_member(uuid) to authenticated;
grant execute on function private.has_club_permission(uuid, text) to authenticated;

with default_club as (
  insert into public.clubs (name, slug, created_by)
  select 'Standardverein', 'standardverein', seed.owner_id
  from (
    select owner_id
    from public.festivals
    where owner_id is not null
    order by created_at
    limit 1
  ) seed
  where not exists (select 1 from public.clubs)
  returning id
),
selected_club as (
  select id from default_club
  union all
  select id
  from (
    select id from public.clubs order by id limit 1
  ) existing_club
)
update public.festivals
set club_id = (select id from selected_club limit 1)
where club_id is null
  and exists (select 1 from selected_club);

with selected_club as (
  select id from public.clubs order by created_at, id limit 1
)
update public.app_roles
set club_id = (select id from selected_club)
where club_id is null
  and exists (select 1 from selected_club);

insert into public.club_memberships (club_id, user_id, role_id)
select distinct on (festival.club_id, festival.owner_id)
  festival.club_id,
  festival.owner_id,
  (
    select role.id
    from public.app_roles role
    where role.club_id = festival.club_id
      and lower(role.name) = 'admin'
    order by role.created_at
    limit 1
  )
from public.festivals festival
where festival.club_id is not null
  and festival.owner_id is not null
on conflict (club_id, user_id) do nothing;

insert into public.club_memberships (club_id, user_id, role_id)
select role.club_id, profile.user_id, profile.role_id
from public.app_user_profiles profile
join public.app_roles role on role.id = profile.role_id
where role.club_id is not null
on conflict (club_id, user_id) do update set role_id = excluded.role_id;

insert into public.system_admins (user_id)
select owner_id
from public.festivals
where owner_id is not null
order by created_at
limit 1
on conflict (user_id) do nothing;

insert into public.public_links (club_id, festival_id, type)
select festival.club_id, festival.id, link_type.type
from public.festivals festival
cross join (values ('helper_signup'), ('guest_reservation')) as link_type(type)
where festival.club_id is not null
on conflict do nothing;

drop policy if exists "Clubs are readable by members" on public.clubs;
drop policy if exists "System admins can manage clubs" on public.clubs;
drop policy if exists "Members can read own club memberships" on public.club_memberships;
drop policy if exists "Club admins can manage memberships" on public.club_memberships;
drop policy if exists "System admins can read system admins" on public.system_admins;
drop policy if exists "Club admins can read public links" on public.public_links;
drop policy if exists "Club admins can insert public links" on public.public_links;
drop policy if exists "Club admins can update public links" on public.public_links;
drop policy if exists "App roles are readable by authenticated users" on public.app_roles;
drop policy if exists "App admins can insert roles" on public.app_roles;
drop policy if exists "App admins can update roles" on public.app_roles;
drop policy if exists "App admins can delete roles" on public.app_roles;
drop policy if exists "Users can read own profile and admins can read profiles" on public.app_user_profiles;
drop policy if exists "App admins can insert profiles" on public.app_user_profiles;
drop policy if exists "App admins can update profiles" on public.app_user_profiles;
drop policy if exists "App admins can delete profiles" on public.app_user_profiles;

create policy "Clubs are readable by members"
on public.clubs
for select to authenticated
using (private.is_system_admin() or private.is_club_member(id));

create policy "System admins can manage clubs"
on public.clubs
for all to authenticated
using (private.is_system_admin())
with check (private.is_system_admin());

create policy "Members can read own club memberships"
on public.club_memberships
for select to authenticated
using (private.is_system_admin() or user_id = auth.uid() or private.has_club_permission(club_id, 'users'));

create policy "Club admins can manage memberships"
on public.club_memberships
for all to authenticated
using (private.is_system_admin() or private.has_club_permission(club_id, 'users'))
with check (private.is_system_admin() or private.has_club_permission(club_id, 'users'));

create policy "System admins can read system admins"
on public.system_admins
for select to authenticated
using (private.is_system_admin() or user_id = auth.uid());

create policy "Club admins can read public links"
on public.public_links
for select to authenticated
using (private.is_system_admin() or private.has_club_permission(club_id, 'users'));

create policy "Club admins can insert public links"
on public.public_links
for insert to authenticated
with check (private.is_system_admin() or private.has_club_permission(club_id, 'users'));

create policy "Club admins can update public links"
on public.public_links
for update to authenticated
using (private.is_system_admin() or private.has_club_permission(club_id, 'users'))
with check (private.is_system_admin() or private.has_club_permission(club_id, 'users'));

create policy "Club roles are readable by members"
on public.app_roles
for select to authenticated
using (club_id is not null and (private.is_system_admin() or private.is_club_member(club_id)));

create policy "Club admins can insert roles"
on public.app_roles
for insert to authenticated
with check (club_id is not null and (private.is_system_admin() or private.has_club_permission(club_id, 'users')));

create policy "Club admins can update roles"
on public.app_roles
for update to authenticated
using (club_id is not null and (private.is_system_admin() or private.has_club_permission(club_id, 'users')))
with check (club_id is not null and (private.is_system_admin() or private.has_club_permission(club_id, 'users')));

create policy "Club admins can delete roles"
on public.app_roles
for delete to authenticated
using (club_id is not null and (private.is_system_admin() or private.has_club_permission(club_id, 'users')));

create policy "Users and club admins can read profiles"
on public.app_user_profiles
for select to authenticated
using (
  user_id = auth.uid()
  or private.is_system_admin()
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
);

create policy "Club admins can insert profiles"
on public.app_user_profiles
for insert to authenticated
with check (private.is_system_admin() or private.has_club_permission((select club_id from public.app_roles where id = role_id), 'users'));

create policy "Club admins can update profiles"
on public.app_user_profiles
for update to authenticated
using (
  private.is_system_admin()
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
)
with check (
  private.is_system_admin()
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
);

create policy "Club admins can delete profiles"
on public.app_user_profiles
for delete to authenticated
using (
  private.is_system_admin()
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
);

drop policy if exists "Users can read accessible festivals" on public.festivals;
drop policy if exists "Owners can create festivals" on public.festivals;
drop policy if exists "Owners and finance users can update festivals" on public.festivals;
drop policy if exists "Owners can delete festivals" on public.festivals;
drop policy if exists "Admins can update accessible festivals" on public.festivals;

create policy "Members can read club festivals"
on public.festivals
for select to authenticated
using (club_id is not null and (private.is_system_admin() or private.is_club_member(club_id)));

create policy "Club members can create club festivals"
on public.festivals
for insert to authenticated
with check (
  club_id is not null
  and owner_id = auth.uid()
  and (private.is_system_admin() or private.is_club_member(club_id))
);

create policy "Club members can update club festivals"
on public.festivals
for update to authenticated
using (
  club_id is not null
  and (
    private.is_system_admin()
    or private.has_club_permission(club_id, 'info')
    or private.has_club_permission(club_id, 'costs')
  )
)
with check (
  club_id is not null
  and (
    private.is_system_admin()
    or private.has_club_permission(club_id, 'info')
    or private.has_club_permission(club_id, 'costs')
  )
);

create policy "Club admins can delete club festivals"
on public.festivals
for delete to authenticated
using (club_id is not null and (private.is_system_admin() or private.has_club_permission(club_id, 'users')));

drop policy if exists "Admins can manage festival days" on public.festival_days;
drop policy if exists "Owners can manage festival days" on public.festival_days;
drop policy if exists "Admins can manage program items" on public.program_items;
drop policy if exists "Owners can manage program items" on public.program_items;
drop policy if exists "Admins can manage checklist items" on public.checklist_items;
drop policy if exists "Owners can manage checklist items" on public.checklist_items;
drop policy if exists "Admins can manage protocols" on public.protocols;
drop policy if exists "Owners can manage protocols" on public.protocols;
drop policy if exists "Admins can manage shifts" on public.shifts;
drop policy if exists "Owners can manage shifts" on public.shifts;
drop policy if exists "Admins can manage shift helpers" on public.shift_helpers;
drop policy if exists "Owners can manage shift helpers" on public.shift_helpers;
drop policy if exists "Admins can manage reservations" on public.reservations;
drop policy if exists "Owners can manage reservations" on public.reservations;
drop policy if exists "Owners and finance users can manage financial items" on public.financial_items;
drop policy if exists "Owners can manage financial items" on public.financial_items;

create policy "Members can manage festival days by club"
on public.festival_days
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = festival_days.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = festival_days.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage program items by club"
on public.program_items
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = program_items.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = program_items.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage checklist items by club"
on public.checklist_items
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = checklist_items.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = checklist_items.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage protocols by club"
on public.protocols
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = protocols.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = protocols.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage shifts by club"
on public.shifts
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = shifts.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = shifts.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage shift helpers by club"
on public.shift_helpers
for all to authenticated
using (exists (select 1 from public.shifts s join public.festivals f on f.id = s.festival_id where s.id = shift_helpers.shift_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.shifts s join public.festivals f on f.id = s.festival_id where s.id = shift_helpers.shift_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Members can manage reservations by club"
on public.reservations
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = reservations.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))))
with check (exists (select 1 from public.festivals f where f.id = reservations.festival_id and (private.is_system_admin() or private.is_club_member(f.club_id))));

create policy "Finance users can manage financial items by club"
on public.financial_items
for all to authenticated
using (exists (select 1 from public.festivals f where f.id = financial_items.festival_id and (private.is_system_admin() or private.has_club_permission(f.club_id, 'costs'))))
with check (exists (select 1 from public.festivals f where f.id = financial_items.festival_id and (private.is_system_admin() or private.has_club_permission(f.club_id, 'costs'))));

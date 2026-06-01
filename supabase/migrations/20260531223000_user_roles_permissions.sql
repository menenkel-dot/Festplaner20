create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  permissions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role_id uuid references public.app_roles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_roles enable row level security;
alter table public.app_user_profiles enable row level security;

grant select, insert, update, delete on public.app_roles to authenticated;
grant select, insert, update, delete on public.app_user_profiles to authenticated;

drop policy if exists "Authenticated users can read roles" on public.app_roles;
drop policy if exists "Authenticated users can manage roles" on public.app_roles;
drop policy if exists "Authenticated users can read profiles" on public.app_user_profiles;
drop policy if exists "Authenticated users can manage profiles" on public.app_user_profiles;

create policy "Authenticated users can read roles"
on public.app_roles
for select to authenticated
using (true);

create policy "Authenticated users can manage roles"
on public.app_roles
for all to authenticated
using (true)
with check (true);

create policy "Authenticated users can read profiles"
on public.app_user_profiles
for select to authenticated
using (true);

create policy "Authenticated users can manage profiles"
on public.app_user_profiles
for all to authenticated
using (true)
with check (true);

insert into public.app_roles (name, description, permissions)
values (
  'Admin',
  'Voller Zugriff auf alle Bereiche',
  array['dashboard','info','meetings','shifts','reservations','costs','users']
)
on conflict (name) do nothing;


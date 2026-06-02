create schema if not exists private;

create or replace function private.is_app_admin()
returns boolean
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select
    exists (
      select 1
      from public.app_user_profiles profile
      join public.app_roles role on role.id = profile.role_id
      where profile.user_id = auth.uid()
        and (
          role.name = 'Admin'
          or role.permissions @> array['users']::text[]
        )
    )
    or not exists (
      select 1
      from public.app_user_profiles profile
      join public.app_roles role on role.id = profile.role_id
      where role.name = 'Admin'
        or role.permissions @> array['users']::text[]
    );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;

revoke all on function private.is_app_admin() from public;
grant execute on function private.is_app_admin() to authenticated;

drop policy if exists "App admins can insert roles" on public.app_roles;
drop policy if exists "App admins can update roles" on public.app_roles;
drop policy if exists "App admins can delete roles" on public.app_roles;
drop policy if exists "Users can read own profile and admins can read profiles" on public.app_user_profiles;
drop policy if exists "App admins can insert profiles" on public.app_user_profiles;
drop policy if exists "App admins can update profiles" on public.app_user_profiles;
drop policy if exists "App admins can delete profiles" on public.app_user_profiles;

create policy "App admins can insert roles"
on public.app_roles
for insert to authenticated
with check (private.is_app_admin());

create policy "App admins can update roles"
on public.app_roles
for update to authenticated
using (private.is_app_admin())
with check (private.is_app_admin());

create policy "App admins can delete roles"
on public.app_roles
for delete to authenticated
using (private.is_app_admin());

create policy "Users can read own profile and admins can read profiles"
on public.app_user_profiles
for select to authenticated
using (user_id = (select auth.uid()) or private.is_app_admin());

create policy "App admins can insert profiles"
on public.app_user_profiles
for insert to authenticated
with check (private.is_app_admin());

create policy "App admins can update profiles"
on public.app_user_profiles
for update to authenticated
using (private.is_app_admin())
with check (private.is_app_admin());

create policy "App admins can delete profiles"
on public.app_user_profiles
for delete to authenticated
using (private.is_app_admin());

drop function if exists public.is_app_admin();

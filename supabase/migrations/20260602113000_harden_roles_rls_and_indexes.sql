create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
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

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Authenticated users can read roles" on public.app_roles;
drop policy if exists "Authenticated users can manage roles" on public.app_roles;
drop policy if exists "Authenticated users can read profiles" on public.app_user_profiles;
drop policy if exists "Authenticated users can manage profiles" on public.app_user_profiles;
drop policy if exists "App roles are readable by authenticated users" on public.app_roles;
drop policy if exists "App admins can insert roles" on public.app_roles;
drop policy if exists "App admins can update roles" on public.app_roles;
drop policy if exists "App admins can delete roles" on public.app_roles;
drop policy if exists "Users can read own profile and admins can read profiles" on public.app_user_profiles;
drop policy if exists "App admins can insert profiles" on public.app_user_profiles;
drop policy if exists "App admins can update profiles" on public.app_user_profiles;
drop policy if exists "App admins can delete profiles" on public.app_user_profiles;

create policy "App roles are readable by authenticated users"
on public.app_roles
for select to authenticated
using (true);

create policy "App admins can insert roles"
on public.app_roles
for insert to authenticated
with check (public.is_app_admin());

create policy "App admins can update roles"
on public.app_roles
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy "App admins can delete roles"
on public.app_roles
for delete to authenticated
using (public.is_app_admin());

create policy "Users can read own profile and admins can read profiles"
on public.app_user_profiles
for select to authenticated
using (user_id = auth.uid() or public.is_app_admin());

create policy "App admins can insert profiles"
on public.app_user_profiles
for insert to authenticated
with check (public.is_app_admin());

create policy "App admins can update profiles"
on public.app_user_profiles
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy "App admins can delete profiles"
on public.app_user_profiles
for delete to authenticated
using (public.is_app_admin());

create index if not exists app_user_profiles_role_id_idx on public.app_user_profiles (role_id);
create index if not exists checklist_items_festival_id_idx on public.checklist_items (festival_id);
create index if not exists festival_days_festival_id_idx on public.festival_days (festival_id);
create index if not exists festivals_owner_id_idx on public.festivals (owner_id);
create index if not exists financial_items_festival_id_idx on public.financial_items (festival_id);
create index if not exists program_items_festival_id_idx on public.program_items (festival_id);
create index if not exists protocols_festival_id_idx on public.protocols (festival_id);
create index if not exists shifts_festival_id_idx on public.shifts (festival_id);

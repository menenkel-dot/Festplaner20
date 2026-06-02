create or replace function private.has_app_permission(permission_name text)
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
          or role.permissions @> array[permission_name]::text[]
          or role.permissions @> array['users']::text[]
        )
    );
$$;

create or replace function private.is_app_user()
returns boolean
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.app_user_profiles profile
    where profile.user_id = auth.uid()
  );
$$;

revoke all on function private.has_app_permission(text) from public;
revoke all on function private.is_app_user() from public;
grant execute on function private.has_app_permission(text) to authenticated;
grant execute on function private.is_app_user() to authenticated;

drop policy if exists "App users can read shared festivals" on public.festivals;
drop policy if exists "Finance users can update festival budget" on public.festivals;
drop policy if exists "Finance users can manage financial items" on public.financial_items;

create policy "App users can read shared festivals"
on public.festivals
for select to authenticated
using (owner_id = (select auth.uid()) or private.is_app_user());

create policy "Finance users can update festival budget"
on public.festivals
for update to authenticated
using (
  owner_id = (select auth.uid())
  or private.has_app_permission('costs')
)
with check (
  owner_id = (select auth.uid())
  or private.has_app_permission('costs')
);

create policy "Finance users can manage financial items"
on public.financial_items
for all to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = financial_items.festival_id
      and (
        festival.owner_id = (select auth.uid())
        or private.has_app_permission('costs')
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = financial_items.festival_id
      and (
        festival.owner_id = (select auth.uid())
        or private.has_app_permission('costs')
      )
  )
);

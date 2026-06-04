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
          lower(role.name) = 'admin'
          or role.permissions @> array['users']::text[]
        )
    )
    or not exists (
      select 1
      from public.app_user_profiles profile
      join public.app_roles role on role.id = profile.role_id
      where lower(role.name) = 'admin'
        or role.permissions @> array['users']::text[]
    );
$$;

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
          lower(role.name) = 'admin'
          or role.permissions @> array[permission_name]::text[]
          or role.permissions @> array['users']::text[]
        )
    );
$$;

revoke all on function private.is_app_admin() from public;
revoke all on function private.has_app_permission(text) from public;
grant execute on function private.is_app_admin() to authenticated;
grant execute on function private.has_app_permission(text) to authenticated;

update public.app_roles
set permissions = array[
  'dashboard',
  'info',
  'meetings',
  'shifts',
  'reservations',
  'costs',
  'users',
  'dashboard:reserved_tables',
  'dashboard:pending_reservations',
  'dashboard:open_shift_spots',
  'dashboard:checklist_progress',
  'dashboard:reservations_by_day',
  'dashboard:open_shifts_by_day',
  'dashboard:next_tasks'
]::text[]
where lower(name) = 'admin';

drop policy if exists "Admins can update accessible festivals" on public.festivals;
create policy "Admins can update accessible festivals"
on public.festivals
for update to authenticated
using (owner_id = (select auth.uid()) or (select private.is_app_admin()))
with check (owner_id = (select auth.uid()) or (select private.is_app_admin()));

drop policy if exists "Admins can manage festival days" on public.festival_days;
create policy "Admins can manage festival days"
on public.festival_days
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = festival_days.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = festival_days.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage program items" on public.program_items;
create policy "Admins can manage program items"
on public.program_items
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = program_items.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = program_items.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage checklist items" on public.checklist_items;
create policy "Admins can manage checklist items"
on public.checklist_items
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = checklist_items.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = checklist_items.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage protocols" on public.protocols;
create policy "Admins can manage protocols"
on public.protocols
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = protocols.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = protocols.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage shifts" on public.shifts;
create policy "Admins can manage shifts"
on public.shifts
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = shifts.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = shifts.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage shift helpers" on public.shift_helpers;
create policy "Admins can manage shift helpers"
on public.shift_helpers
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1
    from public.shifts s
    join public.festivals festival on festival.id = s.festival_id
    where s.id = shift_helpers.shift_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1
    from public.shifts s
    join public.festivals festival on festival.id = s.festival_id
    where s.id = shift_helpers.shift_id
      and festival.owner_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage reservations" on public.reservations;
create policy "Admins can manage reservations"
on public.reservations
for all to authenticated
using (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = reservations.festival_id
      and festival.owner_id = (select auth.uid())
  )
)
with check (
  (select private.is_app_admin())
  or exists (
    select 1 from public.festivals festival
    where festival.id = reservations.festival_id
      and festival.owner_id = (select auth.uid())
  )
);

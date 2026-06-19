drop policy if exists "Clubs are readable by members" on public.clubs;
drop policy if exists "System admins can manage clubs" on public.clubs;

create policy "Clubs are readable by members"
on public.clubs
for select to authenticated
using ((select private.is_system_admin()) or private.is_club_member(id));

create policy "System admins can insert clubs"
on public.clubs
for insert to authenticated
with check ((select private.is_system_admin()));

create policy "System admins can update clubs"
on public.clubs
for update to authenticated
using ((select private.is_system_admin()))
with check ((select private.is_system_admin()));

create policy "System admins can delete clubs"
on public.clubs
for delete to authenticated
using ((select private.is_system_admin()));

drop policy if exists "Members can read own club memberships" on public.club_memberships;
drop policy if exists "Club admins can manage memberships" on public.club_memberships;

create policy "Members can read own club memberships"
on public.club_memberships
for select to authenticated
using (
  (select private.is_system_admin())
  or user_id = (select auth.uid())
  or private.has_club_permission(club_id, 'users')
);

create policy "Club admins can insert memberships"
on public.club_memberships
for insert to authenticated
with check ((select private.is_system_admin()) or private.has_club_permission(club_id, 'users'));

create policy "Club admins can update memberships"
on public.club_memberships
for update to authenticated
using ((select private.is_system_admin()) or private.has_club_permission(club_id, 'users'))
with check ((select private.is_system_admin()) or private.has_club_permission(club_id, 'users'));

create policy "Club admins can delete memberships"
on public.club_memberships
for delete to authenticated
using ((select private.is_system_admin()) or private.has_club_permission(club_id, 'users'));

drop policy if exists "System admins can read system admins" on public.system_admins;

create policy "System admins can read system admins"
on public.system_admins
for select to authenticated
using ((select private.is_system_admin()) or user_id = (select auth.uid()));

drop policy if exists "Users and club admins can read profiles" on public.app_user_profiles;
drop policy if exists "Club admins can insert profiles" on public.app_user_profiles;
drop policy if exists "Club admins can update profiles" on public.app_user_profiles;
drop policy if exists "Club admins can delete profiles" on public.app_user_profiles;

create policy "Users and club admins can read profiles"
on public.app_user_profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_system_admin())
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
with check (
  (select private.is_system_admin())
  or private.has_club_permission((select club_id from public.app_roles where id = role_id), 'users')
);

create policy "Club admins can update profiles"
on public.app_user_profiles
for update to authenticated
using (
  (select private.is_system_admin())
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
)
with check (
  (select private.is_system_admin())
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
  (select private.is_system_admin())
  or exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = app_user_profiles.user_id
      and private.has_club_permission(membership.club_id, 'users')
  )
);

drop policy if exists "Club members can create club festivals" on public.festivals;

create policy "Club members can create club festivals"
on public.festivals
for insert to authenticated
with check (
  club_id is not null
  and owner_id = (select auth.uid())
  and ((select private.is_system_admin()) or private.is_club_member(club_id))
);

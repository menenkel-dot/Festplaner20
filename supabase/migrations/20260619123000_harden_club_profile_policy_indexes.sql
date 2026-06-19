create index if not exists clubs_created_by_idx on public.clubs (created_by);
create index if not exists club_memberships_role_id_idx on public.club_memberships (role_id);

drop policy if exists "Club admins can update profiles" on public.app_user_profiles;

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

alter table public.app_roles
  drop constraint if exists app_roles_name_key;

create unique index if not exists app_roles_club_id_lower_name_key
  on public.app_roles (club_id, lower(name))
  where club_id is not null;

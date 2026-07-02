create table if not exists public.club_notification_preferences (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reservation_requests_enabled boolean not null default false,
  helper_signups_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create trigger club_notification_preferences_set_updated_at
before update on public.club_notification_preferences
for each row execute function public.set_updated_at();

create table if not exists public.club_notification_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  festival_id uuid references public.festivals(id) on delete set null,
  event_type text not null check (event_type in ('reservation_request', 'helper_signup')),
  source_id uuid not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  subject text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists club_notification_events_delivery_idx
  on public.club_notification_events (event_type, source_id, recipient_user_id);

create index if not exists club_notification_events_club_created_idx
  on public.club_notification_events (club_id, created_at desc);

alter table public.club_notification_preferences enable row level security;
alter table public.club_notification_events enable row level security;

revoke all on table public.club_notification_preferences from anon, authenticated;
revoke all on table public.club_notification_events from anon, authenticated;
grant select, insert, update on table public.club_notification_preferences to authenticated;
grant select on table public.club_notification_events to authenticated;

create policy "Club admins manage own notification preferences"
on public.club_notification_preferences
for all to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.club_memberships membership
    join public.app_roles role on role.id = membership.role_id
    where membership.club_id = club_notification_preferences.club_id
      and membership.user_id = (select auth.uid())
      and role.club_id = membership.club_id
      and lower(role.name) = 'admin'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.club_memberships membership
    join public.app_roles role on role.id = membership.role_id
    where membership.club_id = club_notification_preferences.club_id
      and membership.user_id = (select auth.uid())
      and role.club_id = membership.club_id
      and lower(role.name) = 'admin'
  )
);

create policy "Club admins can read notification events"
on public.club_notification_events
for select to authenticated
using (
  exists (
    select 1
    from public.club_memberships membership
    join public.app_roles role on role.id = membership.role_id
    where membership.club_id = club_notification_events.club_id
      and membership.user_id = (select auth.uid())
      and role.club_id = membership.club_id
      and lower(role.name) = 'admin'
  )
);

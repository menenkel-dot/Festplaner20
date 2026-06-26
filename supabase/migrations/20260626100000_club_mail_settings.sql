create table if not exists public.club_mail_settings (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  sender_name text not null default '',
  sender_email text not null default '',
  reply_to_email text,
  smtp_host text not null default '',
  smtp_port integer not null default 587 check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default false,
  smtp_username text not null default '',
  smtp_password_encrypted text,
  subject_template text not null default 'Reservierungsbestätigung für {{fest_name}}',
  body_template text not null default 'Hallo {{gast_name}},

vielen Dank für deine Reservierungsanfrage.

Wir bestätigen hiermit deine Reservierung für {{fest_name}}.

Datum: {{datum}}
Uhrzeit: {{uhrzeit}}
Tisch(e): {{tische}}
Anzahl Tische: {{anzahl_tische}}

Bei Rückfragen antworte bitte direkt auf diese E-Mail.

Viele Grüße
{{verein_name}}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create trigger club_mail_settings_set_updated_at
before update on public.club_mail_settings
for each row execute function public.set_updated_at();

create table if not exists public.reservation_email_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  festival_id uuid references public.festivals(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  reservation_snapshot jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null
);

create index if not exists reservation_email_events_club_festival_idx
  on public.reservation_email_events (club_id, festival_id, sent_at desc);

create index if not exists reservation_email_events_reservation_idx
  on public.reservation_email_events (reservation_id, sent_at desc);

alter table public.club_mail_settings enable row level security;
alter table public.reservation_email_events enable row level security;

revoke all on table public.club_mail_settings from anon, authenticated;
revoke all on table public.reservation_email_events from anon, authenticated;

grant select (
  club_id,
  sender_name,
  sender_email,
  reply_to_email,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_username,
  subject_template,
  body_template,
  created_at,
  updated_at,
  updated_by
) on public.club_mail_settings to authenticated;

grant select on public.reservation_email_events to authenticated;

create policy "Club admins can read mail settings without password"
on public.club_mail_settings
for select to authenticated
using ((select private.is_system_admin()) or private.has_club_permission(club_id, 'users'));

create policy "Reservation users can read email events"
on public.reservation_email_events
for select to authenticated
using ((select private.is_system_admin()) or private.has_club_permission(club_id, 'reservations'));

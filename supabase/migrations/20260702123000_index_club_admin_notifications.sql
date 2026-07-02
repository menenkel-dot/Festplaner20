create index if not exists club_notification_preferences_user_idx
  on public.club_notification_preferences (user_id);

create index if not exists club_notification_events_festival_idx
  on public.club_notification_events (festival_id);

create index if not exists club_notification_events_reservation_idx
  on public.club_notification_events (reservation_id);

create index if not exists club_notification_events_shift_idx
  on public.club_notification_events (shift_id);

create index if not exists club_notification_events_recipient_idx
  on public.club_notification_events (recipient_user_id);

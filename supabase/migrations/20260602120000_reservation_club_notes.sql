alter table public.reservations
  add column if not exists club_reservation_notes text;

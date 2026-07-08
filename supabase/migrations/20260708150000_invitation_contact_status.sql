alter table public.invitation_contacts
  add column if not exists status text not null default 'Nicht versendet',
  add column if not exists sent_at date,
  add column if not exists responded_at date,
  add column if not exists guest_count integer check (guest_count is null or guest_count > 0),
  add column if not exists response_note text;

alter table public.invitation_contacts
  drop constraint if exists invitation_contacts_status_check;

alter table public.invitation_contacts
  add constraint invitation_contacts_status_check
  check (status in ('Nicht versendet', 'Versendet', 'Zusage', 'Absage', 'Vielleicht', 'Keine Rückmeldung'));

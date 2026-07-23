alter table public.financial_items
  add column booking_date date;

update public.financial_items
set booking_date = created_at::date
where booking_date is null;

alter table public.financial_items
  alter column booking_date set default current_date,
  alter column booking_date set not null;

create index financial_items_festival_booking_date_idx
  on public.financial_items (festival_id, booking_date);

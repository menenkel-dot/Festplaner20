alter table public.financial_items
  add column position_number integer;

with numbered_positions as (
  select
    id,
    row_number() over (
      partition by festival_id
      order by booking_date, created_at, id
    )::integer as position_number
  from public.financial_items
)
update public.financial_items as item
set position_number = numbered_positions.position_number
from numbered_positions
where numbered_positions.id = item.id;

alter table public.financial_items
  alter column position_number set not null,
  add constraint financial_items_position_number_positive
    check (position_number > 0);

create unique index financial_items_festival_position_number_key
  on public.financial_items (festival_id, position_number);

create or replace function private.assign_financial_position_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position_number is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.festival_id::text, 0)
    );

    select coalesce(max(item.position_number), 0) + 1
    into new.position_number
    from public.financial_items as item
    where item.festival_id = new.festival_id;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_financial_position_number() from public, anon, authenticated;

drop trigger if exists financial_items_assign_position_number on public.financial_items;
create trigger financial_items_assign_position_number
before insert on public.financial_items
for each row execute function private.assign_financial_position_number();

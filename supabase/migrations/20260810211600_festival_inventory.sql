create table if not exists public.festival_inventory_items (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  name text not null,
  category text not null default '',
  unit text not null,
  minimum_stock numeric(12, 3) not null default 0,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint festival_inventory_items_id_festival_unique unique (id, festival_id),
  constraint festival_inventory_items_name_check check (char_length(trim(name)) between 1 and 120),
  constraint festival_inventory_items_category_check check (char_length(category) <= 120),
  constraint festival_inventory_items_unit_check check (char_length(trim(unit)) between 1 and 40),
  constraint festival_inventory_items_minimum_stock_check check (minimum_stock >= 0),
  constraint festival_inventory_items_notes_check check (char_length(notes) <= 1000)
);

create unique index if not exists festival_inventory_items_active_name_unit_key
  on public.festival_inventory_items (festival_id, lower(name), lower(unit))
  where is_active;

create index if not exists festival_inventory_items_festival_idx
  on public.festival_inventory_items (festival_id, is_active, lower(name));

drop trigger if exists festival_inventory_items_set_updated_at on public.festival_inventory_items;
create trigger festival_inventory_items_set_updated_at
before update on public.festival_inventory_items
for each row execute function public.set_updated_at();

create table if not exists public.festival_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  item_id uuid not null,
  day_date date,
  day_label text not null,
  movement_type text not null,
  quantity numeric(12, 3) not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint festival_inventory_movements_item_festival_fk
    foreign key (item_id, festival_id)
    references public.festival_inventory_items(id, festival_id)
    on delete cascade,
  constraint festival_inventory_movements_day_label_check check (char_length(trim(day_label)) between 1 and 120),
  constraint festival_inventory_movements_type_check check (movement_type in ('count', 'receipt', 'consumption')),
  constraint festival_inventory_movements_quantity_check check (
    (movement_type = 'count' and quantity >= 0)
    or (movement_type in ('receipt', 'consumption') and quantity > 0)
  ),
  constraint festival_inventory_movements_note_check check (note is null or char_length(note) <= 1000)
);

create index if not exists festival_inventory_movements_festival_created_idx
  on public.festival_inventory_movements (festival_id, created_at, id);

create index if not exists festival_inventory_movements_item_created_idx
  on public.festival_inventory_movements (item_id, created_at, id);

alter table public.festival_inventory_items enable row level security;
alter table public.festival_inventory_movements enable row level security;

grant select, insert, update, delete on table public.festival_inventory_items to authenticated;
grant select, insert, update, delete on table public.festival_inventory_movements to authenticated;

drop policy if exists "Inventory users can manage festival items" on public.festival_inventory_items;
create policy "Inventory users can manage festival items"
on public.festival_inventory_items
for all
to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_inventory_items.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'inventory')
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_inventory_items.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'inventory')
      )
  )
);

drop policy if exists "Inventory users can manage festival movements" on public.festival_inventory_movements;
create policy "Inventory users can manage festival movements"
on public.festival_inventory_movements
for all
to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_inventory_movements.festival_id
      and (
        (select private.is_system_admin())
        or private.has_club_permission(festival.club_id, 'inventory')
      )
  )
)
with check (
  created_by = (select auth.uid())
  and exists (
      select 1
      from public.festivals festival
      where festival.id = festival_inventory_movements.festival_id
        and (
          (select private.is_system_admin())
          or private.has_club_permission(festival.club_id, 'inventory')
        )
    )
);

update public.app_roles
set permissions = array_append(permissions, 'inventory')
where lower(name) = 'admin'
  and not permissions @> array['inventory']::text[];

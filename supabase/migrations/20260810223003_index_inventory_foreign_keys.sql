create index if not exists festival_inventory_movements_item_festival_idx
  on public.festival_inventory_movements (item_id, festival_id);

create index if not exists festival_inventory_movements_created_by_idx
  on public.festival_inventory_movements (created_by)
  where created_by is not null;

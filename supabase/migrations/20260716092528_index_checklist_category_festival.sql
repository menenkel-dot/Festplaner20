drop index if exists public.checklist_items_category_id_idx;

create index checklist_items_category_festival_idx
  on public.checklist_items (category_id, festival_id);

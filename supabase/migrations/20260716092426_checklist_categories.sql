create table public.festival_checklist_categories (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint festival_checklist_categories_id_festival_unique unique (id, festival_id)
);

create index festival_checklist_categories_festival_id_idx
  on public.festival_checklist_categories (festival_id);

create unique index festival_checklist_categories_festival_name_idx
  on public.festival_checklist_categories (festival_id, lower(name));

create trigger festival_checklist_categories_set_updated_at
before update on public.festival_checklist_categories
for each row execute function public.set_updated_at();

alter table public.checklist_items
  add column category_id uuid;

alter table public.checklist_items
  add constraint checklist_items_category_festival_fkey
  foreign key (category_id, festival_id)
  references public.festival_checklist_categories(id, festival_id)
  on delete set null (category_id);

create index checklist_items_category_id_idx
  on public.checklist_items (category_id);

alter table public.festival_checklist_categories enable row level security;

create policy "Members can manage checklist categories by club"
on public.festival_checklist_categories
for all to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_checklist_categories.festival_id
      and (
        (select private.is_system_admin())
        or private.is_club_member(festival.club_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = festival_checklist_categories.festival_id
      and (
        (select private.is_system_admin())
        or private.is_club_member(festival.club_id)
      )
  )
);

grant select, insert, update, delete on table public.festival_checklist_categories to authenticated;
grant select, insert, update, delete on table public.festival_checklist_categories to service_role;

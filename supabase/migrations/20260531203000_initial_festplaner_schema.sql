create extension if not exists pgcrypto;

create table public.festivals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  date_label text not null,
  location text not null,
  description text not null default '',
  budget numeric(12, 2) not null default 0,
  helper_public_token text not null default encode(gen_random_bytes(18), 'hex'),
  reservation_public_token text not null default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.festival_days (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  name text not null,
  reservations_enabled boolean not null default true,
  table_count integer not null default 16 check (table_count between 1 and 500),
  grid_cols integer not null default 4 check (grid_cols between 1 and 12),
  reservation_times text[] not null default array['17:00 Uhr', '18:00 Uhr', '19:00 Uhr', '20:00 Uhr'],
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  time_label text not null,
  title text not null,
  location text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  due_date date,
  task text not null,
  completed boolean not null default false,
  assigned_to text,
  created_at timestamptz not null default now()
);

create table public.protocols (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  title text not null,
  protocol_date date not null,
  attendees text not null default '',
  topics text not null default '',
  decisions text not null default '',
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  day_label text not null,
  time_label text not null,
  role text not null,
  needed integer not null check (needed > 0 and needed <= 100),
  notes text,
  created_at timestamptz not null default now()
);

create table public.shift_helpers (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  helper_name text not null,
  created_at timestamptz not null default now(),
  unique (shift_id, helper_name)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  table_id integer not null check (table_id > 0),
  table_ids integer[] not null default '{}',
  table_count integer not null default 1 check (table_count > 0 and table_count <= 50),
  name text not null,
  first_name text,
  last_name text,
  email text not null,
  phone text,
  guest_type text not null default 'private' check (guest_type in ('private', 'club')),
  club_name text,
  guests integer not null default 10 check (guests > 0 and guests <= 100),
  date_label text not null,
  time_label text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index reservations_active_table_idx
  on public.reservations (festival_id, date_label, table_id)
  where status in ('pending', 'confirmed');

create table public.financial_items (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals(id) on delete cascade,
  type text not null check (type in ('expense', 'revenue')),
  category text not null,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null check (status in ('paid', 'open', 'received')),
  attachment_name text,
  attachment_data text,
  created_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger festivals_set_updated_at
before update on public.festivals
for each row execute function public.set_updated_at();

alter table public.festivals enable row level security;
alter table public.festival_days enable row level security;
alter table public.program_items enable row level security;
alter table public.checklist_items enable row level security;
alter table public.protocols enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_helpers enable row level security;
alter table public.reservations enable row level security;
alter table public.financial_items enable row level security;

grant select, insert, update, delete on table
  public.festivals,
  public.festival_days,
  public.program_items,
  public.checklist_items,
  public.protocols,
  public.shifts,
  public.shift_helpers,
  public.reservations,
  public.financial_items
to authenticated;

create policy "Festival owners can manage festivals"
on public.festivals
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners can manage festival days"
on public.festival_days
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = festival_days.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = festival_days.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage program items"
on public.program_items
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = program_items.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = program_items.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage checklist items"
on public.checklist_items
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = checklist_items.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = checklist_items.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage protocols"
on public.protocols
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = protocols.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = protocols.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage shifts"
on public.shifts
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = shifts.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = shifts.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage shift helpers"
on public.shift_helpers
for all to authenticated
using (
  exists (
    select 1
    from public.shifts s
    join public.festivals f on f.id = s.festival_id
    where s.id = shift_helpers.shift_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.shifts s
    join public.festivals f on f.id = s.festival_id
    where s.id = shift_helpers.shift_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage reservations"
on public.reservations
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = reservations.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = reservations.festival_id
      and f.owner_id = (select auth.uid())
  )
);

create policy "Owners can manage financial items"
on public.financial_items
for all to authenticated
using (
  exists (
    select 1 from public.festivals f
    where f.id = financial_items.festival_id
      and f.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.festivals f
    where f.id = financial_items.festival_id
      and f.owner_id = (select auth.uid())
  )
);

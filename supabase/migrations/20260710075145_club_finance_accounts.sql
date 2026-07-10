create table if not exists public.club_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  bank_name text,
  iban text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_item_account_splits (
  id uuid primary key default gen_random_uuid(),
  financial_item_id uuid not null references public.financial_items(id) on delete cascade,
  account_id uuid not null references public.club_finance_accounts(id),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists club_finance_accounts_club_id_idx
  on public.club_finance_accounts (club_id);

create index if not exists financial_item_account_splits_item_idx
  on public.financial_item_account_splits (financial_item_id);

create index if not exists financial_item_account_splits_account_idx
  on public.financial_item_account_splits (account_id);

drop trigger if exists club_finance_accounts_set_updated_at on public.club_finance_accounts;
create trigger club_finance_accounts_set_updated_at
before update on public.club_finance_accounts
for each row execute function public.set_updated_at();

alter table public.club_finance_accounts enable row level security;
alter table public.financial_item_account_splits enable row level security;

drop policy if exists "Finance users can manage club finance accounts" on public.club_finance_accounts;
create policy "Finance users can manage club finance accounts"
on public.club_finance_accounts
for all
to authenticated
using (
  private.is_system_admin()
  or private.has_club_permission(club_id, 'costs')
)
with check (
  private.is_system_admin()
  or private.has_club_permission(club_id, 'costs')
);

drop policy if exists "Finance users can manage financial item account splits" on public.financial_item_account_splits;
create policy "Finance users can manage financial item account splits"
on public.financial_item_account_splits
for all
to authenticated
using (
  exists (
    select 1
    from public.financial_items item
    join public.festivals festival on festival.id = item.festival_id
    where item.id = financial_item_account_splits.financial_item_id
      and (
        private.is_system_admin()
        or private.has_club_permission(festival.club_id, 'costs')
      )
  )
)
with check (
  exists (
    select 1
    from public.financial_items item
    join public.festivals festival on festival.id = item.festival_id
    join public.club_finance_accounts account on account.id = financial_item_account_splits.account_id
    where item.id = financial_item_account_splits.financial_item_id
      and account.club_id = festival.club_id
      and (
        private.is_system_admin()
        or private.has_club_permission(festival.club_id, 'costs')
      )
  )
);

grant select, insert, update, delete on public.club_finance_accounts to authenticated;
grant select, insert, update, delete on public.financial_item_account_splits to authenticated;

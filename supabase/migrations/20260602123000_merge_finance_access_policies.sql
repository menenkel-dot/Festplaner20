drop policy if exists "Festival owners can manage festivals" on public.festivals;
drop policy if exists "App users can read shared festivals" on public.festivals;
drop policy if exists "Finance users can update festival budget" on public.festivals;

create policy "Users can read accessible festivals"
on public.festivals
for select to authenticated
using (owner_id = (select auth.uid()) or private.is_app_user());

create policy "Owners can create festivals"
on public.festivals
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners and finance users can update festivals"
on public.festivals
for update to authenticated
using (owner_id = (select auth.uid()) or private.has_app_permission('costs'))
with check (owner_id = (select auth.uid()) or private.has_app_permission('costs'));

create policy "Owners can delete festivals"
on public.festivals
for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Owners can manage financial items" on public.financial_items;
drop policy if exists "Finance users can manage financial items" on public.financial_items;

create policy "Owners and finance users can manage financial items"
on public.financial_items
for all to authenticated
using (
  exists (
    select 1
    from public.festivals festival
    where festival.id = financial_items.festival_id
      and (
        festival.owner_id = (select auth.uid())
        or private.has_app_permission('costs')
      )
  )
)
with check (
  exists (
    select 1
    from public.festivals festival
    where festival.id = financial_items.festival_id
      and (
        festival.owner_id = (select auth.uid())
        or private.has_app_permission('costs')
      )
  )
);

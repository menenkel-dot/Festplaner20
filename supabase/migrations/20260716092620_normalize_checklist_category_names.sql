update public.festival_checklist_categories
set name = trim(name)
where name <> trim(name);

alter table public.festival_checklist_categories
  add constraint festival_checklist_categories_trimmed_name_check
  check (name = trim(name));

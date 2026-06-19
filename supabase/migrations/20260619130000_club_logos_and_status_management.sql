alter table public.clubs
  add column if not exists logo_path text,
  add column if not exists logo_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-logos',
  'club-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Club logos are publicly readable" on storage.objects;

create policy "Club logos are publicly readable"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'club-logos');

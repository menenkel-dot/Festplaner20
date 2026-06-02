alter table public.protocols
  add column if not exists attachment_name text,
  add column if not exists attachment_data text;

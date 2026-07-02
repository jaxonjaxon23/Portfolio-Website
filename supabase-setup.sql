-- ============================================================================
-- Supabase setup for the portfolio CMS.
-- Run this ONCE in your Supabase project: Dashboard -> SQL Editor -> New query
-- -> paste all of this -> Run.
-- ============================================================================

-- 1) Content table: a single row (id = 1) holding the whole site as JSON.
create table if not exists public.content (
  id         integer primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seed the single row if it isn't there yet.
insert into public.content (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- 2) Row Level Security: anyone can READ; only signed-in users can WRITE.
alter table public.content enable row level security;

drop policy if exists "content read for all"   on public.content;
drop policy if exists "content write signed in" on public.content;

create policy "content read for all"
  on public.content for select
  to anon, authenticated
  using (true);

create policy "content write signed in"
  on public.content for all
  to authenticated
  using (true) with check (true);

-- Explicit grants (required for Data API access on projects created after
-- 2026-05-30; harmless on older ones).
grant select on public.content to anon, authenticated;
grant insert, update on public.content to authenticated;

-- 3) Storage bucket for images uploaded through the CMS. Public read.
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- Storage policies: public can read; signed-in users can upload/replace.
drop policy if exists "images public read"      on storage.objects;
drop policy if exists "images write signed in"   on storage.objects;
drop policy if exists "images update signed in"  on storage.objects;

create policy "images public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'images');

create policy "images write signed in"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'images');

create policy "images update signed in"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'images') with check (bucket_id = 'images');

-- ============================================================================
-- After running this:
--   • Authentication -> Users -> "Add user" -> create YOUR login (email + password).
--     (Turn OFF "Auto Confirm" is not needed; a manually added user is confirmed.)
--   • Settings -> API -> copy the Project URL and anon public key into
--     supabase-config.js in your site files.
-- ============================================================================

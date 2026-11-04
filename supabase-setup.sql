-- ============================================================================
-- Supabase setup for the portfolio CMS (this is what the live project runs).
-- For a NEW project: Dashboard -> SQL Editor -> New query -> paste all of this
-- -> Run. Safe to re-run. Before running, create your login first
-- (Authentication -> Users -> Add user) and put its email in step 1.
--
-- Also in the dashboard: Authentication -> Sign In / Providers ->
-- turn OFF "Allow new users to sign up". (Even if left on, a new account can't
-- edit anything — only accounts listed in private.cms_admins can.)
-- ============================================================================

-- 1) Who may edit: an explicit list of CMS admins, kept out of the public API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.cms_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.cms_admins enable row level security;   -- no policies on purpose
revoke all on private.cms_admins from anon, authenticated;

insert into private.cms_admins (user_id)
select id from auth.users where email = 'jaxonstickler@gmail.com'   -- <- your login email
on conflict do nothing;

create or replace function private.is_cms_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from private.cms_admins where user_id = auth.uid());
$$;
revoke all on function private.is_cms_admin() from public, anon;
grant execute on function private.is_cms_admin() to authenticated;

-- 2) Content table: a single row (id = 1) holding the whole site as JSON.
create table if not exists public.content (
  id         integer primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.content (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- Anyone can read; only admins can insert/update; nobody can delete.
alter table public.content enable row level security;
drop policy if exists "content read for all"    on public.content;
drop policy if exists "content write signed in" on public.content;
drop policy if exists "content insert admin"    on public.content;
drop policy if exists "content update admin"    on public.content;
create policy "content read for all" on public.content for select to anon, authenticated using (true);
create policy "content insert admin" on public.content for insert to authenticated
  with check (private.is_cms_admin());
create policy "content update admin" on public.content for update to authenticated
  using (private.is_cms_admin()) with check (private.is_cms_admin());
grant select on public.content to anon, authenticated;
grant insert, update on public.content to authenticated;
revoke delete on public.content from anon, authenticated;

-- 3) History: every save keeps the version it replaced (newest 300), and the
-- server stamps updated_at — the CMS uses it to refuse to overwrite edits made
-- in another tab/device. To restore an old version (SQL Editor):
--   select version_id, replaced_at from public.content_history order by version_id desc;
--   update public.content set data = (select data from public.content_history
--     where version_id = <N>) where id = 1;
create table if not exists public.content_history (
  version_id  bigserial primary key,
  content_id  integer not null,
  data        jsonb not null,
  updated_at  timestamptz,
  replaced_at timestamptz not null default now(),
  replaced_by uuid
);
create index if not exists content_history_content_replaced on public.content_history (content_id, replaced_at desc);
alter table public.content_history enable row level security;
revoke all on public.content_history from anon, authenticated;
grant select on public.content_history to authenticated;
drop policy if exists "history read admin" on public.content_history;
create policy "history read admin" on public.content_history for select to authenticated
  using (private.is_cms_admin());

create or replace function public.content_before_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.content_history (content_id, data, updated_at, replaced_by)
  values (old.id, old.data, old.updated_at, auth.uid());
  delete from public.content_history
  where content_id = old.id and version_id not in (
    select version_id from public.content_history where content_id = old.id
    order by version_id desc limit 300);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.content_before_update() from public, anon, authenticated;
drop trigger if exists content_keep_history on public.content;
create trigger content_keep_history before update on public.content
  for each row execute function public.content_before_update();

-- 4) Storage bucket for CMS uploads. Files are public BY URL (the bucket is
-- public); only admins can upload, replace or list them.
insert into storage.buckets (id, name, public) values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "images public read"      on storage.objects;
drop policy if exists "images write signed in"  on storage.objects;
drop policy if exists "images update signed in" on storage.objects;
drop policy if exists "images read admin"       on storage.objects;
drop policy if exists "images insert admin"     on storage.objects;
drop policy if exists "images update admin"     on storage.objects;
create policy "images read admin" on storage.objects for select to authenticated
  using (bucket_id = 'images' and private.is_cms_admin());
create policy "images insert admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and private.is_cms_admin());
create policy "images update admin" on storage.objects for update to authenticated
  using (bucket_id = 'images' and private.is_cms_admin())
  with check (bucket_id = 'images' and private.is_cms_admin());

-- ============================================================================
-- Then copy the Project URL and anon public key (Settings -> API) into
-- supabase-config.js.
-- ============================================================================

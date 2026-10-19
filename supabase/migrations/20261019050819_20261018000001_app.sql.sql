-- Set & Settled: database schema, row-level security, storage and safety checks.
-- Run with: supabase db push   (Bolt's Supabase integration applies files in supabase/migrations automatically)

-- ============================================================================================
-- 1. App data. One row per record; the app reads/writes it through a Firestore-style layer (src/db.js).
--    col  = collection name ("bookings", "contacts", "settings", ...)   id = record id   data = the record
-- ============================================================================================
create table if not exists public.app_docs (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col        text not null check (col ~ '^[A-Za-z0-9_-]{1,40}$'),
  id         text not null check (char_length(id) between 1 and 80),
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 1000000),
  updated_at timestamptz not null default now(),
  primary key (owner_id, col, id)
);
alter table public.app_docs enable row level security;
alter table public.app_docs force row level security;
alter table public.app_docs replica identity full;      -- realtime deletes carry the row's col/id

drop policy if exists "own rows: read"   on public.app_docs;
drop policy if exists "own rows: insert" on public.app_docs;
drop policy if exists "own rows: update" on public.app_docs;
drop policy if exists "own rows: delete" on public.app_docs;
create policy "own rows: read"   on public.app_docs for select to authenticated using (owner_id = auth.uid());
create policy "own rows: insert" on public.app_docs for insert to authenticated with check (owner_id = auth.uid());
create policy "own rows: update" on public.app_docs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows: delete" on public.app_docs for delete to authenticated using (owner_id = auth.uid());
revoke all on public.app_docs from anon;
grant select, insert, update, delete on public.app_docs to authenticated;

-- live updates across the person's own tabs/devices (RLS still applies to realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_docs') then
    alter publication supabase_realtime add table public.app_docs;
  end if;
end $$;

-- ============================================================================================
-- 2. update() = recursive merge of nested objects (what the app expects), done atomically on the server
-- ============================================================================================
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k, case
          when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
          when b ? k then b -> k else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b end
$$;

create or replace function public.app_docs_merge(p_col text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare result jsonb;
begin
  update public.app_docs set data = public.jsonb_deep_merge(data, coalesce(p_patch, '{}'::jsonb)), updated_at = now()
   where owner_id = auth.uid() and col = p_col and id = p_id
   returning data into result;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return result;
end $$;
revoke all on function public.app_docs_merge(text, text, jsonb) from public, anon;
grant execute on function public.app_docs_merge(text, text, jsonb) to authenticated;

-- ============================================================================================
-- 3. Bank and card numbers are never stored. The app scrubs them before saving; this trigger is the
--    server-side backstop: card numbers (Luhn-valid), CVV/expiry, bank account/routing numbers and IBANs
--    are reduced to the last 4 digits. Ids, URLs and links are left alone; "...ref" fields only lose
--    card numbers written in groups (transaction ids are long numbers too).
-- ============================================================================================
create or replace function public.app_luhn(d text) returns boolean language plpgsql immutable as $$
declare s int := 0; alt boolean := false; n int; i int;
begin
  for i in reverse length(d)..1 loop
    n := substr(d, i, 1)::int;
    if alt then n := n * 2; if n > 9 then n := n - 9; end if; end if;
    s := s + n; alt := not alt;
  end loop;
  return s % 10 = 0;
end $$;

create or replace function public.app_mask_text(t text, mode text) returns text language plpgsql immutable as $$
declare o text := t; m text[]; d text;
begin
  if t is null or t !~ '\d{3}' then return t; end if;
  o := regexp_replace(o, '(cvv2?|cvc|security code)(\s*[:#]?\s*)\d{3,4}', '\1\2•••', 'gi');
  o := regexp_replace(o, '(exp(iry|iration)?( date)?)(\s*[:#]?\s*)\d{1,2}\s*/\s*\d{2,4}', '\1\4••/••', 'gi');
  -- card numbers
  for m in select regexp_matches(o, '(?:^|[^0-9])([2-6](?:[ -]?[0-9]){12,18})(?![0-9])', 'g') loop
    d := regexp_replace(m[1], '[^0-9]', '', 'g');
    if length(d) between 13 and 19 and public.app_luhn(d) and (mode <> 'ref' or m[1] ~ '[ -]') then
      o := replace(o, m[1], '••••' || right(d, 4));
    end if;
  end loop;
  if mode = 'ref' then return o; end if;
  -- bank details: any 6+ digit number next to banking words
  if o ~* '(routing|aba|account\s*(no|num|number|#)|acct|iban|swift|bic|sort\s*code|bank\s*account|checking|savings)' then
    for m in select regexp_matches(o, '([0-9][0-9 -]{4,}[0-9])', 'g') loop
      d := regexp_replace(m[1], '[^0-9]', '', 'g');
      if length(d) >= 6 then o := replace(o, m[1], '••••' || right(d, 4)); end if;
    end loop;
  end if;
  -- IBAN
  for m in select regexp_matches(o, '([A-Z]{2}[0-9]{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?)', 'g') loop
    o := replace(o, m[1], '••••' || right(regexp_replace(m[1], '\s', '', 'g'), 4));
  end loop;
  return o;
end $$;

create or replace function public.app_scrub(j jsonb, k text default '') returns jsonb language plpgsql immutable as $$
declare r jsonb; e record; i int;
begin
  case jsonb_typeof(j)
    when 'string' then
      if k ~* '(id|ids|url|key)$' or (j #>> '{}') ~* '^(https?:|mailto:|data:)' then return j; end if;
      return to_jsonb(public.app_mask_text(j #>> '{}', case when k ~* 'ref$' then 'ref' else '' end));
    when 'object' then
      r := '{}'::jsonb;
      for e in select key, value from jsonb_each(j) loop r := r || jsonb_build_object(e.key, public.app_scrub(e.value, e.key)); end loop;
      return r;
    when 'array' then
      r := '[]'::jsonb;
      for i in 0 .. jsonb_array_length(j) - 1 loop r := r || jsonb_build_array(public.app_scrub(j -> i, k)); end loop;
      return r;
    else return j;
  end case;
end $$;

create or replace function public.app_docs_before_write() returns trigger language plpgsql as $$
begin
  new.data := public.app_scrub(new.data, '');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists app_docs_scrub on public.app_docs;
create trigger app_docs_scrub before insert or update on public.app_docs for each row execute function public.app_docs_before_write();

-- ============================================================================================
-- 4. Server-only tables (Edge Functions use the service role; browsers have no access at all)
-- ============================================================================================
create table if not exists public.google_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text not null unique,
  email text not null,
  scopes text[] not null default '{}',
  refresh_token_ct text not null,      -- AES-256-GCM ciphertext; key lives only in the TOKEN_ENCRYPTION_KEY function secret
  refresh_token_iv text not null,
  connected_at timestamptz default now(),
  revoked_at timestamptz
);
create table if not exists public.oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tier text not null,
  created_at timestamptz default now()
);
create table if not exists public.audit_log (           -- security events only: never message content
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  action text not null,
  meta jsonb,
  created_at timestamptz default now()
);
create index if not exists audit_log_owner_time on public.audit_log (owner_id, action, created_at desc);
alter table public.google_connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.google_connections, public.oauth_states, public.audit_log from anon, authenticated;
-- (no policies on purpose: only the service role used inside Edge Functions can touch these)

-- ============================================================================================
-- 5. Storage for the profile photo and older Kit pictures. Paths are "<user id>/<random uuid>.<ext>".
--    Public read (unguessable paths, so <img> tags work); only the owner can upload, replace or delete.
-- ============================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-assets', 'user-assets', true, 10485760,
        array['image/png','image/jpeg','image/gif','image/webp','image/avif','video/mp4','video/quicktime','video/webm','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user-assets: owner insert" on storage.objects;
drop policy if exists "user-assets: owner update" on storage.objects;
drop policy if exists "user-assets: owner delete" on storage.objects;
drop policy if exists "user-assets: owner list"   on storage.objects;
create policy "user-assets: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user-assets: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user-assets: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user-assets: owner list" on storage.objects for select to authenticated
  using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);

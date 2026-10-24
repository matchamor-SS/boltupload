/*
# Fix security advisor findings: mutable search_path + RLS without policies

## Problem
The security advisor flagged 8 issues:
1. Five functions have a role-mutable search_path (no `SET search_path` clause).
2. Three server-only tables have RLS enabled but no policies.

## Changes

### 1. Fix mutable search_path on 5 functions
Each function is recreated with `SET search_path = public` so the search path is
pinned at function creation time and cannot be altered by the caller's role.

- `jsonb_deep_merge(a jsonb, b jsonb)` — recursive JSON merge, IMMUTABLE SQL function
- `app_luhn(d text)` — Luhn checksum validation, IMMUTABLE PL/pgSQL function
- `app_mask_text(t text, mode text)` — card/bank number masking, IMMUTABLE PL/pgSQL function
- `app_scrub(j jsonb, k text)` — recursive JSON scrubbing, IMMUTABLE PL/pgSQL function
- `app_docs_before_write()` — BEFORE INSERT/UPDATE trigger function

Note: `app_docs_merge` already had `SET search_path = public` and needs no change.
The `app_docs_before_write` trigger is dropped and recreated after the function
is updated (trigger definitions reference the function OID, so we drop first).

### 2. Add explicit deny-all policies on server-only tables
`google_connections`, `oauth_states`, and `audit_log` are only accessed by Edge
Functions using the service role (which bypasses RLS). The original migration
relied on "no grants + RLS enabled" to block client access. The advisor flags
tables with RLS enabled but zero policies. We add explicit deny-by-default
policies so the intent is unambiguous:

- `TO authenticated` with `USING (false)` / `WITH CHECK (false)` on all four verbs.
- `TO anon` with `USING (false)` / `WITH CHECK (false)` on all four verbs.

These policies deny every row to anon and authenticated, while the service role
(which bypasses RLS) continues to work normally. Grants remain revoked.

### Security impact
- No data is exposed — the new policies deny all rows to client roles.
- The search_path pin prevents search_path hijacking on the five functions.
- No schema changes; no data is touched.
*/

-- ============================================================================================
-- 1a. Fix jsonb_deep_merge: add SET search_path = public
-- ============================================================================================
drop function if exists public.jsonb_deep_merge(jsonb, jsonb) cascade;
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k, case
          when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
          when b ? k then b -> k else a -> k end), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys)
    else b end
$$;
revoke all on function public.jsonb_deep_merge(jsonb, jsonb) from public, anon;
grant execute on function public.jsonb_deep_merge(jsonb, jsonb) to authenticated;

-- ============================================================================================
-- 1b. Fix app_luhn: add SET search_path = public
-- ============================================================================================
drop function if exists public.app_luhn(text);
create or replace function public.app_luhn(d text) returns boolean
language plpgsql immutable set search_path = public as $$
declare s int := 0; alt boolean := false; n int; i int;
begin
  for i in reverse length(d)..1 loop
    n := substr(d, i, 1)::int;
    if alt then n := n * 2; if n > 9 then n := n - 9; end if; end if;
    s := s + n; alt := not alt;
  end loop;
  return s % 10 = 0;
end $$;

-- ============================================================================================
-- 1c. Fix app_mask_text: add SET search_path = public
-- ============================================================================================
drop function if exists public.app_mask_text(text, text);
create or replace function public.app_mask_text(t text, mode text) returns text
language plpgsql immutable set search_path = public as $$
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

-- ============================================================================================
-- 1d. Fix app_scrub: add SET search_path = public
-- ============================================================================================
drop function if exists public.app_scrub(jsonb, text);
create or replace function public.app_scrub(j jsonb, k text default '') returns jsonb
language plpgsql immutable set search_path = public as $$
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

-- ============================================================================================
-- 1e. Fix app_docs_before_write: add SET search_path = public
-- ============================================================================================
drop trigger if exists app_docs_scrub on public.app_docs;
drop function if exists public.app_docs_before_write();
create or replace function public.app_docs_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  new.data := public.app_scrub(new.data, '');
  new.updated_at := now();
  return new;
end $$;
create trigger app_docs_scrub before insert or update on public.app_docs
  for each row execute function public.app_docs_before_write();

-- ============================================================================================
-- 2. Explicit deny-by-default policies on server-only tables
--    The service role bypasses RLS, so Edge Functions are unaffected.
--    anon and authenticated get USING(false) / WITH CHECK(false) on every verb,
--    which blocks all rows even if a grant were accidentally added later.
-- ============================================================================================

-- --- google_connections ---
drop policy if exists "gc deny select anon" on public.google_connections;
drop policy if exists "gc deny insert anon" on public.google_connections;
drop policy if exists "gc deny update anon" on public.google_connections;
drop policy if exists "gc deny delete anon" on public.google_connections;
drop policy if exists "gc deny select auth" on public.google_connections;
drop policy if exists "gc deny insert auth" on public.google_connections;
drop policy if exists "gc deny update auth" on public.google_connections;
drop policy if exists "gc deny delete auth" on public.google_connections;

create policy "gc deny select anon" on public.google_connections for select to anon using (false);
create policy "gc deny insert anon" on public.google_connections for insert to anon with check (false);
create policy "gc deny update anon" on public.google_connections for update to anon using (false) with check (false);
create policy "gc deny delete anon" on public.google_connections for delete to anon using (false);
create policy "gc deny select auth" on public.google_connections for select to authenticated using (false);
create policy "gc deny insert auth" on public.google_connections for insert to authenticated with check (false);
create policy "gc deny update auth" on public.google_connections for update to authenticated using (false) with check (false);
create policy "gc deny delete auth" on public.google_connections for delete to authenticated using (false);

-- --- oauth_states ---
drop policy if exists "os deny select anon" on public.oauth_states;
drop policy if exists "os deny insert anon" on public.oauth_states;
drop policy if exists "os deny update anon" on public.oauth_states;
drop policy if exists "os deny delete anon" on public.oauth_states;
drop policy if exists "os deny select auth" on public.oauth_states;
drop policy if exists "os deny insert auth" on public.oauth_states;
drop policy if exists "os deny update auth" on public.oauth_states;
drop policy if exists "os deny delete auth" on public.oauth_states;

create policy "os deny select anon" on public.oauth_states for select to anon using (false);
create policy "os deny insert anon" on public.oauth_states for insert to anon with check (false);
create policy "os deny update anon" on public.oauth_states for update to anon using (false) with check (false);
create policy "os deny delete anon" on public.oauth_states for delete to anon using (false);
create policy "os deny select auth" on public.oauth_states for select to authenticated using (false);
create policy "os deny insert auth" on public.oauth_states for insert to authenticated with check (false);
create policy "os deny update auth" on public.oauth_states for update to authenticated using (false) with check (false);
create policy "os deny delete auth" on public.oauth_states for delete to authenticated using (false);

-- --- audit_log ---
drop policy if exists "al deny select anon" on public.audit_log;
drop policy if exists "al deny insert anon" on public.audit_log;
drop policy if exists "al deny update anon" on public.audit_log;
drop policy if exists "al deny delete anon" on public.audit_log;
drop policy if exists "al deny select auth" on public.audit_log;
drop policy if exists "al deny insert auth" on public.audit_log;
drop policy if exists "al deny update auth" on public.audit_log;
drop policy if exists "al deny delete auth" on public.audit_log;

create policy "al deny select anon" on public.audit_log for select to anon using (false);
create policy "al deny insert anon" on public.audit_log for insert to anon with check (false);
create policy "al deny update anon" on public.audit_log for update to anon using (false) with check (false);
create policy "al deny delete anon" on public.audit_log for delete to anon using (false);
create policy "al deny select auth" on public.audit_log for select to authenticated using (false);
create policy "al deny insert auth" on public.audit_log for insert to authenticated with check (false);
create policy "al deny update auth" on public.audit_log for update to authenticated using (false) with check (false);
create policy "al deny delete auth" on public.audit_log for delete to authenticated using (false);

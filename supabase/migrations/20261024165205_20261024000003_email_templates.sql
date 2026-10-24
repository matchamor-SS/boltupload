/*
# Email templates table (one set per user)

## Plain-English summary
Email templates used to be stored inside the general-purpose `app_docs` table. They now get their own
table with real columns (id, name, stage, audience, subject, body). Every person only ever sees and edits
their own templates. New users are given the 10 starter templates by the app the first time it loads.

## 1. New table: `email_templates`
- `owner_id` (uuid, defaults to the signed-in user, removed automatically when the account is deleted)
- `id` (text, the template's id, e.g. "stage-lead"; unique per owner)
- `name` (text, e.g. "Lead · First outreach")
- `stage` (text, "Suggest for stage"; '' means any stage. Not limited to the six default stages because
  people can add their own pipeline stages)
- `audience` (text, 'venue' or 'media')
- `subject` (text, may contain {{fill_ins}})
- `body` (text, plain text with line breaks, may contain {{fill_ins}})
- `created_at`, `updated_at`
- Primary key (owner_id, id)

## 2. Security
- Row level security on, with four owner-only policies (select / insert / update / delete) for `authenticated`.
- Only `authenticated` is granted access; `anon` has none.
- Same bank/card-number backstop as `app_docs`: subject and body pass through `app_mask_text` before saving.

## 3. Notes
1. Added to the realtime publication so other open tabs see edits.
2. Size limits keep a single template reasonable (subject 300 chars, body 20,000 chars).
3. No existing data is moved or deleted (no templates were stored yet).
*/

create table if not exists public.email_templates (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  name       text not null check (length(name) between 1 and 200),
  stage      text not null default '' check (length(stage) <= 40),
  audience   text not null default 'venue' check (audience in ('venue', 'media')),
  subject    text not null default '' check (length(subject) <= 300),
  body       text not null default '' check (length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.email_templates enable row level security;

grant select, insert, update, delete on public.email_templates to authenticated;

drop policy if exists "select_own_email_templates" on public.email_templates;
create policy "select_own_email_templates" on public.email_templates for select
  to authenticated using (auth.uid() = owner_id);

drop policy if exists "insert_own_email_templates" on public.email_templates;
create policy "insert_own_email_templates" on public.email_templates for insert
  to authenticated with check (auth.uid() = owner_id);

drop policy if exists "update_own_email_templates" on public.email_templates;
create policy "update_own_email_templates" on public.email_templates for update
  to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "delete_own_email_templates" on public.email_templates;
create policy "delete_own_email_templates" on public.email_templates for delete
  to authenticated using (auth.uid() = owner_id);

create or replace function public.email_templates_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  new.subject := public.app_mask_text(new.subject, '');
  new.body := public.app_mask_text(new.body, '');
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.email_templates_before_write() from public, anon;

drop trigger if exists email_templates_scrub on public.email_templates;
create trigger email_templates_scrub before insert or update on public.email_templates
  for each row execute function public.email_templates_before_write();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'email_templates') then
    alter publication supabase_realtime add table public.email_templates;
  end if;
end $$;
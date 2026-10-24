/*
# Remember where a Google sign-in started

1. Modified Tables
- `oauth_states`
  - `return_to` (text, nullable): the site address (e.g. the Bolt preview or the published site) the person
    started connecting Google from, so they are sent back to the same place afterwards.
2. Security
- No change. The table stays server-only (RLS on, deny-all policies for anon/authenticated, no client grants).
  The value is checked against an allowlist on the server before it is stored and again before redirecting.
*/
ALTER TABLE public.oauth_states ADD COLUMN IF NOT EXISTS return_to text;

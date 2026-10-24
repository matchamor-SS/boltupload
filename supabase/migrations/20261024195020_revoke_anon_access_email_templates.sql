/*
# Remove signed-out access to email templates

1. Security changes
   - Revoke every table privilege on `public.email_templates` from the `anon` role.
     The table only has owner-scoped policies for `authenticated`, so `anon` could
     never read or write rows; this removes the redundant privilege so the table
     matches the `app_docs` least-privilege pattern.
   - The `authenticated` grants (SELECT, INSERT, UPDATE, DELETE) are left untouched,
     so the app keeps working exactly as before for signed-in users.

2. Notes
   - No data is read, written or removed by this migration.
   - Idempotent: re-running the revoke is a no-op.
*/

REVOKE ALL PRIVILEGES ON TABLE public.email_templates FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_templates TO authenticated;

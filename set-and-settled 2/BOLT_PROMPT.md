# Paste this into Bolt after importing the repository

This is a finished app. Keep its layout, styling, text and features exactly as they are. Please don't redesign, rename or "simplify" anything.

1. Connect this project to Supabase. Then apply the SQL in `supabase/migrations/20261018000001_app.sql` and deploy every Edge Function in `supabase/functions/`: `google`, `google-oauth-start`, `google-oauth-callback`, `google-disconnect` and `account-delete`. Use the settings in `supabase/config.toml`. `google-oauth-callback` must have JWT verification turned off.
2. Make sure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the connected project. Add `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` (I'll give you the values).
3. Run `npm install` and `npm run build`. The build runs `scripts/check-security.mjs` first. If that check fails, fix the cause, not the check.
4. Deploy to Netlify. `netlify.toml` already sets the build command, the output folder and the security headers.

Rules:
- `public/app/app.js` is the app itself. Don't rewrite it.
- `src/` connects it to Supabase and Google (`src/runtime.js`, `src/db.js` and `src/google.js`).
- Never add Gmail read, compose or modify permissions, or full Google Drive access.
- Never put `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` or the service-role key anywhere in the frontend.

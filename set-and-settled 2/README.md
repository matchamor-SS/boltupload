# Set & Settled: production site

This is the booking app you tested, as a deployable website: the same screens, the same code and the same features. It adds real sign-in, a real database, file storage and your own Google connection. Gmail access is send-only, Drive access covers only the files the app creates or that the user picks, and Calendar is used for availability and booked sets.

```
index.html                 the app's page (markup + styles, unchanged)
public/app/app.js          the app's code (unchanged apart from the swaps listed in docs/WHAT_CHANGED.md)
public/vendor/jspdf…       PDF library used for invoices (MIT)
src/                       connects the app to Supabase + Google, sign-in screen, Settings additions
  main.js                  start-up: sign-in → runtime → app
  runtime.js db.js google.js   the runtime the app calls (database, Google, uploads, downloads)
  auth.js account.js       sign-in / two-step verification, Settings cards (Google, signature, account)
  mock.js                  demo mode (VITE_SS_MOCK=1): sample data, nothing saved or sent
privacy-policy/ terms-of-service/   public legal pages (no login), required for Google's review
supabase/migrations/       database: tables, row-level security, merge function, bank/card scrub, storage
supabase/functions/        server: google (the only door to Google), OAuth start/callback, disconnect, account delete
netlify.toml vercel.json public/_headers   security headers (CSP, HSTS, no framing…)
scripts/check-security.mjs build fails if a restricted Google scope or a server secret sneaks in
docs/                      Google Cloud setup + verification, security notes, what changed from the prototype
```

## Set it up (about 30–45 minutes the first time)

### 1. Get the code into Bolt
1. Create an empty **private** repository on GitHub, for example `set-and-settled`.
2. Unzip this folder. On the repository page, choose **Add file → Upload files**, drag in everything inside the `set-and-settled` folder, and commit. Don't include a `node_modules` folder.
3. In Bolt, click **GitHub** under the chat box → **Import from URL** → paste the repository URL → **Choose this repository**.
4. Paste the contents of `BOLT_PROMPT.md` into Bolt's chat.

### 2. Supabase (database, sign-in and server functions)
1. In Bolt, connect Supabase (database icon → **Advanced** → **Connect**). Bolt fills in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. If Bolt doesn't apply the migration or deploy the functions itself, run these from your computer with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase functions deploy google google-oauth-start google-oauth-callback google-disconnect account-delete
   ```
3. In the Supabase dashboard, go to **Authentication**:
   - **URL Configuration:** set Site URL to your site (for example `https://setandsettled.com`), and add it to Redirect URLs.
   - **Providers → Email:** keep **Confirm email** on and set the minimum password length to 10.
   - **Providers → Google:** turn it on with the same Google client ID and secret as step 3. This powers "Continue with Google".
   - **Multi-Factor:** leave TOTP enabled.
4. Go to **Edge Functions → Secrets** (or use `supabase secrets set …`) and add:
   | name | value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from Google Cloud (step 3) |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud (step 3) |
   | `GOOGLE_REDIRECT_URI` | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback` |
   | `TOKEN_ENCRYPTION_KEY` | output of `openssl rand -base64 32`. Keep a copy somewhere safe: if you lose it, everyone has to reconnect Google |
   | `APP_URL` | your site, for example `https://setandsettled.com` (no trailing slash) |
   | `APP_ALLOWED_ORIGIN` | the same as `APP_URL` |

### 3. Google Cloud
Follow `docs/GOOGLE_SETUP.md`. It covers the OAuth client, consent screen, the 4 APIs, the Picker key, domain verification and what to submit for verification. Then put `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` in Bolt's `.env`.

### 4. Fill in the legal pages
`privacy-policy/index.html` and `terms-of-service/index.html` contain placeholders: `{{COMPANY}}`, `{{DOMAIN}}`, `{{CONTACT_EMAIL}}`, `{{ADDRESS}}`, `{{GOVERNING_STATE}}` and `{{EFFECTIVE_DATE}}`. Replace them, or ask Bolt to. Have a lawyer review both pages before you submit to Google.

### 5. Deploy
Publish from Bolt (Netlify). The security headers in `netlify.toml` apply automatically. Then sign up, connect Google in **Settings → Google account**, and test.

## Try it without any setup
`npm install && npm run dev:demo` runs the full app with sample data and a pretend Google. Nothing is saved or sent.

## Commands
`npm run dev` · `npm run build` (runs the security check first) · `npm run preview` · `npm run check:security`

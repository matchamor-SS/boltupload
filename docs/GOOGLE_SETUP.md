# Google Cloud setup and verification

The app asks for **no restricted scopes**, so it never needs Google's CASA security audit. The Gmail and Calendar scopes are *sensitive*: the app needs Google's standard OAuth verification (brand + scope review) before the public can use it without the "unverified app" warning.

| Scope | Tier | Used for |
|---|---|---|
| `openid`, `userinfo.email`, `userinfo.profile` | basic | Knowing which Google account is connected |
| `gmail.send` | sensitive | Sending the emails and invoices the user reviews and approves. No reading, no drafts |
| `drive.file` | non-sensitive | Creating Business/Marketing/Promo folders and saving PDFs, contracts and flyers. Only files the app creates or the user picks in Google Picker |
| `calendar.events` | sensitive | Reading events to check availability, and adding/updating/removing the app's own booking events |
| `calendar.calendarlist.readonly` | sensitive | Letting the user choose which calendars count for availability |

Each feature is requested separately, the first time the user needs it (incremental consent), right after an in-app explanation of what it's for.

## 1. Project and APIs
1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project, for example "Set & Settled".
2. Under **APIs & Services → Library**, enable **Gmail API**, **Google Drive API**, **Google Calendar API** and **Google Picker API**.

## 2. OAuth consent screen (Google Auth Platform → Branding / Audience / Data access)
- **App name:** Set & Settled. **Support email:** your address. **Logo:** 120×120 PNG.
- **App home page:** `https://YOUR_DOMAIN/`. The sign-in screen describes the app and links to both policies.
- **Privacy policy:** `https://YOUR_DOMAIN/privacy-policy/`. **Terms of service:** `https://YOUR_DOMAIN/terms-of-service/`.
- **Authorized domains:** `YOUR_DOMAIN` and `supabase.co`.
- **Audience:** External. Leave it in Testing (add test users) until verification is approved.
- **Data access:** add exactly the scopes in the table above, no others.

## 3. OAuth client (Clients → Create client → Web application)
- **Authorized JavaScript origins:** `https://YOUR_DOMAIN`
- **Authorized redirect URIs:**
  - `https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback` (connecting Gmail/Drive/Calendar)
  - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` ("Continue with Google" sign-in)
- Put the client ID and secret into the Supabase Edge Function secrets and the Supabase Google provider. Never put them in the frontend.

## 4. Picker key ("Use a folder I already have")
1. Under **Credentials → Create credentials → API key**, restrict the key: **Application restrictions → Websites:** `https://YOUR_DOMAIN/*`; **API restrictions:** Google Picker API only.
2. Set `VITE_GOOGLE_API_KEY` = that key, and `VITE_GOOGLE_APP_ID` = your **project number** (on the project dashboard).

## 5. Domain ownership
Verify `YOUR_DOMAIN` in [Google Search Console](https://search.google.com/search-console) with the same Google account that owns the Cloud project.

## 6. Verification submission (sensitive scopes)
Prepare these before you click **Prepare for verification**:
1. **Scope justifications.** You can use the "Used for" column above, plus:
   - `gmail.send`: "The user writes or picks an email, reviews the recipients, subject and message on a 'Send this email now?' screen, and only then is it sent. The app has no access to read mail."
   - `calendar.events`: "Shows the user's busy times next to their bookings and adds each booking's set to their calendar."
2. **Demo video** (unlisted YouTube, 2–4 minutes). Show the consent screen with its URL bar, then each feature using its scope: sending an email after review, saving an invoice PDF to Drive, choosing a folder in Google Picker, availability with calendar events, adding a set to the calendar. Finish by disconnecting in Settings.
3. The homepage and privacy policy must be live on your verified domain, and the privacy policy must contain the Limited Use statement (it already does, in section 5).

## Decision for you: `gmail.labels`
The privacy policy sentence you required says the app requests `gmail.send` **and** `gmail.labels`. The app only needs `gmail.send`: with send-only access, Gmail doesn't let an app put labels on messages, so a labels permission would go unused. Google asks apps to request only what they use. Pick one:
- **Recommended:** remove `and 'gmail.labels'` from that sentence in `privacy-policy/index.html` (section 4) and the Terms. Nothing else changes.
- Or add `https://www.googleapis.com/auth/gmail.labels` to `TIERS.mail` in `supabase/functions/_shared/google.ts`, and list it on the consent screen with a justification.

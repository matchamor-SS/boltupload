# Security and privacy: what protects what

| Risk | Protection | Where |
|---|---|---|
| Someone reads another user's data | Row-level security on every table: a user can only read and write their own rows. Server-only tables (`google_connections`, `oauth_states`, `audit_log`) have no user access at all | `supabase/migrations/…_app.sql` |
| Google tokens leak | Refresh tokens are encrypted with AES-256-GCM on the server. The key is only in the `TOKEN_ENCRYPTION_KEY` secret. Access tokens are minted per request, narrowed to the one scope needed, and never stored. Only the Picker gets a browser token, and it's limited to `drive.file` | `supabase/functions/_shared/{crypto,google}.ts` |
| Over-broad Google access | No restricted scopes. Gmail is send-only, Drive is `drive.file`. The build fails if a restricted scope or server secret appears in the code | `scripts/check-security.mjs` |
| Email sent without the user knowing | Every send shows a "Send this email now?" review first. The server validates recipients and blocks header injection. Daily limit of 100 sends | `public/app/app.js` (confirmSend), `supabase/functions/google/index.ts` |
| Email content kept | Never stored. The app's Sent list stores only time, booking, contact, the Gmail message/thread id and whether there was an attachment. The audit log stores counts only | `public/app/app.js` (gmailSend), `google/index.ts` |
| Bank or card numbers stored | They can be typed and used on the invoice or email being sent, but are scrubbed to the last 4 digits before anything is saved: in the browser (`scrubFin`) **and** in the database trigger (`app_docs_scrub`) | app code + migration |
| Forged OAuth callback | Single-use random `state`, 10-minute expiry, ID token audience/issuer/expiry checked, one Google account per user | `google-oauth-callback` |
| Cross-site scripting / clickjacking | Content-Security-Policy (no inline scripts, Google and Supabase only), no framing, HSTS, nosniff, strict referrer | `netlify.toml`, `vercel.json`, `public/_headers` |
| Account takeover | Email confirmation, 10+ character passwords, optional TOTP two-step verification checked at sign-in, Supabase auth rate limits | `src/auth.js`, Supabase Auth settings |
| Right to leave | Settings → Download my data (JSON). Delete account revokes Google, deletes uploads and all rows | `src/account.js`, `account-delete` |

Before launch, also:
1. Set `APP_ALLOWED_ORIGIN` to your exact domain.
2. Turn on Supabase's leaked-password protection, if your plan has it.
3. Restrict the Picker API key to your domain.
4. Keep the Google project in Testing until verification is approved.

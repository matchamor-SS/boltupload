# What changed from the tested prototype

The app's page and code are the prototype's own, copied by `tools/make_from_prototype.py`. To change the app later, edit `tools/prototype-set-and-settled.html` (the single-file version you tested) and re-run `python3 tools/make_from_prototype.py`, or edit `public/app/app.js` directly. Only these swaps were made:

1. **Runtime.** The prototype called `claude.use("db" | "mcp" | "assets" | "downloads")` on claude.ai. The same calls now go to Supabase, the `google` Edge Function, Supabase Storage and normal browser downloads (`src/runtime.js`). The app code didn't need changes for this.
2. **Picture URLs.** `/_blob/<id>` is now `__blob(<id>)` (Supabase Storage URL), in 3 places.
3. **Wording.** Messages that said "claude.ai Settings → Connectors" now say "Settings → Google account". Messages telling the user to open the app in Claude are reworded.
4. **"Use a folder I already have"** (Business/Marketing/Promo) now opens **Google Picker** instead of searching all of Drive. This is how `drive.file` allows picking an existing folder without a restricted scope.
5. **Added around the app, not inside it:**
   - the sign-in screen (also the public homepage);
   - three Settings cards (Google account, Email signature, Account & security);
   - the in-context "Connect Google …" explanation shown before Google's consent screen;
   - demo mode.
6. **Email signature.** Gmail's API can't add your Gmail signature, so the server adds the one saved in Settings → Email signature.

Everything else is unchanged: bookings, stages and checklists, calendar and availability, people, comms and templates, Sent log, kit, invoices (payment picks, one PDF in Drive, update after edits), financials and tax report, folders and deleted-folder recovery, palettes and light/dark mode.

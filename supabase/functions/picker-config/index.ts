// Hands the browser the Google Picker's public identifiers (API key + App ID).
// Signed-in callers only: the token is verified before anything is returned.
import { userFrom } from '../_shared/auth.ts';
import { handler, HttpError, json } from '../_shared/http.ts';

handler(async req => {
  await userFrom(req);
  const apiKey = Deno.env.get('VITE_GOOGLE_API_KEY');
  const appId = Deno.env.get('VITE_GOOGLE_APP_ID');
  if (!apiKey || !appId) throw new HttpError(503, 'picker_not_configured');
  return json({ apiKey, appId });
});

// deploy marker

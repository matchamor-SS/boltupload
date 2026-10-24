// Starts Google's consent screen for ONE feature at a time (incremental consent): mail | drive | calendar.
import { admin, userFrom } from '../_shared/auth.ts';
import { handler, HttpError, isAllowedOrigin, json } from '../_shared/http.ts';
import { TIERS } from '../_shared/google.ts';
handler(async req => {
  const user = await userFrom(req);
  const { tier } = await req.json().catch(() => ({}));
  if (!['mail', 'drive', 'calendar'].includes(tier)) throw new HttpError(400, 'invalid_tier');
  await admin.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString()); // tidy old states
  const state = crypto.randomUUID() + crypto.randomUUID();
  const origin = req.headers.get('Origin');
  const { error } = await admin.from('oauth_states').insert({ state, owner_id: user.id, tier, return_to: isAllowedOrigin(origin) ? origin : null });
  if (error) throw new Error(error.message);
  const q = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: Deno.env.get('GOOGLE_REDIRECT_URI')!, response_type: 'code',
    scope: [...new Set([...TIERS.base, ...TIERS[tier]])].join(' '), access_type: 'offline', include_granted_scopes: 'true',
    prompt: 'consent', state, login_hint: user.email ?? '',
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
});

// deploy marker

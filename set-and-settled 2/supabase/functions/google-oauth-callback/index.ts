// Google redirects here after consent. Exchanges the code, verifies the ID token, encrypts and stores the refresh token,
// then sends the browser back to the app. The refresh token never reaches the browser.
import { admin, audit } from '../_shared/auth.ts';
import { encrypt } from '../_shared/crypto.ts';
const back = (status: string, tier = '') => Response.redirect(`${Deno.env.get('APP_URL')}/?google=${status}${tier ? `&tier=${tier}` : ''}`, 302);
Deno.serve(async req => {
  try {
    const u = new URL(req.url), code = u.searchParams.get('code'), state = u.searchParams.get('state');
    if (u.searchParams.get('error') || !code || !state) return back('denied');
    const { data: st } = await admin.from('oauth_states').select('*').eq('state', state).maybeSingle();
    await admin.from('oauth_states').delete().eq('state', state);                     // single use
    if (!st || Date.now() - new Date(st.created_at).getTime() > 10 * 60_000) return back('expired');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, redirect_uri: Deno.env.get('GOOGLE_REDIRECT_URI')!, grant_type: 'authorization_code' }),
    });
    if (!r.ok) return back('error');
    const t = await r.json();
    const idp = JSON.parse(atob(String(t.id_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (idp.aud !== Deno.env.get('GOOGLE_CLIENT_ID') || !['accounts.google.com', 'https://accounts.google.com'].includes(idp.iss) || !idp.email_verified || idp.exp * 1000 < Date.now()) return back('error');
    const { data: existing } = await admin.from('google_connections').select('*').eq('owner_id', st.owner_id).maybeSingle();
    const { data: other } = await admin.from('google_connections').select('owner_id').eq('google_sub', idp.sub).neq('owner_id', st.owner_id).maybeSingle();
    if (other) return back('in_use');
    const sameAccount = existing && existing.google_sub === idp.sub && !existing.revoked_at;
    const scopes = [...new Set([...(sameAccount ? existing.scopes : []), ...String(t.scope).split(' ')])];
    const refresh = t.refresh_token as string | undefined;
    if (!refresh && !sameAccount) return back('error');
    const enc = refresh ? await encrypt(refresh) : { ct: existing!.refresh_token_ct, iv: existing!.refresh_token_iv };
    await admin.from('google_connections').upsert({ owner_id: st.owner_id, google_sub: idp.sub, email: idp.email, scopes, refresh_token_ct: enc.ct, refresh_token_iv: enc.iv, revoked_at: null, connected_at: new Date().toISOString() });
    await audit(st.owner_id, 'google.connect', { tier: st.tier });
    return back('ok', st.tier);
  } catch (_e) { return back('error'); }
});

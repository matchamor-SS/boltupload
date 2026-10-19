import { admin } from './auth.ts';
import { decrypt } from './crypto.ts';
import { HttpError } from './http.ts';

/* The only Google permissions this app ever asks for. No restricted scopes (no Gmail read/compose/modify, no full Drive). */
export const SCOPE = {
  send: 'https://www.googleapis.com/auth/gmail.send',                        // Sensitive: send only
  drive: 'https://www.googleapis.com/auth/drive.file',                       // Non-sensitive: only app-created or user-picked files
  calEvents: 'https://www.googleapis.com/auth/calendar.events',              // Sensitive
  calList: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', // Sensitive
};
export const TIERS: Record<string, string[]> = {
  base: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  mail: [SCOPE.send],
  drive: [SCOPE.drive],
  calendar: [SCOPE.calEvents, SCOPE.calList],
};

export async function connection(ownerId: string) {
  const { data } = await admin.from('google_connections').select('*').eq('owner_id', ownerId).is('revoked_at', null).maybeSingle();
  return data;
}

/** Short-lived access token minted from the encrypted refresh token, narrowed to just the scopes this call needs.
 *  Never stored. Only the Picker token (drive.file only) is ever sent to the browser. */
export async function accessToken(ownerId: string, need: string[]): Promise<string> {
  const data = await connection(ownerId);
  if (!data) throw new HttpError(409, 'google_not_connected');
  if (need.some(s => !(data.scopes as string[]).includes(s))) throw new HttpError(403, 'missing_scope');
  const refresh = await decrypt(data.refresh_token_ct, data.refresh_token_iv);
  const mint = (scope?: string) => fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, refresh_token: refresh, grant_type: 'refresh_token', ...(scope ? { scope } : {}) }),
  });
  let r = await mint(need.join(' '));
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    if (e.error === 'invalid_grant') {
      await admin.from('google_connections').update({ revoked_at: new Date().toISOString() }).eq('owner_id', ownerId);
      throw new HttpError(409, 'google_reconnect');
    }
    if (e.error === 'invalid_scope') r = await mint();               // fall back to the granted set if Google won't narrow
    if (!r.ok) throw new HttpError(502, 'google_token_error');
  }
  return (await r.json()).access_token as string;
}

/** Calls a Google API. Errors are mapped to short codes; Google's response bodies are never passed to the browser. */
export async function gfetch(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (r.status === 404 || r.status === 410) throw new HttpError(404, 'not_found');
  if (r.status === 429) throw new HttpError(429, 'rate_limited');
  if (r.status === 401) throw new HttpError(409, 'google_reconnect');
  if (r.status === 403) { const b = await r.text(); throw new HttpError(/rateLimit|userRateLimit|quota/i.test(b) ? 429 : 403, /rateLimit|quota/i.test(b) ? 'rate_limited' : 'google_forbidden'); }
  if (!r.ok) throw new HttpError(502, 'google_api_error');
  return r.status === 204 ? null : await r.json();
}

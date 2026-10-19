import { admin, audit, userFrom } from '../_shared/auth.ts';
import { handler, json } from '../_shared/http.ts';
import { decrypt } from '../_shared/crypto.ts';
handler(async req => {
  const user = await userFrom(req);
  const { data } = await admin.from('google_connections').select('*').eq('owner_id', user.id).maybeSingle();
  if (data) {
    try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: await decrypt(data.refresh_token_ct, data.refresh_token_iv) }) }); } catch (_) { /* still delete locally */ }
    await admin.from('google_connections').delete().eq('owner_id', user.id);
  }
  await audit(user.id, 'google.disconnect');
  return json({ ok: true });
});

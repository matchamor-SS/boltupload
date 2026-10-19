// Deletes the account: revokes Google access, removes uploaded pictures, then deletes the user.
// Every table references auth.users ON DELETE CASCADE, so all of the person's rows go with it.
import { admin, audit, userFrom } from '../_shared/auth.ts';
import { handler, HttpError, json } from '../_shared/http.ts';
import { decrypt } from '../_shared/crypto.ts';
handler(async req => {
  const user = await userFrom(req);
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'DELETE') throw new HttpError(400, 'confirmation_required');
  const { data } = await admin.from('google_connections').select('*').eq('owner_id', user.id).maybeSingle();
  if (data) { try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: await decrypt(data.refresh_token_ct, data.refresh_token_iv) }) }); } catch (_) { /* continue */ } }
  for (let page = 0; page < 50; page++) {
    const { data: files } = await admin.storage.from('user-assets').list(user.id, { limit: 100 });
    if (!files || !files.length) break;
    await admin.storage.from('user-assets').remove(files.map(f => `${user.id}/${f.name}`));
  }
  await audit(user.id, 'account.delete');
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new HttpError(500, 'delete_failed');
  return json({ ok: true });
});

// deploy marker

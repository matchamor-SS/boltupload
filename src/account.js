/* Adds three cards to the app's Settings screen (the app's own code is unchanged):
 *   Google account      connect Gmail / Drive / Calendar one at a time, see what's allowed, disconnect
 *   Email signature     added to every email the app sends (Gmail's API can't add your Gmail signature)
 *   Account & security  two-step verification, download my data, sign out, delete account */
import { sb } from './supabase.js';
import { googleStatus, disconnectGoogle, TIER_INFO, consentPrompt } from './google.js';
import { exportAll } from './db.js';
import { downloads } from './runtime.js';
import { esc } from './auth.js';

const toast = t => window.toast && window.toast(t);
/* Signature links end up in other people's inboxes, so only ordinary web and email addresses are kept. */
const safeUrl = u => (typeof u === 'string' && /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : '');

function card(id, html) { const d = document.createElement('div'); d.className = 'card'; d.id = id; d.innerHTML = html; return d; }

async function renderGoogle(el) {
  el.innerHTML = `<div class="head"><h3>Google account</h3></div><p class="note" style="margin:6px 0 8px">Checking…</p>`;
  const st = await googleStatus(true);
  const row = (tier) => { const t = TIER_INFO[tier], on = st.tiers && st.tiers[tier];
    return `<div class="row" style="cursor:default;gap:10px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">${t.name}${on ? ' <span class="note" style="color:var(--ok)">· connected</span>' : ''}</span><span class="sub" style="display:block">${t.what} ${t.not}</span></span>${on ? '' : `<button class="btn small primary" data-gc="${tier}">Connect</button>`}</div>`; };
  el.innerHTML = `<div class="head"><h3>Google account</h3>${st.connected ? '<button class="btn small danger" data-gdis>Disconnect</button>' : ''}</div>
    <p class="note" style="margin:6px 0 8px">${st.connected ? `Connected as <b>${esc(st.email)}</b>. ` : ''}Each feature asks Google for permission separately, only when you use it. The app never reads your email.</p>
    <div class="list">${['mail', 'drive', 'calendar'].map(row).join('')}</div>
    <p class="note" style="margin:8px 0 0">You can also remove access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>`;
  el.querySelectorAll('[data-gc]').forEach(b => b.onclick = () => consentPrompt(b.dataset.gc));
  const dis = el.querySelector('[data-gdis]');
  if (dis) dis.onclick = async () => {
    if (!dis.dataset.armed) { dis.dataset.armed = 1; dis.textContent = 'Tap again to disconnect'; setTimeout(() => { if (dis.isConnected) { delete dis.dataset.armed; dis.textContent = 'Disconnect'; } }, 3000); return; }
    dis.disabled = true; try { await disconnectGoogle(); toast('Google disconnected'); } catch (_) { toast("Couldn't disconnect. Try again."); } renderGoogle(el);
  };
}

async function renderSignature(el) {
  const db = await window.claude.use('db');
  const assets = await window.claude.use('assets');
  let sigData = { text: '', logoId: '', links: [] };
  db.doc('settings/signature').onSnapshot(s => { if (s.exists && s.data()) sigData = { text: s.data().text || '', logoId: s.data().logoId || '', links: Array.isArray(s.data().links) ? s.data().links : [] }; }, () => {});
  function sigPreview() {
    const lines = (sigData.text || '').split('\n').map(l => esc(l)).join('<br>');
    const links = (sigData.links || []).filter(l => safeUrl(l && l.url)).map(l => `<a href="${esc(safeUrl(l.url))}" style="color:#15c">${esc(l.label || safeUrl(l.url))}</a>`).join(' · ');
    const logo = sigData.logoId ? `<img src="${esc(window.__blob ? window.__blob(sigData.logoId) : sigData.logoId)}" alt="" style="max-height:48px;max-width:200px;margin-bottom:4px"><br>` : '';
    return `<div style="margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg)">${logo}${lines}${links ? '<br>' + links : ''}</div>`;
  }
  function renderLinks() {
    const lc = el.querySelector('#ss-siglinks'); if (!lc) return;
    lc.innerHTML = (sigData.links || []).map((l, i) => `<div class="row" style="cursor:default;gap:8px;align-items:center"><input type="text" data-li-label="${i}" value="${esc(l.label || '')}" placeholder="Label" style="flex:1;min-width:80px"><input type="url" data-li-url="${i}" value="${esc(l.url || '')}" placeholder="https://" style="flex:2;min-width:100px"><button class="btn small danger" data-li-del="${i}" aria-label="Remove">×</button></div>`).join('');
    lc.querySelectorAll('[data-li-label]').forEach(inp => inp.oninput = () => { sigData.links[+inp.dataset.liLabel].label = inp.value; });
    lc.querySelectorAll('[data-li-url]').forEach(inp => inp.oninput = () => { sigData.links[+inp.dataset.liUrl].url = inp.value; });
    lc.querySelectorAll('[data-li-del]').forEach(btn => btn.onclick = () => { sigData.links.splice(+btn.dataset.liDel, 1); renderLinks(); });
  }
  el.innerHTML = `<div class="head"><h3>Email signature</h3></div>
    <p class="note" style="margin:6px 0 8px">Added to the end of every email the app sends for you, including invoices.</p>
    <div class="f"><label for="ss-sig">Signature text</label><textarea id="ss-sig" style="min-height:80px" placeholder="Your name&#10;Your DJ name · website&#10;Phone"></textarea></div>
    <div class="f"><label>Hyperlinks</label><div id="ss-siglinks" style="display:flex;flex-direction:column;gap:6px"></div><button class="btn small" id="ss-sigaddlink" style="margin-top:4px;align-self:flex-start">+ Add link</button></div>
    <div class="f"><label>Logo image</label><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button class="btn small" id="ss-siglogo">Upload logo</button>${sigData.logoId ? '<button class="btn small danger" id="ss-siglogodel">Remove logo</button>' : ''}<span class="note">Small image shown above your signature text.</span></div></div>
    <div id="ss-sigprev"></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn save" id="ss-sigsave">Save signature</button></div>`;
  const ta = el.querySelector('#ss-sig');
  db.doc('settings/signature').onSnapshot(s => { if (document.activeElement !== ta) { ta.value = (s.exists && s.data().text) || ''; sigData = { text: (s.exists && s.data().text) || '', logoId: (s.exists && s.data().logoId) || '', links: (s.exists && Array.isArray(s.data().links)) ? s.data().links : [] }; renderLinks(); el.querySelector('#ss-sigprev').innerHTML = sigPreview(); } }, () => {});
  ta.oninput = () => { sigData.text = ta.value; el.querySelector('#ss-sigprev').innerHTML = sigPreview(); };
  el.querySelector('#ss-sigaddlink').onclick = () => { sigData.links = [...(sigData.links || []), { label: '', url: '' }]; renderLinks(); };
  renderLinks();
  const logoBtn = el.querySelector('#ss-siglogo');
  if (logoBtn) logoBtn.onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = async () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f || !assets) return toast("Couldn't upload. Try again.");
      try { const r = await assets.upload(f); sigData.logoId = r.id; el.querySelector('#ss-sigprev').innerHTML = sigPreview(); const del = el.querySelector('#ss-siglogodel'); if (!del) { const db2 = logoBtn.parentElement; const dbtn = document.createElement('button'); dbtn.className = 'btn small danger'; dbtn.id = 'ss-siglogodel'; dbtn.textContent = 'Remove logo'; dbtn.onclick = () => { sigData.logoId = ''; el.querySelector('#ss-sigprev').innerHTML = sigPreview(); dbtn.remove(); }; db2.insertBefore(dbtn, db2.querySelector('.note')); } }
      catch (_) { toast("Couldn't upload the logo. Try again."); } };
    inp.click();
  };
  const logoDel = el.querySelector('#ss-siglogodel');
  if (logoDel) logoDel.onclick = () => { sigData.logoId = ''; el.querySelector('#ss-sigprev').innerHTML = sigPreview(); logoDel.remove(); };
  el.querySelector('#ss-sigsave').onclick = async () => {
    try { const clean = (sigData.links || []).filter(l => safeUrl(l && l.url)).map(l => ({ label: (l.label || '').slice(0, 100), url: safeUrl(l.url).slice(0, 500) })); await db.doc('settings/signature').set({ text: ta.value.slice(0, 4000), logoId: sigData.logoId || '', links: clean }); toast('Signature saved'); } catch (_) { toast("Couldn't save. Try again."); }
  };
  el.querySelector('#ss-sigprev').innerHTML = sigPreview();
}

async function renderAccount(el) {
  const { data: { user } } = await sb.auth.getUser();
  const { data: f } = await sb.auth.mfa.listFactors();
  const totp = (f && f.totp || []).find(x => x.status === 'verified');
  el.innerHTML = `<div class="head"><h3>Account &amp; security</h3><button class="btn small" id="ss-out">Sign out</button></div>
    <p class="note" style="margin:6px 0 10px">Signed in as <b>${esc(user && user.email)}</b>.</p>
    <div class="list">
      <div class="row" style="cursor:default;gap:10px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Two-step verification</span><span class="sub" style="display:block">${totp ? 'On. A code from your authenticator app is needed each time you sign in.' : 'Add a 6-digit code from an authenticator app when you sign in. Recommended before connecting Gmail.'}</span></span><button class="btn small${totp ? '' : ' primary'}" id="ss-mfa">${totp ? 'Turn off' : 'Turn on'}</button></div>
      <div class="row" style="cursor:default;gap:10px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Download my data</span><span class="sub" style="display:block">Everything the app stores for you, as a JSON file.</span></span><button class="btn small" id="ss-exp">Download</button></div>
      <div class="row" style="cursor:default;gap:10px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Delete my account</span><span class="sub" style="display:block">Removes your account and all your data from the app and disconnects Google. Files in your own Google Drive stay yours.</span></span><button class="btn small danger" id="ss-del">Delete</button></div>
    </div><div id="ss-mfabox"></div>`;
  el.querySelector('#ss-out').onclick = async () => { await sb.auth.signOut(); location.replace('/'); };
  el.querySelector('#ss-exp').onclick = async () => {
    try { const rows = await exportAll(); await downloads.save({ filename: `set-and-settled-export-${new Date().toISOString().slice(0, 10)}.json`, data: JSON.stringify({ exportedAt: new Date().toISOString(), email: user.email, records: rows }, null, 2), contentType: 'application/json' }); }
    catch (_) { toast("Couldn't export. Try again."); }
  };
  const del = el.querySelector('#ss-del');
  del.onclick = async () => {
    const typed = prompt('This permanently deletes your account and data. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    del.disabled = true; del.textContent = 'Deleting…';
    const { error } = await sb.functions.invoke('account-delete', { body: { confirm: 'DELETE' } });
    if (error) { del.disabled = false; del.textContent = 'Delete'; return toast("Couldn't delete the account. Try again."); }
    await sb.auth.signOut(); location.replace('/');
  };
  el.querySelector('#ss-mfa').onclick = async () => {
    const box = el.querySelector('#ss-mfabox');
    if (totp) {
      if (!confirm('Turn off two-step verification?')) return;
      const { error } = await sb.auth.mfa.unenroll({ factorId: totp.id });
      if (error) return toast('Sign out and back in with your code first, then try again.');
      toast('Two-step verification is off'); return renderAccount(el);
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' });
    if (error) return toast("Couldn't start setup. Try again.");
    box.innerHTML = `<div class="card" style="margin:10px 0 0"><p style="margin:0 0 8px">Scan this with your authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code.</p>
      <img src="${data.totp.qr_code}" alt="QR code for your authenticator app" width="180" height="180" style="background:#fff;padding:8px;border-radius:8px">
      <p class="note">Can't scan? Enter this key: <span class="num">${esc(data.totp.secret)}</span></p>
      <div class="f"><label for="ss-mcode">Code</label><input id="ss-mcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="ss-mok">Verify &amp; turn on</button><button class="btn" id="ss-mx">Cancel</button></div></div>`;
    box.querySelector('#ss-mx').onclick = async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); box.innerHTML = ''; };
    box.querySelector('#ss-mok').onclick = async () => {
      const code = box.querySelector('#ss-mcode').value.replace(/\D/g, '');
      const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code });
      if (e2) return toast("That code didn't work. Try the newest one.");
      toast('Two-step verification is on'); renderAccount(el);
    };
  };
}

export function mountAccount(opts = {}) {
  const sec = document.querySelector('section[data-view="settings"]');
  if (!sec || document.getElementById('ss-google')) return;
  const legal = [...sec.querySelectorAll(':scope > .card')].find(c => /Privacy/.test(c.textContent));
  const g = card('ss-google', ''), s = card('ss-signature', ''), a = card('ss-account', '');
  [g, s, a].forEach(c => sec.insertBefore(c, legal || null));
  if (opts.demo) {
    g.innerHTML = `<div class="head"><h3>Google account</h3></div><p class="note" style="margin:6px 0 0">Demo mode: Gmail, Drive and Calendar are simulated. Nothing is sent or saved to Google.</p>`;
    a.innerHTML = `<div class="head"><h3>Account &amp; security</h3></div><p class="note" style="margin:6px 0 0">Demo mode: sign-in, two-step verification, data export and account deletion appear here once Supabase is connected.</p>`;
    return renderSignature(s);
  }
  renderGoogle(g); renderSignature(s); renderAccount(a);
}
export const refreshGoogleCard = () => { const g = document.getElementById('ss-google'); if (g) renderGoogle(g); };

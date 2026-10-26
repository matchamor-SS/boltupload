/* Set & Settled: Reminders + Booking link. */
import { sb } from './supabase.js';
import './extras.css';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => isoLocal(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const niceDate = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const hourLabel = h => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
const time12 = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'; } catch { return 'America/Los_Angeles'; } };
async function fnErr(error) { try { const j = await error.context.json(); return j.error || 'unavailable'; } catch { return 'unavailable'; } }
const OFFLINE = "Couldn't reach the Set & Settled server. Check your connection and try again in a minute.";
async function perf(op, extra = {}) {
  const { data, error } = await sb.functions.invoke('performer', { body: { op, ...extra } });
  if (error) throw Object.assign(new Error('fn'), { code: await fnErr(error) });
  return data;
}

const params = new URLSearchParams(location.search);
if (params.get('book')) bookingPage(params.get('book'));
else appExtras();

/* ============================================================== in the app */
function appExtras() {
  const st = { prefs: null, link: null, status: null, server: null, db: null, lastQ: '' };
  const MSG = {};
  function note(where, text, bad) {
    const at = Date.now(); MSG[where] = { text, bad, at }; render(); renderKit();
    setTimeout(() => { if (MSG[where] && MSG[where].at === at) { MSG[where] = null; render(); renderKit(); } }, bad ? 9000 : 5000);
  }
  const msgHTML = where => MSG[where] ? `<p class="ssx-msg${MSG[where].bad ? ' bad' : ''}" role="${MSG[where].bad ? 'alert' : 'status'}">${esc(MSG[where].text)}</p>` : '';
  const linkBox = (link, id) => `<div class="ssx-linkbox"><input id="${id}" class="ssx-linkurl" readonly value="${esc(link)}" aria-label="Your booking link"><button type="button" class="btn primary small ssx-copybtn" data-ssx-copy="${id}">Copy</button></div>`;
  async function copyLink(id, where) {
    const el = document.getElementById(id); if (!el) return;
    let ok = false;
    try { await navigator.clipboard.writeText(el.value); ok = true; } catch (_) { try { el.focus(); el.select(); el.setSelectionRange(0, 9999); ok = document.execCommand('copy'); } catch (_) {} }
    note(where, ok ? 'Link copied. Paste it anywhere.' : 'Press and hold the link to copy it.', !ok);
  }
  function wireLink(root, link, L, where) {
    root.querySelectorAll('[data-ssx-copy]').forEach(b => b.onclick = e => { e.stopPropagation(); copyLink(b.dataset.ssxCopy, where); });
    root.querySelectorAll('.ssx-linkurl').forEach(i => i.onclick = () => { i.select(); i.setSelectionRange(0, 9999); });
    root.querySelectorAll('[data-ssx-share]').forEach(b => b.onclick = e => { e.stopPropagation(); navigator.share({ title: `Book ${L.name || 'me'}`, url: link }).catch(() => {}); });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'ss-goto') goto(new URL(e.data.url, location.origin).searchParams); });
  }
  const ready = () => typeof window.goTab === 'function' && typeof allTasks === 'function' && document.querySelector('section[data-view="settings"]') && window.claude;
  const wait = setInterval(async () => {
    if (!ready()) return;
    clearInterval(wait);
    st.db = await window.claude.use('db');
    if (!st.db) return;
    st.db.doc('settings/notify').onSnapshot(s => { st.prefs = s.exists ? s.data() : {}; render(); queueSoon(); }, () => {});
    st.db.doc('settings/bookinglink').onSnapshot(s => { st.link = s.exists ? s.data() : {}; render(); renderKit(); }, () => {});
    st.db.doc('notify/status').onSnapshot(s => { st.status = s.exists ? s.data() : null; render(); }, () => {});
    perf('status').then(d => { st.server = d; render(); }).catch(() => { st.server = { error: true }; render(); });
    mount(); renderKit(); setupNav(); syncTop(); setTimeout(syncTop, 500);
    const setSec = document.querySelector('section[data-view="settings"]');
    new MutationObserver(() => { if ([...setSec.children].some(c => c.classList.contains('card') || c.classList.contains('ssx-host'))) organize(); }).observe(setSec, { childList: true });
    setTimeout(organize, 800); setTimeout(organize, 2500);
    const kitSec = document.querySelector('section[data-view="kit"]');
    if (kitSec) new MutationObserver(() => { if (!document.getElementById('ssx-kit')) renderKit(); }).observe(kitSec, { childList: true });
    setInterval(queueSoon, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) queueSoon(); });
    if (params.get('goto')) { goto(params); history.replaceState(null, '', location.pathname); }
  }, 300);

  function goto(p) {
    const g = p.get('goto');
    try {
      if (g === 'booking' && p.get('id') && typeof bookingView === 'function') { window.goTab('bookings'); setTimeout(() => bookingView(p.get('id')), 150); }
      else if (['tasks', 'bookings', 'settings', 'home'].includes(g)) window.goTab(g);
    } catch (_) {}
  }

  /* ---------- reminder list */
  const TEXT = {
    promo: (s, r) => `${s} is ${r}. Did you make a post about it yet?`,
    media: (s, r) => `${s} is ${r}, but you said you needed a media person and haven't booked one yet.`,
    contract: (s, r) => `${s} is ${r}. Is the contract signed?`,
    deposit: s => `Has the deposit for ${s} come in yet?`,
    loadin: (s, r) => `${s} is ${r}. Have you confirmed your set time and load-in?`,
    music: (s, r) => `${s} is ${r}. Is your set prepped?`,
    invoice: s => `Time to send the invoice for ${s}.`,
  };
  const rel = (from, to) => { const n = daysBetween(from, to); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === 7 ? 'one week away' : n === 14 ? 'two weeks away' : n > 1 ? `${n} days away` : n === -1 ? 'yesterday' : `${-n} days ago`; };
  function buildQueue() {
    const t0 = todayStr(), lo = addDays(t0, -14), hi = addDays(t0, 120), out = [];
    let tasks = []; try { tasks = allTasks(); } catch (_) { return null; }
    for (const t of tasks) {
      if (t.done || !t.due || !t.b || t.b.status === 'lost' || t.due < lo || t.due > hi) continue;
      const show = (t.b.title || 'your show').slice(0, 80), r = t.b.date ? rel(t.due, t.b.date) : 'coming up';
      const body = (TEXT[t.key] || ((s) => `"${t.label}" for ${s} is due today.`))(show, r);
      out.push({ id: `${t.b.id}:${t.key}:${t.due}`.slice(0, 120), at: t.due, body, bookingId: t.b.id, key: t.key });
    }
    try {
      for (const b of S.bookings || []) {
        if (!b.date || !['confirmed', 'played'].includes(b.status)) continue;
        const at = addDays(b.date, 30); if (at < lo || at > hi) continue;
        out.push({ id: `${b.id}:paid:${at}`, at, body: `It's been a month since ${(b.title || 'your show').slice(0, 80)}, but you haven't checked Paid. Did you get paid yet?`, bookingId: b.id, kind: 'paid' });
      }
    } catch (_) {}
    return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 200);
  }
  let qt = null;
  function queueSoon() { clearTimeout(qt); qt = setTimeout(saveQueue, 1500); }
  async function saveQueue() {
    if (!st.db || !st.prefs || !st.prefs.on) return;
    const items = buildQueue(); if (!items) return;
    const sig = JSON.stringify(items); if (sig === st.lastQ) return;
    st.lastQ = sig;
    try { await st.db.doc('notify/queue').set({ items, updatedAt: new Date().toISOString() }); } catch (_) { st.lastQ = ''; }
    render();
  }

  /* ---------- Settings cards */
  function mount() {
    const sec = document.querySelector('section[data-view="settings"]'); if (!sec || document.getElementById('ssx-host-notify')) return;
    for (const id of ['ssx-host-link', 'ssx-host-notify']) { const h = document.createElement('div'); h.id = id; h.className = 'ssx-host'; sec.appendChild(h); }
    render(); organize();
  }
  const savePrefs = patch => st.db && st.db.doc('settings/notify').set({ ...defPrefs(), ...(st.prefs || {}), ...patch, tz: tz() }).catch(() => note('notify', "Couldn't save your reminder settings. " + OFFLINE, true));
  const defPrefs = () => ({ on: false, push: true, email: false, digest: 'daily', digestHour: 8, alertHour: 9, hideDetails: false });
  let lt = null;
  const saveLink = (patch, now) => { st.link = { ...defLink(), ...(st.link || {}), ...patch, tz: tz() }; clearTimeout(lt); const go = () => st.db.doc('settings/bookinglink').set(st.link).catch(() => note('link', "Couldn't save your booking link settings. " + OFFLINE, true)); now ? go() : (lt = setTimeout(go, 700)); };
  const defLink = () => { let p = {}; try { p = S.profile || {}; } catch (_) {} return { on: false, slug: '', name: p.djName || p.myName || '', headline: '', days: [4, 5, 6], notice: 7, ahead: 180, lengths: [60, 90, 120], earliest: '18:00', latest: '23:30', blocked: [] }; };

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let deviceOn = null;
  async function checkDevice() {
    if (!pushOK()) { deviceOn = false; return; }
    try { const reg = await navigator.serviceWorker.getRegistration('/'); const s = reg && await reg.pushManager.getSubscription(); deviceOn = !!s && Notification.permission === 'granted'; } catch (_) { deviceOn = false; }
  }
  checkDevice().then(render);

  function render() {
    const hN = document.getElementById('ssx-host-notify'), hL = document.getElementById('ssx-host-link'); if (!hN || !hL) return;
    const box = { contains: n => !!n && (hN.contains(n) || hL.contains(n)), querySelector: q => hN.querySelector(q) || hL.querySelector(q), querySelectorAll: q => [...hN.querySelectorAll(q), ...hL.querySelectorAll(q)] };
    const ae = document.activeElement;
    if (ae && box.contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|search|)$/.test(ae.type)))) { if (!ae.__ssx) { ae.__ssx = 1; ae.addEventListener('blur', () => setTimeout(() => { ae.__ssx = 0; render(); }, 600), { once: true }); } return; }
    const keep = ae && box.contains(ae) ? ae.id : null;
    const p = { ...defPrefs(), ...(st.prefs || {}) }, L = { ...defLink(), ...(st.link || {}) }, srv = st.server || {};
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourLabel(h)}</option>`).join('');
    let upcoming = []; try { upcoming = (buildQueue() || []).filter(i => i.at >= todayStr()).slice(0, 4); } catch (_) {}
    const emailNote = !p.email ? '' : srv.gmail ? `Sent from your own Gmail to <b>${esc(srv.gmailEmail)}</b>.` : `<span class="ssx-warn">Connect Gmail in <b>Settings → Google</b> so digests can be sent from your own Gmail.</span>`;
    const devNote = !pushOK() ? (isIOS() && !standalone() ? 'On iPhone or iPad: tap <b>Share</b> then <b>Add to Home Screen</b>, open Set & Settled from your Home Screen, and turn alerts on there.' : "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari.")
      : isIOS() && !standalone() ? 'On iPhone or iPad: tap <b>Share</b> then <b>Add to Home Screen</b>, open Set & Settled from your Home Screen, and turn alerts on there.'
      : Notification.permission === 'denied' ? 'Alerts are blocked for this site. Allow notifications for setnsettled.com in your browser or phone settings, then come back.' : '';
    const link = L.slug ? `${location.origin}/?book=${encodeURIComponent(L.slug)}` : '';
    const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const times = []; for (let h = 0; h < 24; h++) for (const m of [0, 30]) times.push(`${pad(h)}:${pad(m)}`);
    const tOpts = sel => times.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${time12(t)}</option>`).join('');
    const html = `
    <div class="card ssx" id="ssx-notify">
      <div class="ssx-head"><div><h3>Reminders</h3><p class="note">Nudges from your task due dates, like "did you post about it?", "you still need a media person" or "did you get paid?"</p></div>
        <label class="ssx-switch"><input type="checkbox" id="ssx-on" ${p.on ? 'checked' : ''} aria-label="Reminders on or off"><span></span></label></div>
      <div class="ssx-body" ${p.on ? '' : 'hidden'}>
        <div class="ssx-opt">
          <label class="ssx-check"><input type="checkbox" id="ssx-push" ${p.push ? 'checked' : ''}> <b>Phone & laptop alerts</b></label>
          <div class="ssx-sub" ${p.push ? '' : 'hidden'}>
            <div class="ssx-row"><span class="ssx-pill ${deviceOn ? 'on' : ''}">${deviceOn ? 'On for this device' : 'Off for this device'}</span>
              ${deviceOn ? '<button class="btn small" id="ssx-devoff">Turn off here</button><button class="btn small" id="ssx-test">Send a test</button>' : `<button class="btn primary small" id="ssx-devon" ${devNote && !pushOK() ? 'disabled' : ''}>Turn on for this device</button>`}</div>
            <p class="note">${devNote || `Turn this on separately on each phone and laptop you use${srv.devices ? `. ${srv.devices} device${srv.devices === 1 ? '' : 's'} set up so far` : ''}.`}</p>
            <div class="f ssx-inline"><label for="ssx-ah">Send alerts from</label><select id="ssx-ah">${hours}</select></div>
          </div>
        </div>
        <div class="ssx-opt">
          <label class="ssx-check"><input type="checkbox" id="ssx-email" ${p.email ? 'checked' : ''}> <b>Email digest</b></label>
          <div class="ssx-sub" ${p.email ? '' : 'hidden'}>
            <div class="ssx-grid2"><div class="f"><label for="ssx-dg">How often</label><select id="ssx-dg"><option value="daily">Every morning</option><option value="weekly">Mondays</option></select></div>
              <div class="f"><label for="ssx-dh">At</label><select id="ssx-dh">${hours}</select></div></div>
            <p class="note">${emailNote}</p>
          </div>
        </div>
        <label class="ssx-check"><input type="checkbox" id="ssx-hide" ${p.hideDetails ? 'checked' : ''}> Hide show names on my lock screen</label>
        ${upcoming.length ? `<div class="ssx-next"><div class="eyebrow">Next reminders</div>${upcoming.map(i => `<div class="ssx-li"><span>${esc(niceDate(i.at))}</span>${esc(i.body)}</div>`).join('')}</div>` : '<p class="note">No reminders coming up. They come from the due dates on your booking checklists.</p>'}
        ${st.status && st.status.email === 'needs_gmail' && p.email ? '<p class="note ssx-warn">Your last digest couldn\'t be sent: Gmail isn\'t connected.</p>' : ''}
      </div>
      ${msgHTML('notify')}
    </div>
    <div class="card ssx" id="ssx-link">
      <div class="ssx-head"><div><h3>Booking link</h3><p class="note">A page promoters and coordinators can use to pick an open date and time and send you a request. Requests show up as Leads in Bookings.</p></div>
        <label class="ssx-switch"><input type="checkbox" id="ssx-lon" ${L.on ? 'checked' : ''} aria-label="Booking link on or off"><span></span></label></div>
      ${L.on ? '' : msgHTML('link')}
      <div class="ssx-body" ${L.on ? '' : 'hidden'}>
        <div class="f"><label for="ssx-slug">Your link</label>
          <div class="ssx-slug"><span>${esc(location.host)}/?book=</span><input id="ssx-slug" value="${esc(L.slug)}" placeholder="your-name" maxlength="40" autocapitalize="none" autocomplete="off" spellcheck="false"><button class="btn small" id="ssx-claim">Save</button></div>
          <span class="note">Letters, numbers and dashes.</span></div>
        ${msgHTML('link')}
        ${link ? `<div class="f"><label>Share this link</label>${linkBox(link, 'ssx-linkurl')}<div class="ssx-row ssx-share">${navigator.share ? '<button type="button" class="btn small" data-ssx-share>Share…</button>' : ''}<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Preview</a></div><span class="note">It's also in your <b>Kit</b>, ready to copy.</span></div>` : ''}
        <div class="f"><label for="ssx-name">Performer name on the page</label><input id="ssx-name" maxlength="80" value="${esc(L.name)}"></div>
        <div class="f"><label for="ssx-hl">A short note for people booking you</label><textarea id="ssx-hl" maxlength="400" rows="3" placeholder="Latin indie dance and baile funk. Tell me about your night!">${esc(L.headline)}</textarea></div>
        <div class="f"><label>Days you take bookings</label><div class="ssx-chips" id="ssx-days">${D.map((d, i) => `<button type="button" class="ssx-chip" data-ssx-day="${i}" aria-pressed="${L.days.includes(i)}">${d}</button>`).join('')}</div></div>
        <div class="ssx-grid2">
          <div class="f"><label for="ssx-notice">Minimum notice</label><select id="ssx-notice">${[1, 3, 7, 14, 21, 30, 60].map(n => `<option value="${n}">${n} day${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
          <div class="f"><label for="ssx-ahead">Book up to</label><select id="ssx-ahead">${[[30, '1 month'], [90, '3 months'], [180, '6 months'], [365, '1 year']].map(([n, t]) => `<option value="${n}">${t} ahead</option>`).join('')}</select></div>
          <div class="f"><label for="ssx-early">Earliest start</label><select id="ssx-early">${tOpts(L.earliest)}</select></div>
          <div class="f"><label for="ssx-late">Latest start</label><select id="ssx-late">${tOpts(L.latest)}</select></div>
        </div>
        <div class="f"><label>Set lengths you offer</label><div class="ssx-chips" id="ssx-lens">${[30, 45, 60, 90, 120, 180, 240].map(n => `<button type="button" class="ssx-chip" data-ssx-len="${n}" aria-pressed="${L.lengths.includes(n)}">${n < 60 ? n + ' min' : n / 60 + ' hr'}</button>`).join('')}</div></div>
        <div class="f"><label>Dates you're not available</label>${blockCal(L)}<span class="note">Dates with a Confirmed, Played or Paid show are already closed.</span></div>
      </div>
    </div>`;
    const cut = html.indexOf('<div class="card ssx" id="ssx-link">');
    hN.innerHTML = html.slice(0, cut); hL.innerHTML = html.slice(cut);
    const $ = s => box.querySelector(s);
    const setSel = (id, v) => { const el = $(id); if (el) el.value = String(v); };
    setSel('#ssx-ah', p.alertHour); setSel('#ssx-dh', p.digestHour); setSel('#ssx-dg', p.digest); setSel('#ssx-notice', L.notice); setSel('#ssx-ahead', L.ahead);
    if (keep && document.getElementById(keep)) document.getElementById(keep).focus();

    $('#ssx-on').onchange = e => { savePrefs({ on: e.target.checked }); if (e.target.checked) { st.lastQ = ''; queueSoon(); } };
    $('#ssx-push').onchange = e => savePrefs({ push: e.target.checked });
    $('#ssx-email').onchange = e => savePrefs({ email: e.target.checked });
    $('#ssx-hide').onchange = e => savePrefs({ hideDetails: e.target.checked });
    $('#ssx-ah').onchange = e => savePrefs({ alertHour: Number(e.target.value) });
    $('#ssx-dh').onchange = e => savePrefs({ digestHour: Number(e.target.value) });
    $('#ssx-dg').onchange = e => savePrefs({ digest: e.target.value === 'weekly' ? 'weekly' : 'daily' });
    const on = $('#ssx-devon'); if (on) on.onclick = () => deviceEnable(on);
    const off = $('#ssx-devoff'); if (off) off.onclick = deviceDisable;
    const test = $('#ssx-test'); if (test) test.onclick = async () => { test.disabled = true; try { const r = await perf('test'); note('notify', r.pushed ? 'Test alert sent. Check this device.' : "Couldn't reach your devices. Turn alerts off and on again.", !r.pushed); } catch (_) { note('notify', "Couldn't send a test. " + OFFLINE, true); } test.disabled = false; };

    $('#ssx-lon').onchange = e => saveLink({ on: e.target.checked }, true);
    $('#ssx-claim').onclick = claimSlug;
    $('#ssx-slug').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); claimSlug(); } };
    $('#ssx-name').oninput = e => saveLink({ name: e.target.value.slice(0, 80) });
    $('#ssx-hl').oninput = e => saveLink({ headline: e.target.value.slice(0, 400) });
    $('#ssx-notice').onchange = e => saveLink({ notice: Number(e.target.value) }, true);
    $('#ssx-ahead').onchange = e => saveLink({ ahead: Number(e.target.value) }, true);
    $('#ssx-early').onchange = e => saveLink({ earliest: e.target.value }, true);
    $('#ssx-late').onchange = e => saveLink({ latest: e.target.value }, true);
    box.querySelectorAll('[data-ssx-day]').forEach(b => b.onclick = e => { e.stopPropagation(); const d = Number(b.dataset.ssxDay), s = new Set(L.days); s.has(d) ? s.delete(d) : s.add(d); if (!s.size) return note('link', 'Pick at least one day.', true); saveLink({ days: [...s].sort() }, true); });
    box.querySelectorAll('[data-ssx-len]').forEach(b => b.onclick = e => { e.stopPropagation(); const n = Number(b.dataset.ssxLen), s = new Set(L.lengths); s.has(n) ? s.delete(n) : s.add(n); if (!s.size) return note('link', 'Pick at least one set length.', true); saveLink({ lengths: [...s].sort((a, b) => a - b) }, true); });
    wireBlockCal(box, L);
    wireLink(box, link, L, 'link');
  }

  /* ---------- "Dates you're not available" calendar */
  const BC = { month: null, range: false, from: '' };
  function blockCal(L) {
    const t0 = todayStr(), blocked = new Set((L.blocked || []).filter(d => d >= t0));
    if (!BC.month) { const d = new Date(); BC.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    const y = BC.month.getFullYear(), mo = BC.month.getMonth(), first = new Date(y, mo, 1).getDay(), dim = new Date(y, mo + 1, 0).getDate();
    const now = new Date(), canPrev = y > now.getFullYear() || mo > now.getMonth();
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${pad(mo + 1)}-${pad(d)}`, past = ds < t0, on = blocked.has(ds), from = BC.range && BC.from === ds;
      cells += `<button type="button" class="ssx-bd${on ? ' on' : ''}${from ? ' from' : ''}" data-ssx-bd="${ds}" ${past ? 'disabled' : ''} aria-pressed="${on}" aria-label="${niceDate(ds)}${on ? ', blocked' : ''}">${d}</button>`;
    }
    const list = [...blocked].sort(), ranges = [];
    for (const d of list) { const last = ranges[ranges.length - 1]; if (last && addDays(last[1], 1) === d) last[1] = d; else ranges.push([d, d]); }
    const label = ([a, b]) => a === b ? niceDate(a) : `${new Date(a + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(b + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `<p class="note">${BC.range ? (BC.from ? `Now tap the <b>last</b> day of the stretch starting ${esc(niceDate(BC.from))}.` : 'Tap the <b>first</b> day of the stretch you are away.') : 'Tap days to block or unblock them. Use <b>Block a range</b> for trips and stretches.'}</p>
      <div class="ssx-cal"><div class="ssx-calh"><button type="button" class="ssx-calnav" data-ssx-bm="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button><b>${BC.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b><button type="button" class="ssx-calnav" data-ssx-bm="1" aria-label="Next month">›</button></div>
        <div class="ssx-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="ssx-grid">${cells}</div></div>
      <div class="ssx-row"><button type="button" class="ssx-chip" data-ssx-range aria-pressed="${BC.range}">${BC.range ? 'Cancel range' : 'Block a range'}</button>${list.length ? `<span class="note">${list.length} day${list.length === 1 ? '' : 's'} blocked</span><button type="button" class="btn small" data-ssx-clearblocks>Clear all</button>` : ''}</div>
      ${ranges.length ? `<div class="ssx-chips">${ranges.map(r => `<button type="button" class="ssx-chip on" data-ssx-unrange="${r[0]}|${r[1]}" aria-label="Unblock ${esc(label(r))}">${esc(label(r))} ×</button>`).join('')}</div>` : ''}`;
  }
  function wireBlockCal(box, L) {
    const cur = () => new Set((st.link && st.link.blocked || []).filter(d => d >= todayStr()));
    const put = set => { saveLink({ blocked: [...set].sort().slice(0, 400) }, true); render(); };
    box.querySelectorAll('[data-ssx-bm]').forEach(b => b.onclick = e => { e.stopPropagation(); BC.month = new Date(BC.month.getFullYear(), BC.month.getMonth() + Number(b.dataset.ssxBm), 1); render(); });
    box.querySelectorAll('[data-ssx-range]').forEach(b => b.onclick = e => { e.stopPropagation(); BC.range = !BC.range; BC.from = ''; render(); });
    box.querySelectorAll('[data-ssx-clearblocks]').forEach(b => b.onclick = e => { e.stopPropagation(); put(new Set()); note('link', 'All blocked dates cleared.'); });
    box.querySelectorAll('[data-ssx-unrange]').forEach(b => b.onclick = e => { e.stopPropagation(); const [a, z] = b.dataset.ssxUnrange.split('|'), set = cur(); for (let d = a; d <= z; d = addDays(d, 1)) set.delete(d); put(set); });
    box.querySelectorAll('[data-ssx-bd]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const d = b.dataset.ssxBd, set = cur();
      if (BC.range) {
        if (!BC.from) { BC.from = d; render(); return; }
        let [a, z] = [BC.from, d].sort(); if (daysBetween(a, z) > 366) z = addDays(a, 366);
        for (let x = a; x <= z; x = addDays(x, 1)) set.add(x);
        BC.range = false; BC.from = ''; put(set); return;
      }
      set.has(d) ? set.delete(d) : set.add(d); put(set);
    });
  }

  /* ---------- Settings: grouped in the order you use the app */
  const GROUPS = [['profile', 'Profile'], ['google', 'Google'], ['bookings', 'Bookings'], ['reminders', 'Reminders'], ['email', 'Email & invoices'], ['look', 'Look'], ['account', 'Account']];
  let curGroup = (() => { try { return localStorage.getItem('ss-setgroup') || 'profile'; } catch (_) { return 'profile'; } })();
  let organizing = false;
  function organize() {
    const sec = document.querySelector('section[data-view="settings"]'); if (!sec || organizing) return;
    organizing = true;
    try {
      let nav = sec.querySelector(':scope > .ssg-nav');
      if (!nav) {
        nav = document.createElement('nav'); nav.className = 'ssg-nav'; nav.setAttribute('aria-label', 'Settings sections');
        nav.innerHTML = GROUPS.map(([k, t]) => `<button type="button" data-ssg-go="${k}">${t}</button>`).join('');
        const head = sec.querySelector(':scope > .head'); head ? head.after(nav) : sec.prepend(nav);
        nav.addEventListener('click', e => { const b = e.target.closest('[data-ssg-go]'); if (!b) return; e.stopPropagation(); showGroup(b.dataset.ssgGo, true); });
      }
      let anchor = nav;
      for (const [k, t] of GROUPS) {
        let g = sec.querySelector(`:scope > .ssg[data-ssg="${k}"]`);
        if (!g) { g = document.createElement('div'); g.className = 'ssg'; g.dataset.ssg = k; g.setAttribute('aria-label', t); }
        if (anchor.nextElementSibling !== g) anchor.after(g);
        anchor = g;
      }
      const card = q => { const el = sec.querySelector(q); return el ? (el.closest('.ssx-host') || el.closest('.card') || el) : null; };
      let look = document.getElementById('ssg-appearance');
      const seg = document.getElementById('themeSeg');
      if (!look && seg) { look = document.createElement('div'); look.className = 'card'; look.id = 'ssg-appearance'; look.innerHTML = '<div class="head"><h3>Light or dark</h3></div>'; look.appendChild(seg.parentElement); }
      const place = {
        profile: [card('#kitAvatar')],
        google: [card('#ss-google'), card('#driveRoots'), card('#setCals')],
        bookings: [card('#defCl'), document.getElementById('ssx-host-link')],
        reminders: [document.getElementById('ssx-host-notify')],
        email: [card('#ss-signature'), card('#payList')],
        look: [look, card('#palPick'), card('#ss-motion-chk')],
        account: [card('#ss-account'), card('[data-legal]')],
      };
      for (const [k, els] of Object.entries(place)) { const g = sec.querySelector(`:scope > .ssg[data-ssg="${k}"]`); for (const el of els) if (el && el.parentElement !== g) g.appendChild(el); }
      const acct = sec.querySelector(':scope > .ssg[data-ssg="account"]');
      [...sec.children].filter(c => c.classList.contains('card') || c.classList.contains('ssx-host')).forEach(c => acct.insertBefore(c, acct.firstChild));
      showGroup(curGroup, false);
    } finally { organizing = false; }
  }
  function showGroup(k, scroll) {
    if (!GROUPS.some(g => g[0] === k)) k = 'profile';
    curGroup = k; try { localStorage.setItem('ss-setgroup', k); } catch (_) {}
    const sec = document.querySelector('section[data-view="settings"]'); if (!sec) return;
    sec.querySelectorAll(':scope > .ssg').forEach(g => { g.hidden = g.dataset.ssg !== k; });
    sec.querySelectorAll('[data-ssg-go]').forEach(b => { const on = b.dataset.ssgGo === k; b.setAttribute('aria-current', on ? 'true' : 'false'); if (on && scroll !== null) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    if (scroll) { const nav = sec.querySelector('.ssg-nav'); const y = nav.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ss-top')) || 64) - 4; if (scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' }); }
  }
  window.ssShowSettings = (k, targetId) => { window.goTab('settings'); organize(); showGroup(k, false); if (targetId) setTimeout(() => { const t = document.getElementById(targetId); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); };
  document.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('section[data-view="settings"] > .ssg[hidden]'); if (g) showGroup(g.dataset.ssg, false); });

  /* ---------- Settings in the tab menu */
  function setupNav() {
    const tabs = document.getElementById('tabs'); if (!tabs || tabs.querySelector('[data-tab="settings"]')) return;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'settings'; b.className = 'ssx-settab'; b.setAttribute('aria-current', 'false');
    b.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="9.5" fill="color-mix(in srgb, var(--accent) 22%, transparent)"/><g transform="translate(2 2)" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g><circle cx="14" cy="14" r="3" fill="var(--accent-2, currentColor)"/></svg>Settings`;
    b.onclick = () => window.goTab('settings');
    tabs.appendChild(b);
    document.documentElement.classList.add('ssx-settab-on');
    try { if (document.querySelector('section[data-view="settings"]:not([hidden])')) b.setAttribute('aria-current', 'true'); } catch (_) {}
  }
  const syncTop = () => { const h = document.querySelector('header.top'); if (h) document.documentElement.style.setProperty('--ss-top', Math.round(Math.max(0, h.getBoundingClientRect().bottom)) + 'px'); };
  addEventListener('scroll', syncTop, { passive: true }); addEventListener('resize', syncTop);

  /* ---------- Booking link card in the Kit */
  function renderKit() {
    const sec = document.querySelector('section[data-view="kit"]'); if (!sec || !st.db) return;
    let box = document.getElementById('ssx-kit');
    if (!box) { box = document.createElement('div'); box.id = 'ssx-kit'; box.className = 'card ssx ssx-kitcard'; const head = sec.querySelector(':scope > .head'); head ? head.after(box) : sec.prepend(box); }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const L = { ...defLink(), ...(st.link || {}) }, link = L.slug ? `${location.origin}/?book=${encodeURIComponent(L.slug)}` : '';
    box.innerHTML = L.on && link
      ? `<div class="ssx-head"><div><h3>Booking link</h3><p class="note">Send this to promoters and coordinators so they can request an open date.</p></div></div>
         ${linkBox(link, 'ssx-kiturl')}
         <div class="ssx-row">${navigator.share ? '<button type="button" class="btn small" data-ssx-share>Share…</button>' : ''}<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Preview</a><button type="button" class="btn small" data-ssx-edit>Edit</button></div>${msgHTML('kit')}`
      : `<div class="ssx-head"><div><h3>Booking link</h3><p class="note">Let promoters and coordinators pick an open date and send you a request. Requests show up as Leads.</p></div></div>
         <div class="ssx-row"><button type="button" class="btn primary small" data-ssx-edit>Set up my booking link</button></div>`;
    wireLink(box, link, L, 'kit');
    const ed = box.querySelector('[data-ssx-edit]'); if (ed) ed.onclick = e => { e.stopPropagation(); window.ssShowSettings('bookings', 'ssx-link'); };
  }

  async function claimSlug() {
    const el = document.getElementById('ssx-slug'), btn = document.getElementById('ssx-claim');
    const slug = el.value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (slug.length < 3) return note('link', 'Use at least 3 letters or numbers.', true);
    btn.disabled = true; btn.textContent = 'Saving…';
    try { const r = await perf('claim', { slug }); saveLink({ slug: r.slug, on: true }, true); note('link', 'Your booking link is ready. Copy it below.'); }
    catch (e) { note('link', e.code === 'slug_taken' ? 'That link name is taken. Try another.' : e.code === 'bad_slug' ? 'Use letters, numbers and dashes only.' : e.code === 'unauthorized' ? 'Please sign out and back in, then try again.' : "Couldn't save your link name. " + OFFLINE, true); }
    btn.disabled = false; btn.textContent = 'Save';
  }

  const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const deviceLabel = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser'; };
  async function deviceEnable(btn) {
    if (!pushOK()) return note('notify', isIOS() ? 'Add Set & Settled to your Home Screen first, then open it from there.' : "This browser can't show alerts.", true);
    btn.disabled = true; btn.textContent = 'Turning on…';
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { note('notify', 'Alerts were not allowed. You can allow them in your browser or phone settings.', true); return; }
      const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      const key = (st.server && st.server.vapidKey) || (await perf('status')).vapidKey;
      if (!key) { note('notify', 'Alerts are not set up on the server yet.', true); return; }
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const j = sub.toJSON();
      await perf('subscribe', { endpoint: j.endpoint, keys: j.keys, label: deviceLabel() });
      if (!(st.prefs && st.prefs.on)) savePrefs({ on: true, push: true });
      deviceOn = true; note('notify', 'Alerts are on for this device.');
      perf('status').then(d => { st.server = d; render(); }).catch(() => {});
    } catch (e) { note('notify', e.code === 'too_many_devices' ? 'You have alerts on 10 devices already. Turn one off first.' : "Couldn't turn on alerts. " + OFFLINE, true); }
    finally { render(); }
  }
  async function deviceDisable() {
    try { const reg = await navigator.serviceWorker.getRegistration('/'); const sub = reg && await reg.pushManager.getSubscription(); if (sub) { await perf('unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch (_) {}
    deviceOn = false; note('notify', 'Alerts are off for this device.');
  }
}

/* ============================================================== public booking page */
async function bookingPage(rawSlug) {
  const slug = String(rawSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  document.documentElement.classList.add('ss-book');
  const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
  const root = document.createElement('main'); root.id = 'ss-book'; root.setAttribute('aria-live', 'polite');
  const put = () => document.body.appendChild(root); document.body ? put() : document.addEventListener('DOMContentLoaded', put);
  root.innerHTML = '<div class="bk-wrap"><p class="bk-muted">Loading…</p></div>';
  let P;
  try {
    const { data, error } = await sb.functions.invoke(`book?slug=${encodeURIComponent(slug)}`, { method: 'GET' });
    if (error || !data || !data.today) throw new Error('nf');
    P = data;
  } catch (_) {
    root.innerHTML = `<div class="bk-wrap"><div class="bk-card bk-center"><h1>This booking link isn't active</h1><p class="bk-muted">Check the link with the performer who sent it.</p></div></div>`;
    return;
  }
  document.title = `Book ${P.name || 'a performer'} · Set & Settled`;
  const openFrom = addDays(P.today, P.notice), openTo = addDays(P.today, P.ahead), taken = new Set(P.taken || []);
  const isOpen = d => d >= openFrom && d <= openTo && P.days.includes(new Date(d + 'T12:00:00').getDay()) && !taken.has(d);
  const times = (() => { const out = [], [eh, em] = P.earliest.split(':').map(Number), [lh, lm] = P.latest.split(':').map(Number); let a = eh * 60 + em, b = lh * 60 + lm; if (b < a) b += 1440; for (let t = a; t <= b && out.length < 48; t += 30) { const x = t % 1440; out.push(`${pad(Math.floor(x / 60))}:${pad(x % 60)}`); } return out; })();
  const S2 = { month: (() => { const d = new Date(openFrom + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1); })(), date: '', start: '', length: P.lengths.length === 1 ? P.lengths[0] : 0, sent: false, t: Date.now() };
  const lenLabel = n => n < 60 ? `${n} min` : `${n / 60} hr${n > 60 ? 's' : ''}`;

  function cal() {
    const y = S2.month.getFullYear(), mo = S2.month.getMonth(), first = new Date(y, mo, 1).getDay(), dim = new Date(y, mo + 1, 0).getDate();
    const minM = new Date(openFrom + 'T12:00:00'), maxM = new Date(openTo + 'T12:00:00');
    const canPrev = y > minM.getFullYear() || (y === minM.getFullYear() && mo > minM.getMonth()), canNext = y < maxM.getFullYear() || (y === maxM.getFullYear() && mo < maxM.getMonth());
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= dim; d++) { const s = `${y}-${pad(mo + 1)}-${pad(d)}`, ok = isOpen(s); cells += `<button type="button" class="bk-day${s === S2.date ? ' sel' : ''}" data-bk-date="${s}" ${ok ? '' : 'disabled'} aria-label="${niceDate(s)}${ok ? '' : ', not available'}" aria-pressed="${s === S2.date}">${d}</button>`; }
    return `<div class="bk-cal"><div class="bk-calh"><button type="button" class="bk-nav" data-bk-m="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button><b>${S2.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b><button type="button" class="bk-nav" data-bk-m="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button></div>
      <div class="bk-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="bk-grid">${cells}</div></div>`;
  }
  function draw() {
    if (S2.sent) {
      root.innerHTML = `<div class="bk-wrap"><div class="bk-card bk-center"><div class="bk-check" aria-hidden="true">✓</div><h1>Request sent</h1>
        <p>${esc(P.name || 'The performer')} has your request for <b>${esc(niceDate(S2.date))}</b> at <b>${esc(time12(S2.start))}</b> and will reply to you by email.</p>
        <p class="bk-muted">Thank you!</p></div>${foot()}</div>`; return;
    }
    root.innerHTML = `<div class="bk-wrap">
      <header class="bk-hero"><div class="bk-eyebrow">Booking request</div><h1>${esc(P.name || 'Book a performer')}</h1>${P.headline ? `<p>${esc(P.headline)}</p>` : ''}</header>
      <form class="bk-card" id="bk-form" novalidate>
        <section class="bk-step"><h2><span>1</span>Pick a date</h2>${cal()}<p class="bk-muted bk-small">${S2.date ? `Selected: <b>${esc(niceDate(S2.date))}</b>` : 'Open dates are the ones you can tap.'}</p></section>
        <section class="bk-step"><h2><span>2</span>Set time</h2>
          <div class="bk-two"><label class="bk-f">Start time<select id="bk-start" required><option value="">Choose…</option>${times.map(t => `<option value="${t}"${t === S2.start ? ' selected' : ''}>${time12(t)}</option>`).join('')}</select></label>
          <div class="bk-f"><span>Set length</span><div class="bk-chips">${P.lengths.map(n => `<button type="button" class="bk-chip" data-bk-len="${n}" aria-pressed="${S2.length === n}">${lenLabel(n)}</button>`).join('')}</div></div></div></section>
        <section class="bk-step"><h2><span>3</span>About your event</h2>
          <div class="bk-two">
            <label class="bk-f">Your name<input id="bk-name" autocomplete="name" maxlength="80" required></label>
            <label class="bk-f">Email<input id="bk-email" type="email" autocomplete="email" maxlength="200" required></label>
            <label class="bk-f">Phone <i>(optional)</i><input id="bk-phone" type="tel" autocomplete="tel" maxlength="40"></label>
            <label class="bk-f">Company or collective <i>(optional)</i><input id="bk-org" autocomplete="organization" maxlength="120"></label>
            <label class="bk-f">You are a<select id="bk-role"><option value="promoter">Promoter</option><option value="coordinator">Event coordinator</option><option value="venue">Venue</option><option value="other">Other</option></select></label>
            <label class="bk-f">Event name<input id="bk-event" maxlength="120" required></label>
            <label class="bk-f">Venue <i>(optional)</i><input id="bk-venue" maxlength="120"></label>
            <label class="bk-f">City<input id="bk-city" autocomplete="address-level2" maxlength="80" required></label>
            <label class="bk-f bk-span">Address <i>(optional)</i><input id="bk-address" autocomplete="street-address" maxlength="200"></label>
            <label class="bk-f">Your offer in $ <i>(optional)</i><input id="bk-fee" inputmode="decimal" maxlength="12" placeholder="500"></label>
          </div>
          <label class="bk-f">Anything else? <i>(optional)</i><textarea id="bk-msg" rows="4" maxlength="2000" placeholder="Vibe, crowd size, lineup, load-in…"></textarea></label>
          <label class="bk-hp" aria-hidden="true">Website<input id="bk-website" tabindex="-1" autocomplete="off"></label>
          <p class="bk-muted bk-small">Please don't include bank or card numbers. Your details go only to ${esc(P.name || 'this performer')}. <a href="/privacy-policy/" target="_blank" rel="noopener">Privacy</a></p>
          <p class="bk-err" id="bk-err" role="alert"></p>
          <button class="bk-btn" id="bk-send" type="submit">Send request</button>
        </section>
      </form>${foot()}</div>`;
    const keepVals = root.__vals || {}; for (const [k, v] of Object.entries(keepVals)) { const el = root.querySelector('#' + k); if (el) el.value = v; }
    root.querySelectorAll('.bk-nav').forEach(b => b.onclick = () => { remember(); S2.month = new Date(S2.month.getFullYear(), S2.month.getMonth() + Number(b.dataset.bkM), 1); draw(); });
    root.querySelectorAll('.bk-day').forEach(b => b.onclick = () => { remember(); S2.date = b.dataset.bkDate; draw(); root.querySelector('#bk-start').focus(); });
    root.querySelectorAll('.bk-chip').forEach(b => b.onclick = () => { remember(); S2.length = Number(b.dataset.bkLen); draw(); });
    root.querySelector('#bk-start').onchange = e => { S2.start = e.target.value; };
    root.querySelector('#bk-form').onsubmit = submit;
  }
  function remember() { root.__vals = {}; root.querySelectorAll('input[id^="bk-"],textarea[id^="bk-"],select[id^="bk-"]').forEach(el => { if (el.id !== 'bk-start') root.__vals[el.id] = el.value; }); }
  const foot = () => `<footer class="bk-foot">Booking requests by <b>Set & Settled</b> · <a href="/privacy-policy/" target="_blank" rel="noopener">Privacy</a> · <a href="/terms-of-service/" target="_blank" rel="noopener">Terms</a></footer>`;
  async function submit(e) {
    e.preventDefault();
    const v = id => (root.querySelector('#' + id).value || '').trim(), err = root.querySelector('#bk-err'), btn = root.querySelector('#bk-send');
    S2.start = v('bk-start');
    const miss = !S2.date ? 'Pick a date.' : !S2.start ? 'Pick a start time.' : !S2.length ? 'Pick a set length.' : !v('bk-name') ? 'Add your name.' : !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v('bk-email')) ? 'Add a valid email.' : !v('bk-event') ? 'Add the event name.' : !v('bk-city') ? 'Add the city.' : v('bk-fee') && !/^\$?\d[\d,]*(\.\d{1,2})?$/.test(v('bk-fee')) ? 'Write the offer as a number, like 500.' : '';
    if (miss) { err.textContent = miss; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';
    const body = { slug, t: S2.t, website: v('bk-website'), date: S2.date, start: S2.start, length: S2.length, name: v('bk-name'), email: v('bk-email'), phone: v('bk-phone'), org: v('bk-org'), role: v('bk-role'), event: v('bk-event'), venue: v('bk-venue'), city: v('bk-city'), address: v('bk-address'), fee: v('bk-fee'), message: v('bk-msg') };
    const { error } = await sb.functions.invoke('book', { body });
    if (!error) { S2.sent = true; draw(); window.scrollTo(0, 0); return; }
    const code = await fnErr(error);
    if (code === 'date_unavailable') { taken.add(S2.date); S2.date = ''; remember(); draw(); root.querySelector('#bk-err').textContent = 'Sorry, that date was just taken. Please pick another.'; return; }
    err.textContent = code === 'rate_limited' ? 'Too many requests from your network. Please try again in an hour.' : code === 'bad_email' ? 'Please check your email address.' : code === 'bad_phone' ? 'Please check your phone number.' : code === 'bad_fee' ? 'Write the offer as a number, like 500.' : code === 'not_found' ? "This booking link isn't active anymore." : "Couldn't send your request. Please try again.";
    btn.disabled = false; btn.textContent = 'Send request';
  }
  draw();
}
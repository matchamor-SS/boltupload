/* Set & Settled: Reminders + Booking link.
 * 1. Reminders: performers choose phone/laptop alerts and/or an email digest. The app turns each performer's open
 *    checklist tasks (and unpaid shows) into a small reminder list saved with their own data; the server sends what's due.
 * 2. Booking link: a public page (?book=name) where a promoter or coordinator picks an open date and time and sends a
 *    request. Requests arrive as Leads in Bookings with the person added to People.
 * Security: everything the browser saves goes through the signed-in performer's own data (row-level security).
 * Push keys, the cron secret and the service key live only on the server. Nothing here uses innerHTML with
 * performer or booker text without escaping. */
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
const say = t => { if (window.toast) window.toast(t); };
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
  const st = { prefs: null, link: null, status: null, server: null, db: null, lastQ: '', goals: [] };
  /* Messages show inside the card they belong to (never outside the window). */
  const MSG = {};
  function note(where, text, bad) {
    const at = Date.now(); MSG[where] = { text, bad, at }; render(); renderKit(); renderGoals();
    setTimeout(() => { if (MSG[where] && MSG[where].at === at) { MSG[where] = null; render(); renderKit(); renderGoals(); } }, bad ? 9000 : 5000);
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
    st.db.collection('goals').onSnapshot(s => { st.goals = s.docs.map(d => ({ id: d.id, ...d.data() })); renderGoals(); renderHomeGoals(); queueSoon(); }, () => {});
    let lastB = null; setInterval(() => { try { if (S.bookings !== lastB) { lastB = S.bookings; renderGoals(); renderHomeGoals(); } } catch (_) {} }, 2000);
    const homeSec = document.querySelector('section[data-view="home"]');
    if (homeSec) new MutationObserver(() => { if (!document.getElementById('ssx-home-goals')) renderHomeGoals(); }).observe(homeSec, { childList: true });
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

  /* ---------- reminder list (what the server may send, and when) */
  /* Same wording the server uses: from TODAY's point of view, always with the show's real date. */
  const prettyDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  function compose(i, today) {
    const s = i.showDate ? `${i.show} (${prettyDate(i.showDate)})` : i.show, n = i.showDate ? daysBetween(today, i.showDate) : NaN;
    const when = isNaN(n) ? 'coming up' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'was yesterday' : `was ${-n} days ago`;
    if (i.kind === 'paid') return `${s} isn't marked Paid yet${!isNaN(n) && n < 0 ? `, ${-n} days after the show` : ''}. Did you get paid?`;
    const T = { promo: `${s} is ${when}. Did you make a post about it yet?`, media: `${s} is ${when}, and you said you need a media person. Have you booked one?`, contract: `${s} is ${when}. Is the contract signed?`, deposit: `Has the deposit for ${s} come in yet?`, loadin: `${s} is ${when}. Have you confirmed your set time and load-in?`, music: `${s} is ${when}. Is your set prepped?`, invoice: `Time to send the invoice for ${s}.` };
    return T[i.key] || `"${i.label}" for ${s} is due.`;
  }
  function buildQueue() {
    const t0 = todayStr(), lo = addDays(t0, -14), hi = addDays(t0, 120), out = [];
    let tasks = []; try { tasks = allTasks(); } catch (_) { return null; }
    for (const t of tasks) {
      if (t.done || !t.due || !t.b || t.b.status === 'lost' || t.due < lo || t.due > hi) continue;
      const it = { id: `${t.b.id}:${t.key}:${t.due}`.slice(0, 120), at: t.due, bookingId: t.b.id, key: t.key, label: String(t.label || '').slice(0, 80), show: (t.b.title || 'your show').slice(0, 80), showDate: t.b.date || '' };
      out.push({ ...it, body: compose(it, it.at) });
    }
    try {
      for (const b of S.bookings || []) {
        if (!b.date || !['confirmed', 'played'].includes(b.status)) continue;
        const at = addDays(b.date, 30); if (at < lo || at > hi) continue;
        const it = { id: `${b.id}:paid:${at}`, at, bookingId: b.id, kind: 'paid', show: (b.title || 'your show').slice(0, 80), showDate: b.date };
        out.push({ ...it, body: compose(it, at) });
      }
    } catch (_) {}
    for (const g of st.goals || []) {
      if (g.type !== 'steps') continue;
      for (const x of g.steps || []) {
        if (x.done || !x.due || x.due < lo || x.due > hi) continue;
        const it = { id: `goal:${g.id}:${String(x.t).slice(0, 40)}:${x.due}`.slice(0, 120), at: x.due, key: 'goalstep', label: String(x.t).slice(0, 80), show: String(g.title || 'your goal').slice(0, 80), showDate: g.due || '' };
        out.push({ ...it, body: compose(it, it.at) });
      }
    }
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
    mountGoalsPage();
    render(); renderGoals(); organize();
  }
  /* Goals get their own page in the tab menu, right under Kit */
  function mountGoalsPage() {
    if (document.querySelector('section[data-view="goals"]')) return;
    const kit = document.querySelector('section[data-view="kit"]'), main = document.getElementById('main'); if (!main) return;
    const sec = document.createElement('section'); sec.dataset.view = 'goals'; sec.hidden = true;
    sec.innerHTML = '<div class="head"><div><h2>Goals</h2><p class="note" style="margin:2px 0 0">Followers, releases, shows, income: everything you\'re working toward, in one place.</p></div></div><div id="ssx-host-goals" class="ssx-host"></div>';
    kit ? kit.after(sec) : main.appendChild(sec);
    const tabs = document.getElementById('tabs'), kitTab = tabs && tabs.querySelector('[data-tab="kit"]');
    if (tabs && !tabs.querySelector('[data-tab="goals"]')) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'goals'; b.setAttribute('aria-current', 'false');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>Goals';
      b.onclick = () => window.goTab('goals');
      kitTab ? kitTab.after(b) : tabs.appendChild(b);
    }
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
    // don't redraw under someone's fingers while they type; redraw when they leave the field
    if (ae && box.contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|search|)$/.test(ae.type)))) { if (!ae.__ssx) { ae.__ssx = 1; ae.addEventListener('blur', () => setTimeout(() => { ae.__ssx = 0; render(); }, 600), { once: true }); } return; }
    const keep = ae && box.contains(ae) ? ae.id : null;
    const p = { ...defPrefs(), ...(st.prefs || {}) }, L = { ...defLink(), ...(st.link || {}) }, srv = st.server || {};
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourLabel(h)}</option>`).join('');
    let upcoming = []; try { upcoming = (buildQueue() || []).filter(i => i.at >= todayStr()).slice(0, 4); } catch (_) {}
    const emailNote = !p.email ? '' : srv.gmail ? `Sent from your own Gmail to <b>${esc(srv.gmailEmail)}</b>.` : `<span class="ssx-warn">Connect Gmail in <b>Google account</b> above so digests can be sent from your own Gmail.</span>`;
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
        ${upcoming.length ? `<div class="ssx-next"><div class="eyebrow">Next reminders</div>${upcoming.map(i => `<div class="ssx-li"><span>${esc(niceDate(i.at))}</span>${esc(compose(i, i.at))}</div>`).join('')}</div>` : '<p class="note">No reminders coming up. They come from the due dates on your booking checklists.</p>'}
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
        <div class="f"><label>Dates you're not available</label>${blockCal(L)}          <span class="note">Dates with a Confirmed, Played or Paid show are already closed.</span></div>
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
    box.querySelectorAll('[data-ssx-unblock]').forEach(b => b.onclick = e => { e.stopPropagation(); saveLink({ blocked: (L.blocked || []).filter(d => d !== b.dataset.ssxUnblock) }, true); });
    wireLink(box, link, L, 'link');
  }

  /* ---------- "Dates you're not available": tap days to block them, or block a range */
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
    // group consecutive blocked days into ranges for the summary
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

  /* ---------- Settings: grouped in the order you use the app, with a section menu */
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
      // Appearance (light/dark) gets its own card in Look
      let look = document.getElementById('ssg-appearance');
      const seg = document.getElementById('themeSeg');
      if (!look && seg) { look = document.createElement('div'); look.className = 'card'; look.id = 'ssg-appearance'; look.innerHTML = '<div class="head"><h3>Light or dark</h3></div>'; look.appendChild(seg.parentElement); }
      const ep = document.getElementById('editProfile'), pc = card('#kitAvatar');
      if (ep && pc && !pc.contains(ep)) { ep.textContent = 'Edit profile'; ep.classList.add('small'); ep.style.whiteSpace = 'nowrap'; (pc.querySelector('.chips') || pc).appendChild(ep); }
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
      // anything else that shows up later lands in Account so nothing is ever lost
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
  // a field inside a hidden group that gets focus (for example from an app message) opens its group
  document.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('section[data-view="settings"] > .ssg[hidden]'); if (g) showGroup(g.dataset.ssg, false); });

  /* ---------- Settings in the tab menu (bottom of the side menu / end of the phone bar) */
  function setupNav() {
    const tabs = document.getElementById('tabs'); if (!tabs || tabs.querySelector('[data-tab="settings"]')) return;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'settings'; b.className = 'ssx-settab'; b.setAttribute('aria-current', 'false');
    b.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="9.5" fill="color-mix(in srgb, var(--accent) 22%, transparent)"/><g transform="translate(2 2)" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g><circle cx="14" cy="14" r="3" fill="var(--accent-2, currentColor)"/></svg>Settings`;
    b.onclick = () => window.goTab('settings');
    tabs.appendChild(b);
    document.documentElement.classList.add('ssx-settab-on');
    try { if (document.querySelector('section[data-view="settings"]:not([hidden])')) b.setAttribute('aria-current', 'true'); } catch (_) {}
  }
  // measured from the header's own height (not while scrolling), so the page can't jiggle at the top or bottom
  let lastTop = '';
  const syncTop = () => { const h = document.querySelector('header.top'); if (!h) return; const v = Math.round(h.getBoundingClientRect().height + (parseFloat(getComputedStyle(h).top) || 0)) + 'px'; if (v !== lastTop) { lastTop = v; document.documentElement.style.setProperty('--ss-top', v); } };
  addEventListener('resize', syncTop); try { new ResizeObserver(syncTop).observe(document.querySelector('header.top')); } catch (_) {}

  /* ---------- Goals: numbers you track, numbers the app counts for you, checklists and milestones */
  const GTPL = [
    ['Grow your audience', [
      ['Instagram followers', 'metric', { unit: 'followers' }], ['TikTok followers', 'metric', { unit: 'followers' }],
      ['Spotify monthly listeners', 'metric', { unit: 'listeners' }], ['SoundCloud followers', 'metric', { unit: 'followers' }],
      ['YouTube subscribers', 'metric', { unit: 'subscribers' }], ['Email list signups', 'metric', { unit: 'signups' }],
      ['Mix plays', 'metric', { unit: 'plays' }]]],
    ['From your bookings (counts itself)', [
      ['Shows played', 'auto', { source: 'played', unit: 'shows' }], ['Shows booked', 'auto', { source: 'booked', unit: 'shows' }],
      ['Income from paid shows', 'auto', { source: 'income', unit: '$' }], ['New venues played', 'auto', { source: 'venues', unit: 'venues' }],
      ['Cities played', 'auto', { source: 'cities', unit: 'cities' }], ['Booking-link requests', 'auto', { source: 'requests', unit: 'requests' }],
      ['Average fee per show', 'auto', { source: 'avgfee', unit: '$' }]]],
    ['Milestones', [
      ['Release a new mix', 'steps', { steps: ['Pick the tracks', 'Record the mix', 'Make the artwork', 'Upload and share'] }],
      ['Refresh my EPK', 'steps', { steps: ['New photos', 'Update my bio', 'Add recent shows', 'Send it to 5 venues'] }],
      ['Land a festival slot', 'check', {}], ['Book a residency', 'check', {}],
      ['Get featured in press or on a podcast', 'check', {}], ['Play a show out of state', 'check', {}]]],
    ['Your own', [['Custom number goal', 'metric', { unit: '' }], ['Custom checklist', 'steps', { steps: [] }], ['Custom yes/no goal', 'check', {}]]],
  ];
  const AUTO = { played: 'Shows played', booked: 'Shows booked', income: 'Income from paid shows', venues: 'New venues played', cities: 'Cities played', requests: 'Booking-link requests', avgfee: 'Average fee per show' };
  const GS = { form: null, confirmDel: '' };
  const endOfYear = () => `${new Date().getFullYear()}-12-31`;
  const num = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
  const fmtN = (n, unit) => unit === '$' ? '$' + Math.round(n).toLocaleString('en-US') : Math.round(n).toLocaleString('en-US') + (unit ? ' ' + unit : '');
  function autoValue(g) {
    let bs = []; try { bs = S.bookings || []; } catch (_) {}
    const to = g.due || endOfYear(), from = g.from || `${to.slice(0, 4)}-01-01`, k = b => String(b.status || '').toLowerCase();
    const inP = b => b.date && b.date >= from && b.date <= to;
    const played = bs.filter(b => inP(b) && ['played', 'paid'].includes(k(b)));
    switch (g.source) {
      case 'played': return played.length;
      case 'booked': return bs.filter(b => inP(b) && ['confirmed', 'played', 'paid'].includes(k(b))).length;
      case 'income': return bs.filter(b => inP(b) && k(b) === 'paid').reduce((s, b) => s + (+b.fee || 0), 0);
      case 'venues': return new Set(played.map(b => b.venueId).filter(Boolean)).size;
      case 'cities': return new Set(played.map(b => String(b.city || '').trim().toLowerCase()).filter(Boolean)).size;
      case 'requests': return bs.filter(b => b.source === 'booking-link' && String(b.createdAt || '').slice(0, 10) >= from && String(b.createdAt || '').slice(0, 10) <= to).length;
      case 'avgfee': { const f = bs.filter(b => inP(b) && ['confirmed', 'played', 'paid'].includes(k(b)) && +b.fee > 0); return f.length ? f.reduce((s, b) => s + (+b.fee), 0) / f.length : 0; }
    }
    return 0;
  }
  function measure(g) {
    const t0 = todayStr();
    let cur = 0, target = 1, start = 0;
    if (g.type === 'metric') { cur = num(g.current); target = num(g.target); start = num(g.start); }
    else if (g.type === 'auto') { cur = autoValue(g); target = num(g.target); }
    else if (g.type === 'steps') { const st2 = g.steps || []; cur = st2.filter(x => x.done).length; target = st2.length || 1; }
    else { cur = g.done ? 1 : 0; target = 1; }
    const span = target - start, pct = span > 0 ? Math.max(0, Math.min(1, (cur - start) / span)) : (cur >= target ? 1 : 0);
    const done = g.type === 'check' ? !!g.done : target > 0 && cur >= target;
    let pace = '', onTrack = null;
    if (!done && g.due && (g.type === 'metric' || g.type === 'auto') && g.source !== 'avgfee') {
      const left = daysBetween(t0, g.due), begin = g.type === 'auto' ? (g.from || `${g.due.slice(0, 4)}-01-01`) : (String(g.createdAt || '').slice(0, 10) || t0);
      const total = Math.max(1, daysBetween(begin, g.due)), expected = Math.max(0, Math.min(1, 1 - left / total));
      if (left > 0) {
        const per = (target - cur) / (left / 30.4);
        pace = left > 45 ? `About ${fmtN(Math.ceil(per), g.unit)} a month to get there` : `${fmtN(target - cur, g.unit)} to go in ${left} day${left === 1 ? '' : 's'}`;
        onTrack = pct >= expected - 0.05;
      } else pace = 'The date has passed. Edit the goal to set a new date.';
    }
    if (!done && g.type === 'steps') {
      const open = (g.steps || []).filter(x => !x.done), late = open.filter(x => x.due && x.due < t0).length, next = open.filter(x => x.due).sort((a, b) => a.due.localeCompare(b.due))[0];
      if (late) { pace = `${late} step${late === 1 ? '' : 's'} overdue`; onTrack = false; }
      else if (next) { pace = `Next: ${next.t} · ${stepWhen(next.due)}`; onTrack = true; }
      else if (g.due && daysBetween(t0, g.due) < 0) { pace = 'The date has passed. Edit the goal to set a new date.'; onTrack = false; }
    }
    return { cur, target, start, pct, done, pace, onTrack };
  }
  const stepWhen = d => { const n = daysBetween(todayStr(), d); return n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : n > 1 ? `due ${prettyDate(d)} (${n} days)` : `was due ${prettyDate(d)}`; };
  // even spacing from today to the goal date, for steps that don't have a date yet
  const spreadDates = (steps, goalDue) => {
    const t0 = todayStr(), end = goalDue && goalDue > t0 ? goalDue : addDays(t0, 7 * steps.length), total = Math.max(steps.length, daysBetween(t0, end));
    return steps.map((x, i) => x.done || x.due ? x : { ...x, due: addDays(t0, Math.max(0, Math.round(total * (i + 1) / steps.length))) });
  };
  const spark = h => {
    if (!Array.isArray(h) || h.length < 2) return '';
    const pts = h.slice(-12), vs = pts.map(x => num(x.v)), lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
    const d = pts.map((x, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1) * 100).toFixed(1)},${(28 - (num(x.v) - lo) / r * 24).toFixed(1)}`).join(' ');
    return `<svg class="ssx-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const goalLine = (g, m) => {
    if (g.type === 'steps') return `${m.cur} of ${m.target} steps done`;
    if (g.type === 'check') return m.done ? 'Done' : 'Not yet';
    if (g.type === 'metric') return `${fmtN(m.cur, g.unit === '$' ? '$' : '')} of ${fmtN(m.target, g.unit)}${m.start ? ` · started at ${fmtN(m.start, '')}` : ''}`;
    return `${fmtN(m.cur, g.unit === '$' ? '$' : '')} of ${fmtN(m.target, g.unit)} · counted from your bookings`;
  };
  const dueLine = g => { if (!g.due) return ''; const n = daysBetween(todayStr(), g.due); return `by ${prettyDate(g.due)}${n >= 0 ? ` (${n} day${n === 1 ? '' : 's'} left)` : ''}`; };
  const goalsSorted = () => [...(st.goals || [])].sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const saveGoal = (id, data) => st.db.collection('goals').doc(id).set(data).catch(() => note('goals', "Couldn't save the goal. " + OFFLINE, true));

  function goalForm(f) {
    const g = f.g, t = g.type;
    const tplChips = GTPL.map(([grp, list]) => `<div class="ssx-tplgrp"><div class="eyebrow">${esc(grp)}</div><div class="ssx-chips">${list.map(([title, type], i) => `<button type="button" class="ssx-chip" data-ssx-tpl="${esc(grp)}|${i}">${esc(title)}</button>`).join('')}</div></div>`).join('');
    if (!t) return `<div class="ssx-form"><div class="ssx-row" style="justify-content:space-between"><b>Pick a goal to start from</b><button type="button" class="btn small" data-ssx-gcancel>Cancel</button></div>${tplChips}</div>`;
    return `<div class="ssx-form">
      <div class="f"><label for="ssx-g-title">Goal</label><input id="ssx-g-title" maxlength="80" value="${esc(g.title || '')}"></div>
      ${t === 'metric' ? `<div class="ssx-grid2">
          <div class="f"><label for="ssx-g-cur">Where you are now</label><input id="ssx-g-cur" inputmode="decimal" value="${esc(g.current ?? '')}" placeholder="4500"></div>
          <div class="f"><label for="ssx-g-target">Target</label><input id="ssx-g-target" inputmode="decimal" value="${esc(g.target ?? '')}" placeholder="10000"></div>
          <div class="f"><label for="ssx-g-unit">Counting (unit)</label><input id="ssx-g-unit" maxlength="20" value="${esc(g.unit || '')}" placeholder="followers"></div>
          <div class="f"><label for="ssx-g-due">By</label><input id="ssx-g-due" type="date" data-pk="native" value="${esc(g.due || endOfYear())}"></div></div>` : ''}
      ${t === 'auto' ? `<div class="ssx-grid2">
          <div class="f"><label for="ssx-g-target">Target${g.unit === '$' ? ' ($)' : ''}</label><input id="ssx-g-target" inputmode="decimal" value="${esc(g.target ?? '')}"></div>
          <div class="f"><label for="ssx-g-due">By</label><input id="ssx-g-due" type="date" data-pk="native" value="${esc(g.due || endOfYear())}"></div></div>
          <p class="note">Counts ${esc((AUTO[g.source] || '').toLowerCase())} from Jan 1 of that year to the date you pick. Right now: <b>${esc(fmtN(autoValue({ ...g, due: g.due || endOfYear() }), g.unit))}</b>.</p>` : ''}
      ${t === 'steps' ? `<div class="f"><label for="ssx-g-due">Finish the whole goal by</label><input id="ssx-g-due" type="date" data-pk="native" value="${esc(g.due || '')}"></div>
          <div class="f"><label>Steps and their due dates</label>
            <div class="ssx-steprows">${(g.steps || []).map((x, i) => `<div class="ssx-steprow${x.done ? ' done' : ''}" data-ssx-srow="${i}">
              <input class="ssx-st-t" maxlength="120" value="${esc(x.t)}" placeholder="Step ${i + 1}" aria-label="Step ${i + 1}">
              <input class="ssx-st-d" type="date" data-pk="native" value="${esc(x.due || '')}" aria-label="Due date for step ${i + 1}">
              <button type="button" class="ssx-st-x" data-ssx-srm="${i}" aria-label="Remove step ${i + 1}">×</button></div>`).join('')}</div>
            <div class="ssx-row"><button type="button" class="btn small" data-ssx-sadd>+ Add step</button><button type="button" class="btn small" data-ssx-sspread>Fill in dates for me</button></div>
            <span class="note">Each step can have its own due date, before the goal's date. Steps with dates show up in your reminders.</span></div>` : ''}
      ${t === 'check' ? `<div class="f"><label for="ssx-g-due">By (optional)</label><input id="ssx-g-due" type="date" data-pk="native" value="${esc(g.due || '')}"></div>` : ''}
      <label class="ssx-check"><input type="checkbox" id="ssx-g-pin" ${g.pin !== false ? 'checked' : ''}> Show on Home</label>
      ${msgHTML('goalform')}
      <div class="ssx-row"><button type="button" class="btn primary small" data-ssx-gsave>${f.id ? 'Save goal' : 'Add goal'}</button><button type="button" class="btn small" data-ssx-gcancel>Cancel</button></div>
    </div>`;
  }
  function renderGoals() {
    const host = document.getElementById('ssx-host-goals'); if (!host || !st.db) return;
    const ae = document.activeElement;
    if (ae && host.contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|search|)$/.test(ae.type)))) { if (!ae.__ssxg) { ae.__ssxg = 1; ae.addEventListener('blur', () => setTimeout(() => { ae.__ssxg = 0; renderGoals(); }, 600), { once: true }); } return; }
    let prof = {}; try { prof = S.profile || {}; } catch (_) {}
    const goals = goalsSorted();
    host.innerHTML = `<div class="card ssx" id="ssx-goals">
      <div class="ssx-head"><div><h3>Your goals</h3><p class="note">Goals marked "Show on Home" also appear on your Home page.</p></div></div>
      <div class="ssx-opt"><div class="ssx-row" style="justify-content:space-between"><div><div class="eyebrow">Season goals</div><div class="note">${prof.goalShows ? `${esc(prof.goalShows)} shows` : 'No shows goal'} · ${prof.goalIncome ? esc(fmtN(num(prof.goalIncome), '$')) + ' income' : 'no income goal'}${prof.goalYear ? ` · ${esc(prof.goalYear)}` : ''}</div></div><button type="button" class="btn small" data-ssx-season>Edit season goals</button></div></div>
      ${msgHTML('goals')}
      <div class="ssx-goals">${goals.length ? goals.map(goalCard).join('') : '<p class="note">No goals yet. Add one below. Try your Instagram followers, a mix release or a number of shows.</p>'}</div>
      ${GS.form ? goalForm(GS.form) : '<button type="button" class="btn primary" data-ssx-gadd>+ Add a goal</button>'}
    </div>`;
    wireGoals(host);
  }
  function goalCard(g) {
    const m = measure(g), del = GS.confirmDel === g.id;
    return `<div class="ssx-goal${m.done ? ' done' : ''}" data-ssx-gid="${esc(g.id)}">
      <div class="ssx-goal-top"><b>${esc(g.title || 'Goal')}</b><span class="ssx-pill ${m.done ? 'on' : ''}">${m.done ? 'Done 🎉' : Math.round(m.pct * 100) + '%'}</span></div>
      <div class="ssx-bar"><i style="width:${(m.pct * 100).toFixed(1)}%"></i></div>
      <div class="note">${esc(goalLine(g, m))}${g.due ? ' · ' + esc(dueLine(g)) : ''}</div>
      ${m.pace ? `<div class="note ${m.onTrack === false ? 'ssx-warn' : ''}">${esc(m.pace)}${m.onTrack === true ? ' · on track ✓' : m.onTrack === false ? ' · behind pace' : ''}</div>` : ''}
      ${g.type === 'metric' ? spark(g.history) : ''}
      ${g.type === 'steps' ? `<div class="ssx-steps">${(g.steps || []).map((x, i) => { const late = !x.done && x.due && x.due < todayStr(); return `<label class="ssx-check ssx-stepchk${x.done ? ' done' : ''}"><input type="checkbox" data-ssx-gstep="${i}" ${x.done ? 'checked' : ''}> <span class="ssx-st-name">${esc(x.t)}</span>${x.due ? `<span class="ssx-due${late ? ' late' : ''}">${esc(x.done ? prettyDate(x.due) : stepWhen(x.due))}</span>` : ''}</label>`; }).join('')}</div>` : ''}
      <div class="ssx-row">
        ${g.type === 'metric' ? `<input class="ssx-gval" type="text" inputmode="decimal" placeholder="New number" aria-label="New number for ${esc(g.title)}" id="ssx-gval-${esc(g.id)}"><button type="button" class="btn primary small" data-ssx-gupd>Update</button>` : ''}
        ${g.type === 'check' ? `<button type="button" class="btn ${g.done ? '' : 'primary'} small" data-ssx-gcheck>${g.done ? 'Mark not done' : 'Mark done'}</button>` : ''}
        <button type="button" class="btn small" data-ssx-gedit>Edit</button>
        <button type="button" class="btn small" data-ssx-gpin>${g.pin !== false ? 'Hide from Home' : 'Show on Home'}</button>
        <button type="button" class="btn small ${del ? 'danger' : ''}" data-ssx-gdel>${del ? 'Tap again to delete' : 'Delete'}</button>
      </div>
    </div>`;
  }
  function wireGoals(host) {
    const q = s => host.querySelector(s);
    const sea = q('[data-ssx-season]'); if (sea) sea.onclick = e => { e.stopPropagation(); if (typeof profileForm === 'function') profileForm(); else { const b = document.getElementById('editProfile'); b && b.click(); } };
    const add = q('[data-ssx-gadd]'); if (add) add.onclick = e => { e.stopPropagation(); MSG.goalform = null; GS.form = { g: {} }; renderGoals(); };
    host.querySelectorAll('[data-ssx-gcancel]').forEach(b => b.onclick = e => { e.stopPropagation(); GS.form = null; renderGoals(); });
    host.querySelectorAll('[data-ssx-tpl]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const [grp, i] = b.dataset.ssxTpl.split('|'), list = (GTPL.find(x => x[0] === grp) || [])[1] || [], [title, type, extra] = list[Number(i)];
      const custom = /^Custom /.test(title);
      const steps = type === 'steps' ? ((extra.steps || []).length ? extra.steps : ['', '', '']).map(t => ({ t, due: '', done: false })) : [];
      GS.form = { g: { title: custom ? '' : title, type, unit: extra.unit || '', source: extra.source, steps, due: type === 'metric' || type === 'auto' ? endOfYear() : '', pin: true } };
      renderGoals(); setTimeout(() => { const t = document.getElementById(custom ? 'ssx-g-title' : (type === 'metric' ? 'ssx-g-cur' : type === 'auto' ? 'ssx-g-target' : 'ssx-g-title')); t && t.focus(); }, 50);
    });
    // keep what's typed in the step rows when the form redraws
    const readRows = () => { const f = GS.form; if (!f || f.g.type !== 'steps') return; const old = f.g.steps || [];
      f.g.steps = [...host.querySelectorAll('[data-ssx-srow]')].map(r => { const o = old[Number(r.dataset.ssxSrow)] || {}; return { t: r.querySelector('.ssx-st-t').value.slice(0, 120), due: r.querySelector('.ssx-st-d').value, done: !!o.done }; });
      const d = document.getElementById('ssx-g-due'), ti = document.getElementById('ssx-g-title'); if (d) f.g.due = d.value; if (ti) f.g.title = ti.value; };
    const sadd = q('[data-ssx-sadd]'); if (sadd) sadd.onclick = e => { e.stopPropagation(); readRows(); GS.form.g.steps = [...GS.form.g.steps, { t: '', due: '', done: false }].slice(0, 30); renderGoals(); const all = host.querySelectorAll('.ssx-st-t'); all.length && all[all.length - 1].focus(); };
    host.querySelectorAll('[data-ssx-srm]').forEach(b => b.onclick = e => { e.stopPropagation(); readRows(); GS.form.g.steps = GS.form.g.steps.filter((_, i) => i !== Number(b.dataset.ssxSrm)); renderGoals(); });
    const spr = q('[data-ssx-sspread]'); if (spr) spr.onclick = e => { e.stopPropagation(); readRows(); const st3 = GS.form.g.steps.filter(x => x.t.trim()); if (!st3.length) return note('goalform', 'Add a step first.', true); GS.form.g.steps = spreadDates(st3, GS.form.g.due); renderGoals(); note('goalform', GS.form.g.due ? 'Dates spread out evenly up to the goal date. Change any of them.' : 'Dates spread one week apart. Add a goal date to fit them before it.'); };
    const save = q('[data-ssx-gsave]'); if (save) save.onclick = e => {
      readRows();
      e.stopPropagation(); const f = GS.form, g = f.g, v = id => (document.getElementById(id) || {}).value || '';
      const title = v('ssx-g-title').trim().slice(0, 80), due = v('ssx-g-due').trim();
      const bad = msg => { note('goalform', msg, true); };
      if (!title) return bad('Give the goal a name.');
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return bad('Write the date like 2026-12-31.');
      const out = { ...g, title, due, pin: !!(document.getElementById('ssx-g-pin') || {}).checked, updatedAt: new Date().toISOString(), createdAt: g.createdAt || new Date().toISOString() };
      if (g.type === 'metric') {
        const cur = num(v('ssx-g-cur')), target = num(v('ssx-g-target'));
        if (!(target > 0)) return bad('Add a target number.');
        out.unit = v('ssx-g-unit').trim().slice(0, 20); out.target = target; out.current = cur;
        if (!f.id) { out.start = cur; out.history = [{ d: todayStr(), v: cur }]; }
        else if (num(g.current) !== cur) out.history = [...(g.history || []), { d: todayStr(), v: cur }].slice(-60);
      }
      if (g.type === 'auto') { const target = num(v('ssx-g-target')); if (!(target > 0)) return bad('Add a target number.'); out.target = target; out.from = `${(due || endOfYear()).slice(0, 4)}-01-01`; }
      if (g.type === 'steps') {
        out.steps = (g.steps || []).map(x => ({ t: String(x.t || '').trim().slice(0, 120), due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '', done: !!x.done })).filter(x => x.t).slice(0, 30);
        if (!out.steps.length) return bad('Add at least one step.');
        const late = due && out.steps.find(x => x.due && x.due > due);
        if (late) return bad(`"${late.t}" is due after the goal date. Move it to ${prettyDate(due)} or earlier.`);
      }
      const id = f.id || 'g' + Math.random().toString(36).slice(2, 10);
      saveGoal(id, out); GS.form = null; note('goals', f.id ? 'Goal saved.' : 'Goal added.');
    };
    host.querySelectorAll('[data-ssx-gid]').forEach(card => {
      const g = (st.goals || []).find(x => x.id === card.dataset.ssxGid); if (!g) return;
      const b = s => card.querySelector(s);
      const upd = b('[data-ssx-gupd]'); if (upd) {
        const inp = b('.ssx-gval');
        const go = () => { const raw = inp.value.trim(); if (!raw) return; const val = num(raw); saveGoal(g.id, { ...g, current: val, history: [...(g.history || []), { d: todayStr(), v: val }].slice(-60), updatedAt: new Date().toISOString() }); note('goals', `${g.title}: updated to ${fmtN(val, g.unit)}.`); };
        upd.onclick = e => { e.stopPropagation(); go(); }; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); go(); } };
      }
      card.querySelectorAll('[data-ssx-gstep]').forEach(c => c.onchange = e => { e.stopPropagation(); const steps = (g.steps || []).map((x, i) => i === Number(c.dataset.ssxGstep) ? { ...x, done: c.checked, doneAt: c.checked ? todayStr() : '' } : x); saveGoal(g.id, { ...g, steps, updatedAt: new Date().toISOString() }); });
      const chk = b('[data-ssx-gcheck]'); if (chk) chk.onclick = e => { e.stopPropagation(); saveGoal(g.id, { ...g, done: !g.done, doneAt: !g.done ? todayStr() : '', updatedAt: new Date().toISOString() }); };
      const ed = b('[data-ssx-gedit]'); if (ed) ed.onclick = e => { e.stopPropagation(); MSG.goalform = null; GS.form = { id: g.id, g: { ...g } }; renderGoals(); const fm = document.querySelector('#ssx-goals .ssx-form'); fm && fm.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      const pin = b('[data-ssx-gpin]'); if (pin) pin.onclick = e => { e.stopPropagation(); saveGoal(g.id, { ...g, pin: g.pin === false }); };
      const del = b('[data-ssx-gdel]'); if (del) del.onclick = e => {
        e.stopPropagation();
        if (GS.confirmDel !== g.id) { GS.confirmDel = g.id; renderGoals(); setTimeout(() => { if (GS.confirmDel === g.id) { GS.confirmDel = ''; renderGoals(); } }, 4000); return; }
        GS.confirmDel = ''; st.db.collection('goals').doc(g.id).delete().then(() => note('goals', 'Goal deleted.')).catch(() => note('goals', "Couldn't delete. " + OFFLINE, true));
      };
    });
  }
  /* Goals on Home, under the season goals */
  function renderHomeGoals() {
    const sec = document.querySelector('section[data-view="home"]'); if (!sec || !st.db) return;
    let box = document.getElementById('ssx-home-goals');
    if (!box) {
      box = document.createElement('div'); box.id = 'ssx-home-goals'; box.className = 'card ssx';
      const anchor = document.getElementById('goalShows'), grid = anchor && anchor.closest('section[data-view="home"] > *');
      grid ? grid.after(box) : sec.appendChild(box);
    }
    const goals = goalsSorted().filter(g => g.pin !== false).slice(0, 6);
    box.innerHTML = goals.length
      ? `<div class="head"><h3>Goals</h3><button type="button" class="btn small" data-ssx-allgoals>All goals</button></div>
         <div class="ssx-homegoals">${goals.map(g => { const m = measure(g); return `<div class="ssx-hg"><div class="ssx-goal-top"><span>${esc(g.title)}</span><span class="note">${m.done ? 'Done 🎉' : g.type === 'steps' ? `${m.cur}/${m.target}` : g.type === 'check' ? 'Not yet' : esc(fmtN(m.cur, g.unit === '$' ? '$' : '')) + ' / ' + esc(fmtN(m.target, g.unit === '$' ? '$' : ''))}</span></div><div class="ssx-bar"><i style="width:${(m.pct * 100).toFixed(1)}%"></i></div>${g.type === 'steps' && m.pace && !m.done ? `<span class="note${m.onTrack === false ? ' ssx-warn' : ''}">${esc(m.pace)}</span>` : ''}</div>`; }).join('')}</div>`
      : `<div class="head"><h3>Goals</h3></div><p class="note" style="margin:0">Track followers, releases, shows and more.</p><div class="ssx-row"><button type="button" class="btn small" data-ssx-allgoals>+ Add a goal</button></div>`;
    const all = box.querySelector('[data-ssx-allgoals]'); if (all) all.onclick = e => { e.stopPropagation(); window.goTab('goals'); window.scrollTo(0, 0); };
  }

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
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
// invoice PDFs: the PDF maker ships with the site (the site's security rules block scripts from other sites); it loads only when a PDF is made
window.ssxJsPDF = () => import('jspdf').then(m => m.jsPDF || m.default);
// W-9: the PDF form filler ships with the site too, loaded only when a W-9 is made
window.ssxPdfLib = () => import('pdf-lib');

/* Fix: the check-mark animation on app messages watched the message box and added a new check mark every time the
   box changed, including when it added its own check mark, so it looped forever and froze the page right after
   "Saved", "Booking added", "Sent" or "Copied". Nothing is allowed to watch the message box now, and the check mark
   is added here once per message instead. */
(function safeToast() {
  const watch = MutationObserver.prototype.observe;
  MutationObserver.prototype.observe = function (target, options) {
    if (target && target.id === 'toast') return;
    return watch.call(this, target, options);
  };
  const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5 L6.5 12 L13 4.5"/></svg>';
  const hook = () => {
    const orig = window.toast; if (typeof orig !== 'function') return false; if (orig.__ssxSafe) return true;
    const safe = function (msg) {
      const out = orig.apply(this, arguments);
      try {
        const el = document.getElementById('toast');
        if (el && /saved|sent|added|copied/i.test(String(msg)) && !el.querySelector('.ssx-tick')) { const s = document.createElement('span'); s.className = 'ssx-tick'; s.style.cssText = 'display:inline-flex;margin-right:4px'; s.innerHTML = CHECK; el.insertBefore(s, el.firstChild); }
      } catch (_) {}
      return out;
    };
    safe.__ssxSafe = true; window.toast = safe; return true;
  };
  if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 200); setTimeout(() => clearInterval(t), 60000); }
})();

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

/* Nocturne brand: fonts, the Champagne theme (new default) and the S&S monogram in the top bar */
(function nocturne() {
  try {
    if (!document.getElementById('ss-brand-fonts')) {
      const l = document.createElement('link'); l.id = 'ss-brand-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Italiana&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter+Tight:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
  } catch (_) {}
  const champ = () => {
    if (typeof PALETTES === 'undefined' || typeof applyPalette !== 'function') return false;
    if (!PALETTES.some(p => p[0] === 'champagne')) PALETTES.unshift(['champagne', 'Champagne', ['#D4B26E', '#141711', '#EFE7D3']]);
    let saved = null; try { saved = localStorage.getItem('palette'); } catch (_) {}
    if (!saved || saved === 'champagne') applyPalette('champagne'); else if (typeof renderPalPick === 'function') renderPalPick();
    return true;
  };
  if (!champ()) { const t = setInterval(() => { if (champ()) clearInterval(t); }, 200); setTimeout(() => clearInterval(t), 20000); }
  const mono = () => { const b = document.querySelector('header.top .brand'); if (!b || b.querySelector('.ssx-mono')) return; const m = document.createElement('span'); m.className = 'ssx-mono'; m.setAttribute('aria-hidden', 'true'); m.textContent = 'S&S'; const av = b.querySelector('.avatar'); av ? av.after(m) : b.prepend(m); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mono) : mono();
  // the gold sound wave along the bottom of the sign-in page
  const wave = () => { const r = document.getElementById('ss-auth'); if (!r || !r.firstChild || r.querySelector('.ssx-wave')) return; const w = document.createElement('div'); w.className = 'ssx-wave'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = Array.from({ length: 96 }, (_, i) => `<i style="height:${Math.round(Math.min(96, 9 + Math.abs(Math.sin(i * .37) * 45 + Math.sin(i * .11) * 30 + Math.cos(i * 1.7) * 9)))}%;opacity:${(.35 + .65 * Math.abs(Math.sin(i * .21))).toFixed(2)}"></i>`).join(''); r.appendChild(w); };
  const watch = () => { const r = document.getElementById('ss-auth'); if (!r) return; wave(); new MutationObserver(wave).observe(r, { childList: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', watch) : watch();
})();

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
    speedUp(); submitGuard(); routeProfile(); hookFinance(); hookRequestView(); phoneFixes(); financeIcon();
    st.db = await window.claude.use('db');
    if (!st.db) return;
    hookAutopilot(); hookLayout(); hookEase(); hookForms(); hookNotes(); hookFlow();
    st.db.doc('settings/notify').onSnapshot(s => { st.prefs = s.exists ? s.data() : {}; render(); queueSoon(); }, () => {});
        st.db.doc('settings/profile').onSnapshot(() => setTimeout(() => fillProfile(), 0), () => {});
    st.db.doc('settings/bookinglink').onSnapshot(s => { st.link = s.exists ? s.data() : {}; render(); renderKit(); }, () => {});
    st.db.collection('goals').onSnapshot(s => { st.goals = s.docs.map(d => ({ id: d.id, ...d.data() })); renderGoals(); renderHomeGoals(); queueSoon(); }, () => {});
    let lastB = null; setInterval(() => { try { if (S.bookings !== lastB) { lastB = S.bookings; renderGoals(); renderHomeGoals(); renderRequests(); } } catch (_) {} }, 1000);
    setInterval(() => { try { syncAvail(); } catch (e) { console.error(e); } }, 2000);
    const homeSec = document.querySelector('section[data-view="home"]');
    if (homeSec) new MutationObserver(() => { if (!document.getElementById('ssx-home-goals')) renderHomeGoals(); }).observe(homeSec, { childList: true });
    st.db.doc('notify/status').onSnapshot(s => { st.status = s.exists ? s.data() : null; render(); }, () => {});
    perf('status').then(d => { st.server = d; render(); }).catch(() => { st.server = { error: true }; render(); });
    mount(); renderKit(); setupNav(); setupRail(); syncTop(); setTimeout(syncTop, 500);
    const setSec = document.querySelector('section[data-view="settings"]');
    new MutationObserver(() => { if ([...setSec.children].some(c => c.classList.contains('card') || c.classList.contains('ssx-host'))) organize(); }).observe(setSec, { childList: true });
    setTimeout(organize, 800); setTimeout(organize, 2500);
    const kitSec = document.querySelector('section[data-view="kit"]');
    if (kitSec) new MutationObserver(() => { if (!document.getElementById('ssx-kit')) renderKit(); }).observe(kitSec, { childList: true });

    setInterval(queueSoon, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) queueSoon(); });
    if (params.get('goto')) { goto(params); history.replaceState(null, '', location.pathname); }
    if (params.get('epk')) { history.replaceState(null, '', location.pathname); EPK.tab = true; openEPK(); }
    else offerTour();
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
    try { out.push(...apQueue()); } catch (_) {}
    try { flRepeat(out); } catch (_) {}
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
    for (const id of ['ssx-host-link', 'ssx-host-notify', 'ssx-host-tour']) { const h = document.createElement('div'); h.id = id; h.className = 'ssx-host'; sec.appendChild(h); }
    mountGoalsPage();
    render(); renderGoals(); renderTourCard(); organize();
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
        ${availHTML()}
        ${modeHTML()}
        <div class="ssx-grid2">
          <div class="f"><label for="ssx-notice">Minimum notice</label><select id="ssx-notice">${[1, 3, 7, 14, 21, 30, 60].map(n => `<option value="${n}">${n} day${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
          <div class="f"><label for="ssx-early">Earliest start</label><select id="ssx-early">${tOpts(L.earliest)}</select></div>
          <div class="f"><label for="ssx-late">Latest start</label><select id="ssx-late">${tOpts(L.latest)}</select></div>
        </div>
        <div class="f"><label>Booking length</label><span class="note">People pick a start and end time. Tap the shortest and longest you'll take (and any in between).</span><div class="ssx-chips" id="ssx-lens">${[30, 45, 60, 90, 120, 180, 240].map(n => `<button type="button" class="ssx-chip" data-ssx-len="${n}" aria-pressed="${L.lengths.includes(n)}">${n < 60 ? n + ' min' : n / 60 + ' hr'}</button>`).join('')}</div></div>
        <div class="f"><label>Dates you're not available</label>${blockCal(L)}          <span class="note">This is the same list as <b>Calendar → Block dates</b>. Shows, holds and Google Calendar plans close dates here on their own (shaded), using your Calendar → Availability settings. The days above match Availability too.</span>${closedList(L)}</div>
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
    const avr = $('#ssx-avrange'); if (avr) avr.onchange = () => { const r = avr.value, p2 = { range: r }; if (r === 'custom' && !AV().from) { const [x, y] = availRange(AV()); p2.from = x; p2.to = y; } putAvail(p2); };
    for (const k of ['from', 'to']) { const i = $('#ssx-av' + k); if (i) i.onchange = () => { if (i.value) putAvail({ [k]: i.value }); }; }
    box.querySelectorAll('[data-ssx-avbusy]').forEach(c => c.onchange = () => putAvail({ busy: { ...AV().busy, [c.dataset.ssxAvbusy]: c.checked } }));
    box.querySelectorAll('[data-ssx-avg]').forEach(b => b.onclick = e => { e.stopPropagation(); putAvail({ google: b.dataset.ssxAvg }); });
    const bm = $('#ssx-bmode'); if (bm) bm.onchange = () => saveLink({ mode: bm.value }, true);
    const bst = $('#ssx-bstep'); if (bst) bst.onchange = () => saveLink({ step: Number(bst.value) }, true);
    const bgp = $('#ssx-bgap'); if (bgp) bgp.onchange = () => saveLink({ gap: Number(bgp.value) }, true);
    box.querySelectorAll('[data-ssx-open]').forEach(b => b.onclick = e => { e.stopPropagation(); const d = b.dataset.ssxOpen, o = new Set((st.link || {}).open || []); o.has(d) ? o.delete(d) : o.add(d); saveLink({ open: [...o].filter(x => x >= todayStr()).sort() }, true); setTimeout(() => { try { syncAvail(true); render(); } catch (_) {} }, 60); });
    $('#ssx-early').onchange = e => saveLink({ earliest: e.target.value }, true);
    $('#ssx-late').onchange = e => saveLink({ latest: e.target.value }, true);
    box.querySelectorAll('[data-ssx-avday]').forEach(b => b.onclick = e => { e.stopPropagation(); const d = Number(b.dataset.ssxAvday), s = new Set(AV().days); s.has(d) ? s.delete(d) : s.add(d); if (!s.size) return note('link', 'Pick at least one day.', true); putAvail({ days: [...s].sort() }); });
    box.querySelectorAll('[data-ssx-len]').forEach(b => b.onclick = e => { e.stopPropagation(); const n = Number(b.dataset.ssxLen), s = new Set(L.lengths); s.has(n) ? s.delete(n) : s.add(n); if (!s.size) return note('link', 'Pick at least one set length.', true); saveLink({ lengths: [...s].sort((a, b) => a - b) }, true); });
    wireBlockCal(box, L);
    box.querySelectorAll('[data-ssx-unblock]').forEach(b => b.onclick = e => { e.stopPropagation(); saveLink({ blocked: (L.blocked || []).filter(d => d !== b.dataset.ssxUnblock) }, true); });
    wireLink(box, link, L, 'link');
  }

  /* ---------- "Dates you're not available": tap days to block them, or block a range */
  const BC = { month: null, range: false, from: '' };
  function blockCal(L) {
    const t0 = todayStr(), blocked = blockedDays(t0), auto = new Set((L.blocked || []).filter(d => d >= t0 && !blocked.has(d)));
    if (!BC.month) { const d = new Date(); BC.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    const y = BC.month.getFullYear(), mo = BC.month.getMonth(), first = new Date(y, mo, 1).getDay(), dim = new Date(y, mo + 1, 0).getDate();
    const now = new Date(), canPrev = y > now.getFullYear() || mo > now.getMonth();
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${pad(mo + 1)}-${pad(d)}`, past = ds < t0, on = blocked.has(ds), busy = !on && auto.has(ds), from = BC.range && BC.from === ds;
      cells += `<button type="button" class="ssx-bd${on ? ' on' : ''}${busy ? ' auto' : ''}${from ? ' from' : ''}" data-ssx-bd="${ds}" ${past || busy ? 'disabled' : ''} aria-pressed="${on}" aria-label="${niceDate(ds)}${on ? ', blocked' : busy ? ', closed by a show or calendar event' : ''}" ${busy ? `title="${esc(closedWhy(ds) || 'Closed by a show, hold or calendar event')}"` : ''}>${d}</button>`;
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
    const cur = () => blockedDays(todayStr());
    const put = set => { setBlocked(set).then(() => setTimeout(() => { render(); syncAvail(true); }, 500)); };
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

  /* ---------- One availability everywhere: Calendar → Availability and your booking link share the same
     days of the week and the same closed dates, so you only ever update one place. */
  const SY = { days: null, t: 0, migrating: false, blocksRef: null, t0: Date.now(), sig: '' };
/* -- Availability, simplified. One rule everywhere (booking link, Calendar, Settings, and later the venue side):
     you're bookable on your days and hours unless something is already on your calendar (a show or hold in the app,
     or a Google Calendar plan) or you blocked the date. These replace the older versions further down. */
  const avOn = () => { try { return AV().google !== 'ignore'; } catch (_) { return true; } };
  // Only one open copy of the app keeps the booking link's closed dates up to date at a time, so two tabs or devices
  // (or one still running an older version) can't keep overwriting each other.
  const AVW = { id: Math.random().toString(36).slice(2, 10), n: [], off: 0, open: false };
  function avMayWrite(L, force) {
    const now = Date.now(); if (now < AVW.off) return false;
    if (!force && L.calcBy && L.calcBy !== AVW.id && now - (Number(L.calcAt) || 0) < 45000) return false;
    AVW.n = AVW.n.filter(t => now - t < 60000); AVW.n.push(now);
    if (AVW.n.length > 6) { AVW.off = now + 120000; AVW.n = []; return false; } // something else keeps changing it back: step aside for 2 minutes
    return true;
  }
  document.addEventListener('toggle', e => { try { if (e.target.classList.contains('ssx-why')) AVW.open = e.target.open; } catch (_) {} }, true);
  const avMins = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  // counted on your calendar: confirmed, played and paid shows, holds, and a new request for its first 3 days
  const avHeld = b => b.source === 'booking-link' && !b.requestStatus && K(b.status) === 'lead' && b.createdAt && addDays(String(b.createdAt).slice(0, 10), 3) >= todayStr();
  const avShows = d => (S.bookings || []).filter(b => b.date === d && (['confirmed', 'pitched', 'played', 'paid'].includes(K(b.status)) || avHeld(b)));
  const avSpan = b => { const s0 = avMins(b.setStart); if (s0 == null) return [0, 1440]; let e = avMins(b.setEnd); e = e == null ? s0 + 120 : e <= s0 ? e + 1440 : e; return [s0, e]; };
  const avGSpan = (e, day) => { if (e.allDay || !e.start) return [0, 1440]; const sd = new Date(e.start), ed = new Date(e.end || e.start), md = x => x.getHours() * 60 + x.getMinutes(); return [ymd(sd) === day ? md(sd) : 0, ymd(ed) === day ? (md(ed) || 1440) : 1440]; };
  // everything on your calendar around a date, as [start, end, name] in minutes from that date's midnight
  function avBusyOn(d) {
    const iv = [], g = avOn();
    for (const [off, day] of [[-1440, addDays(d, -1)], [0, d], [1440, addDays(d, 1)]]) {
      for (const b of avShows(day)) { const [x, y] = avSpan(b); iv.push([off + x, off + y, bookingName(b)]); }
      if (g) for (const e of agOn(day)) { const [x, y] = avGSpan(e, day); iv.push([off + x, off + y, e.title || 'Google Calendar plan']); }
    }
    return iv;
  }
  // why a date is closed on the booking link (an empty list means it's open)
  function avWhy(d, bl) {
    const L = { ...defLink(), ...(st.link || {}) }, why = [], { from } = linkWindow();
    if (d < from) why.push('before your booking window starts');
    if ((bl || blockedDays(d)).has(d)) why.push('you blocked this date');
    if (avOn()) for (const e of agOn(d)) if (e.allDay) why.push(`Google Calendar: ${e.title || 'plan'} (all day)`);
    if (linkMode(L) === 'day' && !(L.open || []).includes(d)) for (const b of avShows(d)) why.push(`${avHeld(b) ? 'New request (held 3 days)' : kindName(K(b.status))}: ${bookingName(b)}`);
    if (why.length) return why;
    const E0 = avMins(L.earliest) ?? 1080, L0 = avMins(L.latest) ?? 1410, last = L0 < E0 ? L0 + 1440 : L0, step = Math.max(5, Number(L.step) || 30), gap = Math.max(0, Number(L.gap) || 0), len = Math.min(...(L.lengths && L.lengths.length ? L.lengths : [60])), iv = avBusyOn(d);
    if (!iv.length) return why;
    for (let t = E0; t <= last; t += step) if (!iv.some(([a, b]) => t < b + gap && t + len + gap > a)) return why;
    return ['no start time fits around ' + [...new Set(iv.filter(([a, b]) => b > E0 && a < last + len).map(x => x[2]))].slice(0, 3).join(', ')];
  }
  linkClosed = function () {
    const t0 = todayStr(), { a, to } = linkWindow(), bl = blockedDays(t0), out = [];
    if (!a) return [...bl].filter(d => d <= to).sort().slice(0, 400);
    for (let d = t0, i = 0; d <= to && i < 740; d = addDays(d, 1), i++) { if (!a.days.includes(new Date(d + 'T12:00:00').getDay())) continue; try { if (avWhy(d, bl).length) out.push(d); } catch (_) {} }
    return out.slice(0, 400);
  };
  // times the booking page works around: holds and Google plans (the server adds your confirmed shows itself)
  linkBusy = function (to) {
    const t0 = addDays(todayStr(), -1), out = {}, g = avOn(); let n = 0;
    for (let d = t0, i = 0; d <= to && i < 740 && n < 600; d = addDays(d, 1), i++) {
      const iv = [];
      for (const b of avShows(d)) if (!['confirmed', 'played', 'paid'].includes(K(b.status))) iv.push(avSpan(b));
      if (g) for (const e of agOn(d)) if (!e.allDay && e.start) iv.push(avGSpan(e, d));
      if (iv.length) { out[d] = iv.filter(([x, y]) => y > x).sort((x, y) => x[0] - y[0]); n += iv.length; }
    }
    return out;
  };
  closedWhy = d => { try { return avWhy(d).join(' · '); } catch (_) { return ''; } };
  closedList = function (L) {
    const t0 = todayStr(), list = (L.blocked || []).filter(d => d >= t0).slice(0, 40), opened = (L.open || []).filter(d => d >= t0), day = linkMode(L) === 'day';
    if (!list.length && !opened.length) return '';
    return `<details class="ssx-why"${AVW.open || opened.length ? ' open' : ''}><summary>Closed dates and why (${list.length})</summary>${Date.now() < AVW.off ? '<p class="note">Another open copy of Set &amp; Settled (another tab, or the app on another device) is also updating this list. Close or reload it so the two stop overwriting each other.</p>' : ''}<ul>${list.map(d => `<li><b>${esc(niceDate(d))}</b>: ${esc(closedWhy(d) || 'closed')}${day && avShows(d).length && !blockedDays(d).has(d) ? ` <button type="button" class="btn small" data-ssx-open="${d}">Open for another booking</button>` : ''}</li>`).join('')}</ul>
      ${opened.length ? `<span class="eyebrow">Open for another booking</span><ul>${opened.map(d => `<li><b>${esc(niceDate(d))}</b>: open at times that don't overlap what's already there <button type="button" class="btn small" data-ssx-open="${d}">Close again</button></li>`).join('')}</ul>` : ''}
      <span class="note">Add start and end times to your shows so only those hours are taken.</span></details>`;
  };
  function avGoogleNote() {
    try {
      if (typeof G === 'undefined' || !G.mcp) return "Google Calendar isn't connected yet. Connect it in Settings → Google and your plans will close those times on their own.";
      const ids = G.calIds && G.calIds.length ? G.calIds : ['primary'], names = ids.map(i => (G.calNames || {})[i] || (i === 'primary' ? 'your main calendar' : i)).join(', ');
      if (!AG.map) return `Checking ${names}…`;
      const n = new Set(Object.values(AG.map).flat().map(e => e.id)).size;
      return `Checking ${names}: ${n} plan${n === 1 ? '' : 's'} found through ${niceDate(linkWindow().to)}. Choose which calendars count in Settings → Google.`;
    } catch (_) { return ''; }
  }
  availHTML = function (sfx = '') {
    let a; try { a = AV(); } catch (_) { return ''; }
    let f = todayStr(), e = f; try { [f, e] = availRange(a); } catch (_) {}
    const L = { ...defLink(), ...(st.link || {}) }, m = linkMode(L), on = a.google !== 'ignore';
    return `<p class="note ssx-avrule">You're bookable on the days and hours you pick, unless you already have a show, a hold or a Google Calendar plan at that time, or you block the date.</p>
        <div class="f"><label>Days you take bookings</label><div class="ssx-chips">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<button type="button" class="ssx-chip" data-ssx-avday="${i}" aria-pressed="${a.days.includes(i)}">${d}</button>`).join('')}</div></div>
        <div class="f"><label for="ssx-avrange${sfx}">How far ahead</label><select id="ssx-avrange${sfx}">${AV_RANGES.map(([k, l]) => `<option value="${k}"${a.range === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          ${a.range === 'custom' ? `<div class="ssx-row"><input type="date" id="ssx-avfrom${sfx}" value="${f}" min="${todayStr()}" aria-label="From"><span class="note">to</span><input type="date" id="ssx-avto${sfx}" value="${e}" min="${todayStr()}" aria-label="To"></div>` : ''}</div>
        <div class="f"><label>Check my Google Calendar</label><div class="ssx-chips"><button type="button" class="ssx-chip" data-ssx-avg="any" aria-pressed="${on}">On</button><button type="button" class="ssx-chip" data-ssx-avg="ignore" aria-pressed="${!on}">Off</button></div>
          <span class="note">${on ? esc(avGoogleNote()) : 'Off: only your shows, holds and blocked dates count.'}</span></div>
        <div class="f"><label for="ssx-bmode${sfx}">If I already have a booking that day</label><select id="ssx-bmode${sfx}"><option value="day"${m === 'day' ? ' selected' : ''}>Close the whole day</option><option value="time"${m === 'time' ? ' selected' : ''}>Keep the rest of the day open</option></select>
          <span class="note">${m === 'time' ? 'People can still book times that don\'t overlap what you already have.' : 'You can still open a single date for another booking in the list of closed dates.'}</span></div>
        <div class="ssx-grid2"><div class="f"><label for="ssx-bstep${sfx}">Start times every</label><select id="ssx-bstep${sfx}">${[5, 10, 15, 30, 60].map(n => `<option value="${n}"${Number(L.step || 30) === n ? ' selected' : ''}>${n} min</option>`).join('')}</select></div><div class="f"><label for="ssx-bgap${sfx}">Gap between bookings</label><select id="ssx-bgap${sfx}">${[0, 10, 15, 30, 60].map(n => `<option value="${n}"${Number(L.gap || 0) === n ? ' selected' : ''}>${n ? n + ' min' : 'None'}</option>`).join('')}</select></div></div>`;
  };
  modeHTML = () => '';
  // Calendar → Edit availability shows these same controls
  const _ntAvailPanel = ntAvailPanel;
  ntAvailPanel = function () {
    _ntAvailPanel.apply(this, arguments);
    try {
      const p = document.getElementById('availPanel'); if (!p || p.hidden || p.querySelector(':scope > .ssx-avshared')) return;
      p.classList.add('ssx-avp'); p.querySelectorAll(':scope > .grp').forEach(g => { if (g.querySelector('[data-nt-bd]')) g.classList.add('ssx-keep'); });
      const box = document.createElement('div'); box.className = 'ssx-avshared ssx-keep ssx'; box.innerHTML = availHTML('-c'); p.prepend(box);
      const q = s => box.querySelector(s), later = () => setTimeout(() => { try { renderCalendar(); syncAvail(true); } catch (_) {} }, 80);
      box.querySelectorAll('[data-ssx-avday]').forEach(b => b.onclick = () => { const d = Number(b.dataset.ssxAvday), s = new Set(AV().days); s.has(d) ? s.delete(d) : s.add(d); if (s.size) putAvail({ days: [...s].sort() }); });
      const r = q('#ssx-avrange-c'); if (r) r.onchange = () => { const p2 = { range: r.value }; if (r.value === 'custom' && !AV().from) { const [x, y] = availRange(AV()); p2.from = x; p2.to = y; } putAvail(p2); };
      for (const k of ['from', 'to']) { const i = q('#ssx-av' + k + '-c'); if (i) i.onchange = () => { if (i.value) putAvail({ [k]: i.value }); }; }
      box.querySelectorAll('[data-ssx-avg]').forEach(b => b.onclick = () => putAvail({ google: b.dataset.ssxAvg }));
      const bm = q('#ssx-bmode-c'); if (bm) bm.onchange = () => { saveLink({ mode: bm.value }, true); later(); };
      const bs = q('#ssx-bstep-c'); if (bs) bs.onchange = () => { saveLink({ step: Number(bs.value) }, true); later(); };
      const bg = q('#ssx-bgap-c'); if (bg) bg.onchange = () => { saveLink({ gap: Number(bg.value) }, true); later(); };
    } catch (e) { console.error(e); }
  };
/* -- Booking requests, more automatic: each request shows how it fits (what else is on that day, how far it is, your
     history and last fee with them, and how long its time is held), and declining opens a kind reply with your booking link. */
  const REQ_HOLD = 3; // days a new request holds its time on your booking link
  function reqFit(b) {
    const out = [], t12 = t => { try { return time12(t); } catch (_) { return t; } };
    try {
      const mine = avSpan(b), hit = (x, y) => b.setStart ? x < mine[1] && y > mine[0] : true, clash = [];
      for (const o of S.bookings || []) { if (o.id === b.id || o.date !== b.date || !['confirmed', 'pitched', 'played', 'paid'].includes(K(o.status))) continue; const [x, y] = avSpan(o); clash.push(`${bookingName(o)}${o.setStart ? ` (${t12(o.setStart)}${o.setEnd ? ' – ' + t12(o.setEnd) : ''})` : ''}${hit(x, y) ? ', overlaps' : ''}`); }
      if (avOn()) for (const e of agOn(b.date)) { const [x, y] = avGSpan(e, b.date); if (e.allDay || hit(x, y)) clash.push(`Google Calendar: ${e.title || 'plan'}${e.allDay ? ' (all day)' : ', overlaps'}`); }
      out.push(clash.length ? `⚠️ Also that day: ${clash.slice(0, 3).join('; ')}` : '✓ Nothing else on your calendar at that time');
    } catch (_) {}
    try {
      const past = (S.bookings || []).filter(o => o.id !== b.id && K(o.status) !== 'lost' && ((b.promoterId && (o.promoterId === b.promoterId || o.contactPersonId === b.promoterId)) || (b.venueId && o.venueId === b.venueId))).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
      if (past.length) { const fee = past.find(o => +o.fee > 0); out.push(`You've worked together ${past.length} time${past.length === 1 ? '' : 's'}${fee ? `. Last fee: $${Number(fee.fee).toLocaleString('en-US')}` : ''}`); }
      else { const paid = (S.bookings || []).filter(o => +o.fee > 0 && ['played', 'paid'].includes(K(o.status))).sort((x, y) => String(y.date || '').localeCompare(String(x.date || ''))).slice(0, 9).map(o => +o.fee).sort((x, y) => x - y); if (paid.length >= 3) out.push(`New to you. Your usual fee lately: $${paid[Math.floor(paid.length / 2)].toLocaleString('en-US')}`); else out.push('New to you'); }
    } catch (_) {}
    try {
      const h = (apCfg().home || {}), g = b.geo;
      if (h.lat && g && g.lat) { const R = 3959, r = x => x * Math.PI / 180, dLa = r(g.lat - h.lat), dLo = r(g.lon - h.lon), q = Math.sin(dLa / 2) ** 2 + Math.cos(r(h.lat)) * Math.cos(r(g.lat)) * Math.sin(dLo / 2) ** 2, mi = Math.round(2 * R * Math.asin(Math.sqrt(q)) * 1.25); out.push(`About ${mi} mi from home`); }
    } catch (_) {}
    try { if (b.createdAt) { const until = addDays(String(b.createdAt).slice(0, 10), REQ_HOLD); out.push(until >= todayStr() ? `Holding this time on your booking link until ${niceDate(until)}` : 'No longer holding this time on your booking link'); } } catch (_) {}
    return out;
  }
  const _renderRequests = renderRequests;
  renderRequests = function () {
    _renderRequests.apply(this, arguments);
    try {
      document.querySelectorAll('#ssx-requests [data-req]').forEach(item => {
        if (item.querySelector('.ssx-reqfit')) return; const b = (S.bookings || []).find(x => x.id === item.dataset.req); if (!b) return;
        const ul = document.createElement('ul'); ul.className = 'ssx-reqfit'; ul.innerHTML = reqFit(b).map(x => `<li>${esc(x)}</li>`).join('');
        const row = item.querySelector('.ssx-row'); row ? row.before(ul) : item.appendChild(ul);
      });
    } catch (e) { console.error(e); }
  };
  const _decideRequest = decideRequest;
  decideRequest = async function (b, status) {
    const ok = await _decideRequest.apply(this, arguments);
    try {
      if (ok && status === 'lost') { const who = person(b.promoterId || b.venueId || b.contactPersonId), first = who ? String(cName(who) || '').split(' ')[0] : '', link = window.ssBookingLink ? window.ssBookingLink() : '';
        composeSheet({ booking: b.id, to: b.promoterId || b.venueId || '', subject: `About your booking request${b.date ? ' for ' + niceDate(b.date) : ''}`, body: `Hi ${first || 'there'},\n\nThank you for thinking of me for ${bName(b)}${b.date ? ' on ' + niceDate(b.date) : ''}. I'm not able to take this one, but I'd love to work together another time.${link ? `\n\nMy booking link always shows my open dates and times: ${link}` : ''}\n\nAll the best,\n${myName()}` }); }
    } catch (_) {}
    return ok;
  };  
  const _availCard = availCard;
  availCard = function () {
    _availCard.apply(this, arguments);
    try {
      if (typeof window.availBusy === 'function' && !window.availBusy.__ssxV3) { const f = ds => { try { return avWhy(ds).length > 0; } catch (_) { return false; } }; f.__ssxV3 = f.__ssxG = true; window.availBusy = f; }
      const sum = document.getElementById('availSummary'); if (!sum) return;
      let n = document.getElementById('ssx-avnote'); if (!n) { n = document.createElement('p'); n.id = 'ssx-avnote'; n.className = 'note'; n.style.margin = '0 0 8px'; sum.after(n); }
      const a = AV(), L = { ...defLink(), ...(st.link || {}) }, D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], days = a.days.length === 7 ? 'Every day' : a.days.map(i => D[i]).join(', ') || 'No days picked';
      const txt = `${days} · starts ${time12(L.earliest)} to ${time12(L.latest)} · through ${niceDate(linkWindow().to)}. Open unless you have a show, a hold${a.google !== 'ignore' ? ', a Google Calendar plan' : ''} or a blocked date.`;
      if (n.textContent !== txt) n.textContent = txt;
    } catch (_) {}
  };
  // How people book you: one booking a day, or by the time (several a day, to the minute). Services default to by the time.
  const linkMode = L => L && (L.mode === 'time' || L.mode === 'day') ? L.mode : (() => { try { return flArtist().group === 'service' ? 'time' : 'day'; } catch (_) { return 'day'; } })();
  // a day where people pick a start time around your other bookings (every day in "by the time", or a date you opened for another booking)
  const linkTimed = ds => { const L = st.link || {}; return linkMode(L) === 'time' || (Array.isArray(L.open) && L.open.includes(ds)); };
  function modeHTML() {
    const L = { ...defLink(), ...(st.link || {}) }, m = linkMode(L);
    return `<div class="f"><label for="ssx-bmode">How people book you</label><select id="ssx-bmode"><option value="day"${m === 'day' ? ' selected' : ''}>One booking a day</option><option value="time"${m === 'time' ? ' selected' : ''}>By the time (several a day)</option></select>
        ${m === 'time' ? `<div class="ssx-grid2"><div class="f"><label for="ssx-bstep">Start times every</label><select id="ssx-bstep">${[5, 10, 15, 30, 60].map(n => `<option value="${n}"${Number(L.step || 30) === n ? ' selected' : ''}>${n} min</option>`).join('')}</select></div><div class="f"><label for="ssx-bgap">Gap between bookings</label><select id="ssx-bgap">${[0, 10, 15, 30, 60].map(n => `<option value="${n}"${Number(L.gap || 0) === n ? ' selected' : ''}>${n ? n + ' min' : 'None'}</option>`).join('')}</select></div></div>` : ''}
        <span class="note">${m === 'time' ? 'A day stays open until it is full. People only see start times that fit around your other bookings, holds you count as busy, and Google Calendar plans.' : 'A day with a show closes. To take another booking that day, use "Open for another booking" in the list below.'}</span></div>`;
  }
  // busy times the booking page needs for timed days (holds and leads you count as busy, and Google plans); shows are added by the server
  function linkBusy(to) {
    const t0 = addDays(todayStr(), -1), out = {}, a = AV(), push = (d, x, y) => { if (d < t0 || d > to || !(y > x)) return; (out[d] = out[d] || []).push([Math.max(0, Math.round(x)), Math.min(2880, Math.round(y))]); };
    const mm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    for (const b of S.bookings || []) { const k = K(b.status); if (!['pitched', 'lead'].includes(k) || !a.busy[k] || !b.date) continue; const s0 = mm(b.setStart); if (s0 == null) { push(b.date, 0, 1440); continue; } let e = mm(b.setEnd); e = e == null ? s0 + 120 : e <= s0 ? e + 1440 : e; push(b.date, s0, e); }
    if (a.google !== 'ignore') for (let d = t0, i = 0; d <= to && i < 740; d = addDays(d, 1), i++) for (const e of agOn(d)) { if (e.allDay || !e.start) continue; const sd = new Date(e.start), ed = new Date(e.end || e.start), md = x => x.getHours() * 60 + x.getMinutes(); push(d, ymd(sd) === d ? md(sd) : 0, ymd(ed) === d ? (md(ed) || 1440) : 1440); }
    for (const d in out) out[d].sort((x, y) => x[0] - y[0]);
    return out;
  }
  // Calendar and the booking link share these rules (installed once app.js is ready)
  function availWraps() {
    try { if (!AV_RANGES.some(r => r[0] === '12m')) AV_RANGES.splice(AV_RANGES.length - 1, 0, ['12m', 'Next 12 months']); const _ar = window.availRange; if (typeof _ar === 'function' && !_ar.__ssx12) { window.availRange = function (a) { if (a && a.range === '12m') { const t = todayStr(); return [t, addDays(t, 364)]; } return _ar.apply(this, arguments); }; window.availRange.__ssx12 = true; } } catch (_) {}
    // Calendar's open dates leave out the days inside your minimum notice, the same as the booking link
    try { const _on = window.openNights; if (typeof _on === 'function' && !_on.__ssxN) { window.openNights = function () { const out = _on.apply(this, arguments); try { const n = Number((st.link || {}).notice) || 0; if (!n || !(st.link || {}).on) return out; const from = addDays(todayStr(), n); return out.filter(d => d >= from); } catch (_) { return out; } }; window.openNights.__ssxN = true; } } catch (_) {}
    // Calendar's open dates use the same Google check as the booking link (all months, not just the ones you've opened)
    try { const _ab = window.availBusy; if (typeof _ab === 'function' && !_ab.__ssxG) { window.availBusy = function (ds, a) { const A = a || AV(); if (linkTimed(ds)) return !!(A.busy.blocked && blockedDays(ds).has(ds)) || (A.google !== 'ignore' && agOn(ds).some(e => e.allDay)); if (_ab.call(this, ds, { ...A, google: 'ignore' })) return true; if (A.google === 'ignore') return false; const ev = agOn(ds); return A.google === 'any' ? ev.length > 0 : ev.some(e => e.allDay || e.endH >= 17 || e.startH >= 17); }; window.availBusy.__ssxG = true; } } catch (_) {}
  }
  // Settings → Booking link saves into the same availability as Calendar
  const putAvail = patch => { try { const next = { ...AV(), ...patch }; S.avail = next; st.db.doc('settings/availability').set(next).catch(() => note('link', "Couldn't save your availability. " + OFFLINE, true)); try { renderCalendar(); } catch (_) {} setTimeout(() => { try { render(); syncAvail(true); } catch (_) {} }, 60); } catch (_) {} };
  function availHTML() {
    let a; try { a = AV(); } catch (_) { return ''; }
    let f = todayStr(), e = f; try { [f, e] = availRange(a); } catch (_) {}
    const kn = k => { try { return kindName(k); } catch (_) { return k; } };
    const busyL = [['confirmed', `A ${kn('confirmed')} show`], ['pitched', `A ${kn('pitched')} show (on hold)`], ['lead', `A ${kn('lead')}`], ['played', `A show already ${kn('played')} or ${kn('paid')}`], ['blocked', 'Blocked dates']];
    return `<div class="f"><label>Days you take bookings</label><div class="ssx-chips" id="ssx-days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<button type="button" class="ssx-chip" data-ssx-avday="${i}" aria-pressed="${a.days.includes(i)}">${d}</button>`).join('')}</div></div>
        <div class="f"><label for="ssx-avrange">How far ahead</label><select id="ssx-avrange">${AV_RANGES.map(([k, l]) => `<option value="${k}"${a.range === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          ${a.range === 'custom' ? `<div class="ssx-row"><input type="date" id="ssx-avfrom" value="${f}" min="${todayStr()}" aria-label="From"><span class="note">to</span><input type="date" id="ssx-avto" value="${e}" min="${todayStr()}" aria-label="To"></div>` : ''}</div>
        <div class="f"><label>Not available if the day has</label><div class="ssx-avbusy">${busyL.map(([k, l]) => `<label class="ssx-check"><input type="checkbox" data-ssx-avbusy="${k}"${a.busy[k] ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
        <div class="f"><label>Google Calendar plans</label><div class="ssx-chips">${[['evening', 'Evening & all-day'], ['any', 'Any event'], ['ignore', 'Ignore']].map(([k, l]) => `<button type="button" class="ssx-chip" data-ssx-avg="${k}" aria-pressed="${a.google === k}">${l}</button>`).join('')}</div>
          <span class="note">These are the same settings as <b>Calendar → Edit availability</b>. Change them in either place and your booking link updates within a few seconds.</span></div>`;
  }
  const calBlocks = () => { try { return S.blocks || []; } catch (_) { return []; } };
  function blockedDays(from) {
    const out = new Set();
    for (const k of calBlocks()) { if (!k.date) continue; const z = k.endDate && k.endDate >= k.date ? k.endDate : k.date; let d = k.date < from ? from : k.date; for (let i = 0; d <= z && i < 800; d = addDays(d, 1), i++) out.add(d); }
    return out;
  }
  // make Calendar's blocked dates (from today on) exactly match `target`, trimming or splitting blocks as needed
  async function setBlocked(target) {
    if (!st.db) return; const t0 = todayStr(), cur = blockedDays(t0);
    const add = [...target].filter(d => d >= t0 && !cur.has(d)).sort(), del = new Set([...cur].filter(d => !target.has(d)));
    if (del.size) for (const k of calBlocks()) {
      if (!k.date) continue; const z = k.endDate && k.endDate >= k.date ? k.endDate : k.date; let hit = false;
      for (let d = k.date < t0 ? t0 : k.date; d <= z && !hit; d = addDays(d, 1)) hit = del.has(d);
      if (!hit) continue;
      const keep = []; let run = null;
      for (let d = k.date, i = 0; d <= z && i < 800; d = addDays(d, 1), i++) { if (d < t0 || !del.has(d)) { if (run && addDays(run[1], 1) === d) run[1] = d; else { run = [d, d]; keep.push(run); } } else run = null; }
      const { id, ...rest } = k; await st.db.collection('blocks').doc(id).delete().catch(() => {});
      for (const [a, b] of keep) await st.db.collection('blocks').add({ ...rest, date: a, endDate: b === a ? '' : b }).catch(() => {});
    }
    const runs = []; for (const d of add) { const l = runs[runs.length - 1]; if (l && addDays(l[1], 1) === d) l[1] = d; else runs.push([d, d]); }
    for (const [a, b] of runs) await st.db.collection('blocks').add({ label: 'Not available', date: a, endDate: b === a ? '' : b, createdAt: new Date().toISOString() }).catch(() => {});
  }
  // the booking window comes from Calendar → Edit availability ("How far ahead"), so both always match
  function linkWindow() { const t0 = todayStr(); let a = null, from = t0, to = addDays(t0, 180); try { a = AV(); [from, to] = availRange(a); } catch (_) {} return { a, from: from < t0 ? t0 : from, to }; }
  // Google Calendar plans for the whole window (the Calendar page only loads the months you look at)
  const AG = { map: null, at: 0, key: '', busy: false };
  async function availGoogle(to) {
    if (AG.busy) return;
    try {
      if (typeof G === 'undefined' || !G.mcp) return;
      const ids = G.calIds && G.calIds.length ? G.calIds : ['primary'], key = ids.join() + '|' + to;
      if (AG.key === key && Date.now() - AG.at < 10 * 60000) return;
      AG.busy = true; const map = {}; let ok = 0;
      for (const id of ids) { try { gIngest(await gFetchCal(id, todayStr(), to), (G.calNames || {})[id] || id, map); ok++; } catch (_) {} }
      AG.at = Date.now(); if (ok === ids.length || (ok && !AG.map)) { AG.map = map; AG.key = key; syncAvail(true); } // a check that misses a calendar keeps the last full list
    } catch (_) {} finally { AG.busy = false; }
  }
  const agOn = ds => { const own = new Set((S.bookings || []).map(b => b.gcal && b.gcal.eventId).filter(Boolean)), seen = new Set(), out = [];
    for (const e of [...((typeof G !== 'undefined' && G.byDate && G.byDate[ds]) || []), ...((AG.map && AG.map[ds]) || [])]) { if (seen.has(e.id) || own.has(e.id) || own.has(String(e.id).split('_')[0])) continue; seen.add(e.id); out.push(e); } return out; };
  // every date the public booking page should show as taken: the same rules as Calendar's open dates
  function linkClosed(L) {
    const t0 = todayStr(), { a, from, to } = linkWindow(), out = [];
    if (!a) return [...blockedDays(t0)].filter(d => d <= to).sort().slice(0, 400);
    const noG = { ...a, google: 'ignore' };
    for (let d = t0, i = 0; d <= to && i < 740; d = addDays(d, 1), i++) {
      if (!a.days.includes(new Date(d + 'T12:00:00').getDay())) continue; // closed anyway: not a day you take bookings
      const timed = linkTimed(d); let busy = d < from; try { busy = busy || availBusy(d, noG); } catch (_) {}
      if (!busy && !timed && a.google !== 'ignore') { const ev = agOn(d); busy = a.google === 'any' ? ev.length > 0 : ev.some(e => e.allDay || e.endH >= 17 || e.startH >= 17); }
      if (busy) out.push(d);
    }
    return out.slice(0, 400);
  }
  // why a date is closed on your booking link, in words
  function closedWhy(d) {
    const { a, from } = linkWindow(), why = []; if (!a) return '';
    if (d < from) why.push('before your "How far ahead" range');
    try { const on = typeof onDay === 'function' ? onDay(d) : (S.bookings || []).filter(b => b.date === d); for (const b of on) { const k = K(b.status); if (a.busy[k] ?? (k === 'paid' ? a.busy.played : false)) why.push(`${kindName(k)}: ${bookingName(b)}`); } } catch (_) {}
    if (a.busy.blocked && blockedDays(d).has(d)) why.push('blocked date');
    if (a.google !== 'ignore') for (const e of agOn(d)) if (a.google === 'any' || e.allDay || e.endH >= 17 || e.startH >= 17) why.push(`Google Calendar: ${e.title}${e.cal ? ' (' + e.cal + ')' : ''}${e.allDay ? ', all day' : ''}`);
    return why.join(' · ');
  }
  function closedList(L) {
    const t0 = todayStr(), list = (L.blocked || []).filter(d => d >= t0).slice(0, 40), opened = (L.open || []).filter(d => d >= t0), day = linkMode(L) === 'day';
    if (!list.length && !opened.length) return '';
    const hasShow = d => { try { const a = AV(); return (typeof onDay === 'function' ? onDay(d) : (S.bookings || []).filter(b => b.date === d)).some(b => { const k = K(b.status); return ['confirmed', 'played', 'paid'].includes(k) || a.busy[k]; }); } catch (_) { return false; } };
    return `<details class="ssx-why"${opened.length ? ' open' : ''}><summary>Why dates are closed on your booking link (${list.length})</summary><ul>${list.map(d => `<li><b>${esc(niceDate(d))}</b>: ${esc(closedWhy(d) || 'closed')}${day && hasShow(d) ? ` <button type="button" class="btn small" data-ssx-open="${d}">Open for another booking</button>` : ''}</li>`).join('')}</ul>
      ${opened.length ? `<span class="eyebrow">Open for another booking</span><ul>${opened.map(d => `<li><b>${esc(niceDate(d))}</b>: people can pick a start time that doesn't overlap your show <button type="button" class="btn small" data-ssx-open="${d}">Close again</button></li>`).join('')}</ul><span class="note">Add each show's set times so the link knows when you're free that day.</span>` : ''}
      <span class="note">To open a date: unblock it, open it for another booking, or set Google Calendar plans to Ignore (or remove the plan in Google).</span></details>`;
  }
  // Calendar → Availability: share your booking link instead of a long list of dates
  function availCard() {
    const btn = document.getElementById('copyAvail'), list = document.getElementById('openDates'); if (!btn) return;
    if (list && !list.hidden) list.hidden = true;
    const L = st.link || {}, url = L.on && L.slug ? `${location.origin}/?book=${encodeURIComponent(L.slug)}` : '', label = url ? 'Send my booking link' : 'Turn on my booking link';
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.onclick && btn.onclick.__ssx) return;
    const go = () => { const L2 = st.link || {}, u = L2.on && L2.slug ? `${location.origin}/?book=${encodeURIComponent(L2.slug)}` : '';
      if (!u) { try { curGroup = 'bookings'; localStorage.setItem('ss-setgroup', 'bookings'); } catch (_) {} window.setTab('settings'); return; }
      const msg = `Here's my booking link. It shows my open dates and times, and you can send a request right from it: ${u}`;
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ text: msg }).catch(() => {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).then(() => toast('Booking link copied. Paste it into your message.'), () => toast(u)); };
    go.__ssx = true; btn.onclick = go;
  }
  function syncAvail(force) {
    availWraps(); try { availCard(); } catch (_) {}
    if (!st.db || !st.link || Date.now() - SY.t0 < 4000) return;
    const L = { ...defLink(), ...st.link }; let av = null; try { av = S.avail; } catch (_) {}
    let blocksNow = null; try { blocksNow = S.blocks; } catch (_) {}
    if (blocksNow !== SY.blocksRef) { SY.blocksRef = blocksNow; try { render(); } catch (_) {} }
    // once: move the booking link's own blocked dates into Calendar → Block dates
    if (!L.calSync) { if (SY.migrating) return; SY.migrating = true; const t0 = todayStr(), mine = (L.blocked || []).filter(d => d >= t0);
      setBlocked(new Set([...blockedDays(t0), ...mine])).then(() => saveLink({ calSync: true }, true)).finally(() => { SY.migrating = false; }); return; }
    // one availability: Calendar → Edit availability is the saved list, and Settings edits that same list.
    // Once per account, an account that never picked a range in Calendar keeps its booking link's "Book up to".
    if (!L.availV2) { try { if (!av || !av.range) { const r = { 30: '30d', 90: '3m', 180: '6m', 365: '12m' }[Number(L.ahead)] || '6m'; S.avail = { ...AV(), range: r, ...(av && av.days && av.days.length ? {} : { days: [...(L.days && L.days.length ? L.days : AV().days)] }) }; st.db.doc('settings/availability').set(S.avail).catch(() => {}); } } catch (_) {} saveLink({ availV2: true }, true); return; }
    let a2 = null; try { a2 = AV(); } catch (_) {}
    if (a2) {
      const { to } = linkWindow(), ahead = Math.max(1, daysBetween(todayStr(), to));
      if ((L.days || []).join() !== a2.days.join() || Number(L.ahead) !== ahead) saveLink({ days: [...a2.days], ahead }, true);
      availGoogle(to);
      if (L.mode !== 'time' && L.mode !== 'day') saveLink({ mode: linkMode(L) }, true);
      const sig = JSON.stringify(a2) + '|' + AG.at; if (sig !== SY.sig) { const first = !SY.sig; SY.sig = sig; force = true; if (!first) { try { render(); } catch (_) {} } }
    }
    // closed dates on the public page
    const closed = linkClosed({ ...defLink(), ...st.link }), bz = linkBusy(linkWindow().to);
    if ((closed.join() !== (st.link.blocked || []).join() || JSON.stringify(bz) !== JSON.stringify(st.link.busy || {})) && (force || Date.now() - SY.t > 3000) && avMayWrite(st.link, force)) { SY.t = Date.now(); saveLink({ blocked: closed, busy: bz, calcBy: AVW.id, calcAt: Date.now() }, true); }
    // a reminder under Calendar → Availability
    const sum = document.getElementById('availSummary');
    if (sum && !document.getElementById('ssx-avnote')) { const n = document.createElement('p'); n.id = 'ssx-avnote'; n.className = 'note'; n.style.margin = '0 0 8px'; n.innerHTML = 'Your <b>booking link</b> uses these same days and closed dates automatically.'; sum.after(n); }
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
      if (ep) ep.hidden = true; // profile details now live right on the Profile page
      const place = {
        profile: [card('#kitAvatar'), profileCard()],
        google: [card('#ss-google'), card('#driveRoots'), card('#setCals')],
        bookings: [card('#defCl'), document.getElementById('ssx-host-link')],
        reminders: [document.getElementById('ssx-host-notify')],
        email: [card('#ss-signature'), card('#payList')],
        look: [look, card('#palPick'), card('#ss-motion-chk')],
        account: [document.getElementById('ssx-host-tour'), card('#ss-account'), card('[data-legal]')],
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

  /* ---------- Profile details, right on the Settings > Profile page (no pop-up) */
  const PF = [['djName', 'DJ name', 'text', 'name'], ['myName', 'Your name', 'text', 'name'], ['email', 'Booking email', 'email', 'email'], ['phone', 'Phone', 'tel', 'tel'], ['website', 'Website', 'url', 'url'], ['epk', 'EPK link', 'url', 'url'], ['instagram', 'Instagram', 'text', 'off']];
  const PS = { dirty: false };
  function profileCard() {
    let c = document.getElementById('ssx-profile');
    if (!c) { c = document.createElement('div'); c.id = 'ssx-profile'; c.className = 'card ssx'; fillProfile(c); }
    return c;
  }
  function fillProfile(c) {
    c = c || document.getElementById('ssx-profile'); if (!c || PS.dirty) return;
    if (c.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    let p = {}; try { p = S.profile || {}; } catch (_) {}
    let nav = []; try { nav = NAV; } catch (_) {} if (!nav.length) nav = [['google', 'Google Maps'], ['apple', 'Apple Maps']];
    c.innerHTML = `<div class="ssx-head"><div><h3>Profile details</h3><p class="note">Used in your emails, templates, invoices, Kit, EPK and booking page.</p></div></div>
      <div class="ssx-grid2">${PF.map(([k, l, t, ac]) => `<div class="f"><label for="ssx-pf-${k}">${l}</label><input id="ssx-pf-${k}" data-pf="${k}" type="${t}" autocomplete="${ac}" ${t === 'url' ? 'inputmode="url" autocapitalize="none" spellcheck="false"' : ''} ${t === 'email' ? 'autocapitalize="none" spellcheck="false"' : ''} maxlength="${t === 'url' ? 500 : 120}" value="${esc(p[k] || '')}"></div>`).join('')}
        <div class="f"><label for="ssx-pf-navApp">Directions open in</label><select id="ssx-pf-navApp" data-pf="navApp">${nav.map(([k, l]) => `<option value="${esc(k)}"${(p.navApp || 'google') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div class="ssx-row" style="justify-content:flex-end"><span class="note" data-pf-state style="margin-right:auto"></span><button type="button" class="btn" data-pf-undo hidden>Discard changes</button><button type="button" class="btn primary" data-pf-save disabled>Save</button></div>`;
    const st0 = c.querySelector('[data-pf-state]'), sv = c.querySelector('[data-pf-save]'), un = c.querySelector('[data-pf-undo]');
    if (PS.savedAt && Date.now() - PS.savedAt < 4000) st0.textContent = 'Saved ✓';
    const mark = () => { PS.dirty = true; sv.disabled = false; un.hidden = false; st0.textContent = 'Unsaved changes'; };
    c.querySelectorAll('[data-pf]').forEach(el => { el.addEventListener('input', mark); el.addEventListener('change', mark); el.addEventListener('keydown', e => { if (e.key === 'Enter' && el.tagName === 'INPUT') { e.preventDefault(); sv.click(); } }); });
    un.onclick = e => { e.stopPropagation(); PS.dirty = false; fillProfile(c); };
    sv.onclick = async e => {
      e.stopPropagation();
      const v = {}; c.querySelectorAll('[data-pf]').forEach(el => { v[el.dataset.pf] = el.value.trim(); });
      if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { st0.textContent = 'Check the booking email address.'; c.querySelector('[data-pf="email"]').focus(); return; }
      if (v.instagram) v.instagram = v.instagram.replace(/^@/, '');
      let cur = {}; try { cur = S.profile || {}; } catch (_) {}
      const ok = typeof window.save === 'function' ? await window.save('settings', 'profile', { ...cur, ...v }) : null;
      if (ok) { PS.dirty = false; PS.savedAt = Date.now(); try { S.profile = { ...cur, ...v }; } catch (_) {} fillProfile(c); if (window.toast) window.toast('Profile saved'); }
    };
  }
  // anything in the app that used to open the profile pop-up now brings you here
  const routeProfile = () => window.profileForm = () => { try { window.ssShowSettings('profile', 'ssx-profile'); setTimeout(() => { const f = document.querySelector('#ssx-profile input'); f && f.focus({ preventScroll: true }); }, 350); } catch (_) {} };
  // the season targets (shows and income) moved to Goals, in their own small form
  function seasonGoalsForm() {
    let p = {}; try { p = S.profile || {}; } catch (_) {}
    if (typeof sheet !== 'function') return;
    sheet(`<h3>Season targets</h3><p class="note" style="margin:0">How many shows and how much income you're aiming for this season.</p>
      <div class="frow"><div class="f"><label for="sg-y">Year</label><input id="sg-y" type="number" inputmode="numeric" value="${esc(p.goalYear || new Date().getFullYear())}"></div><div class="f"><label for="sg-s">Shows</label><input id="sg-s" type="number" inputmode="numeric" min="0" value="${esc(p.goalShows ?? '')}"></div><div class="f"><label for="sg-i">Income ($)</label><input id="sg-i" type="number" inputmode="decimal" min="0" value="${esc(p.goalIncome ?? '')}"></div></div>
      <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = () => close();
      root.querySelector('[data-save]').onclick = async () => {
        const n = id => { const x = root.querySelector(id).value; return x === '' ? '' : Number(x); };
        let cur = {}; try { cur = S.profile || {}; } catch (_) {}
        if (await window.save('settings', 'profile', { ...cur, goalYear: n('#sg-y') || new Date().getFullYear(), goalShows: n('#sg-s'), goalIncome: n('#sg-i') })) { close(); if (window.toast) window.toast('Saved'); }
      };
    });
  }
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
  /* ---------- Side menu runs down the left on every screen, and folds away with the menu button in the top bar */
  function setupRail() {
    const top = document.querySelector('header.top'), tabs = document.getElementById('tabs'); if (!top || !tabs || document.getElementById('ssx-railbtn')) return;
    const root = document.documentElement; root.classList.add('ssx-rail');
    let min = false; try { const v = localStorage.getItem('ss-rail-min'); min = v === null ? false : v === '1'; } catch (_) {}
    const b = document.createElement('button'); b.type = 'button'; b.id = 'ssx-railbtn'; b.className = 'iconbtn ssx-railbtn';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="ssx-rb-arrow" d="M15 10l-2 2 2 2"/></svg>';
    const apply = () => { root.classList.toggle('ssx-rail-min', min); b.setAttribute('aria-expanded', String(!min)); b.setAttribute('aria-label', min ? 'Show menu' : 'Hide menu'); b.title = min ? 'Show menu' : 'Hide menu'; tabs.querySelectorAll('button').forEach(x => { if (!x.title) x.title = x.textContent.trim(); }); };
    b.onclick = e => { e.stopPropagation(); min = !min; try { localStorage.setItem('ss-rail-min', min ? '1' : '0'); } catch (_) {} apply(); };
    const brand = top.querySelector('.brand'); brand ? brand.prepend(b) : top.prepend(b);
    apply();
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
  // steps in date order: soonest first, steps without a date after, finished steps last
  const stepSort = steps => steps.map((x, i) => [x, i]).sort((a, b) => (a[0].done ? 1 : 0) - (b[0].done ? 1 : 0) || String(a[0].due || '9999').localeCompare(String(b[0].due || '9999')) || a[1] - b[1]).map(p => p[0]);
  // even spacing from today to the goal date: fills the steps without a date; if every step has one, spaces them all out again
  const spreadDates = (steps, goalDue) => {
    const t0 = todayStr(), end = goalDue && goalDue > t0 ? goalDue : addDays(t0, 7 * steps.length);
    const open = steps.filter(x => !x.done), redo = open.some(x => !x.due) ? open.filter(x => !x.due) : open, total = Math.max(redo.length, daysBetween(t0, end));
    return stepSort(steps.map(x => { const i = redo.indexOf(x); return i < 0 ? x : { ...x, due: addDays(t0, Math.max(1, Math.round(total * (i + 1) / redo.length))) }; }));
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
  const goalsSorted = () => [...(st.goals || [])].sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || (measure(a).done ? 1 : 0) - (measure(b).done ? 1 : 0) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))); // soonest due first, finished goals last
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
  function renderGoals(force) {
    const host = document.getElementById('ssx-host-goals'); if (!host || !st.db) return;
    const ae = document.activeElement;
    if (!force && ae && host.contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /^(text|search|)$/.test(ae.type)))) { if (!ae.__ssxg) { ae.__ssxg = 1; ae.addEventListener('blur', () => setTimeout(() => { ae.__ssxg = 0; renderGoals(); }, 600), { once: true }); } return; }
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
      ${g.type === 'steps' ? `<div class="ssx-steps">${stepSort((g.steps || []).map((x, i) => ({ ...x, _i: i }))).map(x => { const i = x._i, late = !x.done && x.due && x.due < todayStr(); return `<label class="ssx-check ssx-stepchk${x.done ? ' done' : ''}"><input type="checkbox" data-ssx-gstep="${i}" ${x.done ? 'checked' : ''}> <span class="ssx-st-name">${esc(x.t)}</span>${x.due ? `<span class="ssx-due${late ? ' late' : ''}">${esc(x.done ? prettyDate(x.due) : stepWhen(x.due))}</span>` : ''}</label>`; }).join('')}</div>` : ''}
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
    const sea = q('[data-ssx-season]'); if (sea) sea.onclick = e => { e.stopPropagation(); seasonGoalsForm(); };
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
    const spr = q('[data-ssx-sspread]'); if (spr) spr.onclick = e => { e.stopPropagation(); readRows(); const st3 = GS.form.g.steps.filter(x => x.t.trim()); if (!st3.length) return note('goalform', 'Type at least one step first, then tap Fill in dates for me.', true); const had = st3.some(x => !x.done && !x.due); GS.form.g.steps = spreadDates(st3, GS.form.g.due); try { document.activeElement && document.activeElement.blur(); } catch (_) {} renderGoals(true); note('goalform', !had ? 'Every step had a date, so they\'re spaced out evenly again, soonest first.' : GS.form.g.due ? 'Dates filled in up to the goal date, soonest first. Change any of them.' : 'Dates filled in one week apart, soonest first. Add a goal date to fit them before it.'); };
    host.querySelectorAll('.ssx-st-d').forEach(d => d.onchange = () => { readRows(); GS.form.g.steps = stepSort(GS.form.g.steps); renderGoals(true); }); // picking a date moves the step into date order
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
        out.steps = stepSort((g.steps || []).map(x => ({ t: String(x.t || '').trim().slice(0, 120), due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '', done: !!x.done })).filter(x => x.t).slice(0, 30));
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

  /* ---------- First-time walkthrough: offered once to new performers, can be skipped, replay from Settings */
  const TOUR = [
    { title: 'Welcome to Set & Settled', body: 'Your home base as a performer: bookings, tasks, money, outreach, goals and your press kit in one place. This tour shows you around and helps you set up the basics. About 5 minutes.' },
    { tab: 'home', target: '#ssx-railbtn', title: 'Your menu', body: 'Every page lives in the menu: Home (with your Goals), your shows (with the Calendar), Tasks, People (with Messages & templates), Financials, Kit (with Media) and Settings. Tap this button to fold the menu away when you want more room, and tap it again to bring it back.' },
    { tab: 'home', target: '#ssx-search', title: 'Find anything', body: 'Search your shows, people, templates and money from here. On a computer, press / or Ctrl/Cmd+K from anywhere.' },
    { tab: 'home', target: '#ssx-upnext, #nextShow', title: 'Up next', body: 'Home keeps an eye on your shows for you. It suggests the next step, like sending an invoice, a thank-you, a follow-up on late payment or a note to book again. Your next show is here too.' },
    { tab: 'home', target: 'section[data-view="home"] .ssx-arrbar button', title: 'Arrange your pages', body: 'Move blocks up or down, or hide the ones you do not need. You can do this on Home, your shows list, the Calendar, Financials and Kit, and it follows you to every device.' },
    { tab: 'settings', group: 'bookings', target: '#ssx-link', title: 'Share when you are available', body: 'Turn on your booking link so promoters can pick an open date. It uses the same days and blocked dates as your Calendar, so you only update one place. Your shows and holds close their dates on their own.' },
    { tab: 'settings', group: 'look', target: '#palPick', title: 'Make it yours', body: 'Pick a color theme (Champagne is the default) and switch between Light and Dark. Your choice follows you on every device.' },
    { tab: 'goals', target: '#ssx-goals', title: 'Set your goals', body: 'Track followers, releases, shows and income. Some goals count themselves from your bookings, checklist goals can have a due date for every step, and your progress shows on Home.', action: ['Add a goal', () => { const b = document.querySelector('[data-ssx-gadd]'); b && b.click(); }] },
    { tab: 'settings', group: 'bookings', target: '#ssx-link', title: 'Share when you are available', body: 'Turn on your booking link so promoters can pick an open date. It uses the same days and blocked dates as your Calendar, so you only update one place. Shows and holds close their dates on their own.' },
    { tab: 'settings', group: 'google', target: '#ss-google', title: 'Connect Google', body: 'Connect Gmail to send emails and invoices from your own address, Drive to keep your files together and Calendar to see your shows. You choose what to connect.' },
    { tab: 'bookings', target: '[data-new="booking"]', title: 'Every show in one list', body: 'Switch between List and Calendar at the top. Add a show and move it from Lead to Confirmed, Played and Paid. Each stage adds its own checklist. Pick a venue you have played and the details fill in from last time. Your shows move to Played on their own, and Undo is there if you slip.' },
    { tab: 'bookings', target: '#ssx-bklink', title: 'Booking requests', body: 'Copy your booking link from here to send to promoters. Their requests show up on this page as Leads. Open one to Accept, Reply or Decline.' },
    { tab: 'bookings', target: '#bookingFilter', title: 'Notes on every show', body: 'Open any show and add a note right there: load-in, sound, who you spoke to, how the night went. Each note is dated, and it also appears on the venue and people connected to that show.' },
    { tab: 'calendar', target: '#cal', title: 'See your month', body: 'Tap Calendar in the switch at the top to see every show on one calendar, along with your Google Calendar plans. Tap an open day and choose Hold this date to save it for a venue or promoter.' },
    { tab: 'calendar', target: '#availEdit', title: 'Edit availability', body: 'Set the days you play and tap any date to block it. This is the same list as your booking link, so a change in one place shows up in the other.', action: ['Open Edit availability', () => { const b = document.getElementById('availEdit'), p = document.getElementById('availPanel'); if (b && p && p.hidden) b.click(); }] },
    { tab: 'tasks', target: '#newTask', title: 'Never miss a step', body: 'Contracts, deposits, promo posts and prep for your set, sorted by due date. Anything past its due date is marked overdue, and your reminders will nudge you to finish it.' },
    { tab: 'kit', target: '#ssx-kit', title: 'Your Kit', body: 'Bio, photos, mixes, socials and riders in one spot, with your booking link ready to copy. Copy your whole press info into an email in one tap.' },
    { tab: 'kit', target: '#ssx-hist', title: 'Your show history', body: 'Add the shows you played before Set & Settled, one at a time or with our template. Your history fills your EPK and stays out of your bookings and money.', action: ['Add past shows', () => nhImport()] },
    { tab: 'kit', target: '#ssx-epk-btn', title: 'Create an EPK', body: 'Turn your Kit and your shows into a designed press kit. Pick colors, Light or Dark, and which sections to include, move them around, edit any text, then download a PDF to send to venues.', action: ['Create my EPK', () => openEPK()] },
    { tab: 'contacts', target: '[data-new="contact"]', title: 'Your people', body: 'Promoters, venues, photographers and collaborators. Open anyone to keep notes, see your shows together and reach out with one tap. Tidy up People helps you connect or merge contacts when something looks doubled up.' },
    { tab: 'comms', target: '[data-new="template"]', title: 'Emails and templates', body: 'Open Messages & templates from the card at the top of People. Start from friendly templates for pitches, confirmations and thank-yous, or save your own. Fill-ins like the venue and date show as bubbles and complete themselves from any show. Minimize an email to keep it in the corner, then tap + to reopen it or × to discard it.' },
    { tab: 'money', target: '[data-new="expense"]', title: 'Financials', body: 'Log income and expenses, save receipts to your Drive, send invoices and see what you have earned this season.' },
    { tab: 'money', target: '#ssx-tax', title: 'Ready for taxes', body: 'See what to set aside from your profit, track estimated payments and keep a 1099 checklist. At tax time, download everything as one tax packet. This keeps your records organized, and it is not tax advice.' },
    { tab: 'money', target: '#ssx-miles', title: 'Mileage and repeating costs', body: 'Add your home address and the app can count the drive to each show for you. It asks you to check shows that are far from home. Below this, add costs that repeat, like subscriptions, so they log themselves.' },
    { tab: 'settings', group: 'email', target: '#ss-signature', title: 'Email signature and payments', body: 'Add your email signature and how you like to be paid, so every email and invoice goes out looking finished.' },
    { tab: 'settings', group: 'reminders', target: '#ssx-notify', title: 'Reminders', body: 'Choose phone and laptop alerts, a morning email digest, or both. Reminders come from your task and goal due dates.' },
    { title: "You're all set", body: 'That is the tour. You can take it again anytime from Settings, under Account. Have a great season!' }
  ];
  const TS = { i: -1, el: null, pill: null, onKey: null, onMove: null };
  const saveTour = data => st.db && st.db.doc('settings/tour').set({ ...data, at: new Date().toISOString() }).catch(() => {});
  // the key layout lives inline too, so the tour always appears in the right place
  const OVERLAY = 'position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  async function offerTour() {
    try {
      const d = await st.db.doc('settings/tour').get(); if (d.exists) return;
    } catch (_) { return; }
    setTimeout(() => {
      if (TS.el || document.querySelector('.sheet-bg, .notice-bg') || (document.getElementById('sheetRoot') || {}).innerHTML || new URLSearchParams(location.search).get('goto')) return;
      let name = ''; try { name = (S.profile && (S.profile.djName || S.profile.myName)) || ''; } catch (_) {}
      const box = document.createElement('div'); box.className = 'ssx-tour-offer'; box.style.cssText = OVERLAY + 'background:rgba(18,22,15,.55);';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ssx-to-h');
      box.innerHTML = `<div class="ssx-tour-card ssx-tour-center" style="position:relative;max-width:420px;width:100%"><div class="ssx-tour-mark" aria-hidden="true">✦</div><h3 id="ssx-to-h">Welcome${name ? ', ' + esc(name) : ''}!</h3>
        <p>Want a quick walk through Set & Settled? We'll help you set up your profile, goals, availability and Google, and show you the rest along the way.</p>
        <div class="ssx-tour-btns"><button type="button" class="btn primary" data-ssx-tgo>Show me around</button><button type="button" class="btn" data-ssx-tskip>Skip, I'll explore</button></div>
        <p class="note">You can take the tour anytime from Settings, under Account.</p></div>`;
      document.body.appendChild(box);
      const close = () => box.remove();
      box.querySelector('[data-ssx-tgo]').onclick = e => { e.stopPropagation(); close(); startTour(1); };
      box.querySelector('[data-ssx-tskip]').onclick = e => { e.stopPropagation(); close(); saveTour({ status: 'skipped' }); };
      box.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); saveTour({ status: 'skipped' }); } });
      box.querySelector('[data-ssx-tgo]').focus();
    }, 1500);
  }
  function startTour(i = 0) {
    endTour(true);
    TS.el = document.createElement('div'); TS.el.className = 'ssx-tour'; TS.el.setAttribute('role', 'dialog'); TS.el.setAttribute('aria-live', 'polite');
    document.body.append(TS.el);
    TS.onKey = e => { if (!TS.el) return; if (e.key === 'Escape') skipTour(); else if (e.key === 'ArrowRight') tourGo(TS.i + 1); else if (e.key === 'ArrowLeft' && TS.i > 0) tourGo(TS.i - 1); };
    TS.w = innerWidth; TS.onMove = () => { if (TS.w === innerWidth) return; TS.w = innerWidth; placeTour(); }; // phones fire resize while scrolling; only a real width change moves the card
    document.addEventListener('keydown', TS.onKey); addEventListener('resize', TS.onMove);
    tourGo(i);
  }
  function endTour(quiet) {
    if (TS.el) TS.el.remove(); if (TS.pill) TS.pill.remove();
    if (TS.onKey) document.removeEventListener('keydown', TS.onKey);
    if (TS.onMove) removeEventListener('resize', TS.onMove);
    TS.el = TS.pill = null; if (!quiet) TS.i = -1;
  }
  function skipTour() { saveTour({ status: 'skipped', step: TS.i }); endTour(); }
  function finishTour() { saveTour({ status: 'done' }); endTour(); try { window.goTab('home'); scrollTo(0, 0); } catch (_) {} }
  const tourTarget = () => { const q = TOUR[TS.i]; if (!q || !q.target) return null; return [...document.querySelectorAll(q.target)].find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null; };
  // close any open form so the tour can move to the next page
  const closeSheets = () => { try { if (typeof window.close === 'function' && String(window.close).includes('sheetRoot')) window.close(); else { const r = document.getElementById('sheetRoot'); if (r) r.innerHTML = ''; } } catch (_) {} };
  function tourGo(i) {
    if (i >= TOUR.length) return finishTour();
    TS.i = Math.max(0, i); const s = TOUR[TS.i];
    saveTour({ status: 'in_progress', step: TS.i });
    closeSheets(); if (EPK.el) closeEPK();
    try {
      if (s.tab === 'settings' && s.group) window.ssShowSettings(s.group);
      else if (s.tab) window.goTab(s.tab);
    } catch (_) {}
    const last = TS.i === TOUR.length - 1, first = TS.i === 0;
    TS.el.innerHTML = `<div class="ssx-tour-card">
      <div class="ssx-tour-top"><span class="eyebrow">${first || last ? 'Set & Settled' : `Step ${TS.i} of ${TOUR.length - 2}`}</span><button type="button" class="ssx-tour-x" data-ssx-tskip aria-label="Skip the tour">Skip tour</button></div>
      <h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>
      <div class="ssx-tour-dots" aria-hidden="true">${TOUR.map((_, k) => `<i class="${k === TS.i ? 'on' : k < TS.i ? 'past' : ''}"></i>`).join('')}</div>
      <div class="ssx-tour-btns">${first ? '' : '<button type="button" class="btn small" data-ssx-tback>Back</button>'}${s.action ? `<button type="button" class="btn small" data-ssx-tact>${esc(s.action[0])}</button>` : ''}<button type="button" class="btn primary small" data-ssx-tnext>${last ? 'Finish' : first ? "Let's go" : 'Next'}</button></div></div>`;
    const q = sel => TS.el.querySelector(sel);
    q('[data-ssx-tnext]').onclick = e => { e.stopPropagation(); tourGo(TS.i + 1); };
    const back = q('[data-ssx-tback]'); if (back) back.onclick = e => { e.stopPropagation(); tourGo(TS.i - 1); };
    q('[data-ssx-tskip]').onclick = e => { e.stopPropagation(); skipTour(); };
    const act = q('[data-ssx-tact]'); if (act) act.onclick = e => { e.stopPropagation(); pauseTour(s.action[1]); };
    placeTour(); TS.el.classList.remove('in');
    setTimeout(() => {
      if (!TS.el) return;
      const t = tourTarget();
      if (t) {
        const nav = s.tab === 'settings' && document.querySelector('section[data-view="settings"] .ssg-nav'), top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ss-top')) || 72) + (nav ? nav.offsetHeight : 0);
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo(0, Math.max(0, t.getBoundingClientRect().top + scrollY - top - 20));
        document.documentElement.style.scrollBehavior = '';
      } else scrollTo(0, 0);
      placeTour(); TS.el.classList.add('in'); const n = TS.el.querySelector('[data-ssx-tnext]'); n && n.focus({ preventScroll: true });
    }, 300);
  }
  // first and last cards sit in the middle of the window; the rest sit in the lower corner (phones: just above the tab bar)
  function placeTour() {
    if (!TS.el) return;
    const s = TOUR[TS.i] || {}, card = TS.el.querySelector('.ssx-tour-card'), phone = innerWidth < 700;
    if (!s.target) { TS.el.style.cssText = OVERLAY + 'z-index:301;background:rgba(18,22,15,.55);'; card.style.cssText = 'position:relative;width:100%;max-width:420px;'; return; }
    TS.el.style.cssText = 'position:fixed;z-index:301;inset:auto;';
    card.style.cssText = phone
      ? 'position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom, 0px));width:auto;max-height:calc(100vh - 140px);overflow:auto;'
      : 'position:fixed;right:24px;bottom:24px;width:360px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;';
  }
  // an action (like "Edit my profile") opens its form; the tour waits with a small "Continue tour" button
  function pauseTour(fn) {
    const i = TS.i; endTour(true); TS.i = i;
    setTimeout(() => { try { fn(); } catch (_) {} }, 60);
    TS.pill = document.createElement('div'); TS.pill.className = 'ssx-tour-pill';
    TS.pill.style.cssText = 'position:fixed;z-index:250;right:16px;bottom:' + (innerWidth >= 1024 ? '24px' : 'calc(16px + env(safe-area-inset-bottom, 0px))') + ';';
    TS.pill.innerHTML = '<button type="button" class="btn primary small" data-ssx-tresume>Continue tour →</button><button type="button" class="ssx-tour-x" data-ssx-tend aria-label="End the tour">×</button>';
    document.body.appendChild(TS.pill);
    TS.pill.querySelector('[data-ssx-tresume]').onclick = e => { e.stopPropagation(); const k = TS.i; TS.pill.remove(); TS.pill = null; startTour(k + 1); };
    TS.pill.querySelector('[data-ssx-tend]').onclick = e => { e.stopPropagation(); TS.pill.remove(); TS.pill = null; saveTour({ status: 'skipped', step: i }); };
  }
  window.ssStartTour = () => startTour(0);
  function renderTourCard() {
    const host = document.getElementById('ssx-host-tour'); if (!host || host.firstChild) return;
    host.innerHTML = `<div class="card ssx" id="ssx-tourcard"><div class="ssx-head"><div><h3>App tour</h3><p class="note">A 5-minute walk through everything Set & Settled can do, and help setting up the basics.</p></div></div><div class="ssx-row"><button type="button" class="btn primary small" data-ssx-treplay>Take the tour</button></div></div>`;
    host.querySelector('[data-ssx-treplay]').onclick = e => { e.stopPropagation(); scrollTo(0, 0); startTour(0); };
  }

  /* ---------- Receipts and the tax packet.
     Receipts: attach a photo or PDF to any expense. It's saved to your own Google Drive at Business / <year> / Receipts,
     named "date – what – amount – category" so it sorts and reads well at tax time, and linked to the expense.
     Tax packet: one download with the tax summary, every transaction, a receipts index, every receipt and invoice file,
     and a checklist for your preparer. Google access stays at drive.file: the app only ever opens files it created
     or folders you picked, and the short-lived Google token is used in memory only for the download, never stored. */
  const RC = { file: null, remove: false };
  const money2 = n => (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const safeName = s => String(s || '').replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const expOf = id => { try { return (S.expenses || []).find(x => x.id === id) || null; } catch (_) { return null; } };
  const catLabel = k => { try { const c = (ECATS || []).find(x => x[0] === k); return c ? c[1] : (k || 'Other'); } catch (_) { return k || 'Other'; } };
  const extOf = (file) => { const m = /\.([a-z0-9]{2,5})$/i.exec(file.name || ''); if (m) return m[1].toLowerCase(); return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }[file.type] || 'jpg'; };
  // phone photos are big: shrink them before upload (keeps receipts readable, uploads fast)
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 1.2e6 || typeof createImageBitmap !== 'function') return file;
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      return out && out.size < file.size ? new File([out], (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch (_) { return file; }
  }
  async function receiptsFolder(mcp, yr) {
    let root = rootOf('biz');
    if (!root) { await new Promise(res => rootPicker('biz', res, res)); root = rootOf('biz'); if (!root) throw { code: 'quiet' }; }
    if (!(await folderAlive(mcp, root.id))) { if (!(await askRecreate('biz', 'root', {}))) throw { code: 'quiet' }; root = await replaceRoot(mcp, 'biz'); }
    const yc = { ...((S.drive || {}).years_biz || {}) }; let yid = yc[yr];
    if (!yid || !(await folderAlive(mcp, yid))) { yid = (await findOrMakeFolder(mcp, yr, root.id)).id; yc[yr] = yid; S.drive = { ...S.drive, years_biz: yc }; await window.save('settings', 'drive', S.drive); }
    const rc = { ...((S.drive || {}).receipts || {}) }; let rid = rc[yr];
    if (!rid || !(await folderAlive(mcp, rid))) { rid = (await findOrMakeFolder(mcp, 'Receipts', yid)).id; rc[yr] = rid; S.drive = { ...S.drive, receipts: rc }; await window.save('settings', 'drive', S.drive); }
    return { id: rid, yearId: yid };
  }
  async function uploadReceipt(id, x, file) {
    if (window.toast) window.toast('Saving your receipt to Google Drive…');
    let mcp = null; try { mcp = await driveReady(); } catch (_) {}
    if (!mcp) { if (window.toast) window.toast('Receipt not saved. Connect Google Drive in Settings, then add it from the expense.'); return; }
    try {
      const yr = String(x.date || todayStr()).slice(0, 4), folder = await receiptsFolder(mcp, yr), blob = await shrink(file);
      const name = `${x.date || todayStr()} – ${safeName(x.desc) || 'Expense'} – ${money2(x.amount)} – ${safeName(catLabel(x.category))}.${extOf(blob)}`;
      const f = await driveUpload(mcp, folder.id, name, blob.type || 'application/octet-stream', await b64of(blob));
      await window.patch('expenses', id, { receipt: { id: f.id, url: f.viewUrl || `https://drive.google.com/file/d/${f.id}/view`, name, type: blob.type || '', size: blob.size, at: new Date().toISOString() } });
      if (window.toast) window.toast('Receipt saved to Drive');
    } catch (e) { if (!e || e.code !== 'quiet') { try { driveErr(e); } catch (_) { if (window.toast) window.toast("Couldn't save the receipt. Open the expense to try again."); } } }
  }
  function receiptUI(e) {
    const sh = document.querySelector('#sheetRoot .sheet'); if (!sh || !sh.querySelector('#e-desc')) return;
    const line = sh.querySelector('#e-line'); const box = document.createElement('div'); box.className = 'f ssx-rcpt';
    const yr = String(e.date || todayStr()).slice(0, 4);
    const draw = () => {
      const r = !RC.remove && e.receipt;
      box.innerHTML = `<label>Receipt <span class="note" style="text-transform:none;letter-spacing:0">(photo or PDF)</span></label>
        <div class="ssx-row">${RC.file ? `<span class="ssx-pill on">📎 ${esc(RC.file.name || 'Receipt')}</span><button type="button" class="btn small" data-rc-pick>Change</button><button type="button" class="btn small" data-rc-clear>Remove</button>`
          : r ? `<a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener">View receipt</a><button type="button" class="btn small" data-rc-pick>Replace</button><button type="button" class="btn small" data-rc-unlink>Remove</button>`
          : `<button type="button" class="btn small" data-rc-pick>📎 Add receipt</button>${RC.remove ? '<span class="note">Will be removed from this expense when you save. The file stays in your Drive.</span>' : ''}`}</div>
        <p class="note" style="margin:0">${RC.file ? `Saves to Business / ${esc(yr)} / Receipts in your Google Drive when you tap ${e.id ? 'Save' : 'Log it'}.` : r ? `In Business / ${esc(yr)} / Receipts in your Google Drive.` : 'Snap a photo or pick a file. Keep receipts for anything you deduct, especially $75 and up.'}</p>`;
      const pick = box.querySelector('[data-rc-pick]'); if (pick) pick.onclick = async ev => {
        ev.stopPropagation();
        const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.style.display = 'none'; document.body.appendChild(i);
        i.onchange = () => { const f = i.files && i.files[0]; i.remove(); if (!f) return; if (f.size > 15e6) { if (window.toast) window.toast('That file is over 15 MB. Try a photo or a smaller PDF.'); return; } RC.file = f; RC.remove = false; draw(); };
        i.click();
      };
      const clr = box.querySelector('[data-rc-clear]'); if (clr) clr.onclick = ev => { ev.stopPropagation(); RC.file = null; draw(); };
      const un = box.querySelector('[data-rc-unlink]'); if (un) un.onclick = ev => { ev.stopPropagation(); RC.remove = true; draw(); };
    };
    draw(); line ? line.before(box) : sh.querySelector('.actions').before(box);
  }
  function hookFinance() {
    if (window.__ssxFin) return; window.__ssxFin = true;
    // the expense form gets a Receipt field
    const ef = window.expenseForm;
    if (typeof ef === 'function') window.expenseForm = function (e = {}) { RC.file = null; RC.remove = false; const out = ef.apply(this, arguments); try { receiptUI(e || {}); } catch (err) { console.error(err); } return out; };
    // when the expense form saves, keep (or remove) the receipt link, then upload a newly picked receipt
    const sv = window.save;
    if (typeof sv === 'function') window.save = async function (col, id, data) {
      if (col === 'expenses' && data && typeof data === 'object' && document.getElementById('e-desc')) {
        if (RC.remove) delete data.receipt;
        const file = RC.file, meta = { ...data }; RC.file = null; RC.remove = false;
        const out = await sv.apply(this, arguments);
        if (out && file) uploadReceipt(out, meta, file);
        return out;
      }
      return sv.apply(this, arguments);
    };
    // a paperclip on expenses that have a receipt in Financials
    const rm = window.renderMoney;
    if (typeof rm === 'function') window.renderMoney = function () {
      const out = rm.apply(this, arguments);
      try { document.querySelectorAll('#txList [data-open-expense]').forEach(row => { const x = expOf(row.dataset.openExpense); const t = row.querySelector('.t'); if (!t || t.querySelector('.ssx-clip')) return; const s = document.createElement('span'); s.className = 'ssx-clip' + (x && x.receipt ? '' : ' none'); s.textContent = x && x.receipt ? ' 📎' : ' · no receipt'; s.title = x && x.receipt ? 'Receipt saved' : 'No receipt yet'; t.appendChild(s); }); } catch (_) {}
      return out;
    };
    // the tax report lists missing receipts too
    const td = window.taxData;
    if (typeof td === 'function') window.taxData = function () {
      const d = td.apply(this, arguments);
      try {
        const miss = d.ex.filter(t => !(expOf(t.ref && t.ref.expense) || {}).receipt);
        const big = miss.filter(t => t.amount >= 75 || t.catKey === 'Travel');
        d.missing = miss; d.gaps = [...big.map(t => `${t.title} (${fmtD(t.date)}, ${money2(t.amount)}): no receipt attached`), ...miss.filter(t => !big.includes(t)).map(t => `${t.title} (${fmtD(t.date)}, ${money2(t.amount)}): no receipt (under $75, a bank or card statement line is usually enough)`), ...d.gaps];
      } catch (_) {}
      return d;
    };
    // the tax report gets a "Tax packet" section
    const ts = window.taxSheet;
    if (typeof ts === 'function') window.taxSheet = function () {
      const out = ts.apply(this, arguments);
      try {
        const sh = document.querySelector('#sheetRoot .sheet'), act = sh && sh.querySelector('.actions'); if (!act || sh.querySelector('.ssx-pack')) return out;
        const box = document.createElement('div'); box.className = 'ssx-pack';
        box.innerHTML = `<div><b>Tax packet</b><p class="note" style="margin:2px 0 0">One download for your tax preparer: this summary, every transaction, a receipts index, all your receipt and invoice files, and a checklist of what to bring.</p></div>
          <div class="ssx-row"><button type="button" class="btn primary" data-pack-zip>Download tax packet (.zip)</button><button type="button" class="btn" data-pack-drive>Save summary to Google Drive</button></div><p class="note" data-pack-status style="margin:0"></p>`;
        act.before(box);
        const status = t => { const p = box.querySelector('[data-pack-status]'); if (p) p.textContent = t; };
        box.querySelector('[data-pack-zip]').onclick = async ev => { const b = ev.currentTarget; b.disabled = true; try { await packetZip(status); } finally { if (b.isConnected) b.disabled = false; } };
        box.querySelector('[data-pack-drive]').onclick = async ev => { const b = ev.currentTarget; b.disabled = true; try { await packetToDrive(status); } finally { if (b.isConnected) b.disabled = false; } };
      } catch (err) { console.error(err); }
      return out;
    };
  }

  /* -- what goes in the packet */
  function packetParts() {
    const R = finRange(), d = window.taxData(R), slug = R.year ? String(R.year) : `${R.from}_to_${R.to}`;
    const p = (() => { try { return S.profile || {}; } catch (_) { return {}; } })();
    const exps = d.ex.map(t => ({ t, x: expOf(t.ref && t.ref.expense) || {} }));
    const bookings = (() => { try { return S.bookings || []; } catch (_) { return []; } })();
    const invs = d.inc.filter(t => t.ref && t.ref.booking).map(t => ({ t, b: bookings.find(b => b.id === t.ref.booking) || {} })).filter(o => o.b.invoice && o.b.invoice.fileId);
    const owedInvs = (d.owed || []).filter(t => t.ref && t.ref.booking).map(t => ({ t, b: bookings.find(b => b.id === t.ref.booking) || {} })).filter(o => o.b.invoice && o.b.invoice.fileId);
    const nec = R.year && R.year >= 2026 ? 2000 : 600;
    const payers1099 = d.byPayer.filter(([, v]) => v.amt >= nec);
    const idx = [['Date', 'Description', 'Category', 'Schedule C line', 'Amount', 'Business purpose', 'Receipt file in this packet', 'Receipt in Google Drive']];
    exps.sort((a, b) => String(a.t.date).localeCompare(String(b.t.date))).forEach(({ t, x }) => idx.push([t.date, t.title, t.cat, catLine(t.catKey), t.amount.toFixed(2), t.purpose || '', x.receipt ? 'Receipts/' + safeName(x.receipt.name).slice(0, 120) : 'MISSING', x.receipt ? x.receipt.url : '']));
    const csv = rows => rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\r\n');
    const L = [];
    L.push(`TAX PACKET · ${R.year ? 'Tax year ' + R.year : R.label}`, `${p.myName || ''}${p.djName ? ' (' + p.djName + ')' : ''}`, `Made ${todayStr()} with Set & Settled. Covers ${R.from} to ${R.to}. Cash basis: income counts on the day it was received.`, '');
    L.push('WHAT IS IN THIS PACKET', '  01 Tax summary (open in a browser, print or save as PDF): totals by Schedule C line, income by payer, expenses by category.', '  02 Transactions.csv: every income and expense line (opens in Excel or Google Sheets).', '  03 Receipts index.csv: every expense with its receipt file and Google Drive link.', '  05 Mileage log.csv: your business trips (when you logged any).', '  Receipts/ and Invoices/: the files themselves.', '');
    L.push('TOTALS', `  Gross receipts (income received): ${money2(d.gross)}`, `  Expenses: ${money2(d.total)}`, `  Net profit: ${money2(d.net)}`);
    if (d.meals) L.push(`  Meals are usually 50% deductible: counting half (${money2(d.mealsAdj)}) gives a net of ${money2(d.netAdj)}.`);
    if (d.owedAmt) L.push(`  Not yet paid at the end of the period (not counted above): ${money2(d.owedAmt)}`);
    L.push('', 'FORMS 1099 YOU MAY RECEIVE', `  Payers who paid you ${money2(nec)} or more ${R.year ? 'in ' + R.year : 'in this period'} may send a 1099-NEC:`);
    if (payers1099.length) payers1099.forEach(([n, v]) => L.push(`    - ${n}: ${money2(v.amt)}`)); else L.push('    - none at that amount');
    L.push('  Payment apps (PayPal, Venmo business accounts, card processors) send a 1099-K only above $20,000 and 200 payments in a year.', '  All of your income is taxable whether or not a 1099 arrives. Check every 1099 you get against the income list in the summary.', '');
    L.push('BEFORE YOU FILE: FILL THESE IN');
    const miss = d.missing || [], noPurpose = d.ex.filter(t => !t.purpose);
    if (!miss.length && !noPurpose.length) L.push('  Nothing missing in the app. Nice.');
    if (miss.length) { L.push(`  ${miss.length} expense${miss.length === 1 ? '' : 's'} without a receipt:`); miss.slice(0, 40).forEach(t => L.push(`    - ${t.date} ${t.title} ${money2(t.amount)}${t.amount >= 75 ? '  (IRS expects a receipt at $75 and up for travel, meals and gifts; keep one for gear too)' : ''}`)); }
    if (noPurpose.length) { L.push(`  ${noPurpose.length} expense${noPurpose.length === 1 ? '' : 's'} without a business purpose noted:`); noPurpose.slice(0, 40).forEach(t => L.push(`    - ${t.date} ${t.title} ${money2(t.amount)}`)); }
    try { L.push(...apPacket(R).lines); } catch (_) {}
    L.push('', 'BRING THESE TOO (the app does not track them)', '  - Home studio or office: square footage of the space used only for work, and of the whole home.', '  - Phone and internet: rough percentage used for work.', '  - Health insurance premiums you paid yourself, and retirement contributions (SEP-IRA, Solo 401(k)).', '  - Big gear purchases: your preparer can deduct them all this year or spread them out (depreciation / Section 179).', '  - Any W-2 jobs and other 1099s.', '');
    L.push('KEEPING RECORDS', '  The IRS generally asks you to keep records and receipts for 3 years after you file; many preparers suggest 7. Your receipts stay in Google Drive under Business / <year> / Receipts.', '');
    L.push('This packet organizes your records; it is not tax advice. Line numbers refer to the federal IRS Schedule C. Most states start from the same federal figures and then adjust some items on their own return.');
    return { R, d, slug, exps, invs: [...invs, ...owedInvs], idxCsv: csv(idx), readme: L.join('\r\n'), summary: taxHtml(d), txCsv: taxCsv(d) };
  }
  const catLine = k => { try { const c = (ECATS || []).find(x => x[0] === k); return c ? c[2] : 'Line 27a Other expenses'; } catch (_) { return ''; } };

  /* -- a plain .zip (no compression), made in the browser */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(files) {
    const parts = [], central = [], enc = new TextEncoder(), now = new Date(); let off = 0;
    const tm = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, dt = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, tm, 2], [12, dt, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, tm, 2], [14, dt, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
      parts.push(new Uint8Array(h.buffer), name, data); central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  async function driveBytes(token, id) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('drive ' + r.status); return new Uint8Array(await r.arrayBuffer());
  }
  async function packetZip(status) {
    const P = packetParts(), enc = new TextEncoder(), files = [], used = new Set(), problems = [];
    const add = (name, data) => { let n = name, i = 2; while (used.has(n)) n = name.replace(/(\.[^./]+)?$/, ` (${i++})$1`); used.add(n); files.push({ name: n, data }); };
    add(`Tax packet ${P.slug}/00 Read me first.txt`, enc.encode(P.readme));
    add(`Tax packet ${P.slug}/01 Tax summary.html`, enc.encode(P.summary));
    add(`Tax packet ${P.slug}/02 Transactions.csv`, enc.encode(P.txCsv));
    add(`Tax packet ${P.slug}/03 Receipts index.csv`, enc.encode(P.idxCsv));
    try { const M = apPacket(P.R); if (M.mileCsv.includes('\n')) add(`Tax packet ${P.slug}/05 Mileage log.csv`, enc.encode(M.mileCsv)); } catch (_) {}
    const want = [...P.exps.filter(o => o.x.receipt && o.x.receipt.id).map(o => ({ id: o.x.receipt.id, name: `Receipts/${safeName(o.x.receipt.name).slice(0, 120) || o.x.receipt.id}`, what: o.t.title })),
      ...P.invs.map(o => ({ id: o.b.invoice.fileId, name: `Invoices/${safeName(o.b.invoice.fileName || (o.t.title + ' invoice')).replace(/(\.pdf)?$/i, '.pdf')}`, what: o.t.title + ' invoice' }))];
    if (want.length) {
      status(`Getting ${want.length} file${want.length === 1 ? '' : 's'} from your Google Drive…`);
      let token = ''; try { const mcp = await driveReady(); if (mcp) token = ((await mcp.callTool(GD, 'picker_token', {})).payload || {}).token || ''; } catch (_) {}
      if (!token) problems.push('Google Drive is not connected, so receipt and invoice files are not included. The Receipts index has their Drive links.');
      else for (let i = 0; i < want.length; i++) {
        status(`Getting files from Google Drive… ${i + 1} of ${want.length}`);
        try { add(`Tax packet ${P.slug}/${want[i].name}`, await driveBytes(token, want[i].id)); } catch (_) { problems.push(`Could not get: ${want[i].what} (it may have been moved or deleted in Drive)`); }
      }
      token = '';
    }
    if (problems.length) add(`Tax packet ${P.slug}/04 Files that could not be added.txt`, enc.encode(problems.join('\r\n')));
    status('Making the .zip…');
    const blob = makeZip(files), dl = await claude.use('downloads');
    if (!dl) { status("Downloads aren't available right now."); return; }
    await dl.save({ filename: `Tax packet ${P.slug}.zip`, data: blob });
    status(`Done: ${files.length} files${problems.length ? `, ${problems.length} could not be added (see the note inside)` : ''}.`);
    if (window.toast) window.toast('Tax packet saved');
  }
  async function packetToDrive(status) {
    const P = packetParts(); let mcp = null; try { mcp = await driveReady(); } catch (_) {}
    if (!mcp) { status('Connect Google Drive in Settings → Google account first.'); return; }
    try {
      status('Saving to Google Drive…');
      const yr = P.R.year ? String(P.R.year) : P.R.to.slice(0, 4), base = await receiptsFolder(mcp, yr), folder = await findOrMakeFolder(mcp, `Tax packet ${P.slug}`, base.yearId);
      const b64 = s => btoa(unescape(encodeURIComponent(s)));
      for (const [n, m, c] of [['00 Read me first.txt', 'text/plain', P.readme], ['01 Tax summary.html', 'text/html', P.summary], ['02 Transactions.csv', 'text/csv', P.txCsv], ['03 Receipts index.csv', 'text/csv', P.idxCsv], ...(() => { try { const M = apPacket(P.R); return M.mileCsv.includes('\n') ? [['05 Mileage log.csv', 'text/csv', M.mileCsv]] : []; } catch (_) { return []; } })()]) await driveUpload(mcp, folder.id, n, m, b64(c));
      const url = folder.viewUrl || `https://drive.google.com/drive/folders/${folder.id}`;
      const p = document.querySelector('.ssx-pack [data-pack-status]'); if (p) p.innerHTML = `Saved in Business / ${esc(yr)} / Tax packet ${esc(P.slug)}. <a href="${esc(url)}" target="_blank" rel="noopener">Open in Drive</a>. Receipts stay in Business / ${esc(yr)} / Receipts.`;
      if (window.toast) window.toast('Tax packet saved to Drive');
    } catch (e) { if (!e || e.code !== 'quiet') { status("Couldn't save to Google Drive. Try again."); try { driveErr(e); } catch (_) {} } }
  }

  /* ---------- Autopilot: the app lines up the next steps for you.
     Home gets an "Up next" card (invoice after the show, thank-you and photo emails, payment follow-ups, booking
     confirmations, receipts for auto-logged costs, mileage, estimated taxes, tax season). Financials gets a
     Taxes card (set-aside, estimated payments, 1099 checklist), a Mileage log and Repeating expenses.
     Nothing is ever sent for you: emails open ready to review, and you press Send. */
  const AP = { cfg: null, mileage: [], recurring: [], vendors: {}, sig: '', paidSeen: null, opened: {} };
  const MILE_RATE = { 2024: 0.67, 2025: 0.70, 2026: 0.725 };
  const mileRate = y => MILE_RATE[y] || MILE_RATE[Math.max(...Object.keys(MILE_RATE).map(Number))];
  const apCfg = () => ({ taxRate: 25, estPayments: [], venueMiles: {}, noDrive: {}, done: {}, dismissed: {}, snooze: {}, got1099: {}, ...(AP.cfg || {}) });
  const apSave = patch => { AP.cfg = { ...apCfg(), ...patch }; return st.db ? st.db.doc('settings/autopilot').set(AP.cfg).catch(() => {}) : null; };
  const apMark = (bucket, key, val = true) => { const c = apCfg(); apSave({ [bucket]: { ...c[bucket], [key]: val } }); };
  const yearR = y => ({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), year: y });
  const addMonths = (s, n) => { const d = new Date(s + 'T12:00:00'), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return isoLocal(d); };
  const bk = () => { try { return S.bookings || []; } catch (_) { return []; } };
  const stat = b => { let s = b.status; try { s = K(s); } catch (_) {} return String(s || '').toLowerCase(); };
  const bName = b => { try { return bookingName(b); } catch (_) { return b.title || 'your show'; } };
  const person = id => { try { return contact(id) || null; } catch (_) { return null; } };
  // a show's miles count only while it's Played or Paid, or Confirmed with its date past (not Lost, not deleted)
  const countable = b => !!b && (['played', 'paid'].includes(stat(b)) || (stat(b) === 'confirmed' && !!b.date && b.date < todayStr()));
  const tripOk = m => !m.bookingId || countable(bk().find(b => b.id === m.bookingId));
  const liveTrips = () => AP.mileage.filter(tripOk);
  function pruneTrips() {
    if (!st.db || !bk().length || Date.now() - (AP.t0 || Date.now()) < 5000) return;
    AP.pruned = AP.pruned || {};
    for (const m of AP.mileage) {
      if (!m.bookingId || AP.pruned[m.id]) continue;
      const b = bk().find(x => x.id === m.bookingId);
      if (!countable(b)) { AP.pruned[m.id] = 1; st.db.collection('mileage').doc(m.id).delete().catch(() => { delete AP.pruned[m.id]; }); }
      else if (b.date && m.date !== b.date) { const { id, ...rest } = m; st.db.collection('mileage').doc(id).set({ ...rest, date: b.date }).catch(() => {}); m.date = b.date; }
    }
    const pend = { ...(apCfg().pend || {}) }; let ch = false;
    Object.keys(pend).forEach(id => { if (!countable(bk().find(b => b.id === id))) { delete pend[id]; ch = true; } });
    if (ch) apSave({ pend });
  }
  // estimated tax due dates for a tax year (weekends move to Monday): federal, and the performer's own state (Taxes card picker)
  const adjDue = d => { const x = new Date(d + 'T12:00:00'), w = x.getDay(); if (w === 6) x.setDate(x.getDate() + 2); if (w === 0) x.setDate(x.getDate() + 1); return isoLocal(x); };
  const estDates = y => [[`${y}-04-15`, 'Q1'], [`${y}-06-15`, 'Q2'], [`${y}-09-15`, 'Q3'], [`${y + 1}-01-15`, 'Q4']].map(([d, q]) => ({ date: adjDue(d), q, year: y }));
  // [code, name, tax site ('' = no state income tax on wages or self-employment)]; schedules below for states that don't use the federal dates
  const STATES = [['AL', 'Alabama', 'https://www.revenue.alabama.gov/'], ['AK', 'Alaska', ''], ['AZ', 'Arizona', 'https://azdor.gov/'], ['AR', 'Arkansas', 'https://www.dfa.arkansas.gov/'], ['CA', 'California', 'https://www.ftb.ca.gov/pay/'],
    ['CO', 'Colorado', 'https://tax.colorado.gov/'], ['CT', 'Connecticut', 'https://portal.ct.gov/drs'], ['DE', 'Delaware', 'https://revenue.delaware.gov/'], ['DC', 'District of Columbia', 'https://otr.cfo.dc.gov/'], ['FL', 'Florida', ''],
    ['GA', 'Georgia', 'https://dor.georgia.gov/'], ['HI', 'Hawaii', 'https://tax.hawaii.gov/'], ['ID', 'Idaho', 'https://tax.idaho.gov/'], ['IL', 'Illinois', 'https://tax.illinois.gov/'], ['IN', 'Indiana', 'https://www.in.gov/dor/'],
    ['IA', 'Iowa', 'https://revenue.iowa.gov/'], ['KS', 'Kansas', 'https://www.ksrevenue.gov/'], ['KY', 'Kentucky', 'https://revenue.ky.gov/'], ['LA', 'Louisiana', 'https://revenue.louisiana.gov/'], ['ME', 'Maine', 'https://www.maine.gov/revenue/'],
    ['MD', 'Maryland', 'https://www.marylandtaxes.gov/'], ['MA', 'Massachusetts', 'https://www.mass.gov/orgs/massachusetts-department-of-revenue'], ['MI', 'Michigan', 'https://www.michigan.gov/taxes'], ['MN', 'Minnesota', 'https://www.revenue.state.mn.us/'], ['MS', 'Mississippi', 'https://www.dor.ms.gov/'],
    ['MO', 'Missouri', 'https://dor.mo.gov/'], ['MT', 'Montana', 'https://mtrevenue.gov/'], ['NE', 'Nebraska', 'https://revenue.nebraska.gov/'], ['NV', 'Nevada', ''], ['NH', 'New Hampshire', ''],
    ['NJ', 'New Jersey', 'https://www.nj.gov/treasury/taxation/'], ['NM', 'New Mexico', 'https://www.tax.newmexico.gov/'], ['NY', 'New York', 'https://www.tax.ny.gov/'], ['NC', 'North Carolina', 'https://www.ncdor.gov/'], ['ND', 'North Dakota', 'https://www.tax.nd.gov/'],
    ['OH', 'Ohio', 'https://tax.ohio.gov/'], ['OK', 'Oklahoma', 'https://oklahoma.gov/tax.html'], ['OR', 'Oregon', 'https://www.oregon.gov/dor/'], ['PA', 'Pennsylvania', 'https://www.revenue.pa.gov/'], ['RI', 'Rhode Island', 'https://tax.ri.gov/'],
    ['SC', 'South Carolina', 'https://dor.sc.gov/'], ['SD', 'South Dakota', ''], ['TN', 'Tennessee', ''], ['TX', 'Texas', ''], ['UT', 'Utah', 'https://tax.utah.gov/'],
    ['VT', 'Vermont', 'https://tax.vermont.gov/'], ['VA', 'Virginia', 'https://www.tax.virginia.gov/'], ['WA', 'Washington', ''], ['WV', 'West Virginia', 'https://tax.wv.gov/'], ['WI', 'Wisconsin', 'https://www.revenue.wi.gov/'], ['WY', 'Wyoming', '']];
  // [month-day for Q1..Q4 (Q4 falls in January of the next year), share of the year's estimate]; checked Nov 2026
  const ST_SCHED = { CA: [['04-15', 30], ['06-15', 40], ['09-15', 0], ['01-15', 30]], HI: [['04-20'], ['06-20'], ['09-20'], ['01-20']], IA: [['04-30'], ['06-30'], ['09-30'], ['01-31']], VA: [['05-01'], ['06-15'], ['09-15'], ['01-15']], DE: [['04-30'], ['06-15'], ['09-15'], ['01-15']] };
  const myState = () => STATES.find(s => s[0] === apCfg().state) || null;
  const agencyName = a => a === 'IRS' || !a ? 'IRS' : ((STATES.find(s => s[0] === a) || [])[1] || a);
  const stDates = y => { const s = myState(); if (!s || !s[2]) return []; const sc = ST_SCHED[s[0]] || [['04-15'], ['06-15'], ['09-15'], ['01-15']];
    return sc.map(([md, pct], i) => ({ date: adjDue(`${i === 3 ? y + 1 : y}-${md}`), q: 'Q' + (i + 1), year: y, pct: pct == null ? 25 : pct })).filter(x => x.pct > 0); };
  const nextDue = () => { const t = todayStr(), y = +t.slice(0, 4); return [...estDates(y - 1), ...estDates(y)].find(x => x.date >= t); };
  const nextStDue = () => { const t = todayStr(), y = +t.slice(0, 4); return [...stDates(y - 1), ...stDates(y)].find(x => x.date >= t); };
  function taxNumbers(y) {
    let d = null; try { d = window.taxData(yearR(y)); } catch (_) {}
    const c = apCfg(), rate = Math.max(0, Math.min(60, Number(c.taxRate) || 25)) / 100;
    const miles = liveTrips().filter(m => String(m.date || '').startsWith(String(y))).reduce((s, m) => s + (+m.miles || 0), 0);
    const mileDed = miles * mileRate(y), net = d ? (d.netAdj ?? d.net) - mileDed : 0;
    const paid = (c.estPayments || []).filter(p => +p.year === y).reduce((s, p) => s + (+p.amount || 0), 0);
    return { d, rate, net, setAside: Math.max(0, net * rate), paid, miles, mileDed };
  }

  const myName = () => { try { return (S.profile || {}).myName || (S.profile || {}).djName || ''; } catch (_) { return ''; } };
  function tplOr(tid, b, subject, body) {
    try { if ((S.templates || []).some(x => x.id === tid)) return useTemplate(tid, b.id); } catch (_) {}
    const who = person(b.contactPersonId || b.promoterId || b.venueId);
    try { composeSheet({ booking: b.id, to: (who || {}).id || '', subject, body: body.replace('{first}', (who && (cName(who) || '').split(' ')[0]) || 'there') }); } catch (_) {}
  }
  const confirmMail = b => tplOr('stage-confirmed', b, `Confirmed: ${bName(b)}${b.date ? ' on ' + niceDate(b.date) : ''}`, `Hi {first},\n\nThank you, I'm locked in for ${bName(b)}${b.date ? ' on ' + niceDate(b.date) : ''}.${+b.fee ? ` Fee: $${Number(b.fee).toLocaleString('en-US')}.` : ''}\n\nCould you send over the set time, load-in time and address, and the contract or anything you need signed?\n\nLooking forward to it,\n${myName()}`);
  const thanksMail = b => tplOr('stage-played', b, `Thank you for ${bName(b)}`, `Hi {first},\n\nThank you for having me at ${bName(b)}. I had the best time, and I really appreciate you and the whole team.${b.driveUrl ? `\n\nPhotos and video will be here: ${b.driveUrl}` : ''}\n\nThanks again for a great night!\n\nWarmly,\n${myName()}`);
  /* -- what should happen next */
  function upNext() {
    const c = apCfg(), t = todayStr(), out = [], skip = k => c.dismissed[k] || c.done[k] || (c.snooze[k] && c.snooze[k] > t);
    for (const b of bk()) {
      const s = stat(b), since = b.date ? daysBetween(b.date, t) : null, who = person(b.contactPersonId || b.promoterId || b.venueId), name = bName(b);
      if (s === 'confirmed' && since !== null && since >= 1 && since <= 30 && !skip('played:' + b.id))
        out.push({ k: 'played:' + b.id, at: b.date, icon: '🎧', text: `How did <b>${esc(name)}</b> go? Mark it Played to line up the invoice and follow-ups.`, btn: 'Mark Played', go: async () => { await window.patch('bookings', b.id, { status: 'played', stageAt: { played: (b.stageAt || {}).played || t }, updatedAt: new Date().toISOString() }); } });
      if ((s === 'played' || s === 'paid') && since !== null && since >= 0 && since <= 21) {
        if (s === 'played' && +b.fee > 0 && !(b.invoice && (b.invoice.fileId || b.invoice.sentAt)) && !skip('invoice:' + b.id))
          out.push({ k: 'invoice:' + b.id, at: b.date, icon: '🧾', text: `Send the invoice for <b>${esc(name)}</b> (${esc('$' + Number(b.fee).toLocaleString('en-US'))}). It's filled in from the booking.`, btn: 'Make invoice', go: () => { try { invoiceSheet(b.id); } catch (_) {} } });
        if (!skip('thanks:' + b.id))
          out.push({ k: 'thanks:' + b.id, at: b.date, icon: '💌', text: `Send a thank-you for <b>${esc(name)}</b>${who ? ' to ' + esc(cName(who)) : ''}, with your photos folder and open dates.`, btn: 'Write it', mark: true, go: () => thanksMail(b) });
        const m = person(b.mediaId);
        if (m && !skip('media:' + b.id))
          out.push({ k: 'media:' + b.id, at: b.date, icon: '📸', text: `Ask ${esc(cName(m))} for the photos and video from <b>${esc(name)}</b>.`, btn: 'Ask for files', mark: true, go: () => { try { composeSheet({ booking: b.id, to: m.id, subject: `Photos & video from ${name}`, body: `Hi ${(cName(m) || '').split(' ')[0] || 'there'},\n\nThank you for shooting ${name}! Whenever they're ready, could you drop the photos and video here?\n${b.driveUrl || '(folder link)'}\n\nThanks so much,\n${myName()}` }); } catch (_) {} } });
        if (!skip('recap:' + b.id))
          out.push({ k: 'recap:' + b.id, at: b.date, icon: '📣', text: `Post a recap of <b>${esc(name)}</b> and thank the venue and promoter.`, btn: 'Done', mark: true, go: () => {} });
      }
      // payment follow-up: invoice sent, still unpaid after the due date (or 14 days with no due date)
      const inv = b.invoice || {}, sentAt = String(inv.sentAt || '').slice(0, 10), due = b.payDue || (sentAt ? addDays(sentAt, 14) : '');
      if ((s === 'played' || s === 'confirmed') && sentAt && due && due < t && !skip('chase:' + b.id)) {
        const late = daysBetween(due, t);
        out.push({ k: 'chase:' + b.id, at: due, icon: '⏰', text: `Payment for <b>${esc(name)}</b> is ${late} day${late === 1 ? '' : 's'} past due. Send a friendly reminder?`, btn: 'Write reminder', snooze: 7, go: () => { try { composeSheet({ booking: b.id, to: (who || {}).id || '', subject: `Invoice for ${name}`, body: `Hi ${(who && (cName(who) || '').split(' ')[0]) || 'there'},\n\nJust a friendly check-in on the invoice for ${name}${b.date ? ' on ' + niceDate(b.date) : ''}${+b.fee ? ` ($${Number(b.fee).toLocaleString('en-US')})` : ''}. Could you let me know when payment is on the way?\n\nThanks so much,\n${myName()}` }); } catch (_) {} } });
      }
      // a request you accepted gets a confirmation email
      if (b.requestStatus === 'accepted' && b.reviewedAt && daysBetween(String(b.reviewedAt).slice(0, 10), t) <= 14 && !skip('confirm:' + b.id))
        out.push({ k: 'confirm:' + b.id, at: String(b.reviewedAt).slice(0, 10), icon: '✅', text: `Send <b>${esc(name)}</b> a booking confirmation: date, set time, fee, contract and load-in.`, btn: 'Write it', mark: true, go: () => confirmMail(b) });
    }
    // receipts for costs the app logged on its own
    let exps = []; try { exps = S.expenses || []; } catch (_) {}
    exps.filter(x => String(x.id).startsWith('rec-') && !x.receipt && x.date && daysBetween(x.date, t) <= 45 && !skip('rcpt:' + x.id)).forEach(x =>
      out.push({ k: 'rcpt:' + x.id, at: x.date, icon: '📎', text: `Add the receipt for <b>${esc(x.desc || 'your repeating cost')}</b> (${esc(niceDate(x.date))}).`, btn: 'Add receipt', go: () => { try { goTab('money'); expenseForm(x); } catch (_) {} } }));
    // far-away shows: confirm where you drove from
    const pendIds = Object.keys(c.pend || {}).filter(id => bk().some(b => b.id === id));
    if (pendIds.length && !skip('milefar:' + pendIds.join(',')))
      out.push({ k: 'milefar:' + pendIds.join(','), at: t, icon: '📍', text: `${pendIds.length} show${pendIds.length === 1 ? ' was' : 's were'} out of town or far from home. Confirm where you drove from to log the miles.`, btn: 'Check miles', snooze: 3, go: () => { try { goTab('money'); setTimeout(() => { const el = document.getElementById('ssx-miles'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); } catch (_) {} } });
    // miles to log
    const ms = mileageToLog(); if (ms.length && !skip('miles:' + t.slice(0, 7)))
      out.push({ k: 'miles:' + t.slice(0, 7), at: t, icon: '🚗', text: `${ms.length} show${ms.length === 1 ? '' : 's'} to log miles for. Mileage is one of the easiest deductions to miss.`, btn: 'Log miles', snooze: 7, go: () => { try { goTab('money'); setTimeout(() => { const el = document.getElementById('ssx-miles'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); } catch (_) {} } });
    // estimated taxes
    const nd = nextDue();
    if (nd && daysBetween(t, nd.date) <= 21 && !(apCfg().estPayments || []).some(p => +p.year === nd.year && p.q === nd.q) && !skip(`est:${nd.year}${nd.q}`)) {
      const tn = taxNumbers(nd.year), left = Math.max(0, tn.setAside - tn.paid);
      if (left > 0) out.push({ k: `est:${nd.year}${nd.q}`, at: nd.date, icon: '🏛️', text: `Estimated taxes (${nd.q} ${nd.year}) are due <b>${esc(niceDate(nd.date))}</b>. About ${esc('$' + Math.round(left).toLocaleString('en-US'))} set aside so far isn't paid yet.`, btn: 'See taxes', snooze: 5, go: () => { try { goTab('money'); setTimeout(() => { const el = document.getElementById('ssx-tax'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); } catch (_) {} } });
    }
    // tax season
    const m0 = +t.slice(5, 7), ly = +t.slice(0, 4) - 1;
    if (m0 >= 1 && m0 <= 4 && !skip('season:' + ly))
      out.push({ k: 'season:' + ly, at: t, icon: '🗂️', text: `Tax season: your ${ly} tax packet is ready, and your 1099 checklist is in Financials.`, btn: 'Open tax packet', go: () => { try { goTab('money'); FP.preset = 'year:' + ly; renderMoney(); taxSheet(); } catch (_) { try { taxSheet(); } catch (__) {} } } });
    try { out.push(...easeItems(c, t, skip)); } catch (_) {}
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  function renderUpNext() { try { return nmRender(); } catch (e) { console.error(e); } // Next moves takes over; the old card below only runs if it fails
    const sec = document.querySelector('section[data-view="home"]'); if (!sec || !st.db) return;
    const items = upNext(); let box = document.getElementById('ssx-upnext');
    if (!items.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'ssx-upnext'; box.className = 'card ssx ssx-kitcard ssx-up'; const w = document.getElementById('welcome'); w ? w.after(box) : sec.prepend(box); }
    box.innerHTML = `<div class="ssx-head"><div><h3>Up next <span class="ssx-pill on">${items.length}</span></h3><p class="note">Lined up from your shows, money and calendar. Emails open ready to review; nothing sends without you.</p></div></div>
      <div class="ssx-uplist">${items.slice(0, 8).map((it, i) => `<div class="ssx-upi" data-up="${i}"><span class="ssx-upic" aria-hidden="true">${it.icon}</span><span class="ssx-uptx">${it.text}</span><span class="ssx-upbt"><button type="button" class="btn small primary" data-up-go>${esc(it.btn)}</button><button type="button" class="ssx-upx" data-up-x aria-label="Dismiss" title="${it.snooze ? 'Remind me later' : 'Dismiss'}">×</button></span></div>`).join('')}</div>
      ${items.length > 8 ? `<p class="note" style="margin:0">+ ${items.length - 8} more after these.</p>` : ''}`;
    box.querySelectorAll('[data-up]').forEach(row => {
      const it = items[+row.dataset.up];
      row.querySelector('[data-up-go]').onclick = async e => { e.stopPropagation(); try { await it.go(); } catch (_) {} if (it.mark) apMark('done', it.k); else if (it.snooze) apMark('snooze', it.k, addDays(todayStr(), it.snooze)); };
      row.querySelector('[data-up-x]').onclick = e => { e.stopPropagation(); it.snooze ? apMark('snooze', it.k, addDays(todayStr(), it.snooze)) : apMark('dismissed', it.k); };
    });
  }

  /* -- mileage */
  const venueKey = b => b.venueId || String(b.address || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function mileageToLog() {
    const c = apCfg(), y = todayStr().slice(0, 4), logged = new Set(AP.mileage.map(m => m.bookingId).filter(Boolean));
    const auto = c.autoMiles && c.home && c.home.lat, pend = c.pend || {};
    const t = todayStr();
    return bk().filter(b => (['played', 'paid'].includes(stat(b)) || (stat(b) === 'confirmed' && b.date && b.date < t)) && String(b.date || '').startsWith(y) && !logged.has(b.id) && !c.noDrive[b.id] && !pend[b.id] && !(auto && destOf(b) && !failed(b.id))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  async function logTrip(b, oneWay, o = {}) {
    const miles = Math.round(oneWay * 2 * 10) / 10, v = person(b.venueId), where = (v && cName(v)) || b.address || b.city || 'the venue';
    const from = o.from ? ` from ${o.from}` : '';
    await st.db.collection('mileage').doc('m-' + b.id).set({ date: b.date, miles, purpose: `Round trip${from} to ${where} for ${bName(b)}`, bookingId: b.id, auto: !!o.auto, review: o.review || null, createdAt: new Date().toISOString() });
    const c = apCfg(), k = venueKey(b), pend = { ...(c.pend || {}) }; delete pend[b.id];
    apSave({ pend, ...(k && !o.custom ? { venueMiles: { ...c.venueMiles, [k]: oneWay } } : {}) });
  }

  /* -- automatic mileage: measures the drive from home (or another start you set) to each show.
     Uses OpenStreetMap to find addresses and the OSRM route service for driving distance; only addresses are sent. */
  const GEO = { last: 0, busy: false, fail: {} };
  const failed = id => { const f = GEO.fail[id]; return !!f && Date.now() - f.at < 30 * 60 * 1000; };
  const setFail = (id, why) => { GEO.fail[id] = { why, at: Date.now() }; };
  const normAddr = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const sameCity = (a, b) => normAddr(a) && normAddr(a) === normAddr(b);
  async function geoOne(q) {
    const wait = 1100 - (Date.now() - GEO.last); if (wait > 0) await new Promise(r => setTimeout(r, wait)); GEO.last = Date.now();
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' + encodeURIComponent(String(q).slice(0, 200)), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('geo ' + r.status);
    const j = (await r.json())[0]; if (!j) return null;
    const a = j.address || {};
    return { lat: +j.lat, lon: +j.lon, city: a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '' };
  }
  // tries the full address, then without a venue name in front, then the street with the city, then the city alone (marked approximate)
  async function geoFind(q, city) {
    const k = normAddr(q); if (!k) return null;
    const cache = apCfg().geo || {}; if (cache[k]) return cache[k];
    const s = String(q), noName = s.replace(/^[^0-9]*?(?=\d)/, '').trim(), street = noName.split(',')[0].trim();
    const tries = [s, noName !== s ? noName : '', city && street && street !== noName ? `${street}, ${city}` : ''].filter(Boolean);
    let hit = null;
    for (const t of tries) { hit = await geoOne(t); if (hit) break; }
    if (!hit && city && normAddr(city) !== k) { hit = await geoOne(city); if (hit) hit = { ...hit, approx: true }; }
    if (!hit) return null;
    const g = { ...(apCfg().geo || {}) }; const keys = Object.keys(g); if (keys.length > 300) delete g[keys[0]]; g[k] = hit; apSave({ geo: g });
    return hit;
  }
  async function driveMiles(from, to) {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`);
    if (!r.ok) throw new Error('route ' + r.status);
    const j = await r.json(); const m = j && j.routes && j.routes[0] && j.routes[0].distance;
    if (!(m > 0)) throw new Error('no route');
    return Math.round(m / 1609.344 * 10) / 10;
  }
  function destOf(b) {
    const v = person(b.venueId) || {}, addr = b.address || v.address || '', city = b.city || v.city || '';
    const q = [addr, city && !normAddr(addr).includes(normAddr(city)) ? city : ''].filter(Boolean).join(', ');
    return q ? { q, city, cityOnly: !addr } : null;
  }
  // shows that happened and can be measured automatically
  function autoCandidates() {
    const c = apCfg(), t = todayStr(), y = t.slice(0, 4), logged = new Set(AP.mileage.map(m => m.bookingId).filter(Boolean)), pend = c.pend || {};
    return bk().filter(b => (['played', 'paid'].includes(stat(b)) || (stat(b) === 'confirmed' && b.date < t)) && b.date && String(b.date).startsWith(y) && !logged.has(b.id) && !c.noDrive[b.id] && !pend[b.id] && !failed(b.id) && destOf(b));
  }
  // confirmed shows still to come: measured ahead so you can see the miles
  function upcomingShows() {
    const t = todayStr();
    return bk().filter(b => stat(b) === 'confirmed' && b.date && b.date >= t).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  async function autoMiles() {
    const c = apCfg(); if (GEO.busy || !c.autoMiles || !c.home || !c.home.lat || !st.db) return;
    for (const [id, p] of Object.entries(c.pend || {})) { const b = bk().find(x => x.id === id); if (countable(b) && p.mi > 0 && !AP.mileage.some(m => m.bookingId === id)) { try { await logTrip(b, p.mi, { auto: true, from: 'home', review: { city: p.city || '', approx: !!p.approx } }); } catch (_) {} } }
    const past = autoCandidates(), est = c.est || {};
    const ahead = upcomingShows().filter(b => { const d = destOf(b); return d && !failed(b.id) && !(est[b.id] && est[b.id].q === d.q); });
    const list = [...past.map(b => [b, 'past']), ...ahead.map(b => [b, 'ahead'])].slice(0, 4); if (!list.length) return;
    GEO.busy = true;
    try {
      for (const [b, kind] of list) {
        try {
          const d = destOf(b), cc = apCfg(), start = (cc.mileFrom || {})[b.id], from = start && start.lat ? start : cc.home, pre = (cc.est || {})[b.id];
          let one, city, approx;
          if (!start && pre && pre.q === d.q) ({ mi: one, city, approx } = pre);
          else {
            const to = await geoFind(d.q, d.city); if (!to) { setFail(b.id, 'notfound'); continue; }
            try { one = await driveMiles(from, to); } catch (_) { setFail(b.id, 'noroute'); continue; }
            city = to.city || d.city || ''; approx = !!to.approx || !!d.cityOnly;
          }
          if (kind === 'ahead') { apSave({ est: { ...(apCfg().est || {}), [b.id]: { q: d.q, mi: one, city, approx } } }); continue; }
          const far = !start && (approx || one > (Number(cc.farMiles) || 50) || (city && cc.home.city && !sameCity(city, cc.home.city)));
          await logTrip(b, one, { auto: true, from: start ? start.label || 'your start address' : 'home', custom: !!start, review: far ? { city, approx: !!approx } : null });
          if (window.toast) window.toast(`Logged ${Math.round(one * 2 * 10) / 10} mi for ${bName(b)}${far ? ' (check where you drove from)' : ''}`);
        } catch (err) { setFail(b.id, 'error'); console.warn('mileage', err); }
      }
    } finally { GEO.busy = false; }
    setTimeout(autoMiles, 1500); // keep going until every show is measured
  }
  async function measureFrom(b, addr) {
    const start = await geoFind(addr); if (!start) { if (window.toast) window.toast("Couldn't find that start address"); return false; }
    const d = destOf(b), to = d && await geoFind(d.q, d.city); if (!to) { if (window.toast) window.toast("Couldn't find the show's address"); return false; }
    const one = await driveMiles(start, to);
    apSave({ mileFrom: { ...(apCfg().mileFrom || {}), [b.id]: { ...start, label: String(addr).slice(0, 120) } } });
    await logTrip(b, one, { auto: true, from: String(addr).slice(0, 120), custom: true });
    if (window.toast) window.toast(`Logged ${Math.round(one * 2 * 10) / 10} mi for ${bName(b)}`); return true;
  }
  /* -- repeating expenses */
  let recRunning = false;
  async function runRecurring() {
    if (recRunning || !st.db) return; recRunning = true;
    try {
      const t = todayStr(); let have = new Set(); try { have = new Set((S.expenses || []).map(x => x.id)); } catch (_) {}
      for (const r of AP.recurring) {
        if (r.paused || !r.next) continue; let next = r.next, n = 0, made = [];
        while (next <= t && n < 24) {
          const id = `rec-${r.id}-${next}`.slice(0, 120);
          if (!have.has(id)) { await st.db.collection('expenses').doc(id).set({ desc: r.desc, amount: +r.amount || 0, date: next, category: r.category || 'Other', otherLabel: r.otherLabel || '', payMethod: r.payMethod || '', payRef: '', purpose: r.purpose || '', bookingId: '', recurringId: r.id, createdAt: new Date().toISOString() }); made.push(next); }
          next = r.every === 'year' ? addMonths(next, 12) : addMonths(next, 1); n++;
        }
        if (next !== r.next) { const { id: _rid, ...rest } = r; await st.db.collection('recurring').doc(r.id).set({ ...rest, next }); }
        if (made.length && window.toast) window.toast(`Logged ${r.desc} (${made.length > 1 ? made.length + ' times' : '$' + Number(r.amount).toFixed(2)}). Add the receipt when you have it.`);
      }
    } catch (e) { console.error(e); } finally { recRunning = false; }
  }

  /* -- Financials cards: Taxes, Mileage, Repeating expenses */
  function renderFinCards() {
    const sec = document.querySelector('section[data-view="money"]'); if (!sec || !st.db) return;
    let wrap = document.getElementById('ssx-fin');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'ssx-fin'; wrap.className = 'ssx-fin'; const s = document.getElementById('moneyStats'); s ? s.after(wrap) : sec.appendChild(wrap); }
    const ae = document.activeElement; if (wrap.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && !/checkbox|radio/.test(ae.type || '')) return;
    const c = apCfg(), t = todayStr(), y = +t.slice(0, 4), tn = taxNumbers(y), nd = nextDue(), sMe = myState(), sNd = nextStDue(), $ = n => '$' + Math.round(n).toLocaleString('en-US');
    const pays = (c.estPayments || []).filter(p => +p.year === y).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const ly = y - 1, m0 = +t.slice(5, 7), nec = ly >= 2026 ? 2000 : 600;
    let payers = []; if (m0 <= 4) { try { payers = window.taxData(yearR(ly)).byPayer.filter(([, v]) => v.amt >= nec); } catch (_) {} }
    const home = c.home || {}, far = Number(c.farMiles) || 50, pendL = Object.entries(c.pend || {}).map(([id, p]) => [bk().find(b => b.id === id), p]).filter(([b]) => b);
    const autoOn = !!(c.autoMiles && home.lat), playedN = bk().filter(b => (['played', 'paid'].includes(stat(b)) || (stat(b) === 'confirmed' && b.date < t)) && b.date && String(b.date).startsWith(String(y))).length;
    const revL = [...liveTrips().filter(m => m.review && m.bookingId && String(m.date || '').startsWith(String(y))).map(m => [bk().find(b => b.id === m.bookingId), { mi: (+m.miles || 0) / 2, city: m.review.city, approx: m.review.approx, logged: m.id }]), ...pendL.filter(([b]) => !AP.mileage.some(m => m.bookingId === b.id))].filter(([b]) => b);
    const ml = mileageToLog(), trips = liveTrips().filter(m => String(m.date || '').startsWith(String(y))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    wrap.innerHTML = `
    <div class="card ssx" id="ssx-tax">
      <div class="ssx-head"><div><h3>Taxes</h3><p class="note">What to set aside from your ${y} profit, and your estimated payments. Self-employed people usually pay four times a year.</p></div></div>
      <div class="stats ssx-tstats"><div class="stat"><span class="eyebrow">Profit so far</span><b class="num">${$(tn.net)}</b><span class="hint">after expenses${tn.miles ? ' and mileage' : ''}</span></div>
        <div class="stat"><span class="eyebrow">Set aside (${Math.round(tn.rate * 100)}%)</span><b class="num">${$(tn.setAside)}</b><span class="hint">change the rate below</span></div>
        <div class="stat"><span class="eyebrow">Paid so far</span><b class="num">${$(tn.paid)}</b><span class="hint">${pays.length} estimated payment${pays.length === 1 ? '' : 's'}</span></div></div>
            ${nd ? `<p class="ssx-msg">Next federal estimated payment: <b>${esc(nd.q)} ${nd.year}, due ${esc(niceDate(nd.date))}</b>.${sNd ? ` ${esc(sMe[1])}: <b>${esc(sNd.q)} due ${esc(niceDate(sNd.date))}</b>${sNd.pct !== 25 ? ` (${sNd.pct}% of the year's state estimate)` : ''}.` : sMe && !sMe[2] ? ` ${esc(sMe[1])} doesn't tax wages or self-employment income, so it's federal only.` : ''} Still unpaid from what you've set aside: <b>${$(Math.max(0, tn.setAside - tn.paid))}</b>.</p>` : ''}
      <div class="ssx-row"><label class="ssx-inline" for="ssx-state">Your state <select id="ssx-state"><option value="">Pick your state…</option>${STATES.map(([k, n]) => `<option value="${k}" ${sMe && sMe[0] === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>${sMe ? '' : '<span class="note">Pick it to see your state\'s due dates.</span>'}</div>
      <div class="ssx-row"><label class="ssx-inline" for="ssx-rate">Set aside <input id="ssx-rate" type="number" min="0" max="60" step="1" inputmode="numeric" value="${esc(c.taxRate ?? 25)}" style="width:76px"> % of profit</label><a class="btn small" href="https://www.irs.gov/payments/direct-pay" target="_blank" rel="noopener">Pay the IRS</a>${sMe && sMe[2] ? `<a class="btn small" href="${esc(sMe[2])}" target="_blank" rel="noopener">${esc(sMe[1])} tax site</a>` : ''}</div>
      <details class="ssx-det"><summary>Log an estimated payment</summary>
        <div class="ssx-grid2"><div class="f"><label for="ssx-ep-d">Date paid</label><input id="ssx-ep-d" type="date" value="${esc(t)}"></div><div class="f"><label for="ssx-ep-a">Amount ($)</label><input id="ssx-ep-a" type="number" inputmode="decimal" min="0" step="0.01"></div>
          <div class="f"><label for="ssx-ep-w">Paid to</label><select id="ssx-ep-w"><option value="IRS">IRS (federal)</option>${sMe && sMe[2] ? `<option value="${sMe[0]}">${esc(sMe[1])}</option>` : ''}</select></div><div class="f"><label for="ssx-ep-q">For</label><select id="ssx-ep-q">${[...estDates(y - 1).slice(3), ...estDates(y)].map(x => `<option value="${x.year}|${x.q}" ${nd && nd.q === x.q && nd.year === x.year ? 'selected' : ''}>${x.q} ${x.year} (due ${esc(niceDate(x.date))})</option>`).join('')}</select></div></div>
        <div class="ssx-row"><button type="button" class="btn primary small" data-ep-add>Save payment</button></div></details>
      ${pays.length ? `<div class="ssx-mini">${pays.map(p => `<div><span>${esc(niceDate(p.date))} · ${esc(agencyName(p.agency))} · ${esc(p.q)} ${esc(p.year)}</span><b class="num">$${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b><button type="button" class="ssx-upx" data-ep-del="${esc(p.id)}" aria-label="Remove payment">×</button></div>`).join('')}</div>` : ''}
      ${payers.length ? `<div class="ssx-opt"><b>1099s to expect for ${ly}</b><p class="note" style="margin:0">Payers who paid you ${$(nec)} or more. They're due by January 31. Check them off as they arrive and compare the amounts.</p>${payers.map(([n, v]) => { const k = `${ly}|${n}`; return `<label class="ssx-check"><input type="checkbox" data-1099="${esc(k)}" ${c.got1099[k] ? 'checked' : ''}> ${esc(n)} · ${$(v.amt)}</label>`; }).join('')}</div>` : ''}
      <p class="note" style="margin:0">A rough guide, not tax advice: 25–30% of profit covers self-employment tax plus income tax for many performers. Your preparer can fine-tune it.</p>
    </div>
    <div class="card ssx" id="ssx-miles">
      <div class="ssx-head"><div><h3>Mileage</h3>
        <div class="ssx-milestat"><div><span class="eyebrow">${y} business miles</span><b class="num">${(Math.round(trips.reduce((s, m) => s + (+m.miles || 0), 0) * 10) / 10).toLocaleString('en-US')} mi</b></div><div><span class="eyebrow">Deduction (about)</span><b class="num">${$(tn.mileDed)}</b></div></div>
        <p class="note" style="margin:6px 0 0">${trips.length} trip${trips.length === 1 ? '' : 's'} at the IRS rate of ${(mileRate(y) * 100).toFixed(1)}¢ a mile${MILE_RATE[y] ? '' : ' (check this year\'s rate)'}.${autoOn ? ` Counted automatically from ${playedN} show${playedN === 1 ? '' : 's'} played so far${ml.length ? `; ${ml.length} still need${ml.length === 1 ? 's' : ''} your help below` : ''}.` : ''}</p></div>
        <label class="ssx-switch"><input type="checkbox" id="ssx-am-on" ${c.autoMiles ? 'checked' : ''} aria-label="Count miles automatically"><span></span></label></div>
      <div class="ssx-opt ssx-am">
        <b>Count miles automatically ${c.autoMiles ? (home.lat ? '<span class="ssx-pill on">On</span>' : '<span class="ssx-pill">Needs your home address</span>') : '<span class="ssx-pill">Off</span>'}</b>
        <p class="note" style="margin:0">After each show, the app measures the drive from your home to the venue and logs the round trip. If a show is in another city or more than ${esc(far)} miles away, it still counts it from home and asks you to check where you left from.</p>
        <details class="ssx-det" ${home.lat ? '' : 'open'}><summary>Home address and settings</summary>
        <div class="ssx-grid2"><div class="f"><label for="ssx-am-home">Home (starting address)</label><input id="ssx-am-home" autocomplete="street-address" maxlength="200" placeholder="Street, city, state" value="${esc(home.address || '')}"></div>
          <div class="f"><label for="ssx-am-far">Ask me when it's more than (miles one way)</label><input id="ssx-am-far" type="number" min="5" max="500" step="5" inputmode="numeric" value="${esc(far)}"></div></div>
        <div class="ssx-row"><button type="button" class="btn small primary" data-am-save>Save</button>${home.city ? `<span class="note" style="margin:0">Home city: ${esc(home.city)}</span>` : ''}</div>
        <p class="note" style="margin:0">Addresses are looked up with OpenStreetMap to measure the drive; nothing else is shared. Drives from home count when home is your main place of business (a home studio usually qualifies). Your preparer can confirm.</p><p class="note" style="margin:0;font-size:11px">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Routes by <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a></p></details>
      </div>
      ${revL.length ? `<div class="ssx-uplist ssx-pend"><b>Check where you drove from</b><p class="note" style="margin:0">These shows were out of town or far away, so they were counted from home. Change any you started from somewhere else.</p>${revL.map(([b, p]) => `<div class="ssx-upi" data-pd="${esc(b.id)}"><span class="ssx-upic">📍</span><span class="ssx-uptx"><b>${esc(bName(b))}</b> · ${esc(niceDate(b.date))}${p.city ? ' · ' + esc(p.city) : ''}${p.mi ? ` · ${p.approx ? 'about ' : ''}${Math.round(p.mi * 2 * 10) / 10} mi round trip from home` : ''}${p.approx ? ' (measured to the city center)' : ''}</span><span class="ssx-upbt">${p.logged ? '<button type="button" class="btn small primary" data-pd-ok>Looks right</button>' : p.mi || home.lat ? `<button type="button" class="btn small primary" data-pd-home>From home${p.mi ? ` (${Math.round(p.mi * 2 * 10) / 10} mi)` : ''}</button>` : ''}<button type="button" class="btn small" data-pd-other>Different start</button><button type="button" class="btn small" data-pd-no>Didn't drive</button></span>
        <div class="ssx-row ssx-pdform" hidden><input data-pd-addr maxlength="200" placeholder="Where you left from (hotel, friend's place…)" aria-label="Starting address" style="flex:1 1 220px"><button type="button" class="btn small primary" data-pd-go>Measure and log</button></div></div>`).join('')}</div>` : ''}
      ${ml.length ? `<div class="ssx-uplist">${ml.slice(0, 6).map(b => { const k = venueKey(b), known = c.venueMiles[k]; return `<div class="ssx-upi" data-ml="${esc(b.id)}"><span class="ssx-upic">🚗</span><span class="ssx-uptx"><b>${esc(bName(b))}</b> · ${esc(niceDate(b.date))}${known ? ` · ${known * 2} mi round trip` : ''}${autoOn ? `<br><span class="note">${!destOf(b) ? 'No address on this booking yet. Add one and the miles count themselves.' : (GEO.fail[b.id] || {}).why === 'noroute' ? 'No driving route found to this address.' : "Couldn't find this address automatically. Check the spelling, or enter the miles."}</span>` : ''}</span><span class="ssx-upbt">${autoOn && !destOf(b) ? '<button type="button" class="btn small" data-ml-addr>Add address</button>' : ''}${known ? `<button type="button" class="btn small primary" data-ml-ok>Log ${known * 2} mi</button>` : `<input type="number" min="0" step="0.1" inputmode="decimal" placeholder="Miles one way" aria-label="Miles one way" style="width:120px" data-ml-in><button type="button" class="btn small primary" data-ml-ok>Log</button>`}<button type="button" class="btn small" data-ml-no>Didn't drive</button></span></div>`; }).join('')}</div>${ml.length > 6 ? `<p class="note" style="margin:0">+ ${ml.length - 6} more</p>` : ''}<p class="note" style="margin:0">Enter the one-way miles once per venue. Next time you play there, it's one tap.</p>` : autoOn ? '' : '<p class="note" style="margin:0">Played shows with a venue or address show up here to log in one tap.</p>'}
      <details class="ssx-det"><summary>Add another trip (gear runs, rehearsals, meetings)</summary>
        <div class="ssx-grid2"><div class="f"><label for="ssx-mt-d">Date</label><input id="ssx-mt-d" type="date" value="${esc(t)}"></div><div class="f"><label for="ssx-mt-m">Miles (total)</label><input id="ssx-mt-m" type="number" min="0" step="0.1" inputmode="decimal"></div></div>
        <div class="f"><label for="ssx-mt-p">Where and why</label><input id="ssx-mt-p" maxlength="160" placeholder="e.g. Guitar Center for cables"></div><div class="ssx-row"><button type="button" class="btn primary small" data-mt-add>Save trip</button></div></details>
      ${trips.length ? `<details class="ssx-det"><summary>Your ${y} trips (${trips.length})</summary><div class="ssx-mini">${trips.map(m => `<div><span>${esc(niceDate(m.date))} · ${esc(m.purpose || '')}${m.auto ? ' <span class="ssx-pill">auto</span>' : ''}</span><b class="num">${esc(m.miles)} mi</b><button type="button" class="ssx-upx" data-mt-del="${esc(m.id)}" aria-label="Remove trip" title="${m.bookingId ? 'Remove and re-check this show' : 'Remove trip'}">×</button></div>`).join('')}</div></details>` : ''}
    </div>
    <div class="card ssx" id="ssx-rec">
      <div class="ssx-head"><div><h3>Repeating expenses</h3><p class="note">Subscriptions and regular costs log themselves on their date. Set one up from <b>+ Log expense</b> with "Repeats".</p></div></div>
      ${AP.recurring.length ? `<div class="ssx-mini">${AP.recurring.map(r => `<div><span>${esc(r.desc)} · ${r.every === 'year' ? 'every year' : 'every month'}${r.paused ? ' · paused' : ` · next ${esc(niceDate(r.next))}`}</span><b class="num">$${Number(r.amount).toFixed(2)}</b><button type="button" class="btn small" data-rec-pause="${esc(r.id)}">${r.paused ? 'Resume' : 'Pause'}</button><button type="button" class="ssx-upx" data-rec-del="${esc(r.id)}" aria-label="Stop repeating">×</button></div>`).join('')}</div>` : '<p class="note" style="margin:0">None yet.</p>'}
    </div>`;
    const q = s => wrap.querySelector(s);
    q('#ssx-rate').onchange = e => { const v = Math.max(0, Math.min(60, Number(e.target.value) || 0)); apSave({ taxRate: v }); };
    q('#ssx-state').onchange = e => { apSave({ state: e.target.value }); e.target.blur(); renderFinCards(); const s = myState(); if (window.toast && s) window.toast(s[2] ? `Saved. You'll see ${s[1]}'s estimated tax dates here and in your reminders.` : `Saved. ${s[1]} doesn't tax wages or self-employment income, so only federal payments show.`); };
    q('[data-ep-add]').onclick = e => { e.stopPropagation(); const a = Number(q('#ssx-ep-a').value), d = q('#ssx-ep-d').value, [yy, qq] = q('#ssx-ep-q').value.split('|'); if (!(a > 0) || !d) { if (window.toast) window.toast('Add the date and amount'); return; } apSave({ estPayments: [...(apCfg().estPayments || []), { id: 'ep' + Date.now().toString(36), date: d, amount: Math.round(a * 100) / 100, agency: q('#ssx-ep-w').value, year: +yy, q: qq }] }); if (window.toast) window.toast('Estimated payment saved'); };
    wrap.querySelectorAll('[data-ep-del]').forEach(b => b.onclick = e => { e.stopPropagation(); apSave({ estPayments: (apCfg().estPayments || []).filter(p => p.id !== b.dataset.epDel) }); });
    wrap.querySelectorAll('[data-1099]').forEach(b => b.onchange = () => apMark('got1099', b.dataset['1099'], b.checked));
    wrap.querySelectorAll('[data-ml]').forEach(row => {
      const b = bk().find(x => x.id === row.dataset.ml); if (!b) return;
      row.querySelector('[data-ml-ok]').onclick = async e => { e.stopPropagation(); const inp = row.querySelector('[data-ml-in]'), known = apCfg().venueMiles[venueKey(b)], one = inp ? Number(inp.value) : known; if (!(one > 0)) { if (window.toast) window.toast('Enter the one-way miles'); inp && inp.focus(); return; } await logTrip(b, one); if (window.toast) window.toast('Trip logged'); };
      row.querySelector('[data-ml-no]').onclick = e => { e.stopPropagation(); apMark('noDrive', b.id); };
      const ad = row.querySelector('[data-ml-addr]'); if (ad) ad.onclick = e => { e.stopPropagation(); try { bookingForm(b); } catch (_) {} };
    });
    q('[data-mt-add]').onclick = async e => { e.stopPropagation(); const m = Number(q('#ssx-mt-m').value), d = q('#ssx-mt-d').value, p = q('#ssx-mt-p').value.trim(); if (!(m > 0) || !d || !p) { if (window.toast) window.toast('Add the date, miles and where you went'); return; } await st.db.collection('mileage').add({ date: d, miles: Math.round(m * 10) / 10, purpose: p.slice(0, 160), createdAt: new Date().toISOString() }); if (window.toast) window.toast('Trip logged'); };
    wrap.querySelectorAll('[data-mt-del]').forEach(b => b.onclick = e => { e.stopPropagation(); const m = AP.mileage.find(x => x.id === b.dataset.mtDel); st.db.collection('mileage').doc(b.dataset.mtDel).delete().catch(() => {});
      if (m && m.bookingId) { const cc = apCfg(), mf = { ...(cc.mileFrom || {}) }; delete mf[m.bookingId]; apSave({ mileFrom: mf, pend: { ...(cc.pend || {}), [m.bookingId]: { mi: (cc.venueMiles || {})[venueKey(bk().find(x => x.id === m.bookingId) || {})] || 0, city: '' } } }); } });
    q('#ssx-am-on').onchange = e => { apSave({ autoMiles: e.target.checked }); if (e.target.checked && !(apCfg().home || {}).lat) setTimeout(() => { const i = document.getElementById('ssx-am-home'); i && i.focus(); }, 50); };
    q('[data-am-save]').onclick = async e => { e.stopPropagation(); const btn = e.currentTarget, addr = q('#ssx-am-home').value.trim(), f = Math.max(5, Math.min(500, Number(q('#ssx-am-far').value) || 50)), cur = apCfg().home || {};
      if (addr && normAddr(addr) !== normAddr(cur.address)) { btn.disabled = true; btn.textContent = 'Finding…'; let h = null; try { h = await geoFind(addr); } catch (_) {} btn.disabled = false; btn.textContent = 'Save';
        if (!h) { if (window.toast) window.toast("Couldn't find that address. Try adding the city and state."); return; }
        Object.keys(GEO.fail).forEach(k => delete GEO.fail[k]); apSave({ home: { address: addr.slice(0, 200), lat: h.lat, lon: h.lon, city: h.city }, farMiles: f, autoMiles: true }); }
      else apSave({ farMiles: f, ...(addr ? {} : { home: {} }) });
      if (window.toast) window.toast('Mileage settings saved'); };
    wrap.querySelectorAll('[data-pd]').forEach(row => {
      const b = bk().find(x => x.id === row.dataset.pd); if (!b) return; const p = (apCfg().pend || {})[b.id] || {}, form = row.querySelector('.ssx-pdform');
      const home = row.querySelector('[data-pd-home]'); if (home) home.onclick = async e => { e.stopPropagation(); const h = apCfg().home || {};
        if (p.mi) { await logTrip(b, p.mi, { auto: true, from: 'home' }); if (window.toast) window.toast('Trip logged'); return; }
        try { const d = destOf(b), to = d && await geoFind(d.q, d.city); if (!to || !h.lat) throw 0; const one = await driveMiles(h, to); await logTrip(b, one, { auto: true, from: 'home' }); if (window.toast) window.toast('Trip logged'); } catch (_) { if (window.toast) window.toast("Couldn't measure that drive. Enter the miles under Add another trip."); } };
      const okb = row.querySelector('[data-pd-ok]'); if (okb) okb.onclick = e => { e.stopPropagation(); const m = AP.mileage.find(x => x.bookingId === b.id); if (m) { const { id, ...rest } = m; st.db.collection('mileage').doc(id).set({ ...rest, review: null }).catch(() => {}); } };
      row.querySelector('[data-pd-other]').onclick = e => { e.stopPropagation(); form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); };
      row.querySelector('[data-pd-no]').onclick = e => { e.stopPropagation(); const cc = apCfg(), pend = { ...(cc.pend || {}) }; delete pend[b.id]; apSave({ pend, noDrive: { ...cc.noDrive, [b.id]: true } }); AP.mileage.filter(m => m.bookingId === b.id).forEach(m => st.db.collection('mileage').doc(m.id).delete().catch(() => {})); };
      row.querySelector('[data-pd-go]').onclick = async e => { e.stopPropagation(); const btn = e.currentTarget, a = form.querySelector('input').value.trim(); if (!a) { form.querySelector('input').focus(); return; }
        btn.disabled = true; btn.textContent = 'Measuring…'; try { await measureFrom(b, a); } catch (_) { if (window.toast) window.toast("Couldn't measure that drive. Enter the miles under Add another trip."); } btn.disabled = false; btn.textContent = 'Measure and log'; };
    });
    wrap.querySelectorAll('[data-rec-pause]').forEach(b => b.onclick = e => { e.stopPropagation(); const r = AP.recurring.find(x => x.id === b.dataset.recPause); if (r) { const { id, ...rest } = r; st.db.collection('recurring').doc(id).set({ ...rest, paused: !r.paused, next: r.paused && r.next < todayStr() ? todayStr() : r.next }).catch(() => {}); } });
    wrap.querySelectorAll('[data-rec-del]').forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.armed) { st.db.collection('recurring').doc(b.dataset.recDel).delete().catch(() => {}); if (window.toast) window.toast('Stopped repeating. Past entries stay in your expenses.'); return; } b.dataset.armed = '1'; b.textContent = 'Stop?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '×'; } }, 3500); });
  }

  /* -- for reminders (phone/laptop alerts and the email digest) */
  function apQueue() {
    const out = [], t = todayStr(), c = apCfg();
    for (const x of [...estDates(+t.slice(0, 4) - 1), ...estDates(+t.slice(0, 4))]) {
      if (x.date < t || daysBetween(t, x.date) > 60 || (c.estPayments || []).some(p => +p.year === x.year && p.q === x.q)) continue;
           const sx = stDates(x.year).find(z => z.q === x.q && z.date === x.date), body = `Estimated tax payment (${x.q} ${x.year}) is due ${niceDate(x.date)}${sx ? `. ${myState()[1]} is due the same day` : ''}. See how much to pay in Financials, then log it there.`;
      out.push({ id: `est:${x.year}${x.q}:w`, at: addDays(x.date, -7), kind: 'note', show: 'Estimated taxes', body }, { id: `est:${x.year}${x.q}:d`, at: x.date, kind: 'note', show: 'Estimated taxes', body });
    }
    // the performer's state, when its date differs from the federal one
    for (const x of [...stDates(+t.slice(0, 4) - 1), ...stDates(+t.slice(0, 4))]) {
      if (estDates(x.year).some(z => z.q === x.q && z.date === x.date)) continue;
      if (x.date < t || daysBetween(t, x.date) > 60 || (c.estPayments || []).some(p => +p.year === x.year && p.q === x.q && p.agency === myState()[0])) continue;
      const body = `${myState()[1]} estimated tax payment (${x.q} ${x.year}) is due ${niceDate(x.date)}. See how much to pay in Financials, then log it there.`;
      out.push({ id: `est:${x.year}${x.q}:sw`, at: addDays(x.date, -7), kind: 'note', show: 'Estimated taxes', body }, { id: `est:${x.year}${x.q}:sd`, at: x.date, kind: 'note', show: 'Estimated taxes', body });
    }
    const y = +t.slice(0, 4);
    out.push({ id: `1099:${y - 1}`, at: `${y}-02-02`, kind: 'note', show: 'Tax season', body: `Your ${y - 1} 1099s should have arrived. Check them off in Financials and compare the amounts.` },
      { id: `pack:${y - 1}`, at: `${y}-02-15`, kind: 'note', show: 'Tax season', body: `Your ${y - 1} tax packet is ready: Financials, then Tax report, then Download tax packet.` });
    return out.filter(i => i.at >= addDays(t, -7));
  }

  /* -- for the tax packet */
  function apPacket(R) {
    const y = R.year || +String(R.to).slice(0, 4), c = apCfg();
    const trips = liveTrips().filter(m => String(m.date || '') >= R.from && String(m.date || '') <= R.to).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const miles = trips.reduce((s, m) => s + (+m.miles || 0), 0), pays = (c.estPayments || []).filter(p => +p.year === y);
    const lines = ['', 'TRACKED IN THE APP'];
    lines.push(`  Mileage: ${miles.toLocaleString('en-US')} business miles in ${trips.length} trip${trips.length === 1 ? '' : 's'}${MILE_RATE[y] ? `, about $${Math.round(miles * MILE_RATE[y]).toLocaleString('en-US')} at the IRS standard rate of ${(MILE_RATE[y] * 100).toFixed(1)} cents` : ''}. Log in "05 Mileage log.csv". Your preparer will choose standard mileage or actual car costs.`);
    if (pays.length) { lines.push(`  Estimated tax payments for ${y}:`); pays.sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(p => lines.push(`    - ${p.date} ${agencyName(p.agency)} ${p.q}: $${Number(p.amount).toFixed(2)}`)); }
    else lines.push(`  Estimated tax payments for ${y}: none logged in the app. Bring your records if you made any.`);
    const csv = [['Date', 'Miles', 'Where and why', 'Show'], ...trips.map(m => [m.date, m.miles, m.purpose || '', (bk().find(b => b.id === m.bookingId) || {}).title || ''])].map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\r\n');
    return { lines, mileCsv: csv };
  }

  /* -- smarter expense form: remembers categories by vendor, and can repeat */
  const vKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  function expenseExtras(e) {
    const sh = document.querySelector('#sheetRoot .sheet'); if (!sh || !sh.querySelector('#e-desc')) return;
    const desc = sh.querySelector('#e-desc'), cat = sh.querySelector('#e-cat'), purpose = sh.querySelector('#e-purpose');
    let catTouched = !!e.id; if (cat) cat.addEventListener('change', ev => { if (ev.isTrusted !== false && !cat.__ssxAuto) catTouched = true; });
    const fill = () => {
      const v = AP.vendors[vKey(desc.value)]; if (!v) return;
      if (cat && !catTouched && v.category && [...cat.options].some(o => o.value === v.category) && cat.value !== v.category) { cat.__ssxAuto = true; cat.value = v.category; cat.dispatchEvent(new Event('change', { bubbles: true })); cat.__ssxAuto = false; if (typeof cat._sync === 'function') cat._sync(); }
      if (purpose && !purpose.value.trim() && v.purpose) purpose.value = v.purpose;
    };
    if (!e.id) { desc.addEventListener('change', fill); desc.addEventListener('blur', fill); }
    if (!e.id && !e.recurringId) {
      const row = document.createElement('div'); row.className = 'f';
      row.innerHTML = `<label for="ssx-repeat">Repeats</label><select id="ssx-repeat"><option value="">Doesn't repeat</option><option value="month">Every month (logs itself)</option><option value="year">Every year (logs itself)</option></select>`;
      const anchor = sh.querySelector('.ssx-rcpt') || sh.querySelector('#e-line'); anchor ? anchor.before(row) : sh.querySelector('.actions').before(row);
    }
  }
  function hookAutopilot() {
    if (window.__ssxAP || !st.db) return; window.__ssxAP = true;
    st.db.doc('settings/autopilot').onSnapshot(s => { AP.cfg = s.exists ? s.data() : {}; apTick(true); queueSoon(); }, () => {});
    st.db.doc('settings/vendors').onSnapshot(s => { AP.vendors = s.exists ? s.data() : {}; }, () => {});
    st.db.collection('mileage').onSnapshot(s => { AP.mileage = s.docs.map(d => ({ id: d.id, ...d.data() })); apTick(true); }, () => {});
    st.db.collection('recurring').onSnapshot(s => { AP.recurring = s.docs.map(d => ({ id: d.id, ...d.data() })); runRecurring(); apTick(true); }, () => {});
    setInterval(() => apTick(false), 1000); AP.t0 = Date.now(); setInterval(pruneTrips, 3000);
    setInterval(runRecurring, 6 * 3600 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) runRecurring(); });
    // expense form: vendor memory + "Repeats"
    const ef = window.expenseForm;
    if (typeof ef === 'function') window.expenseForm = function (e = {}) { const out = ef.apply(this, arguments); try { expenseExtras(e || {}); } catch (err) { console.error(err); } return out; };
    const sv = window.save;
    if (typeof sv === 'function') window.save = async function (col, id, data) {
      const form = col === 'expenses' && data && typeof data === 'object' && document.getElementById('e-desc');
      const rep = form ? (document.getElementById('ssx-repeat') || {}).value || '' : '';
      const out = await sv.apply(this, arguments);
      if (form && out) {
        try { const k = vKey(data.desc); if (k) { AP.vendors = { ...AP.vendors, [k]: { category: data.category || '', purpose: data.purpose || '' } }; st.db.doc('settings/vendors').set(AP.vendors).catch(() => {}); } } catch (_) {}
        if (rep && !id) { try { const d = data.date || todayStr(); await st.db.collection('recurring').add({ desc: data.desc || 'Repeating expense', amount: +data.amount || 0, category: data.category || 'Other', otherLabel: data.otherLabel || '', payMethod: data.payMethod || '', purpose: data.purpose || '', every: rep, next: rep === 'year' ? addMonths(d, 12) : addMonths(d, 1), createdAt: new Date().toISOString() }); if (window.toast) window.toast(rep === 'year' ? 'Saved. It will log itself every year.' : 'Saved. It will log itself every month.'); } catch (_) {} }
      }
      return out;
    };
    const home = document.querySelector('section[data-view="home"]'); if (home) new MutationObserver(() => { if (!document.getElementById('ssx-upnext')) renderUpNext(); }).observe(home, { childList: true });
    const money = document.querySelector('section[data-view="money"]'); if (money) new MutationObserver(() => { if (!document.getElementById('ssx-fin')) renderFinCards(); }).observe(money, { childList: true });
  }
  function apTick(force) {
    let b, x, i, p; try { b = S.bookings; x = S.expenses; i = S.income; p = S.profile; } catch (_) { return; }
    const sig = [b, x, i, p, AP.cfg, AP.mileage, AP.recurring, todayStr()];
    if (!force && AP.last && sig.every((v, k) => v === AP.last[k])) return; AP.last = sig;
    // a show just marked Paid: say how much to set aside
    const paidNow = new Set((b || []).filter(z => stat(z) === 'paid').map(z => z.id));
    if (AP.paidSeen) { const fresh = (b || []).filter(z => paidNow.has(z.id) && !AP.paidSeen.has(z.id) && +z.fee > 0); if (fresh.length && window.toast) { const rate = (Number(apCfg().taxRate) || 25) / 100, amt = fresh.reduce((s, z) => s + +z.fee, 0); window.toast(`Paid! Set aside about $${Math.round(amt * rate).toLocaleString('en-US')} (${Math.round(rate * 100)}%) for taxes.`); } }
    AP.paidSeen = paidNow;
    // a booking request you just accepted: open its confirmation email to review
    if (AP.cfg) for (const z of b || []) if (z.requestStatus === 'accepted' && z.reviewedAt && Date.now() - Date.parse(z.reviewedAt) < 20000 && !AP.opened[z.id] && !apCfg().done['confirm:' + z.id]) { AP.opened[z.id] = 1; setTimeout(() => { try { confirmMail(z); apMark('done', 'confirm:' + z.id); } catch (_) {} }, 700); }
    try { renderUpNext(); } catch (e) { console.error(e); }
    try { renderFinCards(); } catch (e) { console.error(e); }
    autoMiles();
  }

  /* ---------- Arrange this page: move blocks up or down, or hide them, on Home, Bookings, Calendar, Financials and Kit.
     Saved to your account (settings/layout), so it follows you to every device. */
  const byId = id => () => document.getElementById(id);
  const byH3 = t => sec => [...sec.children].find(c => c.classList.contains('card') && c.querySelector('h3') && String(c.querySelector('h3').textContent || '').trim().toLowerCase().startsWith(t));
  // [key, label, find(section), shows only when needed]
  const LAYOUT = {
    home: { label: 'Home', blocks: [['welcome', 'Getting started', byId('welcome'), 1], ['upnext', 'Next moves', byId('ssx-upnext'), 1], ['next', 'Next show', byId('nextShow')], ['season', 'Season goals', sec => sec.querySelector(':scope > .grid')], ['goals', 'Goals', byId('ssx-home-goals'), 1], ['pipeline', 'Pipeline', byH3('pipeline')], ['played', "Where you've played", byH3('where you')]] },
    bookings: { label: 'Bookings', blocks: [['requests', 'Booking requests', byId('ssx-requests'), 1], ['link', 'Booking link', byId('ssx-bklink')], ['list', 'Your bookings', () => { const f = document.getElementById('bookingFilter'); return f ? [f, f.nextElementSibling] : null; }]] },
    calendar: { label: 'Calendar', blocks: [['month', 'Month calendar', () => { const c = document.getElementById('cal'); return c && c.closest('.card'); }], ['clash', 'Possible double bookings', byId('clashCard'), 1], ['avail', 'Availability', byH3('availability')]] },
    money: { label: 'Financials', blocks: [['totals', 'Totals (tap one to filter Transactions)', byId('moneyStats')], ['chart', 'By month chart', byH3('by month')], ['tx', 'Transactions', byId('txCard')], ['tax', 'Taxes', byId('ssx-tax')], ['miles', 'Mileage', byId('ssx-miles')], ['rec', 'Repeating expenses', byId('ssx-rec')]] },
    kit: { label: 'Kit', blocks: [['link', 'Booking link', byId('ssx-kit')], ['bio', 'Bio', byH3('bio')], ['links', 'Links', byH3('links')], ['promo', 'Promo content', byH3('promo')], ['rider', 'Tech rider', byH3('tech rider')], ['hosp', 'Hospitality rider', byH3('hospitality')], ['notes', 'Other notes', byH3('other notes')]] },
  };
  const layOf = tab => ((st.layout || {})[tab]) || {};
  function layoutOrder(tab) {
    const def = LAYOUT[tab].blocks.map(b => b[0]), out = (layOf(tab).order || []).filter(k => def.includes(k));
    def.forEach((k, i) => { if (out.includes(k)) return; const prev = def.slice(0, i).reverse().find(p => out.includes(p)); out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k); });
    return out;
  }
  const layEls = (tab, k, sec) => { const b = LAYOUT[tab].blocks.find(x => x[0] === k); let r = null; try { r = b[2](sec); } catch (_) {} return (Array.isArray(r) ? r : [r]).filter(Boolean); };
  function applyLayout(tab) {
    const sec = document.querySelector(`section[data-view="${tab}"]`); if (!sec || !LAYOUT[tab]) return;
    const hid = new Set(layOf(tab).hidden || []), known = new Set();
    layoutOrder(tab).forEach((k, i) => layEls(tab, k, sec).forEach(el => { known.add(el); const o = String(10 + i); if (el.style.order !== o) el.style.order = o; el.classList.toggle('ssx-lay-off', hid.has(k)); }));
    let bar = sec.querySelector(':scope > .ssx-arrbar');
    if (!bar) { bar = document.createElement('div'); bar.className = 'ssx-arrbar'; bar.innerHTML = '<button type="button" class="btn small">⇅ Arrange this page</button>'; bar.querySelector('button').onclick = e => { e.stopPropagation(); arrangeSheet(tab); }; sec.appendChild(bar); }
    [...sec.children].forEach(c => { if (known.has(c) || c.id === 'ssx-fin') return; const o = c.classList.contains('head') ? '-1' : c === bar ? '999' : '500'; if (c.style.order !== o) c.style.order = o; });
  }
  function saveLayout(tab, patch) {
    st.layout = { ...(st.layout || {}), [tab]: { ...layOf(tab), ...patch } };
    applyLayout(tab); if (st.db) st.db.doc('settings/layout').set(st.layout).catch(() => {});
  }
  function arrangeSheet(tab) {
    const L = LAYOUT[tab]; if (!L || typeof sheet !== 'function') return;
    sheet(`<h3>Arrange ${esc(L.label)}</h3><p class="note" style="margin:4px 0 10px">Move blocks up or down, or switch off the ones you don't use. Changes save to your account right away.</p><ol class="ssx-arrlist" id="ssx-arrlist"></ol>
      <div class="actions"><button class="btn" data-lay-reset>Reset to default</button><span class="spacer"></span><button class="btn primary" data-lay-done>Done</button></div>`, root => {
      const draw = () => {
        const order = layoutOrder(tab), hid = new Set(layOf(tab).hidden || []), list = root.querySelector('#ssx-arrlist');
        list.innerHTML = order.map((k, i) => { const b = L.blocks.find(x => x[0] === k); return `<li data-k="${esc(k)}" class="${hid.has(k) ? 'off' : ''}"><span class="ssx-arrname">${esc(b[1])}${b[3] ? '<span class="note">Shows only when there is something to see</span>' : ''}</span>
          <span class="ssx-epk-mv"><button type="button" data-up aria-label="Move ${esc(b[1])} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-dn aria-label="Move ${esc(b[1])} down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></span>
          <label class="ssx-switch"><input type="checkbox" ${hid.has(k) ? '' : 'checked'} aria-label="Show ${esc(b[1])}"><span></span></label></li>`; }).join('');
        list.querySelectorAll('li').forEach(li => {
          const k = li.dataset.k, mv = d => { const o = layoutOrder(tab), i = o.indexOf(k), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; saveLayout(tab, { order: o }); draw(); const f = root.querySelector(`li[data-k="${k}"] [data-${d < 0 ? 'up' : 'dn'}]`); f && !f.disabled && f.focus(); };
          li.querySelector('[data-up]').onclick = e => { e.stopPropagation(); mv(-1); };
          li.querySelector('[data-dn]').onclick = e => { e.stopPropagation(); mv(1); };
          li.querySelector('input').onchange = e => { const h = new Set(layOf(tab).hidden || []); e.target.checked ? h.delete(k) : h.add(k); saveLayout(tab, { hidden: [...h] }); li.classList.toggle('off', !e.target.checked); };
        });
      };
      draw();
      root.querySelector('[data-lay-reset]').onclick = e => { e.stopPropagation(); saveLayout(tab, { order: [], hidden: [] }); draw(); };
      root.querySelector('[data-lay-done]').onclick = e => { e.stopPropagation(); try { close(); } catch (_) {} };
    });
  }
  function hookLayout() {
    if (window.__ssxLay || !st.db) return; window.__ssxLay = true;
    const pend = new Set(); let raf = 0;
    const soon = tab => { pend.add(tab); if (!raf) raf = requestAnimationFrame(() => { raf = 0; [...pend].forEach(t => { try { applyLayout(t); } catch (_) {} }); pend.clear(); }); };
    Object.keys(LAYOUT).forEach(tab => { const sec = document.querySelector(`section[data-view="${tab}"]`); if (!sec) return; sec.classList.add('ssx-lay'); new MutationObserver(() => soon(tab)).observe(sec, { childList: true, subtree: true }); soon(tab); });
    st.db.doc('settings/layout').onSnapshot(s => { st.layout = s.exists ? s.data() : {}; Object.keys(LAYOUT).forEach(soon); }, () => {});
    // the Totals tiles filter Transactions: bring the list into view when it's off screen
    document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#moneyStats [data-tx]'); if (!t) return;
      setTimeout(() => { const c = document.getElementById('txCard'); if (!c || c.classList.contains('ssx-lay-off')) return; const r = c.getBoundingClientRect(); if (r.top > innerHeight * 0.7 || r.top < 0) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); });
  }

  /* ---------- Easier every day: shows move stages on their own, Undo instead of "are you sure", smart pre-fill,
     one search box, a short booking form, quick replies to booking requests, holds from the calendar,
     and a duplicate-people check. */
  const EZ = { skipUndo: 0, bRef: null, cRef: null, cfgRef: null };
  const stageName = k => { try { return ((STATUSES || []).find(s => s[0] === k) || [])[1] || k; } catch (_) { return k; } };
  const stageKey = kind => { try { return ((STATUSES || []).find(s => K(s[0]) === kind) || [kind])[0]; } catch (_) { return kind; } };
  const clone = o => JSON.parse(JSON.stringify(o));

  // -- Undo: put back exactly the fields a change touched
  async function undoPatch(prev, data) {
    const upd = {}; Object.keys(data).forEach(k => { upd[k] = prev[k] === undefined ? null : prev[k]; }); upd.updatedAt = new Date().toISOString();
    EZ.skipUndo++; try { await window.patch('bookings', prev.id, upd); } finally { EZ.skipUndo--; }
    try { syncBookingEvent(prev.id, { ...prev, ...upd }); } catch (_) {}
    try { if (document.querySelector('#sheetRoot .sheet [data-status]')) window.bookingView(prev.id); } catch (_) {}
    if (window.toast) window.toast(`Undone. ${bName(prev)} is ${stageName(prev.status)} again`);
  }

  // -- 1) Confirmed → Played the day after the show (once per show; Undo keeps it Confirmed)
  async function autoStages() {
    if (!st.db || !AP.cfg || EZ.busy || Date.now() - (AP.t0 || Date.now()) < 5000) return;
    const c = apCfg(), t = todayStr(), done = c.autoPlayed || {}, pk = stageKey('played');
    const due = bk().filter(b => stat(b) === 'confirmed' && b.date && b.date < t && daysBetween(b.date, t) <= 30 && !done[b.id]);
    if (!due.length) return;
    EZ.busy = true;
    try { for (const b of due) {
      const prev = clone(b), upd = { status: pk, stageAt: { ...(b.stageAt || {}), [pk]: (b.stageAt || {})[pk] || t }, updatedAt: new Date().toISOString() };
      let ok = null; EZ.skipUndo++; try { ok = await window.patch('bookings', b.id, upd); } finally { EZ.skipUndo--; }
      if (!ok) continue;
      apMark('autoPlayed', b.id, t);
      try { syncBookingEvent(b.id, { ...b, ...upd }); } catch (_) {}
      if (window.toast) window.toast(`${bName(b)} is now ${stageName(pk)}. Nice show!`, () => undoPatch(prev, upd));
    } } finally { EZ.busy = false; }
  }

  // -- 6) quick reply when someone books you through your link
  function ackMail(b) {
    const who = person(b.promoterId || b.venueId || b.contactPersonId), first = who ? String(cName(who) || '').split(' ')[0] : '';
    try { composeSheet({ booking: b.id, to: b.promoterId || b.venueId || '', subject: `Got your booking request${b.date ? ' for ' + niceDate(b.date) : ''}`, body: `Hi ${first || 'there'},\n\nThanks so much for reaching out about ${bName(b)}${b.date ? ' on ' + niceDate(b.date) : ''}! I got your request and I'll get back to you within 48 hours to confirm the details.\n\nTalk soon,\n${myName()}` }); } catch (_) {}
  }

  // -- extra "Up next" items: reply to new requests, paid yet?, duplicate people
  function easeItems(c, t, skip) {
    const out = [];
    for (const b of bk()) {
      if (isRequest(b) && !skip('ack:' + b.id)) out.push({ k: 'ack:' + b.id, at: String(b.createdAt || t).slice(0, 10), icon: '💬', text: `New booking request: <b>${esc(bName(b))}</b>${b.date ? ' on ' + esc(niceDate(b.date)) : ''}. Send a quick "got it" so they know you saw it.`, btn: 'Write reply', mark: true, go: () => ackMail(b) });
      const paidOn = b.paidDate || (b.stageAt || {})[stageKey('paid')] || '', sincePaid = paidOn ? daysBetween(String(paidOn).slice(0, 10), t) : null;
      if (stat(b) === 'paid' && sincePaid !== null && sincePaid >= 30 && sincePaid <= 120 && !skip('rebook:' + b.id)
        && !bk().some(x => x.id !== b.id && x.date && x.date >= t && !['lost'].includes(stat(x)) && ((b.venueId && x.venueId === b.venueId) || (b.promoterId && x.promoterId === b.promoterId))))
        out.push({ k: 'rebook:' + b.id, at: addDays(String(paidOn).slice(0, 10), 30), icon: '🔁', text: `It's been a month since <b>${esc(bName(b))}</b>. A friendly check-in is a great way to land the next date.`, btn: 'Write it', mark: true, go: () => tplOr('rebook', b, `Would love to come back to ${bName(b)}`, `Hi {first},\n\nHope things have been great since ${bName(b)}! I've been thinking about that night and would love to come back.\n\nIf you have any dates coming up, just let me know. Happy to make it work.\n\nWarmly,\n${myName()}`) });
      const since = b.date ? daysBetween(b.date, t) : null;
      if (stat(b) === 'played' && +b.fee > 0 && since !== null && since >= 2 && since <= 90 && !skip('paidq:' + b.id)) {
        const pk = stageKey('paid');
        out.push({ k: 'paidq:' + b.id, at: b.date, icon: '💸', text: `Did you get paid for <b>${esc(bName(b))}</b> (${esc('$' + Number(b.fee).toLocaleString('en-US'))})?`, btn: 'Mark Paid', snooze: 7, go: async () => { await window.patch('bookings', b.id, { status: pk, paidDate: b.paidDate || t, stageAt: { ...(b.stageAt || {}), [pk]: t }, updatedAt: new Date().toISOString() }); } });
      }
    }
    const dp = dupPairs(); if (dp.length && !skip('dups:' + dp.map(x => x[2]).join(',')))
      out.push({ k: 'dups:' + dp.map(x => x[2]).join(','), at: t, icon: '👥', text: `${dp.length} ${dp.length === 1 ? 'contact' : 'contacts'} in People to tidy up: ${dp.some(x => x[3] === 'link') ? 'people to connect to their collective or venue' : ''}${dp.some(x => x[3] === 'link') && dp.some(x => x[3] === 'dup') ? ', and ' : ''}${dp.some(x => x[3] === 'dup') ? 'possible duplicates' : ''}.`, btn: 'Review', snooze: 14, go: () => { try { goTab('contacts'); } catch (_) {} } });
    return out;
  }

  // -- 3) smart pre-fill + 5) short booking form
  function bookingExtras(b) {
    const root = document.querySelector('#sheetRoot .sheet'); if (!root || !root.querySelector('#b-title')) return;
    const acts = root.querySelector('.actions');
    if (acts && !root.querySelector('.ssx-more')) {
      const pick = [['#b-addr', '.f'], ['#b-inctype', '.f'], ['#b-pp', '.f'], ['#b-media', '.frow'], ['#b-drive', '.f'], ['#b-notes', '.f']].map(([s, w]) => { const el = root.querySelector(s); return el && el.closest(w); }).filter(Boolean);
      if (pick.length) {
        const det = document.createElement('details'); det.className = 'ssx-more';
        const filled = !!(b.address || b.notes || b.mediaId || b.ticketUrl || b.driveUrl || b.payInfo || (b.payPrefs || []).length);
        det.innerHTML = `<summary>More details <span class="note">address, payment, media, notes${filled ? ' · has info' : ''}</span></summary><div class="ssx-morebody"></div>`;
        const body = det.querySelector('.ssx-morebody'); pick.forEach(el => body.appendChild(el)); acts.before(det);
      }
    }
    if (b.id) return;
    const venue = root.querySelector('#b-venue'); if (!venue) return;
    const note = document.createElement('p'); note.className = 'note ssx-prefill'; note.hidden = true; (venue.closest('.frow') || venue).after(note);
    const setSel = (sel, v) => { const el = root.querySelector(sel); if (!el || !v || (el.value && el.value !== '')) return false; if (![...el.options].some(o => o.value === v)) return false; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof el._sync === 'function') el._sync(); return true; };
    venue.addEventListener('change', () => {
      const id = venue.value; if (!id || id === '__new__') return;
      const last = bk().filter(x => x.venueId === id).sort((a, c) => String(c.date || '').localeCompare(String(a.date || '')))[0]; if (!last) { note.hidden = true; return; }
      const got = [], fee = root.querySelector('#b-fee');
      if (fee && !fee.value && +last.fee) { fee.value = last.fee; fee.dispatchEvent(new Event('input', { bubbles: true })); got.push('fee'); }
      if (setSel('#b-promo', last.promoterId)) got.push('promoter');
      if (setSel('#b-media', last.mediaId)) got.push('media person');
      try { if (!readTime(root, 'b-ts') && last.setStart) { setTimeSel(root, 'b-ts', last.setStart); if (last.setEnd) setTimeSel(root, 'b-te', last.setEnd); got.push('set time'); } } catch (_) {}
      if (got.length) { note.hidden = false; note.textContent = `Filled in the ${got.join(', ')} from your last show here (${niceDate(last.date)}). Change anything that's different.`; }
    });
  }

  // -- 4) one search box
  function searchSheet() {
    if (typeof sheet !== 'function') return;
    sheet(`<h3>Search</h3><input id="ssx-q" class="ssx-qin" type="search" placeholder="Shows, people, templates, expenses…" autocomplete="off" aria-label="Search everything"><div id="ssx-qres" class="ssx-qres"></div>
      <div class="actions"><button class="btn" data-cancel>Close</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = () => { try { close(); } catch (_) {} };
      const q = root.querySelector('#ssx-q'), res = root.querySelector('#ssx-qres');
      const run = () => {
        const s = q.value.trim().toLowerCase(); if (s.length < 2) { res.innerHTML = '<p class="note">Type at least 2 letters.</p>'; return; }
        const has = (...v) => v.some(x => String(x || '').toLowerCase().includes(s));
        const grp = (n, items) => items.length ? `<div class="ssx-qgrp"><span class="eyebrow">${n}</span><div class="list">${items.slice(0, 8).join('')}</div></div>` : '';
        const row = (attr, t, sub) => `<button type="button" class="row" ${attr}><span class="main"><span class="t" style="display:block">${esc(t)}</span><span class="sub" style="display:block">${esc(sub)}</span></span></button>`;
        let D = {}; try { D = S; } catch (_) {}
        const bks = (D.bookings || []).filter(b => { const v = person(b.venueId), p = person(b.promoterId); return has(b.title, b.city, b.address, b.notes, v && cName(v), p && cName(p), b.date); }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(b => row(`data-q-b="${esc(b.id)}"`, bName(b), [b.date ? niceDate(b.date) : '', stageName(b.status), b.city].filter(Boolean).join(' · ')));
        const ppl = (D.contacts || []).filter(c => has(c.name, c.org, c.email, c.phone, c.ig, c.city)).map(c => row(`data-q-c="${esc(c.id)}"`, cName(c) || c.email || 'Contact', [c.email, c.city].filter(Boolean).join(' · ')));
        const tpl = (D.templates || []).filter(t => has(t.name, t.subject, t.body)).map(t => row(`data-q-t="${esc(t.id)}"`, t.name || t.subject || 'Template', t.subject || ''));
        const mon = [...(D.expenses || []).filter(x => has(x.desc, x.purpose, x.category)).map(x => row(`data-q-x="${esc(x.id)}"`, x.desc || 'Expense', `Expense · $${Number(x.amount || 0).toFixed(2)}${x.date ? ' · ' + niceDate(x.date) : ''}`)),
          ...(D.income || []).filter(x => has(x.desc, x.source)).map(x => row(`data-q-i="${esc(x.id)}"`, x.desc || 'Income', `Income · $${Number(x.amount || 0).toFixed(2)}${x.date ? ' · ' + niceDate(x.date) : ''}`))];
        res.innerHTML = grp('Shows', bks) + grp('People', ppl) + grp('Templates', tpl) + grp('Money', mon) || '<p class="note">Nothing found.</p>';
        const on = (sel, fn) => res.querySelectorAll(sel).forEach(el => el.onclick = () => { try { fn(el); } catch (e) { console.error(e); } });
        on('[data-q-b]', el => window.bookingView(el.dataset.qB));
        on('[data-q-c]', el => contactForm((D.contacts || []).find(c => c.id === el.dataset.qC)));
        on('[data-q-t]', el => templateForm((D.templates || []).find(t => t.id === el.dataset.qT)));
        on('[data-q-x]', el => window.expenseForm((D.expenses || []).find(x => x.id === el.dataset.qX)));
        on('[data-q-i]', el => incomeForm((D.income || []).find(x => x.id === el.dataset.qI)));
      };
      q.addEventListener('input', run); run(); setTimeout(() => q.focus(), 60);
    });
  }

  // -- 7) hold a date for any venue or promoter (new or returning), straight from the calendar
  function holdButton(ds) {
    const sh = document.querySelector('#sheetRoot .sheet'); if (!sh || !ds || ds < todayStr()) return;
    const acts = sh.querySelector('.actions'); if (!acts || acts.querySelector('[data-ssx-hold]')) return;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.dataset.ssxHold = '1'; btn.textContent = 'Hold this date…';
    acts.insertBefore(btn, acts.lastElementChild); btn.onclick = () => holdSheet(ds);
  }
  function holdSheet(ds) {
    let cs = []; try { cs = S.contacts || []; } catch (_) {}
    const by = type => cs.filter(c => c.type === type).sort((a, b) => String(cName(a)).localeCompare(String(cName(b))));
    const og = (label, list) => list.length ? `<optgroup label="${label}">${list.map(c => `<option value="${esc(c.id)}">${esc(cName(c))}</option>`).join('')}</optgroup>` : '';
    const pk = stageKey('pitched'), firm = bk().filter(b => b.date === ds && ['confirmed', 'played', 'paid'].includes(stat(b)));
    sheet(`<h3>Hold ${esc(niceDate(ds))}</h3><p class="note" style="margin:4px 0 10px">Saves the date as <b>${esc(stageName(pk))}</b> so it closes on your booking link. Works for new and returning venues and promoters.</p>
      ${firm.length ? `<p class="warn" style="margin:0 0 10px">You already have ${esc(firm.map(bName).join(', '))} on this date.</p>` : ''}
      <div class="f"><label for="ssx-hv">Who is it with?</label><select id="ssx-hv"><option value="__new__">+ Someone new</option>${og('Venues', by('venue'))}${og('Promoters', by('promoter'))}</select></div>
      <div id="ssx-hnew">
        <div class="f"><label>They are a</label><div class="ssx-chips" id="ssx-htype"><button type="button" class="ssx-chip" data-ht="venue" aria-pressed="true">Venue</button><button type="button" class="ssx-chip" data-ht="promoter" aria-pressed="false">Promoter / collective</button></div></div>
        <div class="f"><label for="ssx-hname">Name</label><input id="ssx-hname" maxlength="120" placeholder="e.g. The Casbah"></div>
        <div class="ssx-grid2"><div class="f"><label for="ssx-hemail">Email (optional)</label><input id="ssx-hemail" type="email" maxlength="160" autocomplete="off" placeholder="booking@venue.com"></div>
          <div class="f"><label for="ssx-hcity">City (optional)</label><input id="ssx-hcity" maxlength="80"></div></div>
        <p class="note" style="margin:0">They're added to People, so next time they're in the list.</p>
      </div>
      <div class="f"><label for="ssx-htitle">Show name (optional)</label><input id="ssx-htitle" maxlength="120" placeholder="Leave blank to use their name"></div>
      <label class="ssx-check"><input type="checkbox" id="ssx-hpitch" checked> Open a pitch email after</label>
      <div class="actions"><button class="btn" data-cancel>Back</button><button class="btn primary" data-hold>Hold date</button></div>`, root => {
      const q = s => root.querySelector(s), sel = q('#ssx-hv'), nw = q('#ssx-hnew'); let type = 'venue';
      if (by('venue').length || by('promoter').length) { sel.value = (by('venue')[0] || by('promoter')[0]).id; }
      const sync = () => { nw.hidden = sel.value !== '__new__'; if (!nw.hidden) setTimeout(() => q('#ssx-hname').focus(), 30); };
      sel.onchange = sync; sync();
      root.querySelectorAll('[data-ht]').forEach(b => b.onclick = () => { type = b.dataset.ht; root.querySelectorAll('[data-ht]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); q('#ssx-hname').placeholder = type === 'venue' ? 'e.g. The Casbah' : 'e.g. Afternoon Umbrella Friends'; });
      q('[data-cancel]').onclick = () => { try { window.daySheet(ds); } catch (_) { try { close(); } catch (__) {} } };
      q('[data-hold]').onclick = async e => {
        const btn = e.currentTarget, now = new Date().toISOString(), t = todayStr(); let id = sel.value, c = null;
        if (id === '__new__') {
          const name = q('#ssx-hname').value.trim(), email = q('#ssx-hemail').value.trim(), city = q('#ssx-hcity').value.trim();
          if (!name) { if (window.toast) window.toast('Add their name'); q('#ssx-hname').focus(); return; }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (window.toast) window.toast('Check the email address'); q('#ssx-hemail').focus(); return; }
          btn.disabled = true;
          c = { type, name: name.slice(0, 120), email: email.slice(0, 160), city: city.slice(0, 80), ...(type === 'promoter' ? { pkind: 'person' } : {}), createdAt: now };
          id = await window.save('contacts', null, c); if (!id) { btn.disabled = false; return; }
          c = { ...c, id };
        } else { c = person(id) || {}; btn.disabled = true; }
        const title = q('#ssx-htitle').value.trim() || cName(c) || 'Hold', pitch = q('#ssx-hpitch').checked;
        const data = { title: title.slice(0, 120), date: ds, status: pk, stageAt: { [pk]: t }, city: c.city || '', [c.type === 'promoter' ? 'promoterId' : 'venueId']: id, createdAt: now, updatedAt: now };
        const nid = await window.save('bookings', null, data); if (!nid) { btn.disabled = false; return; }
        try { close(); } catch (_) {}
        if (window.toast) window.toast(`Held ${niceDate(ds)} for ${cName(c) || title}`);
        let n = 0; const after = () => { const b = bk().find(x => x.id === nid); if (!b && n++ < 20) return setTimeout(after, 200);
          try { syncBookingEvent(nid, { ...data, id: nid }); } catch (_) {}
          if (!pitch) return;
          const to = c.bookingContactId || id, first = String(cName(person(c.bookingContactId) || c) || '').split(' ')[0];
          try { (S.templates || []).some(x => x.id === 'venue-pitch') ? useTemplate('venue-pitch', nid) : composeSheet({ booking: nid, to, subject: `Booking inquiry: ${niceDate(ds)}`, body: `Hi ${first || 'there'},\n\nI'd love to play ${cName(c) || 'for you'} on ${niceDate(ds)}. I'm holding the date for you for now. Let me know if it works and I'll send everything you need.\n\nThanks,\n${myName()}` }); } catch (_) {} };
        setTimeout(after, 300);
      };
    });
  }
  // -- 8) duplicate people. A collective and the person who runs it can share an email: that's a link, not a duplicate.
  const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const kindOf = c => c.type === 'promoter' ? (c.pkind === 'collective' ? 'collective' : 'person') : (c.type || 'other');
  const cids = p => [...new Set([...(p.collectiveIds || []), p.collectiveId].filter(Boolean))];
  function linked(a, b) {
    const one = (x, y) => cids(x).includes(y.id) || x.mainContactId === y.id || x.bookingContactId === y.id || x.runBy === y.id
      || (x.memberIds || []).includes(y.id) || (x.venueIds || []).includes(y.id) || (x.promoterIds || []).includes(y.id);
    return one(a, b) || one(b, a);
  }
  // [a, b, key, 'dup' | 'link']  ('link' = a collective or venue and a person who share an email but aren't connected yet)
  function dupPairs() {
    let cs = []; try { cs = S.contacts || []; } catch (_) {}
    const nd = apCfg().notDup || {}, out = [];
    for (let i = 0; i < cs.length && out.length < 20; i++) for (let j = i + 1; j < cs.length && out.length < 20; j++) {
      const a = cs[i], b = cs[j], k = [a.id, b.id].sort().join('|'); if (nd[k] || linked(a, b)) continue;
      const ea = String(a.email || '').trim().toLowerCase(), eb = String(b.email || '').trim().toLowerCase(), na = normName(cName(a)), nb = normName(cName(b));
      const sameEmail = !!ea && ea === eb, sameName = na.length > 2 && na === nb, ka = kindOf(a), kb = kindOf(b);
      if (ka === kb && (sameEmail || sameName)) out.push([a, b, k, 'dup']);
      else if (sameEmail && [ka, kb].includes('person') && ([ka, kb].includes('collective') || [ka, kb].includes('venue'))) out.push(ka === 'person' ? [b, a, k, 'link'] : [a, b, k, 'link']);
    }
    return out;
  }
  // connect a person to the collective or venue they run, instead of merging them
  async function linkContacts(org, p) {
    if (!st.db) return;
    if (kindOf(org) === 'collective') {
      if (!org.mainContactId) await window.patch('contacts', org.id, { mainContactId: p.id });
      await window.patch('contacts', p.id, { collectiveIds: [...new Set([...cids(p), org.id])] });
    } else if (!org.bookingContactId) await window.patch('contacts', org.id, { bookingContactId: p.id });
    else await window.patch('contacts', p.id, { venueIds: [...new Set([...(p.venueIds || []), org.id])] });
    if (window.toast) window.toast(`Connected ${cName(p)} to ${cName(org)}`);
  }
  async function mergeContacts(a, b) {
    if (!st.db) return;
    const uses = c => bk().filter(x => [x.venueId, x.promoterId, x.mediaId, x.contactPersonId].includes(c.id)).length;
    const [keep, drop] = uses(b) > uses(a) ? [b, a] : [a, b];
    const merged = { ...keep };
    for (const [k, v] of Object.entries(drop)) { if (k === 'id' || k === 'createdAt') continue; const cur = merged[k];
      if (Array.isArray(v)) merged[k] = [...new Set([...(Array.isArray(cur) ? cur : []), ...v])];
      else if (cur === undefined || cur === null || cur === '') merged[k] = v; }
    const swap = v => v === drop.id ? keep.id : v;
    ['venueIds', 'promoterIds', 'memberIds', 'collectiveIds'].forEach(f => { if (Array.isArray(merged[f])) merged[f] = [...new Set(merged[f].map(swap))].filter(x => x !== keep.id); });
    ['bookingContactId', 'mainContactId', 'runBy', 'collectiveId'].forEach(f => { if (merged[f] === drop.id || merged[f] === keep.id) merged[f] = ''; });
    const { id: _k, ...keepData } = merged; await st.db.collection('contacts').doc(keep.id).set(keepData);
    for (const x of bk()) { const upd = {}; ['venueId', 'promoterId', 'mediaId', 'contactPersonId'].forEach(f => { if (x[f] === drop.id) upd[f] = keep.id; }); if (Object.keys(upd).length) await window.patch('bookings', x.id, upd); }
    let cs = [], inc = []; try { cs = S.contacts || []; inc = S.income || []; } catch (_) {}
    for (const c of cs) { if (c.id === keep.id || c.id === drop.id) continue; let ch = false; const n = { ...c };
      ['bookingContactId', 'mainContactId', 'runBy', 'collectiveId'].forEach(f => { if (n[f] === drop.id) { n[f] = keep.id; ch = true; } });
      ['venueIds', 'promoterIds', 'memberIds', 'collectiveIds'].forEach(f => { if (Array.isArray(n[f]) && n[f].includes(drop.id)) { n[f] = [...new Set(n[f].map(swap))]; ch = true; } });
      if (ch) { const { id, ...d } = n; await st.db.collection('contacts').doc(id).set(d).catch(() => {}); } }
    for (const i of inc) if (i.sourceId === drop.id) { const { id, ...d } = i; await st.db.collection('income').doc(id).set({ ...d, sourceId: keep.id }).catch(() => {}); }
    await ntMerge(keep, drop);
    await st.db.collection('contacts').doc(drop.id).delete().catch(() => {});
    if (window.toast) window.toast(`Merged into ${cName(keep) || 'one contact'}`);
  }
  function renderDups() {
    const sec = document.querySelector('section[data-view="contacts"]'); if (!sec || !st.db) return;
    const list = dupPairs(); let box = document.getElementById('ssx-dups');
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'ssx-dups'; box.className = 'card ssx ssx-kitcard'; const head = sec.querySelector(':scope > .head'); head ? head.after(box) : sec.prepend(box); }
    const line = c => `<b>${esc(cName(c) || 'No name')}</b>${c.email ? ` · ${esc(c.email)}` : ''}${c.city ? ` · ${esc(c.city)}` : ''}`;
    const dups = list.filter(x => x[3] === 'dup'), links = list.filter(x => x[3] === 'link');
    box.innerHTML = `<div class="ssx-head"><div><h3>Tidy up People <span class="ssx-pill on">${list.length}</span></h3><p class="note">A collective or venue and the person who runs it can share an email. Connect them so both stay, and each keeps its own shows.</p></div></div>
      ${links.length ? `<div class="ssx-uplist"><b>Connect</b>${links.map(([org, p, k]) => `<div class="ssx-upi" data-dup="${esc(k)}"><span class="ssx-upic">🔗</span><span class="ssx-uptx"><b>${esc(cName(p))}</b> looks like the ${kindOf(org) === 'collective' ? 'person who runs' : 'booking contact for'} <b>${esc(cName(org))}</b> (same email).</span><span class="ssx-upbt"><button type="button" class="btn small primary" data-dup-link>Connect them</button><button type="button" class="btn small" data-dup-no>Not related</button></span></div>`).join('')}</div>` : ''}
      ${dups.length ? `<div class="ssx-uplist"><b>Possible duplicates</b><p class="note" style="margin:0">Same kind of contact with the same email or name. Merging keeps every show, payment and note under one.</p>${dups.map(([a, b, k]) => `<div class="ssx-upi" data-dup="${esc(k)}"><span class="ssx-upic">👥</span><span class="ssx-uptx">${line(a)}<br>${line(b)}</span><span class="ssx-upbt"><button type="button" class="btn small primary" data-dup-go>Merge</button><button type="button" class="btn small" data-dup-no>Not the same</button></span></div>`).join('')}</div>` : ''}`;
    box.querySelectorAll('[data-dup]').forEach(row => {
      const pair = list.find(x => x[2] === row.dataset.dup); if (!pair) return;
      const go = row.querySelector('[data-dup-go]'); if (go) go.onclick = async e => { e.stopPropagation(); e.currentTarget.disabled = true; e.currentTarget.textContent = 'Merging…'; try { await mergeContacts(pair[0], pair[1]); } catch (err) { console.error(err); if (window.toast) window.toast("Couldn't merge. Try again."); } };
      const ln = row.querySelector('[data-dup-link]'); if (ln) ln.onclick = async e => { e.stopPropagation(); e.currentTarget.disabled = true; try { await linkContacts(pair[0], pair[1]); } catch (err) { console.error(err); if (window.toast) window.toast("Couldn't connect them. Try again."); } };
      row.querySelector('[data-dup-no]').onclick = e => { e.stopPropagation(); apMark('notDup', pair[2]); setTimeout(renderDups, 100); };
    });
  }
  function hookEase() {
    if (window.__ssxEase || !st.db) return; window.__ssxEase = true;
    // Undo for stage changes
    const pt = window.patch;
    if (typeof pt === 'function') window.patch = async function (col, id, data) {
      const p = col === 'bookings' && data && typeof data === 'object' && 'status' in data ? bk().find(b => b.id === id) : null, prev = p ? clone(p) : null;
      const out = await pt.apply(this, arguments);
      if (out && prev && !EZ.skipUndo && prev.status !== data.status) {
        const label = data.requestStatus === 'accepted' ? 'Request accepted' : data.requestStatus === 'declined' ? 'Request declined' : `${bName(prev)} moved to ${stageName(data.status)}`;
        setTimeout(() => { if (window.toast) window.toast(label, () => undoPatch(prev, data)); }, 80);
      }
      return out;
    };
    // Undo for deletes (no more "tap again to delete"; files from your Kit still ask first)
    const rm = window.remove;
    if (typeof rm === 'function') window.remove = async function (col, id) {
      let snap = null; try { const arr = S[col]; snap = Array.isArray(arr) ? arr.find(x => x.id === id) : null; } catch (_) {}
      snap = snap ? clone(snap) : null;
      const out = await rm.apply(this, arguments);
      if (snap && col !== 'kitFiles') setTimeout(() => { if (window.toast) window.toast('Deleted', async () => {
        const { id: _i, ...data } = snap; if (col === 'bookings') delete data.gcal;
        await st.db.collection(col).doc(id).set(data).catch(() => {});
        if (col === 'bookings') setTimeout(() => { try { syncBookingEvent(id, { ...data, id }); } catch (_) {} }, 800);
        if (window.toast) window.toast('Restored');
      }); }, 80);
      return out;
    };
    const ad = window.armDelete;
    if (typeof ad === 'function') window.armDelete = function (root, fn) { if (String(fn).includes('kitFiles')) return ad.apply(this, arguments); const b = root && root.querySelector('[data-del]'); if (!b) return; b.onclick = () => { b.disabled = true; fn(); }; };
    // short form + smart pre-fill
    const bf = window.bookingForm;
    if (typeof bf === 'function') window.bookingForm = function (b = {}) { const out = bf.apply(this, arguments); try { bookingExtras(b || {}); } catch (e) { console.error(e); } return out; };
    // hold from the calendar
    const dsh = window.daySheet;
    if (typeof dsh === 'function') window.daySheet = function (ds) { const out = dsh.apply(this, arguments); try { holdButton(ds); } catch (e) { console.error(e); } return out; };
    // search: a button in the top bar, plus "/" or Ctrl/Cmd+K
    const topr = document.querySelector('header.top .topr');
    if (topr && !document.getElementById('ssx-search')) { const s = document.createElement('button'); s.className = 'iconbtn'; s.id = 'ssx-search'; s.type = 'button'; s.setAttribute('aria-label', 'Search'); s.title = 'Search (/)';
      s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
      s.onclick = searchSheet; topr.prepend(s); }
    document.addEventListener('keydown', e => { const t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); searchSheet(); } });
    // background: auto stages + duplicates
    setInterval(() => { try { let b = null, c = null; try { b = S.bookings; c = S.contacts; } catch (_) {}
      if (b !== EZ.bRef || AP.cfg !== EZ.cfgRef) { EZ.bRef = b; EZ.cfgRef = AP.cfg; EZ.cRef = c; autoStages(); renderDups(); }
      else if (c !== EZ.cRef) { EZ.cRef = c; renderDups(); }
      autoStages(); } catch (e) { console.error(e); } }, 1500);
  }

  /* ---------- Friendlier forms: fill-ins show as bubbles, tasks are easy to tap, and places fill themselves in. */

  // -- Fill-ins as bubbles: {{venue}} shows as a "Venue name" pill in templates and the email window
  const fillLabels = () => { const m = {}; try { FILLINS.forEach(([, items]) => items.forEach(([k, l]) => { m[k] = l; })); } catch (_) {} return m; };
  const TOK = { forms: new WeakMap() };
  function tokenEditor(field, multi) {
    if (!field || field.__ssxTok) return null; field.__ssxTok = true;
    const L = fillLabels(), ed = document.createElement('div');
    ed.className = 'ssx-tokedit' + (multi ? ' multi' : ''); ed.contentEditable = 'true'; ed.spellcheck = true;
    ed.setAttribute('role', 'textbox'); if (multi) ed.setAttribute('aria-multiline', 'true');
    const lab = field.id && document.querySelector(`label[for="${field.id}"]`); if (lab) { ed.setAttribute('aria-label', lab.textContent.trim()); lab.addEventListener('click', e => { e.preventDefault(); ed.focus(); }); }
    if (multi) ed.style.minHeight = field.style.minHeight || '200px';
    field.classList.add('ssx-tokhide'); field.tabIndex = -1; field.after(ed);
    const pill = k => `<span class="ssx-tok" contenteditable="false" data-tok="${esc(k)}">${esc(L[k] || String(k).replace(/_/g, ' '))}</span>`;
    let last = null, range = null;
    const render = () => { last = field.value; ed.innerHTML = esc(field.value).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => pill(k)).replace(/\n/g, '<br>') + (multi ? '<br data-fill="1">' : ''); };
    const toText = () => { let out = '';
      const walk = n => { for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.nodeValue.replace(/\u200b/g, '');
        else if (c.nodeName === 'BR') { if (!c.dataset.fill) out += '\n'; }
        else if (c.dataset && c.dataset.tok) out += `{{${c.dataset.tok}}}`;
        else { if (/^(DIV|P)$/.test(c.nodeName) && out && !out.endsWith('\n')) out += '\n'; walk(c); } } };
      walk(ed); return multi ? out : out.replace(/\n/g, ' '); };
    const sync = () => { const v = toText(); if (v !== field.value) { field.value = v; field.dispatchEvent(new Event('input', { bubbles: true })); } last = field.value; };
    const keep = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
    ed.addEventListener('input', () => { sync(); keep(); });
    ['keyup', 'mouseup', 'focus'].forEach(ev => ed.addEventListener(ev, keep));
    ed.addEventListener('focus', () => { const f = field.closest('.sheet'); if (f) TOK.forms.set(f, api); field.dispatchEvent(new Event('focus')); });
    ed.addEventListener('blur', () => { sync(); if (/\{\{\s*[a-z0-9_]+\s*\}\}/i.test(toText()) && [...ed.childNodes].some(n => n.nodeType === 3 && /\{\{/.test(n.nodeValue))) render(); });
    ed.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); if (multi && !document.execCommand('insertLineBreak')) { const s = getSelection(); if (s.rangeCount) { const r = s.getRangeAt(0), br = document.createElement('br'); r.deleteContents(); r.insertNode(br); r.setStartAfter(br); s.removeAllRanges(); s.addRange(r); } } sync(); });
    ed.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, multi ? t : t.replace(/\s*\n\s*/g, ' ')); sync(); });
    const api = { field, ed, insert(k) {
      ed.focus(); const s = getSelection(); let r = range && ed.contains(range.startContainer) ? range : null;
      if (!r) { r = document.createRange(); const end = ed.querySelector('br[data-fill]'); end ? r.setStartBefore(end) : r.selectNodeContents(ed); r.collapse(!end ? false : true); }
      const tmp = document.createElement('span'); tmp.innerHTML = pill(k); const node = tmp.firstChild, sp = document.createTextNode('\u200b');
      r.deleteContents(); r.insertNode(sp); r.insertNode(node); r.setStartAfter(sp); r.collapse(true); s.removeAllRanges(); s.addRange(r); range = r.cloneRange(); sync(); } };
    render();
    const iv = setInterval(() => { if (!ed.isConnected) return clearInterval(iv); if (field.value !== last && document.activeElement !== ed) render(); }, 400);
    return api;
  }
  // the "Insert a fill-in" menus: friendly labels, and the bubble goes where your cursor is
  document.addEventListener('change', e => {
    const sel = e.target; if (!sel || !/^(t-fill|cm-fill)$/.test(sel.id) || !sel.value) return;
    const sh = sel.closest('.sheet'), api = sh && (TOK.forms.get(sh) || (sh.__ssxBody)); if (!api) return;
    const k = sel.value; sel.value = ''; api.insert(k);
  }, true);
  function friendlyFills(root) {
    [['#t-subj', '#t-body', '#t-fill'], ['#cm-subj', '#cm-body', '#cm-fill']].forEach(([s, b, f]) => {
      const subj = root.querySelector(s), body = root.querySelector(b), sel = root.querySelector(f); if (!body || body.__ssxTok) return;
      const bApi = tokenEditor(body, true); tokenEditor(subj, false);
      const sh = body.closest('.sheet'); if (sh && bApi) sh.__ssxBody = bApi;
      if (sel) sel.querySelectorAll('option').forEach(o => { o.textContent = o.textContent.replace(/\s*·\s*\{\{[^}]*\}\}\s*$/, ''); });
    });
  }

  // -- To-do rows: tap anywhere on the left of a task (not just the tiny box) to check it off
  document.addEventListener('click', e => {
    const row = e.target.closest && e.target.closest('.trow'); if (!row || e.target.closest('.tcb, .tmain, a, button, input, select')) return;
    const cb = row.querySelector('.tcb'); if (cb) cb.click();
  });

  // -- Place search: venue names and addresses fill themselves in (free, from OpenStreetMap via Photon)
  const PLACE = { cache: new Map() };
  const placeAddr = p => { const a = [[p.housenumber, p.street].filter(Boolean).join(' '), p.city || p.town || p.village || p.district, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean); return a.join(', '); };
  async function placeSearch(q, kind) {
    const h = (apCfg().home || {}), key = kind + '|' + q.toLowerCase(); if (PLACE.cache.has(key)) return PLACE.cache.get(key);
    const u = `https://photon.komoot.io/api/?limit=6&lang=en&q=${encodeURIComponent(q.slice(0, 120))}${h.lat ? `&lat=${h.lat}&lon=${h.lon}` : ''}${kind === 'addr' ? '&layer=house&layer=street&layer=city' : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error('place ' + r.status);
    const j = await r.json(), out = (j.features || []).map(f => { const p = f.properties || {}; return { name: p.name || '', addr: placeAddr(p), city: p.city || p.town || p.village || '', lat: f.geometry && f.geometry.coordinates[1], lon: f.geometry && f.geometry.coordinates[0], osm: p.osm_type && p.osm_id ? p.osm_type + p.osm_id : '', kind: p.osm_value || '' }; }).filter(x => x.name || x.addr);
    PLACE.cache.set(key, out); return out;
  }
  async function placeExtras(osm) { // website and phone for a picked place (one lookup, only after you pick)
    if (!osm) return {}; try { const r = await fetch(`https://nominatim.openstreetmap.org/lookup?format=jsonv2&extratags=1&osm_ids=${encodeURIComponent(osm)}`); if (!r.ok) return {}; const j = (await r.json())[0] || {}, x = j.extratags || {}; return { website: x.website || x['contact:website'] || x.url || '', phone: x.phone || x['contact:phone'] || '' }; } catch (_) { return {}; }
  }
  function placeAuto(input, kind, onPick) {
    if (!input || input.__ssxPlace) return; input.__ssxPlace = true; input.setAttribute('autocomplete', 'off');
    const wrap = input.parentElement; wrap.classList.add('ssx-placewrap');
    const box = document.createElement('div'); box.className = 'ssx-place'; box.hidden = true; box.setAttribute('role', 'listbox'); input.after(box);
    let t = 0, items = [], at = -1, seq = 0, picked = '';
    const hide = () => { box.hidden = true; at = -1; };
    const draw = () => { box.innerHTML = items.map((p, i) => `<button type="button" class="ssx-placeopt${i === at ? ' on' : ''}" role="option" data-i="${i}"><b>${esc(kind === 'addr' ? (p.addr || p.name) : (p.name || p.addr))}</b>${kind === 'addr' ? (p.name && p.addr && p.name !== p.addr ? `<span>${esc(p.name)}</span>` : '') : (p.addr ? `<span>${esc(p.addr)}</span>` : '')}</button>`).join('') + '<span class="ssx-placeattr">Places from OpenStreetMap</span>'; box.hidden = !items.length;
      box.querySelectorAll('[data-i]').forEach(b => b.onmousedown = ev => { ev.preventDefault(); pick(items[+b.dataset.i]); }); };
    const pick = async p => { hide(); if (!p) return; clearTimeout(t); seq++; items = []; input.value = kind === 'addr' ? (p.addr || p.name) : (p.name || input.value); picked = input.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      try { if (p.addr && p.lat) { const g = { ...(apCfg().geo || {}) }; g[normAddr(p.addr)] = { lat: p.lat, lon: p.lon, city: p.city }; AP.cfg = { ...apCfg(), geo: g }; } } catch (_) {}
      try { await onPick(p); } catch (_) {} };
    input.addEventListener('input', () => { clearTimeout(t); if (picked && input.value === picked) { hide(); return; } picked = ''; const q = input.value.trim(); if (q.length < 3) { items = []; hide(); return; }
      t = setTimeout(async () => { const my = ++seq; try { const r = await placeSearch(q, kind); if (my !== seq || document.activeElement !== input) return; items = r; at = -1; draw(); } catch (_) { hide(); } }, 320); });
    input.addEventListener('keydown', e => { if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
      else if (e.key === 'Enter' && at >= 0) { e.preventDefault(); pick(items[at]); } else if (e.key === 'Escape') hide(); });
    input.addEventListener('blur', () => setTimeout(hide, 150));
  }
  const fillIfEmpty = (root, sel, v) => { const el = root.querySelector(sel); if (el && v && !el.value.trim()) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
  function enhancePlaces(root) {
    const venueForm = root.querySelector('#c-addr');
    if (venueForm) {
      placeAuto(root.querySelector('#c-org'), 'place', async p => { fillIfEmpty(root, '#c-addr', p.addr); fillIfEmpty(root, '#c-city', p.city); const x = await placeExtras(p.osm); fillIfEmpty(root, '#c-site', x.website); fillIfEmpty(root, '#c-phone', x.phone); });
      placeAuto(root.querySelector('#c-addr'), 'addr', async p => { fillIfEmpty(root, '#c-city', p.city); });
    }
    placeAuto(root.querySelector('#b-addr'), 'addr', async p => { fillIfEmpty(root, '#b-city', p.city); });
    placeAuto(root.querySelector('#ssx-am-home'), 'addr', async () => {});
    const hn = root.querySelector('#ssx-hname'); if (hn) placeAuto(hn, 'place', async p => { fillIfEmpty(root, '#ssx-hcity', p.city); });
  }
  function hookForms() {
    if (window.__ssxForms) return; window.__ssxForms = true;
    const scan = () => { ['#sheetRoot', '#composeRoot', 'section[data-view="money"]'].forEach(s => { const r = document.querySelector(s); if (!r) return; try { friendlyFills(r); } catch (e) { console.error(e); } try { enhancePlaces(r); } catch (e) { console.error(e); } }); };
    let raf = 0; const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); };
    ['#sheetRoot', '#composeRoot'].forEach(s => { const r = document.querySelector(s); if (r) new MutationObserver(soon).observe(r, { childList: true, subtree: true }); });
    setInterval(scan, 2000); scan();
  }

  /* ---------- Notes: dated notes on every booking, person and venue. A note on a show also appears on the
     people connected to it, and notes on a person also appear on their shows. Plus the Edit availability panel. */
  const NTS = { draft: {}, month: null, done: false };
  const ntAll = () => { try { return S.notes || []; } catch (_) { return []; } };
  const ntDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const ntNewest = l => [...l].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const ntKey = (kind, id) => `${kind}:${id}`;
  const ntField = kind => kind === 'booking' ? 'bookingId' : 'contactId';
  const ntShows = cid => { let l = []; try { l = S.bookings || []; } catch (_) {} return l.filter(b => [b.venueId, b.promoterId, b.mediaId, b.contactPersonId].includes(cid)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); };
  const ntRec = (kind, id) => { try { return (kind === 'booking' ? S.bookings : S.contacts).find(x => x.id === id); } catch (_) { return null; } };
  function ntLinked(kind, id) {
    const rec = ntRec(kind, id); if (!rec) return [];
    if (kind === 'booking') {
      const ids = [...new Set([rec.venueId, rec.promoterId, rec.contactPersonId, rec.mediaId].filter(Boolean))];
      return ntAll().filter(n => ids.includes(n.contactId)).map(n => ({ n, from: cName(contact(n.contactId)) || 'Contact', open: () => reachSheet(n.contactId) }));
    }
    const shows = ntShows(id);
    return ntAll().filter(n => shows.some(b => b.id === n.bookingId)).map(n => { const b = shows.find(x => x.id === n.bookingId); return { n, from: showName(b), open: () => window.bookingView(b.id) }; });
  }
  function ntDraw(box) {
    const list = box.querySelector('.ssx-nlist'); if (!list || list.querySelector('.ssx-nedit')) return;
    const { kind, id, pin } = box.dataset, rec = ntRec(kind, id);
    const own = ntNewest(ntAll().filter(n => n[ntField(kind)] === id)), more = ntLinked(kind, id).sort((a, b) => String(b.n.at || '').localeCompare(String(a.n.at || '')));
    const shows = kind === 'contact' ? ntShows(id) : [];
    list.innerHTML = `${pin && rec && rec.notes ? `<div class="ssx-nit ssx-npin"><p>${esc(rec.notes)}</p><div class="ssx-nmeta"><span>Pinned note</span><button type="button" data-nt-pin>Edit</button></div></div>` : ''}
      ${own.map(n => `<div class="ssx-nit" data-nt="${esc(n.id)}"><p>${esc(n.text)}</p><div class="ssx-nmeta"><span>${esc(ntDay(n.at))}${n.editedAt ? ' · edited' : ''}</span><button type="button" data-nt-edit>Edit</button><button type="button" data-nt-del>Delete</button></div></div>`).join('')}
      ${!own.length && !(pin && rec && rec.notes) ? `<p class="note" style="margin:0">Nothing yet. Add what you'll want to remember next time.</p>` : ''}
      ${more.length ? `<span class="eyebrow">${kind === 'booking' ? 'From the people on this show' : 'From shows together'}</span>${more.map((m, i) => `<div class="ssx-nit"><p>${esc(m.n.text)}</p><div class="ssx-nmeta"><span>${esc(ntDay(m.n.at))}</span><button type="button" data-nt-from="${i}">${esc(m.from)}</button></div></div>`).join('')}` : ''}
      ${shows.length ? `<span class="eyebrow">Shows together · ${shows.length}</span><div class="ssx-nshows">${shows.slice(0, 6).map(b => `<button type="button" data-nt-show="${esc(b.id)}"><span>${esc(showName(b))}</span><span class="note">${esc(b.date ? fmtD(b.date) : 'No date')}</span></button>`).join('')}</div>` : ''}`;
    const pinBtn = list.querySelector('[data-nt-pin]'); if (pinBtn) pinBtn.onclick = () => { const r = ntRec(kind, id); if (r) (kind === 'booking' ? bookingForm : contactForm)(r); };
    list.querySelectorAll('[data-nt-from]').forEach(b => { b.onclick = () => more[+b.dataset.ntFrom].open(); });
    list.querySelectorAll('[data-nt-show]').forEach(b => { b.onclick = () => window.bookingView(b.dataset.ntShow); });
    list.querySelectorAll('[data-nt]').forEach(row => {
      const n = own.find(x => x.id === row.dataset.nt); if (!n) return;
      row.querySelector('[data-nt-edit]').onclick = () => {
        row.classList.add('ssx-nedit');
        row.innerHTML = `<textarea aria-label="Edit note" maxlength="4000">${esc(n.text)}</textarea><div class="ssx-nmeta"><button type="button" data-nt-save>Save</button><button type="button" data-nt-cancel>Cancel</button></div>`;
        const ta = row.querySelector('textarea'); ta.focus();
        row.querySelector('[data-nt-cancel]').onclick = () => { row.classList.remove('ssx-nedit'); ntDraw(box); };
        row.querySelector('[data-nt-save]').onclick = async () => {
          const text = ta.value.trim(); if (!text) return;
          const { id: nid, ...data } = n, next = { ...data, text, editedAt: new Date().toISOString() };
          if (await window.save('notes', nid, next)) { if (S.notes) S.notes = S.notes.map(x => x.id === nid ? { id: nid, ...next } : x); row.classList.remove('ssx-nedit'); ntDraw(box); }
        };
      };
      row.querySelector('[data-nt-del]').onclick = async () => {
        const { id: nid, ...data } = n;
        try { await st.db.collection('notes').doc(nid).delete(); } catch (_) { if (window.toast) window.toast("Couldn't delete that note. Try again."); return; }
        if (S.notes) S.notes = S.notes.filter(x => x.id !== nid);
        ntRefresh();
        if (window.toast) window.toast('Note deleted', async () => { if (await window.save('notes', nid, data)) { if (S.notes && !S.notes.some(x => x.id === nid)) S.notes = [...S.notes, { id: nid, ...data }]; ntRefresh(); } });
      };
    });
  }
  const ntRefresh = () => document.querySelectorAll('.ssx-notes').forEach(ntDraw);
  function ntMount(kind, id, pin, place) {
    const sh = document.querySelector('#sheetRoot .sheet'); if (!sh || !id) return;
    const key = ntKey(kind, id), box = document.createElement('div');
    box.className = 'ssx-notes'; box.dataset.kind = kind; box.dataset.id = id; if (pin) box.dataset.pin = '1';
    box.innerHTML = `<div class="eyebrow">Notes</div><div class="ssx-nadd"><textarea aria-label="Add a note" maxlength="4000" placeholder="${kind === 'booking' ? 'Load-in, sound, who you spoke to, how the night went…' : 'What they like, who to ask for, how you met…'}"></textarea><button type="button" class="btn small primary" data-nt-add>Add note</button></div><div class="ssx-nlist"></div>`;
    const ta = box.querySelector('textarea'); ta.value = NTS.draft[key] || ''; ta.oninput = () => { NTS.draft[key] = ta.value; };
    const add = async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const data = { text, at: new Date().toISOString(), [ntField(kind)]: id }, btn = box.querySelector('[data-nt-add]'); btn.disabled = true;
      const nid = await window.save('notes', null, data); btn.disabled = false; if (!nid) return;
      if (!ntAll().some(x => x.id === nid)) S.notes = [...ntAll(), { id: nid, ...data }];
      ta.value = ''; delete NTS.draft[key]; ntRefresh();
    };
    box.querySelector('[data-nt-add]').onclick = add;
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } };
    place(sh, box); ntDraw(box);
  }
  const ntBeforeActions = (sh, box) => { const a = [...sh.querySelectorAll(':scope > .actions')].pop(); a ? a.before(box) : sh.appendChild(box); };
  // the Edit availability panel on Calendar: tap days to block them. Same list as Settings → Booking link.
  function ntAvailPanel() {
    const btn = document.getElementById('availEdit'), p = document.getElementById('availPanel'); if (!btn || !p) return;
    btn.textContent = p.hidden ? 'Edit availability' : 'Done';
    const hint = document.querySelector('#openDates .note'); if (hint && hint.textContent.includes('under Filters')) hint.textContent = hint.textContent.replace('under Filters', 'under Edit availability');
    if (p.hidden) return;
    if (!NTS.month) { const n = new Date(); NTS.month = new Date(n.getFullYear(), n.getMonth(), 1); }
    const t0 = todayStr(), blocked = blockedDays(t0), auto = new Set(((st.link && st.link.blocked) || []).filter(d => d >= t0 && !blocked.has(d)));
    const y = NTS.month.getFullYear(), mo = NTS.month.getMonth(), now = new Date(), canBack = y > now.getFullYear() || (y === now.getFullYear() && mo > now.getMonth());
    let cells = '<span></span>'.repeat(new Date(y, mo, 1).getDay());
    for (let d = 1, last = new Date(y, mo + 1, 0).getDate(); d <= last; d++) {
      const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, on = blocked.has(ds), busy = !on && auto.has(ds);
      cells += `<button type="button" class="ssx-bd${on ? ' on' : ''}${busy ? ' auto' : ''}" data-nt-bd="${ds}" ${ds < t0 || busy ? 'disabled' : ''} aria-pressed="${on}" aria-label="${esc(niceDate(ds))}${on ? ', blocked' : busy ? ', closed by a show or calendar event' : ''}">${d}</button>`;
    }
    const box = document.createElement('div'); box.className = 'grp';
    box.innerHTML = `<span class="eyebrow">Dates you're not available</span><p class="note" style="margin:0">Tap a day to block or unblock it. This is the same list as Settings → Booking link, so it stays matched in both places.</p>
      <div class="ssx-cal"><div class="ssx-calh"><button type="button" class="ssx-calnav" data-nt-bm="-1" ${canBack ? '' : 'disabled'} aria-label="Previous month">‹</button><b>${esc(NTS.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))}</b><button type="button" class="ssx-calnav" data-nt-bm="1" aria-label="Next month">›</button></div>
      <div class="ssx-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="ssx-grid">${cells}</div></div>
      <div class="ssx-row"><button type="button" class="btn small" data-nt-trip>Block a trip…</button><button type="button" class="btn small" data-nt-link>Booking link settings</button></div>`;
    const acts = [...p.querySelectorAll(':scope > .actions')].pop(); acts ? acts.before(box) : p.appendChild(box);
    box.querySelectorAll('[data-nt-bm]').forEach(b => { b.onclick = () => { NTS.month = new Date(y, mo + Number(b.dataset.ntBm), 1); renderCalendar(); }; });
    box.querySelectorAll('[data-nt-bd]').forEach(b => { b.onclick = () => { const set = blockedDays(todayStr()), d = b.dataset.ntBd; set.has(d) ? set.delete(d) : set.add(d); setBlocked(set).then(() => setTimeout(() => { renderCalendar(); syncAvail(true); }, 500)); }; });
    box.querySelector('[data-nt-trip]').onclick = () => blockForm({ date: todayStr() });
    box.querySelector('[data-nt-link]').onclick = () => window.ssShowSettings('bookings', 'ssx-link');
  }
  function hookNotes() {
    if (NTS.done || !st.db) return; NTS.done = true;
    st.db.collection('notes').onSnapshot(s => { S.notes = s.docs.map(d => ({ id: d.id, ...d.data() })); ntRefresh(); }, e => console.error(e));
    const wrap = (name, after) => { const fn = window[name]; if (typeof fn !== 'function') return; window[name] = function (...a) { const r = fn.apply(this, a); try { after(...a); } catch (e) { console.error(e); } return r; }; };
    wrap('bookingView', id => ntMount('booking', id, true, (sh, box) => {
      const dl = sh.querySelector('dl.kv'); if (!dl) { ntBeforeActions(sh, box); return; }
      const dt = [...dl.querySelectorAll('dt')].find(x => x.textContent.trim() === 'Notes'); if (dt) { dt.nextElementSibling.remove(); dt.remove(); }
      dl.after(box);
    }));
    // notes live on the contact's profile, under Reach-outs (the edit form is just for details)
    wrap('reachSheet', id => ntMount('contact', id, true, (sh, box) => { const s = sh.querySelector('.ssx-cp-slot'); s ? s.appendChild(box) : ntBeforeActions(sh, box); }));
    wrap('renderAvail', ntAvailPanel); ntAvailPanel();
    setInterval(() => { try { ntTourTick(); } catch (e) { console.error(e); } }, 100);
    nhStart();
  }
  // moves a merged-away contact's notes onto the one being kept
  async function ntMerge(keep, drop) {
    for (const n of ntAll()) if (n.contactId === drop.id) { const { id, ...d } = n; await st.db.collection('notes').doc(id).set({ ...d, contactId: keep.id }).catch(() => {}); }
    if (drop.notes && keep.notes && drop.notes !== keep.notes) await st.db.collection('notes').add({ text: drop.notes, at: new Date().toISOString(), contactId: keep.id }).catch(() => {});
  }
  /* ---------- Tour extras: a spotlight on what each step describes, the real button beside the title, and mock examples. */
  const NTOUR = { spot: null };
  const ntTourIcon = { 'Your menu': '#ssx-railbtn', 'Find anything': '#ssx-search' };
  const ntDemoShow = '<div class="ssx-tshow"><b>Moonlight Rooftop</b><span class="pill s-confirmed">Confirmed</span></div>';
  const ntTourDemo = {
    'Up next': '<div class="ssx-nit"><p>The Lantern Room show is done. Send your invoice?</p><div class="ssx-nmeta"><span class="ssx-tfake">Review</span><span>Later</span></div></div>',
    'Every show in one list': '<div class="ssx-nit">' + ntDemoShow + '<div class="ssx-nmeta"><span>Lead → Pitched → <b>Confirmed</b> → Played → Paid</span></div><div class="ssx-nmeta"><span>☐ Send the contract · due Friday</span></div></div>',
    'Booking requests': '<div class="ssx-nit"><div class="ssx-tshow"><b>Riley, The Lantern Room</b><span class="pill s-lead">Lead</span></div><p>Saturday, 9 PM, 2-hour set</p><div class="ssx-nmeta"><span class="ssx-tfake">Accept</span><span>Reply</span><span>Decline</span></div></div>',
    'Notes on every show': '<div class="ssx-nit">' + ntDemoShow + '<div class="ssx-tnote"><p>Sound check at 7. Ask for Tomás at the door.</p><div class="ssx-nmeta"><span>Nov 5, 2026</span><span>Edit</span><span>Delete</span></div></div><span class="eyebrow">From the people on this show</span><div class="ssx-tnote"><p>Load in through the alley.</p><div class="ssx-nmeta"><span>Oct 12, 2026 · The Lantern Room</span></div></div></div>',
    'See your month': '<div class="ssx-nit"><b>Saturday, Dec 12</b><p>Open</p><div class="ssx-nmeta"><span class="ssx-tfake">Hold this date…</span></div></div>',
    'Edit availability': '<div class="ssx-nit"><span class="eyebrow">Days of the week</span><div class="ssx-tdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span class="on">F</span><span class="on">S</span></div><div class="ssx-nmeta"><span>Blocked: Dec 24 – 26 ×</span></div></div>',
    'Never miss a step': '<div class="ssx-nit"><p>☐ Send the contract</p><div class="ssx-nmeta"><span class="ssx-tlate">Overdue · was due Tuesday</span></div></div>',
    'Your people': '<div class="ssx-nit"><div class="ssx-tshow"><b>The Lantern Room</b><span class="pill">Venue</span></div><div class="ssx-tnote"><p>Pays by Zelle within a week. Ask for Riley.</p><div class="ssx-nmeta"><span>Oct 12, 2026</span></div></div><div class="ssx-nmeta"><span>Shows together · 2</span><span class="ssx-tfake">Contact</span></div></div>',
    'Emails and templates': '<div class="ssx-nit"><p>Hi <span class="ssx-tok">Promoter name</span>, I loved playing <span class="ssx-tok">Venue</span> on <span class="ssx-tok">Show date</span>.</p></div>',
  };
  /* Tour targets: each step points at the section it talks about. With several listed, the first one showing wins, so a hidden block falls through to the next. */
  const ntTourTargets = {
    'Your menu': '#tabs',
    'Every show in one list': '.card:has(#bookingList)',
    'Notes on every show': '#bookingList:not(:has(.row)), #bookingList .row',
    'Edit availability': '.card:has(#availEdit)',
    'Never miss a step': '.card:has(#tList)',
    'Your Kit': '.card:has(#kitBio), .card:has(#linkList), .card:has(#kitFiles), .card:has(#kitRider)',
    'Your people': '.card:has(#contactList)',
    'Emails and templates': '#tplFilter + .card',
    'Financials': '#moneyStats, #txCard',
  };
  TOUR.forEach(s => { if (ntTourTargets[s.title]) s.target = ntTourTargets[s.title]; });
  function ntTourEnter(title) {
    if (!title || NTOUR.title === title) return;
    NTOUR.title = title; NTOUR.until = Date.now() + 2500;
    if (title === 'Emails and templates') { const b = document.querySelector('#commSeg [data-cmode="tpl"]'); if (b) b.click(); }
  }
  function ntTourFollow(step, el, card) {
    /* Pages can finish drawing after the tour scrolls, so keep the target in view for a moment. Phones: one scroll when the step opens, then the page is yours. */
    if (innerWidth < 700) return;
    const nav = step.tab === 'settings' && document.querySelector('section[data-view="settings"] .ssg-nav');
    const min = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ss-top')) || 72) + (nav ? nav.offsetHeight : 0);
    let r = el.getBoundingClientRect();
    if (!el.closest('#tabs, header') && Date.now() < NTOUR.until && (r.top < min - 2 || r.top > innerHeight - 60 || (innerWidth >= 700 && r.bottom > innerHeight - 8 && r.top > min + 24))) {
      scrollTo({ top: Math.max(0, r.top + scrollY - min - 20), behavior: 'instant' });
      r = el.getBoundingClientRect();
    }
    if (innerWidth < 700 || !card) return;
    /* On a computer, the card sits in whichever corner covers the least of the target. */
    const c = card.getBoundingClientRect(), tabs = document.getElementById('tabs').getBoundingClientRect();
    const l = (tabs.left === 0 && tabs.width < 300 ? tabs.right : 0) + 24, t = min + 12, x = innerWidth - c.width - 24, y = innerHeight - c.height - 24;
    const spots = { br: [x, y], bl: [l, y], tr: [x, t], tl: [l, t] };
    const cover = ([a, b]) => Math.max(0, Math.min(a + c.width, r.right + 6) - Math.max(a, r.left - 6)) * Math.max(0, Math.min(b + c.height, r.bottom + 6) - Math.max(b, r.top - 6));
    const best = Object.keys(spots).reduce((p, k) => (cover(spots[k]) < cover(spots[p]) - 1 ? k : p), 'br');
    Object.assign(card.style, { left: best[1] === 'l' ? `${l}px` : 'auto', right: best[1] === 'r' ? '24px' : 'auto', top: best[0] === 't' ? `${t}px` : 'auto', bottom: best[0] === 'b' ? '24px' : 'auto' });
  }
  function ntTourTick() {
    const wrap = document.querySelector('.ssx-tour'), card = wrap && wrap.querySelector('.ssx-tour-card'), h = card && card.querySelector('h3');
    const title = h && h.firstChild ? h.firstChild.textContent : '', step = title ? TOUR.find(s => s.title === title) : null;
    if (h && !h.dataset.ntDone) {
      h.dataset.ntDone = '1';
      const icon = ntTourIcon[title] && document.querySelector(ntTourIcon[title]);
      if (icon) { const s = document.createElement('span'); s.className = 'ssx-tour-ic'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = icon.innerHTML; h.classList.add('ssx-tour-h'); h.appendChild(s); }
      if (ntTourDemo[title]) { const d = document.createElement('div'); d.className = 'ssx-tdemo'; d.innerHTML = `<span class="eyebrow">Example</span>${ntTourDemo[title]}`; const p = card.querySelector('p'); if (p) p.after(d); }
    }
    ntTourEnter(title);
    const el = wrap && wrap.classList.contains('in') && step && step.target ? [...document.querySelectorAll(step.target)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) : null;
    if (NTOUR.on !== el) { if (NTOUR.on) NTOUR.on.classList.remove('ssx-tour-on'); NTOUR.on = el; }
    if (el && !el.classList.contains('ssx-tour-on')) el.classList.add('ssx-tour-on');
    if (!el) { if (NTOUR.spot) { NTOUR.spot.remove(); NTOUR.spot = null; } return; }
    if (!NTOUR.spot) { NTOUR.spot = document.createElement('div'); NTOUR.spot.className = 'ssx-tour-spot'; NTOUR.spot.setAttribute('aria-hidden', 'true'); document.body.appendChild(NTOUR.spot); NTOUR.box = ''; }
    const r = el.getBoundingClientRect(), pad = 6, top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), bottom = Math.min(innerHeight - 4, r.bottom + pad), right = Math.min(innerWidth - 4, r.right + pad);
    const box = `top:${top}px;left:${left}px;width:${Math.max(0, right - left)}px;height:${Math.max(0, bottom - top)}px;`; if (NTOUR.box !== box) { NTOUR.box = box; NTOUR.spot.style.cssText = box; }
    ntTourFollow(step, el, card);
  }
    /* ---------- Tax packet button and phone tour fit. ---------- */
  function phoneFixes(){
    const taxBtn=document.getElementById("taxBtn");
    if(taxBtn)taxBtn.onclick=()=>window.taxSheet();
    const body=document.body;
    setInterval(()=>{
      const card=innerWidth<700&&document.querySelector(".ssx-tour .ssx-tour-card");
      if(!card){
        if(body.dataset.ssxTourPad){body.style.paddingBottom="";delete body.dataset.ssxTourPad}
        return;
      }
      const spot=document.querySelector(".ssx-tour-spot");
      if(!spot||getComputedStyle(spot).display==="none")return;
      if(!body.dataset.ssxTourPad){body.dataset.ssxTourPad="1";body.style.paddingBottom="70vh"}
      // the tour no longer scrolls the page on phones after a step opens, so nothing moves under your finger
    },200);
  }
  /* ---------- Show history: past shows kept apart from Bookings, so they never touch money, tasks, mileage or reminders.
     Add them one at a time or import a list. The EPK and its stats use them together with shows played in the app. */
  const NH = { sig: null };
  const nhPast = () => { try { return S.pastShows || []; } catch (_) { return []; } };
  const nhKey = s => `${s.date}|${String(s.venue || s.title || '').trim().toLowerCase()}`;
  function nhShows() {
    const t0 = todayStr(); let bks = []; try { bks = S.bookings || []; } catch (_) {}
    const played = bks.filter(b => b.date && b.date <= t0 && ['played', 'paid'].includes(String(b.status).toLowerCase())).map(b => { const venue = b.venueId && typeof contactName === 'function' ? contactName(b.venueId) || '' : ''; return { id: b.id, kind: 'booking', date: b.date, title: b.title || venue || 'Show', venue, city: b.city || '' }; });
    const seen = new Set(played.map(nhKey));
    const past = nhPast().filter(s => s.date && !seen.has(nhKey(s))).map(s => ({ ...s, kind: 'past', title: s.title || s.venue || 'Show' }));
    return [...played, ...past].sort((a, b) => b.date.localeCompare(a.date));
  }
  const nhWhere = s => [s.title !== s.venue ? s.venue : '', s.city].filter(Boolean).join(' · ');
  const nhStats = list => ({ shows: list.length, cities: new Set(list.map(s => String(s.city || '').trim().toLowerCase()).filter(Boolean)).size, venues: new Set(list.map(s => String(s.venue || '').trim().toLowerCase()).filter(Boolean)).size });
  const nhParts = iso => { const d = new Date(iso + 'T12:00:00'); return { day: d.getDate(), mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), year: d.getFullYear() }; };
  const nhLabel = s => { const p = nhParts(s.date), name = p.mon[0] + p.mon.slice(1).toLowerCase(); return s.approx ? `${name} ${p.year}` : `${name} ${p.day}, ${p.year}`; };
  // -- reading a pasted list or CSV
  const NH_MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function nhDate(text) {
    text = flDateFix(text);
    const t = String(text || '').trim().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i, '').replace(/(\d)(st|nd|rd|th)\b/gi, '$1'); let m, y, mo, d = 1, approx = false;
    const mon = s => NH_MON.indexOf(String(s).slice(0, 3).toLowerCase()) + 1;
    if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/))) { mo = +m[1]; d = +m[2]; y = +m[3] + (m[3].length === 2 ? 2000 : 0); }
    else if ((m = t.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i))) { mo = mon(m[1]); d = +m[2]; y = +m[3]; }
    else if ((m = t.match(/^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i))) { d = +m[1]; mo = mon(m[2]); y = +m[3]; }
    else if ((m = t.match(/^([a-z]{3,9})\.?,?\s+(\d{4})$/i))) { mo = mon(m[1]); y = +m[2]; approx = true; }
    else if ((m = t.match(/^(\d{1,2})[-/](\d{4})$/))) { mo = +m[1]; y = +m[2]; approx = true; }
    else return null;
    const test = new Date(y, mo - 1, d); if (!mo || y < 1950 || test.getMonth() !== mo - 1 || test.getDate() !== d) return null;
    return { date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, approx };
  }
  function nhCells(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (/\s[-–—·]\s/.test(line)) return line.split(/\s[-–—·]\s/);
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out;
  }
  function nhRead(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim()).slice(0, 1001); let cols = null; const rows = [], bad = [];
    const head = nhCells(lines[0] || '').map(x => x.trim().toLowerCase());
    if (head.some(x => /^(show )?date$|^when$/.test(x)) && head.length > 1) {
      const at = re => head.findIndex(x => re.test(x));
      cols = { date: at(/date|when/), title: at(/event|show|title|gig|name/), venue: at(/venue|club|location|place|where/), city: at(/city|town/), state: at(/^state$|province|country/) }; lines.shift();
    }
    for (const line of lines) {
      let c = nhCells(line).map(x => x.trim()), parsed = null, title = '', venue = '', city = '';
      if (cols) {
        parsed = nhDate(c[cols.date]); title = c[cols.title] || ''; venue = c[cols.venue] || ''; city = [c[cols.city], c[cols.state]].filter(Boolean).join(', ');
      } else {
        for (let i = 0; i < c.length && !parsed; i++) {
          if ((parsed = nhDate(c[i]))) c.splice(i, 1);
          else if (c[i + 1] && (parsed = nhDate(`${c[i]}, ${c[i + 1]}`))) c.splice(i, 2);
        }
        c = c.filter(Boolean);
        if (c.length >= 3) [title, venue, city] = c; else [venue, city] = c;
      }
      if (!parsed || !(title || venue)) { bad.push(line.trim()); continue; }
      rows.push({ ...parsed, title: title || '', venue: venue || '', city: city || '' });
    }
    return { rows, bad };
  }
  // -- Kit card and sheets
  function nhCard() {
    const sec = document.querySelector('section[data-view="kit"]'); if (!sec || !st.db) return;
    const all = nhShows(), stat = nhStats(all), sig = JSON.stringify(all.slice(0, 4).map(s => [s.id, s.date, s.title, s.city])) + all.length;
    let box = document.getElementById('ssx-hist');
    if (!box) { box = document.createElement('div'); box.id = 'ssx-hist'; box.className = 'card ssx ssx-kitcard'; const a = document.getElementById('ssx-kit'); a ? a.after(box) : sec.appendChild(box); NH.sig = null; }
    if (NH.sig === sig) return; NH.sig = sig;
    box.innerHTML = `<div class="ssx-head"><div><h3>Show history</h3><p class="note">${all.length ? `${stat.shows} show${stat.shows === 1 ? '' : 's'} · ${stat.venues} venue${stat.venues === 1 ? '' : 's'} · ${stat.cities} cit${stat.cities === 1 ? 'y' : 'ies'}. Your EPK uses this list.` : 'Add the shows you played before Set & Settled, one at a time or with our template. They fill your EPK and stay out of your bookings and money.'}</p></div></div>
      ${all.length ? `<div class="ssx-hlist">${all.slice(0, 4).map(s => `<div class="ssx-hrow"><span class="ssx-hdate">${esc(nhLabel(s))}</span><span class="ssx-hmain"><b>${esc(s.title)}</b><span class="note">${esc(nhWhere(s))}</span></span></div>`).join('')}</div>` : ''}
      <div class="ssx-row"><button type="button" class="btn primary small" data-nh-import>Add past shows</button>${all.length ? `<button type="button" class="btn small" data-nh-all>See all ${all.length}</button>` : ''}</div>`;
    box.querySelector('[data-nh-import]').onclick = () => nhImport();
    const more = box.querySelector('[data-nh-all]'); if (more) more.onclick = nhList;
  }
  function nhForm(s) {
    const isNew = !s.id;
    sheet(`<h3>${isNew ? 'Add a past show' : 'Edit past show'}</h3><p class="note" style="margin:0">For shows you played before using Set & Settled. It only appears in your history and EPK.</p>
      ${field('nh-date', 'Date', s.date, 'date', `data-k="date" max="${todayStr()}"`)}${field('nh-title', 'Event name (optional)', s.title, 'text', 'data-k="title" placeholder="e.g. Summer Block Party"')}
      <div class="frow">${field('nh-venue', 'Venue', s.venue, 'text', 'data-k="venue"')}${field('nh-city', 'City', s.city, 'text', 'data-k="city"')}</div>
      <div class="actions">${isNew ? '' : delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = close;
      armDelete(root, async () => { await remove('pastShows', s.id); close(); });
      root.querySelector('[data-save]').onclick = async () => {
        const v = formVals(root); if (!v.date) { toast('Pick a date'); return; } if (v.date > todayStr()) { toast('Add upcoming shows in Bookings'); return; } if (!v.title && !v.venue) { toast('Add a venue or event name'); return; }
        if (await window.save('pastShows', s.id || null, { ...v, approx: !!(s.approx && s.date === v.date) })) { close(); toast('Show saved'); }
      };
    });
  }
  function nhList() {
    const all = nhShows(), years = [...new Set(all.map(s => s.date.slice(0, 4)))];
    sheet(`<h3>Show history</h3><div class="ssx-row"><button type="button" class="btn primary small" data-nh-import>Add past shows</button></div>
      ${years.map(y => `<div class="ssx-hyear"><span class="eyebrow">${y}</span><div class="ssx-nshows">${all.filter(s => s.date.startsWith(y)).map(s => `<button type="button" data-nh-open="${esc(s.kind)}:${esc(s.id)}"><span><b>${esc(s.title)}</b>${nhWhere(s) ? `<br><span class="note">${esc(nhWhere(s))}</span>` : ''}</span><span class="note">${esc(nhLabel(s).replace(/, \d{4}$/, ''))}</span></button>`).join('')}</div></div>`).join('')}
      <div class="actions"><button class="btn" data-cancel>Done</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = close; root.querySelector('[data-nh-import]').onclick = () => nhImport();
      root.querySelectorAll('[data-nh-open]').forEach(b => { b.onclick = () => { const i = b.dataset.nhOpen.indexOf(':'), kind = b.dataset.nhOpen.slice(0, i), id = b.dataset.nhOpen.slice(i + 1); if (kind === 'booking') window.bookingView(id); else nhForm(nhPast().find(x => x.id === id) || {}); }; });
    });
  }
  const NH_TEMPLATE = 'Date,Event name,Venue,City\r\n3/14/2025,Example Block Party,Example Venue,San Diego\r\n';
  function nhTemplate() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + NH_TEMPLATE], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'set-and-settled-show-history-template.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const nhDraft = () => { if (!NH.draft) { NH.draft = []; NH.bad = []; } return NH.draft; };
  function nhImport() { nhBuild(nhDraft().length ? null : -1); }
  function nhBuild(edit) {
    const list = nhDraft(), bad = NH.bad || [], cur = edit >= 0 ? list[edit] : {}, open = edit !== null;
    sheet(`<h3>Add past shows</h3><p class="note" style="margin:0">Add each show below, or fill in our template if you have a lot of them. You'll check everything before it's saved.</p>
      ${list.length ? `<div class="ssx-hlist">${list.map((r, i) => `<div class="ssx-hrow"><span class="ssx-hdate">${esc(nhLabel(r))}</span><span class="ssx-hmain"><b>${esc(r.title || r.venue)}</b><span class="note">${esc(nhWhere({ ...r, title: r.title || r.venue }))}</span></span><span class="ssx-hact"><button type="button" data-nh-edit="${i}" aria-label="Edit ${esc(r.title || r.venue)}">Edit</button><button type="button" data-nh-rem="${i}" aria-label="Remove ${esc(r.title || r.venue)}">Remove</button></span></div>`).join('')}</div>` : ''}
      ${open ? `<div class="ssx-hentry"><span class="eyebrow">${edit >= 0 ? 'Edit this show' : list.length ? 'Another show' : 'Your first show'}</span>
        ${field('nh-date', 'Date', cur.date, 'date', `max="${todayStr()}"`)}${field('nh-title', 'Event name (optional)', cur.title, 'text', 'placeholder="e.g. Summer Block Party"')}
        <div class="frow">${field('nh-venue', 'Venue', cur.venue, 'text', '')}${field('nh-city', 'City', cur.city, 'text', '')}</div>
        <div class="ssx-row"><button type="button" class="btn primary small" data-nh-ok>${edit >= 0 ? 'Update show' : 'Save show to list'}</button>${edit >= 0 || list.length ? '<button type="button" class="btn small" data-nh-stop>Cancel</button>' : ''}</div></div>` : '<div class="ssx-row"><button type="button" class="btn small" data-nh-more>+ Add another show</button></div>'}
      ${bad.length ? `<div class="f"><label>Couldn't read ${bad.length} row${bad.length === 1 ? '' : 's'}</label><div class="ssx-hbad">${bad.slice(0, 20).map(esc).join('<br>')}</div><span class="note">Each row needs a date plus a venue or event. Add these above, or fix your file and upload it again.</span></div>` : ''}
      <div class="ssx-hfile"><b>Have a lot of shows?</b><span class="note">Download the template, fill it in with Excel or Google Sheets, save it as a CSV, then upload it here.</span>
        <div class="ssx-row"><button type="button" class="btn small" data-nh-tpl>Download template</button><label class="btn small" for="nh-file">Upload filled template</label><input id="nh-file" class="ssx-hidefile" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain"></div></div>
      <div class="actions"><button class="btn" data-cancel>Close</button><button class="btn primary" data-go ${list.length ? '' : 'disabled'}>Check my shows${list.length ? ` (${list.length})` : ''}</button></div>`, root => {
      const q = s => root.querySelector(s);
      q('[data-cancel]').onclick = close; q('[data-nh-tpl]').onclick = nhTemplate;
      q('[data-go]').onclick = () => { if (open && (q('#nh-date').value || q('#nh-venue').value.trim() || q('#nh-title').value.trim())) { toast('Save or cancel the show you have open first'); return; } nhReview(); };
      const more = q('[data-nh-more]'); if (more) more.onclick = () => nhBuild(-1);
      const stop = q('[data-nh-stop]'); if (stop) stop.onclick = () => nhBuild(null);
      root.querySelectorAll('[data-nh-edit]').forEach(b => { b.onclick = () => nhBuild(+b.dataset.nhEdit); });
      root.querySelectorAll('[data-nh-rem]').forEach(b => { b.onclick = () => { const i = +b.dataset.nhRem, [gone] = list.splice(i, 1); nhBuild(list.length ? null : -1); toast('Show removed', () => { list.splice(i, 0, gone); nhBuild(null); }); }; });
      const ok = q('[data-nh-ok]');
      if (ok) { q('#nh-date').focus(); ok.onclick = () => {
        const date = q('#nh-date').value, title = q('#nh-title').value.trim(), venue = q('#nh-venue').value.trim(), city = q('#nh-city').value.trim();
        if (!date) { toast('Pick the date of the show'); return; } if (date > todayStr()) { toast('Add upcoming shows in Bookings'); return; } if (!title && !venue) { toast('Add a venue or event name'); return; }
        const row = { date, title, venue, city, approx: !!(cur.approx && cur.date === date) };
        if (edit >= 0) list[edit] = row; else list.push(row);
        nhBuild(null);
      }; }
      q('#nh-file').onchange = async e => {
        const f = e.target.files[0]; if (!f) return; if (/\.xlsx?$/i.test(f.name)) { toast('Save your file as a CSV first, then upload it'); return; } if (f.size > 1048576) { toast('That file is too large. Try one under 1 MB.'); return; }
        const r = nhRead(await f.text()), rows = r.rows.filter(x => x.venue !== 'Example Venue'); list.push(...rows); NH.bad = r.bad;
        nhBuild(list.length ? null : -1); toast(rows.length ? `Added ${rows.length} show${rows.length === 1 ? '' : 's'} from your file` : 'No shows found in that file yet');
      };
    });
  }
  function nhReview() {
    const rows = nhDraft(), t0 = todayStr(), have = new Set(nhShows().map(nhKey)), inList = new Set();
    rows.forEach(r => { const k = nhKey(r); r.skip = r.date > t0 ? 'Upcoming, add it in Bookings' : have.has(k) || inList.has(k) ? 'Already in your history' : ''; inList.add(k); });
    sheet(`<h3>Check my shows</h3><p class="note" style="margin:0">Does this look right? Untick any show you don't want to add.</p>
      <div class="ssx-nshows ssx-hcheck">${rows.map((r, i) => `<label><input type="checkbox" data-nh-row="${i}" ${r.skip ? 'disabled' : 'checked'}><span class="ssx-hmain"><b>${esc(r.title || r.venue)}</b><span class="note">${esc(nhLabel(r))}${nhWhere({ ...r, title: r.title || r.venue }) ? ' · ' + esc(nhWhere({ ...r, title: r.title || r.venue })) : ''}${r.skip ? ' · ' + esc(r.skip) : ''}</span></span></label>`).join('')}</div>
      <div class="actions"><button class="btn" data-back>Go back and edit</button><button class="btn primary" data-add>Add shows</button></div>`, root => {
      const add = root.querySelector('[data-add]'), picked = () => rows.filter((r, i) => root.querySelector(`[data-nh-row="${i}"]`).checked), label = () => { const n = picked().length; add.textContent = n ? `Add ${n} show${n === 1 ? '' : 's'} to my history` : 'Add shows'; add.disabled = !n; };
      root.querySelectorAll('[data-nh-row]').forEach(c => { c.onchange = label; }); label();
      root.querySelector('[data-back]').onclick = () => nhBuild(null);
      add.onclick = async () => {
        const picks = picked(), ids = []; add.disabled = true;
        for (let i = 0; i < picks.length; i += 8) {
          add.textContent = `Adding ${Math.min(i + 8, picks.length)} of ${picks.length}…`;
          const got = await Promise.all(picks.slice(i, i + 8).map(({ skip, ...r }) => window.save('pastShows', null, r))); ids.push(...got.filter(Boolean));
        }
        NH.draft = []; NH.bad = []; closeAll(); toast(`Added ${ids.length} show${ids.length === 1 ? '' : 's'}`, async () => { for (const id of ids) await st.db.collection('pastShows').doc(id).delete().catch(() => {}); toast('Import undone'); });
      };
    });
  }
  // -- EPK: stats and shows are built here so they always include your full history
  function nhEpk(k, c, T, place) {
    const label = (key, def) => `<div class="epk-ed epk-label" contenteditable="true" spellcheck="true" data-epk-k="lbl_${key}" data-ph="${esc(def)}" style="color:${T.solid}">${esc((c.text || {})['lbl_' + key] ?? def)}</div>`;
    const badge = s => { const p = nhParts(s.date); return `<span class="epk-date${s.approx ? ' mo' : ''}" style="border-color:${T.line}"><b>${s.approx ? p.mon : p.day}</b><span style="color:${T.solid}">${s.approx ? p.year : `${p.mon} ${p.year}`}</span></span>`; };
    const row = s => `<div class="epk-show" style="border-color:${T.line}">${badge(s)}<span><b style="font-weight:500">${esc(s.title)}</b><br><span style="color:${T.muted};font-size:12.5px">${esc(nhWhere(s))}</span></span></div>`;
    let bks = []; try { bks = S.bookings || []; } catch (_) {}
    const t0 = todayStr(), up = bks.filter(b => b.date && b.date >= t0 && String(b.status).toLowerCase() === 'confirmed' && !b.epkOff).sort((a, b) => a.date.localeCompare(b.date)), all = nhShows().filter(flOnEpk);
    if (k === 'stats') {
      const s = { ...nhStats(c.statsAll === false ? all : nhShows()), upcoming: up.length }, list = [['shows', 'Shows played'], ['cities', 'Cities'], ['venues', 'Venues'], ['upcoming', 'Upcoming']].filter(([x]) => s[x]);
      if (list.length) place('stats', 'full', `<div class="epk-stats" style="border-color:${T.line}">${list.map(([x, l]) => `<div><b style="color:${T.solid}">${s[x]}</b><span style="color:${T.muted}">${l}</span></div>`).join('')}</div>`);
      return;
    }
    if (k === 'upcoming') {
      if (up.length) place('upcoming', 'half', `${label('upcoming', 'Upcoming')}<div class="epk-rows">${up.slice(0, 5).map(b => { const venue = b.venueId && typeof contactName === 'function' ? contactName(b.venueId) || '' : ''; return row({ date: b.date, title: b.title || venue || 'Show', venue, city: b.city || '' }); }).join('')}</div>`);
      return;
    }
    if (!all.length) return;
    const view = c.showsView || 'recent';
    if (view === 'recent') { place('played', 'half', `${label('played', 'Show history')}<div class="epk-rows">${all.slice(0, 8).map(row).join('')}</div>`); return; }
    if (view === 'venues') {
      const cities = {}; all.forEach(s => { const v = s.venue || s.title, n = s.city || 'Other'; (cities[n] = cities[n] || {})[v] = (cities[n][v] || 0) + 1; });
      const names = Object.keys(cities).sort((a, b) => (a === 'Other') - (b === 'Other') || Object.keys(cities[b]).length - Object.keys(cities[a]).length || a.localeCompare(b));
      for (let i = 0; i < names.length; i += 16) place('played', 'full', `${i ? '' : label('played', "Where I've played")}<div class="epk-vgrid">${names.slice(i, i + 16).map(n => `<div class="epk-vcity" style="border-color:${T.line}"><b style="color:${T.solid}">${esc(n)}</b><span>${Object.keys(cities[n]).sort().map(v => esc(v) + (cities[n][v] > 1 ? ` ×${cities[n][v]}` : '')).join(' · ')}</span></div>`).join('')}</div>`);
      return;
    }
    let first = true;
    for (const y of [...new Set(all.map(s => s.date.slice(0, 4)))]) {
      const list = all.filter(s => s.date.startsWith(y));
      for (let i = 0; i < list.length; i += 24) {
        place('played', 'full', `${first ? label('played', 'Show history') : ''}<div class="epk-year" style="border-color:${T.line}"><b>${y}</b><span style="color:${T.muted}">${i ? 'continued' : `${list.length} show${list.length === 1 ? '' : 's'}`}</span></div><div class="epk-hrows">${list.slice(i, i + 24).map(s => { const p = nhParts(s.date), name = p.mon[0] + p.mon.slice(1).toLowerCase(); return `<div class="epk-hrow"><span style="color:${T.solid}">${s.approx ? name : `${name} ${p.day}`}</span><span><b>${esc(s.title)}</b>${nhWhere(s) ? `<i style="color:${T.muted}">${esc(nhWhere(s))}</i>` : ''}</span></div>`; }).join('')}</div>`);
        first = false;
      }
    }
  }
  // lone half-width blocks widen, full pages stretch to their bottom edge, and a page with only Booking gets a closing layout
  function nhEpkTidy(stage) {
    const pages = [...stage.querySelectorAll('.epk-page')];
    pages.forEach((pg, i) => {
      const kids = [...pg.querySelector('.epk-body').children]; let open = null;
      kids.forEach(b => { if (b.classList.contains('half')) { if (open) open = null; else open = b; } else if (open) { open.classList.replace('half', 'full'); open = null; } });
      if (open) open.classList.replace('half', 'full');
      pg.classList.toggle('epk-solo', kids.length === 1 && kids[0].dataset.blk === 'booking');
      pg.classList.toggle('epk-fill', i < pages.length - 1 && kids.length > 1);
    });
  }
  function nhEpkBar() {
    const bar = EPK.el && EPK.el.querySelector('.ssx-epk-opts'), sec = bar && bar.querySelector('.ssx-epk-sec'); if (!sec) return;
    const view = EPK.cfg.showsView || 'recent', row = document.createElement('div'); row.className = 'ssx-epk-row';
    row.innerHTML = `<span class="ssx-epk-k">Show history</span>${[['recent', 'Latest 8'], ['year', 'All, by year'], ['venues', 'Venues by city']].map(([k, n]) => `<button type="button" class="ssx-chip" data-nh-view="${k}" aria-pressed="${view === k}">${n}</button>`).join('')}<button type="button" class="ssx-chip" data-nh-more>+ Add past shows</button>`;
    sec.before(row);
    row.querySelectorAll('[data-nh-view]').forEach(b => { b.onclick = () => { EPK.cfg.showsView = b.dataset.nhView; epkSave(); epkRender(); }; });
    row.querySelector('[data-nh-more]').onclick = () => { closeEPK(); window.goTab('kit'); nhImport(); };
  }
  function nhStart() {
    st.db.collection('pastShows').onSnapshot(s => { S.pastShows = s.docs.map(d => ({ id: d.id, ...d.data() })); nhCard(); }, e => console.error(e));
    const pb = EPK_BLOCKS.findIndex(b => b[0] === 'played'), ub = EPK_BLOCKS.findIndex(b => b[0] === 'upcoming');
    if (pb >= 0) EPK_BLOCKS[pb][1] = 'Show history';
    if (pb > ub && ub >= 0) { const [x] = EPK_BLOCKS.splice(pb, 1); EPK_BLOCKS.splice(ub, 0, x); }
    if (LAYOUT.kit && !LAYOUT.kit.blocks.some(b => b[0] === 'history')) LAYOUT.kit.blocks.splice(1, 0, ['history', 'Show history', byId('ssx-hist')]);
    ntTourDemo['Your show history'] = '<div class="ssx-nit"><div class="ssx-tshow"><b>42 shows · 11 venues · 6 cities</b></div><div class="ssx-nmeta"><span>Mar 14, 2025 · The Lantern Room · San Diego</span></div><div class="ssx-nmeta"><span class="ssx-tfake">Add past shows</span></div></div>';
    setInterval(() => { try { nhCard(); } catch (e) { console.error(e); } }, 1500);
  }
  /* ---------- Financials tab icon: one coin with a dollar sign. */
  function financeIcon() {
    const s = document.querySelector('#tabs [data-tab="money"] svg');
    if (s) s.innerHTML = '<circle cx="14" cy="14" r="12" fill="color-mix(in srgb, var(--accent) 22%, transparent)"/><path d="M6.2 10.6 A8.6 8.6 0 0 1 10.6 6.2" fill="none" stroke="var(--accent-2)" stroke-width="1.8" stroke-linecap="round"/><path d="M18.4 10.3 Q17.2 8.7 14 8.7 Q10 8.7 10 11.3 Q10 13.4 14 14 Q18 14.6 18 16.8 Q18 19.3 14 19.3 Q10.8 19.3 9.6 17.7 M14 6 V22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  }
    /* ---------- Install offer: invites phone users to add the app to their home screen. */
  ;(function installOffer() {
    const KEY = 'ssx-install-later', WAIT = 30 * 864e5;
    let promptEvent = null, card = null, ready = 0;
    const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const phone = () => matchMedia('(max-width:860px) and (pointer:coarse)').matches;
    const snoozed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < WAIT; } catch (_) { return false; } };
    const close = () => { if (card) { card.remove(); card = null; } };
    const snooze = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (_) {} close(); };
    const shown = el => !!el && el.getClientRects().length > 0;
    const appReady = () => !document.documentElement.classList.contains('ss-locked') && !shown(document.getElementById('ss-auth')) && shown(document.querySelector('.tabs')) && !new URLSearchParams(location.search).get('book') && !document.querySelector('.ssx-tour,.ssx-tour-offer');
    const draw = steps => {
      if (!card) { card = document.createElement('div'); card.className = 'ssx-install'; card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Add Set & Settled to your phone'); document.body.appendChild(card); }
      card.innerHTML = steps
        ? `<h3>Add it to your Home Screen</h3><ol><li>Tap <b>Share</b>. If you don't see it, tap <b>•••</b> first.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open it from your Home Screen and sign in once more.</li></ol><div class="ssx-install-act"><button type="button" class="btn primary small" data-ins-later>Got it</button></div>`
        : `<h3>Keep Set & Settled on your phone</h3><p>Open it in one tap, full screen, just like an app.</p><div class="ssx-install-act"><button type="button" class="btn small" data-ins-later>Not now</button><button type="button" class="btn primary small" data-ins-add>${promptEvent ? 'Add to my phone' : 'Show me how'}</button></div>`;
      card.querySelector('[data-ins-later]').onclick = snooze;
      const add = card.querySelector('[data-ins-add]');
      if (add) add.onclick = async () => {
        if (!promptEvent) { draw(true); return; }
        const ev = promptEvent; promptEvent = null;
        try { await ev.prompt(); const c = await ev.userChoice; if (c && c.outcome === 'accepted') close(); else snooze(); } catch (_) { snooze(); }
      };
    };
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvent = e; });
    window.addEventListener('appinstalled', () => { promptEvent = null; close(); });
    setInterval(() => {
      if (installed() || snoozed() || !phone() || !(promptEvent || isIOS() || card)) { close(); ready = 0; return; }
      if (!appReady()) { if (card) card.hidden = true; ready = 0; return; }
      if (++ready < 3) return;
      if (card) card.hidden = false; else draw(false);
    }, 3000);
  })();
  /* ---------- Flow: less busywork.
     - Old stage tasks close when a booking moves on (Settings → Checklists by stage).
     - Reminders can repeat until a task is done, with an early heads-up (Settings → Reminders).
     - Add a venue, promoter, media person or contact right inside the booking form.
     - What kind of artist you are (Settings → Profile) replaces "DJ" across the app.
     - Media tab: photos, links and folders from your shows, plus a post plan with ready captions.
     - "Show on my EPK" for each booking and past show; Google Sheet import for past shows.
     Settings live in settings/flow. Photos live in app storage, listed in the media collection. */
  const FL = { cfg: null, media: [], posts: {}, draftEpk: new Map(), raf: 0, formB: null, nhOpen: null, sel: {}, loaded: false };
  const flCfg = () => ({ closeOld: true, every: 0, ahead: 0, epkPhoto: '', mediaDone: {}, artist: null, plan: { announce: true, countdown: true, dayof: true, recap: true }, tags: '', sheetId: '', sheetUrl: '', ...(FL.cfg || {}) });
  const flSave = patch => { FL.cfg = { ...flCfg(), ...patch }; return st.db ? st.db.doc('settings/flow').set(FL.cfg).catch(() => {}) : null; };
  const flSoon = () => { if (!FL.raf) FL.raf = requestAnimationFrame(flScan); };
  function flRefresh(all) { if (all) { try { window.render(); } catch (_) {} } try { queueSoon(); } catch (_) {} }
  const flKind = s => { try { return K(s); } catch (_) { return String(s || '').toLowerCase(); } };
  const flBk = () => { try { return S.bookings || []; } catch (_) { return []; } };
  const flChip = (on, label = 'EPK') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ssx-fl-epkchip'; b.textContent = label; b.title = 'Show on my EPK'; b.setAttribute('aria-label', 'Show on my EPK'); b.setAttribute('aria-pressed', String(!!on)); return b; };
  const flTwoTap = (btn, label, go) => { if (!btn.dataset.armed) { btn.dataset.armed = '1'; const was = btn.innerHTML; btn.textContent = label; setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = was; } }, 3500); return; } delete btn.dataset.armed; go(); };

  /* -- what kind of artist: replaces "DJ" in labels, calendar events, invoices and pitch text.
     Kinds are grouped; each group has a starter set (tasks, stage names, stage emails) the artist can switch to. */
  const FL_GROUPS = [
    ['music', 'Music', [['dj', 'DJ', 'DJ'], ['singer', 'Singer', 'Singer'], ['rapper', 'Rapper', 'Rapper'], ['band', 'Band', 'Band'], ['instrumentalist', 'Instrumentalist', 'Instrumentalist'], ['producer', 'Producer', 'Producer']]],
    ['comedy', 'Comedy & hosting', [['comedian', 'Comedian', 'Comedian'], ['host', 'Host / MC', 'Host'], ['drag', 'Drag artist', 'Drag artist'], ['magician', 'Magician', 'Magician']]],
    ['movement', 'Movement & visual', [['dancer', 'Dancer', 'Dancer'], ['aerialist', 'Aerialist', 'Aerialist'], ['painter', 'Live painter', 'Live painter'], ['vj', 'VJ / visual artist', 'Visual artist']]],
    ['service', 'Services', [['tattoo', 'Tattoo artist', 'Tattoo artist'], ['massage', 'Massage therapist', 'Massage therapist'], ['acupuncture', 'Acupuncturist', 'Acupuncturist'], ['hmua', 'Hair & makeup', 'Hair & makeup artist']]],
    ['other', 'Something else', []]];
  const FL_KINDS = FL_GROUPS.flatMap(g => g[2].map(k => [k[0], k[2], g[0]]));
  function flArtist() {
    const a = flCfg().artist || {}, kind = a.kind || '', hit = FL_KINDS.find(k => k[0] === kind);
    const group = a.group || (hit && hit[2]) || (kind ? 'other' : 'music');
    const label = String((hit ? hit[1] : a.label) || a.label || 'Artist').trim() || 'Artist';
    return { kind, label, group, preset: a.preset || 'dj', name: kind === 'dj' ? 'DJ name' : kind === 'band' ? 'Band name' : group === 'service' ? 'Business name' : 'Stage name' };
  }
  // what a booking is called on invoices and calendar events
  const flPerf = () => { const A = flArtist(); return A.group === 'service' ? 'Session' : A.label + ' performance'; };
  /* -- show / set / EPK words follow the artist type too (music and comedy keep "show", "set" and "EPK"). Only app
     wording changes, never your own text; nouns are matched by the word in front ("your show", "set times"). */
  function flWords() {
    const A = flArtist(), k = A.kind, g = A.group;
    if (k === 'producer') return { show: 'session', set: 'session', epk: 'Portfolio' };
    if (g === 'service') return { show: 'appointment', set: 'appointment', epk: k === 'massage' || k === 'acupuncture' ? 'Resume' : 'Portfolio' };
    if (g === 'movement') return { show: 'gig', set: 'performance', epk: k === 'painter' || k === 'vj' ? 'Portfolio' : 'EPK' };
    if (g === 'other') return { show: 'booking', set: 'booking', epk: 'EPK' };
    return { show: 'show', set: 'set', epk: 'EPK' };
  }
  const FL_RX = /\bDJs?\b|\b[Ss]hows?\b|\b[Ss]et\b|\bEPKs?\b/;
  const FL_DET = 'a|an|the|this|that|these|those|your|my|our|their|each|every|next|last|one|any|all|new|past|first|other|same|per|upcoming|confirmed|played|paid|future|earlier|recent|more|no|some|\\d+';
  const flCap = (m, w) => /^[A-Z]/.test(m) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  function flWordSwap(s) {
    const W = flWords(); if (W.show === 'show' && W.set === 'set' && W.epk === 'EPK') return s;
    const sw = (m, base) => flCap(m, base + (/s$/i.test(m) ? 's' : ''));
    let o = s;
    if (W.show !== 'show') o = o
      .replace(new RegExp(`\\b(${FL_DET}|of|by) (shows?)\\b`, 'gi'), (m, d, w, at, str) => /^(this|that|one|each)$/i.test(d) && /s$/i.test(w) && /^ (up|on|in|here|what|how|when|where|as|it|them|only|once|below|that|this)\b/i.test(str.slice(at + m.length)) ? m : d + ' ' + sw(w, W.show))
      .replace(/\b(shows?)(?= (history|notes?|names?|dates?|day|fee|night|folder|times?|checklist|goals?)\b)/gi, (m, w) => sw(w, W.show))
      .replace(/(^\s*|, )(shows?)(?=\s*$|,| and | or )/gi, (m, a, w) => a + sw(w, W.show));
    if (W.set !== 'set') o = o
      .replace(/\b(set) (times?|lengths?|start|end|list)\b/gi, (m, w, n) => flCap(w, W.set) + ' ' + n)
      .replace(/\b(your|my|the|each|this|every|a) (set)\b(?! (up|of|you|it|aside|to|for|a|the|your|them)\b)/gi, (m, d, w) => d + ' ' + flCap(w, W.set));
    if (W.epk !== 'EPK') o = o.replace(/\bEPK(s?)\b/g, (m, p) => W.epk + p);
    // "a appointment" -> "an appointment", "an Portfolio" -> "a Portfolio"
    return o.replace(/\b(an?|An?) (appointments?|sessions?|gigs?|performances?|bookings?|Portfolio|Resume|EPK)\b/g, (m, a, w) => (a[0] === 'A' ? 'A' : 'a') + (/^[aeiou]/i.test(w) || w === 'EPK' ? 'n' : '') + ' ' + w);
  }
  function flSwap(s) {
    const A = flArtist(); if (A.label === 'DJ' || !/\bDJs?\b/.test(s)) return flWordSwap(s);
    const L = A.label, N = A.name, low = N.charAt(0).toLowerCase() + N.slice(1);
    return flWordSwap(flA(s.replace(/\bDJ or artist name\b/g, low).replace(/\bYour DJ name\b/g, 'Your ' + low).replace(/\bor DJ name\b/g, 'or ' + low).replace(/\bDJ name\b/g, N))
      .replace(/\bDJs\b/g, L + 's').replace(/\bDJ\b/g, L));
  }
  // "a DJ" in a sentence becomes "a singer", "an instrumentalist"
  const flLow = L => /^[A-Z0-9]+$/.test(L) ? L : L.charAt(0).toLowerCase() + L.slice(1);
  const flA = s => { const L = flArtist().label; return s.replace(/\b([Aa]) DJ\b/g, (m, a) => (/^[aeiou]/i.test(L) ? (a === 'A' ? 'An' : 'an') : a) + ' ' + flLow(L)); };
  const FL_SKIPUI = '.epk-page,.epk-ed,#kitBio,#kitRider,#kitHosp,#kitNotes,.kv dd,.row,.trow,.list,.ssx-hlist,.ssx-nshows,.ssx-uplist,.ssx-fl-wait,.ssx-fl-plist,.ssx-fl-llist,.cl-row,.pop,.ev,.cal-g,.ssx-fl-artist,[data-open-booking],[data-open-contact],[data-open-task],[data-up],[data-mid],[data-cid],[data-vid],[data-pid],.pick-btn';
  const FL_UI = 'label,.note,.eyebrow,.hint,.empty,.ssx-epk-k,.ssx-tok,summary,dt,button,[class*="ssx-tour"]';
  function flUiText(el) {
    if (!el || el.closest('script,style,textarea')) return false;
    if (el.closest('.ssx-tok')) return true;
    if (el.closest('[contenteditable="true"]') || el.closest(FL_SKIPUI)) return false;
    if (el.closest('option')) return !!el.closest('#t-fill,#cm-fill');
    if (el.id === 'kitName') return true;
    return !!el.closest(FL_UI);
  }
  function flRelabel(root) {
    if (!root || !st.db || !FL.cfg) return; const on = flArtist().label !== 'DJ';
    const fix = n => { if (n.__flOrig != null && n.nodeValue !== n.__flOut) n.__flOrig = null; if (n.__flOrig == null) { if (!on || !FL_RX.test(n.nodeValue)) return; n.__flOrig = n.nodeValue; } const v = on ? flSwap(n.__flOrig) : n.__flOrig; n.__flOut = v; if (n.nodeValue !== v) n.nodeValue = v; };
    if (root.nodeType === 3) { if (flUiText(root.parentElement)) fix(root); return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if ((n.__flOrig != null || FL_RX.test(n.nodeValue)) && flUiText(n.parentElement) && !(n.parentElement.id === 'kitName' && (n.__flOrig || n.nodeValue) !== 'Your DJ name')) fix(n);
    const els = [...(root.matches && root.matches('[placeholder],[data-ph]') ? [root] : []), ...root.querySelectorAll('[placeholder],[data-ph]')];
    for (const el of els) for (const at of ['placeholder', 'data-ph']) {
      if (!el.hasAttribute(at)) continue; const k = 'flo' + at; let o = el[k];
      if (o == null) { const v = el.getAttribute(at); if (!on || !FL_RX.test(v)) continue; o = el[k] = v; }
      const v = on ? flSwap(o) : o; if (el.getAttribute(at) !== v) el.setAttribute(at, v);
    }
    if (on) root.querySelectorAll('#sheetRoot input:not([type]), #sheetRoot input[type="text"]').forEach(i => { if (/^DJ performance\b/.test(i.value)) { i.value = i.value.replace(/^DJ performance/, flPerf()); i.dispatchEvent(new Event('input', { bubbles: true })); } });
  }
  function flWrapWords() {
    const wrap = (name, fixOut) => { const o = window[name]; if (typeof o !== 'function' || o.__fl) return; const w = function () { const out = o.apply(this, arguments); try { if (!FL.cfg || flArtist().label === 'DJ') return out; return out && typeof out.then === 'function' ? out.then(fixOut) : fixOut(out); } catch (_) { return out; } }; w.__fl = true; window[name] = w; };
    wrap('evPayload', p => { if (p && typeof p.summary === 'string') p.summary = p.summary.replace(/DJ set:/, flArtist().group === 'service' ? 'Appointment:' : flArtist().label + ' performance:'); return p; });
    wrap('newInvoice', inv => { if (inv && Array.isArray(inv.lines)) inv.lines.forEach(l => { if (l && typeof l.desc === 'string') l.desc = l.desc.replace(/^DJ performance/, flPerf()); }); return inv; });
    wrap('dmText', s => typeof s === 'string' ? flA(s) : s);
  }
  /* -- starter sets: tasks, stage names and the six stage emails for each kind of work. Switching asks first, saves a backup you can go
     back to, and freezes the tasks on every booking you already have, so existing bookings never change. */
  const FL_TPL_DJ = [
    ['stage-lead', 'Lead · First outreach', 'lead', '{{dj_name}} for {{venue}} – [month] dates', "Hi {{contact_first}},\n\nI'm {{my_name}}, and I DJ as {{dj_name}}. [One line on why you fit: a night they host, an artist they've booked, or the crowd you'd bring.]\n\n{{bio_short}}\n\nI'd love to play {{venue}}. These dates are open, and I'm flexible on the slot:\n{{availability}}\n\nMix / EPK: {{epk}}\nInstagram: {{instagram}}\n\nWould any of these work? I'm easy to work with and will promote the night on my channels.\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-pitched', 'Pitched · Follow-up (no reply)', 'pitched', 'Re: {{dj_name}} for {{venue}}', "Hi {{contact_first}},\n\nBumping this back up in case it got buried. I'd still love to bring {{dj_name}} to {{venue}}.\n\n[One new thing since your first email: a recent show, a new mix or a release.]\n\nDates I'm holding open:\n{{availability}}\n\nMix / EPK: {{epk}}\n\nIf you're not the right person for bookings, could you point me to who is?\n\nThanks so much,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-confirmed', 'Confirmed · Booking confirmation', 'confirmed', 'Confirmed: {{dj_name}} at {{venue}}, {{date}}', "Hi {{contact_first}},\n\nThank you for having me! Here's what I have so we're on the same page:\n\nEvent: {{show}}\nDate: {{date}}\nVenue: {{venue}}, {{address}}\nSet time: {{set_time}}\nFee: {{fee}}\n\nCould you confirm or fill in:\n1. Contract or written agreement\n2. Payment: any deposit, plus how and when the balance is paid\n3. Load-in and soundcheck time, and parking\n4. Gear on site (my tech rider is below)\n5. Guest list spots\n6. Your day-of contact number\n\nTech rider:\n{{rider}}\n\nFor promo, here are my links and photos:\n{{links}}\n{{files}}\n\nTickets: {{ticket_link}}\n\nI'll share the event on my socials as soon as the flyer is ready.\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-played', 'Played · Thank you & follow-up', 'played', 'Thank you for {{date}} at {{venue}}', "Hi {{contact_first}},\n\nThank you again for having me at {{venue}}. [One specific highlight: the crowd, a moment, or the team.]\n\nPhotos and video will land here as they come in: {{media_folder}}\nFeel free to use them, and please tag {{instagram}} if you post.\n\nAs agreed, the fee was {{fee}}. [Invoice attached, or how to pay: Zelle, Venmo or ACH details.]\n\nI'd love to come back. Here are some open dates:\n{{availability}}\n\nAny feedback on the night is always welcome.\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-paid', 'Paid · Payment received', 'paid', 'Payment received, thank you!', "Hi {{contact_first}},\n\nJust confirming I received {{fee}} for {{show}} on {{date}}. Thank you for the smooth payment.\n\nIt was a pleasure working with you and the {{venue}} team. Keep me in mind for future nights; I'll keep you posted on new mixes and open dates.\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-lost', 'Lost · Keep the door open', 'lost', 'Thanks for considering {{dj_name}}', "Hi {{contact_first}},\n\nThanks for letting me know, and for taking the time to consider me. I completely understand.\n\nI'd love to stay on your radar for future nights at {{venue}}. Here's my EPK for your files: {{epk}}\n\nI'll check back in a few months with new mixes and dates.\n\nAll the best,\n{{my_name}}\n{{dj_name}} · {{phone}}"]];
  const FL_TPL_SVC = [
    ['stage-lead', 'Inquiry · Reply to a new client', 'lead', 'Your appointment with {{dj_name}}', "Hi {{contact_first}},\n\nThanks for reaching out! I'm {{my_name}} with {{dj_name}}. [One line about what they asked for and how you can help.]\n\nHere are my open dates:\n{{availability}}\n\nBook anytime here: {{booking_link}}\nSee my work: {{website}}\nInstagram: {{instagram}}\n\nLet me know which day works and I'll get you booked.\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-pitched', 'Quoted · Follow-up (no reply)', 'pitched', 'Following up on your appointment', "Hi {{contact_first}},\n\nJust checking in on the quote I sent. [Quick recap: what's included and the price.]\n\nHappy to answer any questions. These dates are still open:\n{{availability}}\n\nBook anytime here: {{booking_link}}\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-confirmed', 'Booked · Appointment confirmation', 'confirmed', 'Confirmed: your appointment on {{date}}', "Hi {{contact_first}},\n\nYou're booked! Here are the details:\n\nDate: {{date}}\nTime: {{set_time}}\nWhere: {{address}}\nPrice: {{fee}}\n\nBefore your appointment:\n1. [Prep instructions]\n2. Deposit: [amount and how to pay]\n3. Please let me know at least 48 hours ahead if you need to reschedule.\n\nPayment options:\n{{pay_handles}}\n\nSee you soon,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-played', 'Done · Thank you & aftercare', 'played', 'Thank you for coming in', "Hi {{contact_first}},\n\nThank you for trusting me with your appointment. [Aftercare or follow-up notes.]\n\nThe total was {{fee}}. Payment options:\n{{pay_handles}}\n\nIf you loved it, a quick review means a lot: [review link]\n\nReady for your next one? Here are some open dates:\n{{availability}}\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-paid', 'Paid · Payment received', 'paid', 'Payment received, thank you!', "Hi {{contact_first}},\n\nJust confirming I received {{fee}} for your appointment on {{date}}. Thank you!\n\nIt was a pleasure working with you. I'd love to see you again anytime: {{booking_link}}\n\nThanks,\n{{my_name}}\n{{dj_name}} · {{phone}}"],
    ['stage-lost', "Didn't book · Keep the door open", 'lost', 'Thanks for considering {{dj_name}}', "Hi {{contact_first}},\n\nThanks for letting me know. I completely understand.\n\nWhenever you're ready, I'd love to work with you. You can book anytime here: {{booking_link}}\n\nAll the best,\n{{my_name}}\n{{dj_name}} · {{phone}}"]];
  const flTplSwap = rep => FL_TPL_DJ.map(([id, name, stage, s, b]) => [id, name, stage, rep.reduce((x, [a, c]) => x.split(a).join(c), s), rep.reduce((x, [a, c]) => x.split(a).join(c), b)]);
  const FL_REP_PERF = [['and I DJ as', 'and I perform as'], ["I'd love to play {{venue}}", "I'd love to perform at {{venue}}"], ['for future nights', 'for future events']];
  const flCl = rows => rows.map(([key, label, offset]) => ({ key, label, offset }));
  const FL_CL_BASE = [['contract', 'Contract signed', -21], ['deposit', 'Deposit received', -14]];
  const FL_PRESETS = {
    dj: { title: 'DJ', blurb: 'The original DJ tasks, stage names and emails.', tpl: FL_TPL_DJ },
    music: { title: 'Music', blurb: 'Tasks and emails for singers, rappers, bands and players.',
      checklist: flCl([...FL_CL_BASE, ['media', 'Media person booked', -14], ['loadin', 'Confirm set time & load-in', -3], ['promo', 'Promo posted', -7], ['music', 'Set list ready', -2]]),
      tpl: flTplSwap([['and I DJ as', 'and I perform as'], ['Mix / EPK', 'Music / EPK'], ['a new mix or a release', 'a new song or a release'], ['new mixes', 'new music']]) },
    comedy: { title: 'Comedy & hosting', blurb: 'Set length, call time and set-writing tasks, with emails written for comics and hosts.',
      checklist: flCl([...FL_CL_BASE, ['cm_time', 'Confirm set length & call time', -3], ['promo', 'Promo posted', -7], ['cm_set', 'Set written & timed', -2], ['media', 'Someone booked to film the set', -14]]),
      tpl: flTplSwap([...FL_REP_PERF, ["I'd love to perform at {{venue}}", "I'd love to do a set at {{venue}}"], ['Mix / EPK', 'Clips / EPK'], ['a new mix or a release', 'a new clip, a special or a festival spot'], ['new mixes', 'new clips'], ["a night they host, an artist they've booked, or the crowd you'd bring", "a show they run, a comic they've booked, or the crowd you'd bring"], ['Load-in and soundcheck time, and parking', 'Call time, set length and parking'], ['Gear on site (my tech rider is below)', 'Mic and sound setup (my tech rider is below)']]) },
    movement: { title: 'Movement & visual', blurb: 'Rehearsal, space, cue and costume tasks, with emails written for dancers and visual artists.',
      checklist: flCl([...FL_CL_BASE, ['mv_space', 'Confirm stage or floor space & call time', -7], ['mv_cues', 'Send music or tech cues to the venue', -3], ['mv_rehearse', 'Final rehearsal', -2], ['mv_costume', 'Costume, props & supplies ready', -1], ['promo', 'Promo posted', -7], ['media', 'Media person booked', -14]]),
      tpl: flTplSwap([...FL_REP_PERF, ['Mix / EPK', 'Reel / EPK'], ['a new mix or a release', 'a new reel or a recent piece'], ['new mixes', 'new work'], ["a night they host, an artist they've booked, or the crowd you'd bring", "an event they host, an artist they've booked, or what you'd bring to the night"], ['Load-in and soundcheck time, and parking', 'Call time, rehearsal, stage or floor space, and parking'], ['Set time', 'Performance time']]) },
    service: { title: 'Services', blurb: 'Stages become Inquiry, Quoted, Booked, Done and Paid, with deposit, intake and aftercare tasks and client emails.',
      names: { lead: 'Inquiry', pitched: 'Quoted', confirmed: 'Booked', played: 'Done', paid: 'Paid', lost: "Didn't book" },
      checklist: flCl([['sv_deposit', 'Deposit received', -7], ['sv_intake', 'Intake or consult form completed', -3], ['sv_prep', 'Send prep instructions', -2], ['sv_confirm', 'Confirm time & address', -1], ['sv_supplies', 'Supplies & setup ready', -1]]),
      stages: { lead: flCl([['sv_reply', 'Reply to the inquiry', 0], ['sv_avail', 'Check the date and time work', 0], ['sv_quote', 'Send a quote or your booking link', 1]]),
        pitched: flCl([['sv_follow1', 'Follow up if no reply', 3], ['sv_follow2', 'Second follow-up', 7]]),
        played: flCl([['sv_after', 'Send aftercare or follow-up notes', 0], ['sv_invoice', 'Send invoice or receipt', 0], ['sv_review', 'Ask for a review', 2], ['sv_next', 'Offer their next appointment', 7]]),
        paid: flCl([['sv_check', 'Check payment matches the invoice', 0], ['sv_thanks', 'Thank them for payment', 1]]) },
      tpl: FL_TPL_SVC },
    other: { title: 'General performer', blurb: 'Tasks and emails that work for any kind of performer.',
      checklist: flCl([...FL_CL_BASE, ['media', 'Media person booked', -14], ['loadin', 'Confirm call time & setup', -3], ['promo', 'Promo posted', -7], ['music', 'Performance prepped', -2]]),
      tpl: flTplSwap([...FL_REP_PERF, ['Mix / EPK', 'EPK'], ['a new mix or a release', 'a new video or project'], ['new mixes', 'new work'], ['Load-in and soundcheck time, and parking', 'Call time, setup and parking'], ['Set time', 'Performance time']]) },
  };
  const flPresetFor = (group, kind) => group === 'music' ? (kind === 'dj' ? 'dj' : 'music') : FL_PRESETS[group] ? group : 'other';
  const flPlain = x => x == null ? null : JSON.parse(JSON.stringify(x));
  // every booking you already have keeps the exact tasks it shows today
  async function flFreezeBookings() {
    for (const b of flBk()) {
      const own = b.checklists || {}, add = {};
      for (const s0 of STAGES) {
        if (Array.isArray(own[s0]) || (s0 === 'confirmed' && Array.isArray(b.checklist))) continue;
        add[s0] = flPlain(clFor(b, s0).map(it => ({ ...it, offset: offOf(it) })));
      }
      if (Object.keys(add).length) await st.db.collection('bookings').doc(b.id).update({ checklists: add });
    }
  }
  const flPut = (path, data) => data == null ? st.db.doc(path).delete() : st.db.doc(path).set(data);
  async function flApplyPreset(pid) {
    const P = FL_PRESETS[pid], ids = P.tpl.map(t => t[0]), pl = S.pipeline && Array.isArray(S.pipeline.stages) && S.pipeline.stages.length ? S.pipeline : null;
    const prev = {
      preset: flArtist().preset, checklist: flPlain(S.checklist), stages: flPlain(S.stages), pipeline: flPlain(pl),
      stageNames: S.stageNames && Object.keys(S.stageNames).length ? flPlain(S.stageNames) : null,
      templates: ids.map(id => { const t = (S.templates || []).find(x => x.id === id); return t ? { id, name: t.name || '', stage: t.stage || '', audience: t.audience || 'venue', subject: t.subject || '', body: t.body || '' } : { id, gone: true }; }),
      at: new Date().toISOString(),
    };
    await st.db.doc('settings/presetBackup').set(prev); FL.hasBackup = true;
    await flFreezeBookings();
    await flPut('settings/checklist', P.checklist ? { items: P.checklist } : null);
    await flPut('settings/stages', P.stages || null);
    if (pl) await st.db.doc('settings/pipeline').set({ stages: pl.stages.map(p => KINDS.includes(p.key) && (p.like || p.key) === p.key ? { ...p, name: (P.names || {})[p.key] || STAGE_DEFAULT_NAMES[p.key] } : p) });
    else await flPut('settings/stageNames', P.names || null);
    for (const [id, name, stage, subject, body] of P.tpl) await st.db.collection('templates').doc(id).set({ name, stage, audience: 'venue', subject, body });
    await flSave({ artist: { ...(flCfg().artist || {}), preset: pid } });
  }
  async function flRestorePreset() {
    const s = await st.db.doc('settings/presetBackup').get(); if (!s.exists) { toast('Nothing to go back to'); return false; }
    const B = s.data();
    await flPut('settings/checklist', B.checklist ? { items: B.checklist } : null);
    await flPut('settings/stages', B.stages || null);
    if (B.pipeline) await st.db.doc('settings/pipeline').set(B.pipeline); else await flPut('settings/stageNames', B.stageNames || null);
    for (const t of B.templates || []) { const { id, gone, ...rest } = t; if (gone) await st.db.collection('templates').doc(id).delete(); else await st.db.collection('templates').doc(id).set(rest); }
    await flSave({ artist: { ...(flCfg().artist || {}), preset: B.preset || 'dj' } });
    await st.db.doc('settings/presetBackup').delete(); FL.hasBackup = false;
    return true;
  }
  async function flSwitchPreset(pid, btn) {
    if (FL.switching) return; FL.switching = true; if (btn) { btn.disabled = true; btn.textContent = 'Switching…'; }
    try {
      await flApplyPreset(pid); FL.askPreset = null; FL.switching = false;
      toast(`Switched to the ${FL_PRESETS[pid].title} starter set. Your current bookings kept their tasks.`, async () => { try { await flRestorePreset(); toast('Back to your previous tasks and emails'); } catch (e) { console.error(e); toast("Couldn't undo that. Try again from Settings → Profile."); } flSoon(); });
    } catch (e) {
      console.error(e); FL.switching = false; if (btn) { btn.disabled = false; btn.textContent = 'Use the new set'; }
      toast(`Couldn't finish switching. Tap "Go back to my previous tasks & emails" in Settings → Profile to undo any part that changed.`);
    }
    flSoon();
  }
  function flArtistBox(id) {
    const A = flArtist(), c = flCfg().artist || {}, g = FL.artGroup || A.group, grp = FL_GROUPS.find(x => x[0] === g) || FL_GROUPS[4];
    const custom = A.kind === 'other' && A.group === g, ask = FL.askPreset && FL_PRESETS[FL.askPreset], box = document.createElement('div'); box.id = id; box.className = 'ssx-fl-artist';
    box.innerHTML = `<div class="ssx-fl-k">What kind of work do you do?</div>
      <div class="chips ssx-fl-grps">${FL_GROUPS.map(([k, l]) => `<button type="button" class="chip" data-fl-grp="${k}" aria-pressed="${g === k}">${l}</button>`).join('')}</div>
      ${grp[2].length ? `<div class="chips">${grp[2].map(([k, l]) => `<button type="button" class="chip" data-fl-kind="${k}" aria-pressed="${A.kind === k}">${l}</button>`).join('')}<button type="button" class="chip" data-fl-kind="other" aria-pressed="${custom}">Something else</button></div>` : ''}
      <div class="ssx-fl-other" ${custom || !grp[2].length ? '' : 'hidden'}><input aria-label="How should the app refer to you?" placeholder="${g === 'service' ? 'e.g. Nail artist, Esthetician, Barber' : 'How should we refer to you? e.g. Poet, Choir, Puppeteer'}" value="${esc(custom ? c.label || '' : '')}" maxlength="30"><button type="button" class="btn small primary" data-fl-kok>Save</button></div>
      ${ask ? `<div class="ssx-fl-ask2" role="group" aria-label="Starter set"><b>Use the ${esc(ask.title)} starter set?</b><p class="note">${esc(ask.blurb)} Bookings you already have keep the tasks they have now. Only the six stage emails are replaced; your other emails stay as they are.</p>
        <div class="ssx-row"><button type="button" class="btn small primary" data-fl-yes ${FL.switching ? 'disabled' : ''}>${FL.switching ? 'Switching…' : 'Use the new set'}</button><button type="button" class="btn small" data-fl-no>Keep my current ones</button></div></div>` : ''}
      <p class="note" style="margin:0">${A.kind ? `The app calls you ${(/^[aeiou]/i.test(A.label) ? 'an ' : 'a ') + esc(flLow(A.label))} in labels, invoices, calendar events and pitch messages.` : 'Pick one and the app uses it in labels, invoices, calendar events and pitch messages.'}</p>
      ${FL.hasBackup && !ask ? '<button type="button" class="linkbtn ssx-fl-undo" data-fl-undo>Go back to my previous tasks &amp; emails</button>' : ''}`;
    const redraw = () => { const old = document.getElementById(id); if (old) { const nb = flArtistBox(id); nb.dataset.sig = old.dataset.sig; old.replaceWith(nb); } };
    const set = (kind, label) => {
      const pid = flPresetFor(g, kind);
      flSave({ artist: { kind, label, group: g, preset: A.preset } }); flRelabel(document.body); FL.artGroup = null;
      FL.askPreset = pid !== A.preset ? pid : null;
      toast(`Got it. The app will call you ${(/^[aeiou]/i.test(label) ? 'an ' : 'a ') + flLow(label)}.`); flSoon();
    };
    box.querySelectorAll('[data-fl-grp]').forEach(b => b.onclick = () => { FL.artGroup = b.dataset.flGrp; redraw(); });
    box.querySelectorAll('[data-fl-kind]').forEach(b => b.onclick = () => { const k = b.dataset.flKind; if (k === 'other') { box.querySelector('.ssx-fl-other').hidden = false; box.querySelector('.ssx-fl-other input').focus(); return; } set(k, (FL_KINDS.find(x => x[0] === k) || [])[1]); });
    const inp = box.querySelector('.ssx-fl-other input'), ok = () => { const v = inp.value.trim().replace(/\s+/g, ' '); if (!v) { toast('Type how we should refer to you'); inp.focus(); return; } set('other', v.charAt(0).toUpperCase() + v.slice(1)); };
    box.querySelector('[data-fl-kok]').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    const yes = box.querySelector('[data-fl-yes]'), no = box.querySelector('[data-fl-no]'), undo = box.querySelector('[data-fl-undo]');
    if (yes) yes.onclick = () => flSwitchPreset(FL.askPreset, yes);
    if (no) no.onclick = () => { FL.askPreset = null; toast('Kept your current tasks and emails'); flSoon(); };
    if (undo) undo.onclick = () => flTwoTap(undo, 'Tap again to go back', async () => { undo.disabled = true; try { if (await flRestorePreset()) toast('Back to your previous tasks and emails'); } catch (e) { console.error(e); toast("Couldn't go back. Check your connection and try again."); } undo.disabled = false; flSoon(); });
    return box;
  }
  function flArtistUI() {
    if (FL.hasBackup === undefined && st.db) { FL.hasBackup = false; st.db.doc('settings/presetBackup').get().then(s => { FL.hasBackup = !!s.exists; flSoon(); }).catch(() => {}); }
    const sig = JSON.stringify([flCfg().artist || {}, FL.askPreset || '', !!FL.hasBackup, !!FL.switching]);
    const busy = b => b && b.contains(document.activeElement) && document.activeElement.matches('input');
    const prof = document.getElementById('ssx-profile');
    if (prof) { let b = prof.querySelector('#ssx-fl-art'); if ((!b || b.dataset.sig !== sig) && !busy(b)) { const nb = flArtistBox('ssx-fl-art'); nb.dataset.sig = sig; if (b) b.replaceWith(nb); else { const h = prof.querySelector('.ssx-head, .head, h3'); h ? h.after(nb) : prof.prepend(nb); } } }
    const home = document.querySelector('section[data-view="home"]'), q = document.getElementById('ssx-fl-ask');
    if (flCfg().artist && !FL.askPreset) { if (q) q.remove(); return; }
    if (q) { const b = q.querySelector('#ssx-fl-art2'); if (b && b.dataset.sig !== sig && !busy(b)) { const nb = flArtistBox('ssx-fl-art2'); nb.dataset.sig = sig; b.replaceWith(nb); } return; }
    if (!home || !FL.cfg || flCfg().artist) return;
    const card = document.createElement('div'); card.id = 'ssx-fl-ask'; card.className = 'card ssx';
    const nb = flArtistBox('ssx-fl-art2'); nb.dataset.sig = sig; card.append(nb); const w = document.getElementById('welcome'); w ? w.after(card) : home.prepend(card);
  }
  /* -- old stage tasks close on their own */
  function flWrapTasks() {
    const orig = window.tasksOf; if (typeof orig !== 'function' || orig.__fl) return;
    const w = function (b) { const out = orig.apply(this, arguments); try { if (flCfg().closeOld && b && b.status) return out.filter(t => t.st === b.status); } catch (_) {} return out; };
    w.__fl = true; window.tasksOf = w;
  }
  function flStageToggle() {
    const anchor = document.getElementById('defCl'), card = anchor && anchor.closest('.card'); if (!card) return;
    let row = card.querySelector('#ssx-fl-close'); const on = flCfg().closeOld;
    if (row) { const cb = row.querySelector('input'); if (cb.checked !== on && document.activeElement !== cb) cb.checked = on; return; }
    row = document.createElement('label'); row.id = 'ssx-fl-close'; row.className = 'ssx-fl-switch';
    row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span><b>Close old stage tasks</b><span class="note">When a booking moves to its next stage, unfinished tasks from earlier stages leave your to-do list and reminders.</span></span>`;
    const note = card.querySelector(':scope > p.note'); note ? note.after(row) : card.appendChild(row);
    row.querySelector('input').onchange = e => { flSave({ closeOld: e.target.checked }); flRefresh(true); toast(e.target.checked ? 'Old stage tasks now close on their own' : 'Old stage tasks stay open'); };
  }

  /* -- reminders: repeat until done, an early heads-up, and posts from the post plan */
  const FL_EVERY = [[0, 'Just once'], [1, 'Every day'], [3, 'Every 3 days'], [7, 'Every week']];
  const FL_AHEAD = [[0, 'None'], [1, '1 day before'], [3, '3 days before'], [7, '1 week before']];
  const flWhen = n => n === 1 ? 'tomorrow' : n === 7 ? 'in a week' : `in ${n} days`;
  function flRemindRow() {
    const card = document.getElementById('ssx-notify'); if (!card) return;
    let box = card.querySelector('#ssx-fl-rem'); const c = flCfg(), sig = c.every + '|' + c.ahead;
    if (box && box.dataset.sig === sig && box === card.lastElementChild) return;
    if (!box) { box = document.createElement('div'); box.id = 'ssx-fl-rem'; box.className = 'ssx-fl-rem'; }
    card.appendChild(box); box.dataset.sig = sig;
    const chips = (list, key, val) => list.map(([v, l]) => `<button type="button" class="chip" data-fl-${key}="${v}" aria-pressed="${+val === v}">${l}</button>`).join('');
    box.innerHTML = `<div class="ssx-fl-k">Remind me until it's done</div><div class="chips">${chips(FL_EVERY, 'every', c.every)}</div>
      <div class="ssx-fl-k">Early heads-up</div><div class="chips">${chips(FL_AHEAD, 'ahead', c.ahead)}</div>
      <p class="note" style="margin:0">Reminders stop on their own once you check a task off or mark the show Paid.</p>`;
    box.querySelectorAll('[data-fl-every]').forEach(b => b.onclick = () => { flSave({ every: +b.dataset.flEvery }); flRemindRow(); flRefresh(); });
    box.querySelectorAll('[data-fl-ahead]').forEach(b => b.onclick = () => { flSave({ ahead: +b.dataset.flAhead }); flRemindRow(); flRefresh(); });
  }
  // called from the reminder list builder
  function flRepeat(out) {
    const c = flCfg(), every = +c.every || 0, ahead = +c.ahead || 0, t = todayStr(), end = addDays(t, 60), add = [];
    if (every || ahead) for (const it of out) {
      if (!it || !it.bookingId || !it.at || !(it.key || it.kind === 'paid') || String(it.key || '').startsWith('post_')) continue;
      const base = String(it.id || '').slice(0, 96), paid = it.kind === 'paid';
      if (ahead && !paid) { const d = addDays(it.at, -ahead); if (d >= t) add.push({ ...it, id: `${base}:h${d}`, at: d, body: `Coming up ${flWhen(ahead)}: "${it.label}" for ${it.show}.` }); }
      if (every) for (let d = addDays(it.at, every), n = 0; d <= end && n < 30; d = addDays(d, every), n++) if (d >= t)
        add.push({ ...it, id: `${base}:r${d}`, at: d, body: paid ? `${it.show} still isn't marked Paid. Did you get paid?` : `Still open: "${it.label}" for ${it.show}.` });
    }
    try { flPlan(true).filter(p => p.due >= t && p.due <= end).forEach(p => add.push({ id: `post:${p.b.id}:${p.kind}:${p.due}`.slice(0, 120), at: p.due, bookingId: p.b.id, key: 'post_' + p.kind, label: `Post: ${FL_POSTS[p.kind][0]}`, show: bookingName(p.b).slice(0, 80), showDate: p.b.date || '', body: `Time to post about ${bookingName(p.b)}: ${FL_POSTS[p.kind][1]}. Your caption is ready in Media.` })); } catch (_) {}
    // reach-out follow-ups join the same reminders (phone/laptop alerts and the email digest)
    try { for (const { c: fc, l } of flFuOpen()) if (l.follow <= end) add.push({ id: `fu:${fc.id}:${l.id}:${l.follow}`.slice(0, 120), at: l.follow < t ? t : l.follow, kind: 'note', show: 'Follow-ups', body: `Follow up with ${cName(fc)}. You last reached out ${flRoShort(l.at)} by ${flRoVia(l.via).toLowerCase()}.` }); } catch (_) {}
    out.push(...add);
  }

  /* -- add a new venue, promoter, media person or contact inside the booking form */
  const FL_NEW = { 'b-venue': 'venue', 'b-promo': 'promoter', 'b-media': 'media', 'b-talk': 'talk' };
  function flInlineHook(root) {
    if (!root.querySelector('#b-venue')) return;
    Object.keys(FL_NEW).forEach(id => { const s = root.querySelector('#' + id); if (s && !s.__flSeen) { s.__flSeen = true; s.__flPrev = s.value; } });
    if (root.__flInline) return; root.__flInline = true;
    root.addEventListener('change', e => {
      const s = e.target; if (!s || !FL_NEW[s.id]) return;
      if (s.value !== '__new__') { s.__flPrev = s.value; return; }
      if (s.__flBypass) { s.__flBypass = false; return; }
      e.stopImmediatePropagation();
      s.value = [...s.options].some(o => o.value === s.__flPrev) ? s.__flPrev : ''; if (typeof s._sync === 'function') s._sync();
      flNewPanel(root, s, FL_NEW[s.id]);
    }, true);
  }
  function flNewPanel(root, sel, kind) {
    const old = root.querySelector('#ssx-fl-new'); if (old) old.remove();
    const host = sel.closest('.frow') || sel.closest('.f'); if (!host) return;
    const val = id => ((root.querySelector(id) || {}).value || '').trim();
    const promo = contact(val('#b-promo')), city = val('#b-city');
    const title = { venue: 'New venue or festival', promoter: 'New promoter or collective', media: 'New media person', talk: `New person at ${cName(promo) || 'this collective'}` }[kind];
    const fld = (id, label, attrs = '') => `<div class="f"><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;
    const seg = (name, list) => `<div class="seg" data-fl-seg="${name}" style="flex-wrap:wrap">${list.map(([k, l], i) => `<button type="button" data-v="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>`;
    const email = fld('ssx-fl-email', 'Email (optional)', 'type="email" autocomplete="off"'), phone = fld('ssx-fl-phone', 'Phone (optional)', 'type="tel" inputmode="tel" autocomplete="off"');
    const notes = '<div class="f"><label for="ssx-fl-notes">Notes (optional)</label><textarea id="ssx-fl-notes" style="min-height:60px"></textarea></div>';
    const more = inner => `<div class="ssx-fl-more" hidden>${inner}${notes}</div>`;
    const body = {
      venue: `${fld('c-org', 'Venue name', 'autocomplete="off" placeholder="Start typing to look it up"')}${fld('c-addr', 'Address', 'autocomplete="off" placeholder="Fills in when you pick a place"')}
        <div class="frow">${fld('c-city', 'City', `value="${esc(city)}"`)}${email}</div><div class="frow">${fld('c-phone', 'Phone (optional)', 'type="tel" inputmode="tel" autocomplete="off"')}${fld('c-site', 'Website (optional)', 'type="url" autocomplete="off" placeholder="https://"')}</div>${more('')}`,
      promoter: `${seg('pkind', [['person', 'Person'], ['collective', 'Collective or company']])}${fld('ssx-fl-name', 'Name')}<div class="frow">${email}${phone}</div>${fld('ssx-fl-ig', 'Instagram (optional)', 'placeholder="@handle"')}
        ${more(`<div class="frow">${fld('ssx-fl-city', 'City (optional)', `value="${esc(city)}"`)}${fld('ssx-fl-site', 'Website (optional)', 'type="url" placeholder="https://"')}</div>`)}`,
      media: `${fld('ssx-fl-name', 'Name')}${seg('mkind', [['photo', 'Photo'], ['video', 'Video'], ['both', 'Photo & video']])}<div class="frow">${email}${phone}</div>${fld('ssx-fl-ig', 'Instagram (optional)', 'placeholder="@handle"')}
        ${more(`<div class="frow">${fld('ssx-fl-site', 'Portfolio link (optional)', 'type="url" placeholder="https://"')}${fld('ssx-fl-rate', 'Rate (optional)', 'placeholder="e.g. $150 per show"')}</div>${fld('ssx-fl-city', 'City (optional)', `value="${esc(city)}"`)}`)}`,
      talk: `${fld('ssx-fl-name', 'Name')}<div class="frow">${email}${phone}</div>${more(fld('ssx-fl-ig', 'Instagram (optional)', 'placeholder="@handle"'))}`
    }[kind];
    const p = document.createElement('div'); p.id = 'ssx-fl-new'; p.className = 'ssx-fl-new';
    p.innerHTML = `<h4>${esc(title)}</h4>${body}<div class="ssx-row"><button type="button" class="btn primary small" data-fl-save>Add and pick</button><button type="button" class="btn small" data-fl-cancel>Cancel</button><button type="button" class="linkbtn" data-fl-more>More details</button></div>`;
    host.after(p);
    const q = s => p.querySelector(s), segVal = n => { const b = p.querySelector(`[data-fl-seg="${n}"] [aria-pressed="true"]`); return b ? b.dataset.v : ''; };
    p.querySelectorAll('[data-fl-seg] [data-v]').forEach(b => b.onclick = () => { b.parentElement.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); const n = q('#ssx-fl-name'); if (n && b.dataset.v === 'collective') n.previousElementSibling.textContent = 'Collective name'; else if (n && b.dataset.v === 'person') n.previousElementSibling.textContent = 'Name'; });
    const first = q('#c-org') || q('#ssx-fl-name'); setTimeout(() => { try { first.focus(); p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }, 30);
    const done = () => { p.remove(); try { sel.focus(); } catch (_) {} };
    q('[data-fl-cancel]').onclick = done;
    q('[data-fl-more]').onclick = () => { const m = q('.ssx-fl-more'), b = q('[data-fl-more]'); if (!m) return; m.hidden = !m.hidden; b.textContent = m.hidden ? 'More details' : 'Fewer details'; if (!m.hidden) { const f = m.querySelector('input, textarea'); if (f) f.focus(); } };
    const go = async () => {
      const name = (first.value || '').trim(), mail = (q('#ssx-fl-email') || {}).value || '', ig = ((q('#ssx-fl-ig') || {}).value || '').trim();
      if (!name) { toast(kind === 'venue' ? 'Add the venue name' : 'Add a name'); first.focus(); return; }
      const venueId = val('#b-venue'), promoId = val('#b-promo'), talkId = val('#b-talk'), c0 = city || '';
      let data;
      if (kind === 'venue') {
        const pr = contact(promoId), bc = talkId || (pr && !isColl(pr) ? pr.id : '');
        data = { type: 'venue', vkind: 'club', org: name, address: (q('#c-addr').value || '').trim(), city: (q('#c-city').value || '').trim(), website: q('#c-site').value || '', phone: q('#c-phone').value || '', email: mail.trim(), promoterIds: [...new Set([promoId, bc].filter(x => x && x !== '__new__'))], ...(bc ? { bookingContactId: bc } : {}) };
      } else if (kind === 'promoter') {
        const coll = segVal('pkind') === 'collective', vIds = venueId && venueId !== '__new__' ? [venueId] : [];
        data = coll ? { type: 'promoter', pkind: 'collective', org: name, email: mail.trim(), instagram: ig, city: c0, venueIds: vIds }
          : { type: 'promoter', pkind: 'person', name, email: mail.trim(), instagram: ig, city: c0, venueIds: vIds, collectiveIds: [] };
      } else if (kind === 'media') data = { type: 'media', mkind: segVal('mkind') || 'photo', name, email: mail.trim(), instagram: ig, city: c0 };
      else data = { type: 'promoter', pkind: 'person', name, email: mail.trim(), city: c0, venueIds: [], collectiveIds: promoId ? [promoId] : [] };
      { const x = id => ((q(id) || {}).value || '').trim(), ex = { phone: x('#ssx-fl-phone'), notes: x('#ssx-fl-notes'), city: x('#ssx-fl-city'), rate: x('#ssx-fl-rate'), instagram: kind === 'talk' ? x('#ssx-fl-ig') : '' }; ex[kind === 'media' ? 'portfolio' : 'website'] = x('#ssx-fl-site'); Object.keys(ex).forEach(k => { if (ex[k]) data[k] = ex[k]; }); }
      const btn = q('[data-fl-save]'); btn.disabled = true; btn.textContent = 'Adding…';
      const id = await save('contacts', null, data);
      if (!id) { btn.disabled = false; btn.textContent = 'Add and pick'; return; }
      try { if (!S.contacts.some(x => x.id === id)) S.contacts.push({ id, ...data }); } catch (_) {}
      if (kind === 'talk' && promo && !promo.mainContactId) { const { id: _pid, ...rest } = promo; save('contacts', promo.id, { ...rest, mainContactId: id }); }
      const o = document.createElement('option'); o.value = id; o.textContent = cName({ id, ...data });
      const nw = [...sel.options].find(x => x.value === '__new__'); nw && nw.parentElement === sel ? nw.after(o) : sel.appendChild(o);
      sel.value = id; sel.__flPrev = id; if (typeof sel._sync === 'function') sel._sync();
      p.remove(); sel.dispatchEvent(new Event('change', { bubbles: true }));
      toast(`Added ${name}`);
    };
    q('[data-fl-save]').onclick = go;
    p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.defaultPrevented) { e.preventDefault(); go(); } });
  }

  /* -- "Show on my EPK" on bookings */
  function flFormExtras(root) {
    if (!root.querySelector('#b-venue') || root.querySelector('#ssx-b-epk')) return;
    const g = root.querySelector('#b-gcal'), lab = g && g.closest('label'), el = document.createElement('label');
    el.className = 'note ssx-fl-check'; el.innerHTML = `<input type="checkbox" id="ssx-b-epk" ${(FL.formB || {}).epkOff ? '' : 'checked'}> Show on my EPK`;
    if (lab) lab.after(el); else { const a = root.querySelector('.actions'); a ? a.before(el) : root.appendChild(el); }
  }
  function flWrapForm() {
    const orig = window.bookingForm; if (typeof orig !== 'function' || orig.__fl) return;
    const w = function (b) { FL.formB = b || {}; const out = orig.apply(this, arguments); try { flScan(); } catch (e) { console.error(e); } return out; };
    w.__fl = true; window.bookingForm = w;
  }
  function flWrapView() {
    const orig = window.bookingView; if (typeof orig !== 'function' || orig.__fl) return;
    const w = function (id) { const out = orig.apply(this, arguments); try { flViewExtras(id); } catch (e) { console.error(e); } return out; };
    w.__fl = true; window.bookingView = w;
  }
  function flViewExtras(id) {
    const root = document.querySelector(`#sheetRoot .sheet[data-booking="${id}"]`), b = flBk().find(x => x.id === id); if (!root || !b) return;
    if (flCfg().closeOld) root.querySelectorAll('[data-stgtog]').forEach(h => { if (h.dataset.stgtog === b.status) return; const n = [...h.querySelectorAll('.note')].pop(); if (n && /to do/.test(n.textContent)) { n.textContent = 'Closed'; n.title = 'Closed when this booking moved on'; } });
    const dl = root.querySelector('dl.kv'); if (!dl || dl.querySelector('.ssx-fl-epkrow') || flKind(b.status) === 'lost') return;
    const n = FL.media.filter(m => m.bookingId === id && m.assetId).length;
    const add = (label, html, cls) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.className = cls; dd.innerHTML = html; dl.append(dt, dd); return dd; };
    const ep = add('EPK', `<label class="ssx-fl-check"><input type="checkbox" ${b.epkOff ? '' : 'checked'}> Show on my EPK</label>`, 'ssx-fl-epkrow');
    ep.querySelector('input').onchange = async e => { const on = e.target.checked; if (await window.patch('bookings', id, { epkOff: !on })) toast(on ? 'On your EPK' : 'Hidden from your EPK'); };
    const ph = add('Photos', `${n ? `<button type="button" class="linkbtn" data-fl-goto>${n} in Media</button> ` : ''}<button type="button" class="btn small" data-fl-addph>Add photos</button>`, 'ssx-fl-phrow');
    ph.querySelector('[data-fl-addph]').onclick = () => flAddPhotos(id, () => { if (document.querySelector(`#sheetRoot .sheet[data-booking="${id}"]`)) bookingView(id); });
    const gt = ph.querySelector('[data-fl-goto]'); if (gt) gt.onclick = () => { close(); goTab('media'); };
  }

  /* -- "Show on my EPK" on past shows: the add list, Check my shows, See all and the edit form */
  const flDraft = () => { try { return NH.draft || []; } catch (_) { return []; } };
  const flDraftSet = (r, on) => { r.epkOff = !on; FL.draftEpk.set(nhKey(r), !on); };
  const flApplyDraft = () => flDraft().forEach(r => { const k = nhKey(r); if (FL.draftEpk.has(k)) r.epkOff = FL.draftEpk.get(k); });
  function flBuilder(root) {
    const rows = [...root.querySelectorAll('.ssx-hrow')].filter(r => r.querySelector('[data-nh-edit]')); if (!rows.length && !root.querySelector('.ssx-hfile')) return;
    flApplyDraft(); const D = flDraft();
    rows.forEach(row => {
      const r = D[+row.querySelector('[data-nh-edit]').dataset.nhEdit]; if (!r) return;
      let chip = row.querySelector('.ssx-fl-epkchip');
      if (!chip) { chip = flChip(!r.epkOff); const act = row.querySelector('.ssx-hact'); act ? act.before(chip) : row.appendChild(chip); chip.onclick = e => { e.preventDefault(); e.stopPropagation(); flDraftSet(r, !!r.epkOff); chip.setAttribute('aria-pressed', String(!r.epkOff)); }; }
      else if (chip.getAttribute('aria-pressed') !== String(!r.epkOff)) chip.setAttribute('aria-pressed', String(!r.epkOff));
    });
    const hf = root.querySelector('.ssx-hfile .note'); if (hf && !hf.dataset.fl) { hf.dataset.fl = '1'; hf.textContent = 'Fill in a Google Sheet and import it in one tap, or use the template with Excel and upload it as a CSV. The On EPK column picks which shows go on your EPK.'; }
    flSheetRow(root);
  }
  function flReview(root) {
    const list = root.querySelector('.ssx-hcheck'); if (!list) return; flApplyDraft(); const D = flDraft();
    list.querySelectorAll('label').forEach(lab => {
      const inp = lab.querySelector('[data-nh-row]'), r = inp && D[+inp.dataset.nhRow]; if (!r) return;
      let chip = lab.querySelector('.ssx-fl-epkchip');
      if (!chip) { chip = flChip(!r.epkOff); chip.disabled = inp.disabled; lab.appendChild(chip); chip.onclick = e => { e.preventDefault(); e.stopPropagation(); flDraftSet(r, !!r.epkOff); chip.setAttribute('aria-pressed', String(!r.epkOff)); }; }
      else if (chip.getAttribute('aria-pressed') !== String(!r.epkOff)) chip.setAttribute('aria-pressed', String(!r.epkOff));
    });
    flWhy(root, list, D);
    if (root.querySelector('.ssx-fl-selbar')) return;
    const bar = document.createElement('div'); bar.className = 'ssx-fl-selbar';
    bar.innerHTML = `<span>Add</span><button type="button" class="linkbtn" data-fl-sel="add:1">All</button><button type="button" class="linkbtn" data-fl-sel="add:0">None</button><span aria-hidden="true">·</span><span>On my EPK</span><button type="button" class="linkbtn" data-fl-sel="epk:1">All</button><button type="button" class="linkbtn" data-fl-sel="epk:0">None</button>`;
    list.before(bar);
    const intro = root.querySelector('p.note'); if (intro && !intro.dataset.fl) { intro.dataset.fl = '1'; intro.textContent += ' Turn EPK off for shows you want in your history but not on your EPK.'; }
    bar.querySelectorAll('[data-fl-sel]').forEach(b => b.onclick = () => {
      const [what, v] = b.dataset.flSel.split(':'), on = v === '1';
      if (what === 'add') list.querySelectorAll('[data-nh-row]:not(:disabled)').forEach(i => { if (i.checked !== on) { i.checked = on; i.dispatchEvent(new Event('change', { bubbles: true })); } });
      else { list.querySelectorAll('[data-nh-row]').forEach(i => { const r = D[+i.dataset.nhRow]; if (r && !i.disabled) flDraftSet(r, on); }); flReview(root); }
    });
  }
  const flShowOn = s => { try { if (s.kind === 'booking') { const b = flBk().find(x => x.id === s.id); return !(b && b.epkOff); } const p = (S.pastShows || []).find(x => x.id === s.id); return !(p && p.epkOff); } catch (_) { return true; } };
  const flOnEpk = s => flShowOn(s);
  function flSeeAll(root) {
    root.querySelectorAll('.ssx-nshows:not(.ssx-hcheck) [data-nh-open]').forEach(btn => {
      const [kind, ...rest] = btn.dataset.nhOpen.split(':'), id = rest.join(':'), on = flShowOn({ kind, id });
      let chip = btn.querySelector('.ssx-fl-epkchip');
      if (!chip) {
        chip = document.createElement('span'); chip.className = 'ssx-fl-epkchip'; chip.textContent = 'EPK'; chip.setAttribute('role', 'switch'); chip.tabIndex = 0; chip.title = 'Show on my EPK';
        const flip = async e => { e.preventDefault(); e.stopPropagation(); const now = chip.getAttribute('aria-checked') !== 'true'; chip.setAttribute('aria-checked', String(now)); if (await window.patch(kind === 'booking' ? 'bookings' : 'pastShows', id, { epkOff: !now })) toast(now ? 'On your EPK' : 'Hidden from your EPK'); };
        chip.addEventListener('click', flip); chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') flip(e); });
        btn.appendChild(chip);
      }
      chip.setAttribute('aria-checked', String(on)); chip.setAttribute('aria-label', `Show ${btn.querySelector('b') ? btn.querySelector('b').textContent : 'this show'} on my EPK`);
    });
  }
  function flPastForm(root) {
    const d = root.querySelector('#nh-date[data-k]'); if (!d || root.querySelector('[data-nh-ok]') || root.querySelector('#ssx-nh-epk')) return;
    const h = root.querySelector('h3'), isEdit = h && /edit/i.test(h.textContent), p = isEdit && FL.nhOpen && FL.nhOpen.kind === 'past' ? (S.pastShows || []).find(x => x.id === FL.nhOpen.id) : null;
    const el = document.createElement('label'); el.className = 'ssx-fl-check'; el.innerHTML = `<input type="checkbox" id="ssx-nh-epk" ${p && p.epkOff ? '' : 'checked'}> Show on my EPK`;
    const a = root.querySelector('.actions'); a ? a.before(el) : root.appendChild(el);
  }
  // dates the template reader didn't know: 7-Feb-25, Feb 7 25, ranges ("May 1, 2026 → May 2, 2026"), month-year ("Feb-25"), spreadsheet date numbers
  function flDateFix(v) {
    let t = String(v == null ? '' : v).trim();
    if (/^\d{5}(\.\d+)?$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
    t = t.split(/\s*(?:→|->|–|—|\bto\b|\bthru\b|\bthrough\b|\s-\s)\s*/i)[0].trim();
    const MO = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec', yr = y => y.length === 2 ? 2000 + +y : +y; let m;
    if ((m = t.match(new RegExp(`^(\\d{1,2})[-\\s/.]+(${MO})[a-z]*\\.?[-\\s/.,]+(\\d{4}|\\d{2})$`, 'i')))) return `${m[2]} ${+m[1]}, ${yr(m[3])}`;
    if ((m = t.match(new RegExp(`^(${MO})[a-z]*\\.?[-\\s/.]+(\\d{1,2})[-\\s/.,]+(\\d{4}|\\d{2})$`, 'i')))) return `${m[1]} ${+m[2]}, ${yr(m[3])}`;
    if ((m = t.match(new RegExp(`^(${MO})[a-z]*\\.?[-\\s/.']+(\\d{2})$`, 'i')))) return `${m[1]} ${2000 + +m[2]}`;
    return t;
  }
  const flCells = line => { if (line.includes('\t')) return line.split('\t').map(s => s.trim()); const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  function flReadEpkCol(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim()); if (lines.length < 2) return;
    const h = flCells(lines[0]).map(s => s.toLowerCase()), at = re => h.findIndex(x => re.test(x));
    const di = at(/date|when/), ei = at(/epk/), ti = at(/event|show|title|gig|name/), vi = at(/venue|club|location|place|where/);
    if (di < 0 || ei < 0) return;
    for (const line of lines.slice(1)) {
      const c = flCells(line), d = nhDate(c[di]); if (!d || !d.date) continue;
      FL.draftEpk.set(nhKey({ date: d.date, venue: vi >= 0 ? c[vi] || '' : '', title: ti >= 0 ? c[ti] || '' : '' }), /^(no|n|false|0|off|hide|skip)$/i.test(String(c[ei] || '').trim()));
    }
    flApplyDraft(); flSoon();
  }
  const FL_TPL = 'Date,Event name,Venue,City,On EPK (yes/no)\r\n3/14/2025,Example Block Party,Example Venue,San Diego,yes\r\n';
  function flTemplate() {
    const u = URL.createObjectURL(new Blob(['\uFEFF' + FL_TPL], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = u; a.download = 'set-and-settled-show-history-template.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  // Google Sheet: made in their Drive with the right columns, then read back in one tap
  async function flToken() { try { const mcp = await driveReady(); if (!mcp) return ''; const r = await mcp.callTool('Google Drive', 'picker_token', {}); return ((r || {}).payload || {}).token || ''; } catch (_) { return ''; } }
  async function flMakeSheet(btn) {
    const win = window.open('', '_blank'); btn.disabled = true; btn.textContent = 'Making your sheet…';
    try {
      const tok = await flToken(); if (!tok) throw new Error('drive');
      const bd = 'ssx' + Date.now(), meta = { name: 'Set & Settled – Show history', mimeType: 'application/vnd.google-apps.spreadsheet' };
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + bd }, body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: text/csv\r\n\r\n${FL_TPL}\r\n--${bd}--` });
      if (!r.ok) throw new Error('make ' + r.status);
      const f = await r.json(), url = f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`;
      await flSave({ sheetId: f.id, sheetUrl: url });
      if (win && !win.closed) win.location.href = url; else window.open(url, '_blank');
      toast('Your sheet is open in a new tab. Fill it in, then come back and tap Import.'); flSoon();
    } catch (e) { if (win && !win.closed) win.close(); toast(e.message === 'drive' ? 'Connect Google Drive in Settings, then try again' : "Couldn't make the sheet. Try again."); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Make a Google Sheet'; } }
  }
  async function flImportSheet(root, btn) {
    const c = flCfg(); if (!c.sheetId) return; btn.disabled = true; btn.textContent = 'Reading your sheet…';
    try {
      const tok = await flToken(); if (!tok) throw new Error('drive');
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(c.sheetId)}/export?mimeType=text%2Fcsv`, { headers: { Authorization: 'Bearer ' + tok } });
      if (r.status === 404) { await flSave({ sheetId: '', sheetUrl: '' }); throw new Error('gone'); }
      if (!r.ok) throw new Error('read ' + r.status);
      const text = await r.text(), inp = root.querySelector('#nh-file');
      if (!inp) throw new Error('form');
      const dt = new DataTransfer(); dt.items.add(new File([text], 'google-sheet.csv', { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { toast(e.message === 'drive' ? 'Connect Google Drive in Settings, then try again' : e.message === 'gone' ? 'That sheet was deleted. Make a new one.' : "Couldn't read your sheet. Try again."); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Import from my sheet'; } }
  }
  function flSheetRow(root) {
    const hf = root.querySelector('.ssx-hfile'); if (!hf) return;
    const c = flCfg(), sig = c.sheetId || '-'; let row = hf.querySelector('.ssx-fl-gs'); if (row && row.dataset.sig === sig) return;
    if (!row) { row = document.createElement('div'); row.className = 'ssx-row ssx-fl-gs'; const n = hf.querySelector('.note'); n ? n.after(row) : hf.appendChild(row); }
    row.dataset.sig = sig;
    row.innerHTML = c.sheetId ? `<a class="btn small" href="${esc(c.sheetUrl)}" target="_blank" rel="noopener">Open my Google Sheet</a><button type="button" class="btn small primary" data-fl-gsin>Import from my sheet</button><button type="button" class="linkbtn" data-fl-gsnew>Make a new one</button>` : '<button type="button" class="btn small primary" data-fl-gsnew>Make a Google Sheet</button>';
    const nw = row.querySelector('[data-fl-gsnew]'); nw.onclick = () => flMakeSheet(nw);
    const im = row.querySelector('[data-fl-gsin]'); if (im) im.onclick = () => flImportSheet(root, im);
  }
  function flDocClick(e) {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    if (t.closest('[data-nh-tpl]')) { e.preventDefault(); e.stopImmediatePropagation(); flTemplate(); return; }
    const o = t.closest('[data-nh-open]'); if (o && !t.closest('.ssx-fl-epkchip')) { const [kind, ...rest] = o.dataset.nhOpen.split(':'); FL.nhOpen = { kind, id: rest.join(':') }; }
  }
  function flDocChange(e) {
    const t = e.target; if (!t || t.id !== 'nh-file' || !t.files || !t.files[0]) return;
    const f = t.files[0]; if (f.size > 1048576 || /\.xlsx?$/i.test(f.name)) return;
    f.text().then(flReadEpkCol).catch(() => {});
  }
  function flWrapSave() {
    const sv = window.save; if (typeof sv !== 'function' || sv.__fl) return;
    const w = async function (col, id, data) {
      try {
        if (col === 'bookings' && data && typeof data === 'object') { const cb = document.querySelector('#sheetRoot #ssx-b-epk'); if (cb) data = { ...data, epkOff: !cb.checked }; }
        if (col === 'pastShows' && data && typeof data === 'object') {
          const cb = document.querySelector('#sheetRoot #ssx-nh-epk');
          if (cb) data = { ...data, epkOff: !cb.checked }; else if (!id) { const k = nhKey(data); if (FL.draftEpk.has(k)) data = { ...data, epkOff: FL.draftEpk.get(k) }; }
        }
      } catch (_) {}
      return sv.call(this, col, id, data);
    };
    w.__fl = true; window.save = w;
  }

  /* -- Media: photos, links and folders, and a post plan */
  const flAssets = async () => { try { return await claude.use('assets'); } catch (_) { return null; } };
  const flSrc = id => { try { return typeof __blob === 'function' ? __blob(id) : ''; } catch (_) { return ''; } };
  const flPhotos = () => FL.media.filter(m => m.assetId).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  const flLinks = () => FL.media.filter(m => m.type === 'link' && m.url).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  const flKitPhotos = () => { try { return (S.kitFiles || []).filter(f => f.assetId && /^image\//.test(f.contentType || '')); } catch (_) { return []; } };
  const flAvatar = () => { try { return (S.profile || {}).avatarId || ''; } catch (_) { return ''; } };
  function flEpkAsset() {
    const c = flCfg(), all = [...flPhotos().map(m => m.assetId), ...flKitPhotos().map(f => f.assetId)];
    if (c.epkPhoto === 'profile') return '';
    if (c.epkPhoto && all.includes(c.epkPhoto)) return c.epkPhoto;
    return flAvatar() ? '' : (all[0] || '');
  }
  // called from epkData: the picture the EPK should use, or '' for the profile photo
  const flEpkPhoto = () => { const id = flEpkAsset(); return id ? flSrc(id) : ''; };
  const flFolder = b => { try { return subUrl(b, 'mkt', 'media') || b.driveUrl || (((b.folders || {}).mkt) || {}).url || ''; } catch (_) { return b.driveUrl || ''; } };
  function flWaiting() {
    const t = todayStr(), from = addDays(t, -60), have = new Set(FL.media.filter(m => m.assetId).map(m => m.bookingId).filter(Boolean)), skip = flCfg().mediaDone || {};
    return flBk().filter(b => b.date && b.date <= t && b.date >= from && ['played', 'paid'].includes(flKind(b.status)) && (b.mediaId || flFolder(b)) && !have.has(b.id) && !skip[b.id]).sort((a, b) => b.date.localeCompare(a.date));
  }
  const flShows = () => flBk().filter(b => b.date && flKind(b.status) !== 'lost' && b.date <= addDays(todayStr(), 60)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
  // app copies are kept to 1600px so storage stays small
  async function flShrink(file) {
    try {
      const bmp = await createImageBitmap(file), r = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (r === 1 && file.size < 1.2e6) return file;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(x => res(x || file), 'image/jpeg', 0.85));
    } catch (_) { return file; }
  }
  async function flAddFiles(files, bookingId, after) {
    files = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)); if (!files.length) return;
    if (files.some(f => f.size > 25e6)) { toast('One of those photos is over 25 MB. Pick a smaller copy.'); return; }
    const assets = await flAssets(); if (!assets) { toast("Photo uploads aren't available right now"); return; }
    const ids = [];
    for (const [n, f] of files.entries()) {
      if (files.length > 1) toast(`Adding photo ${n + 1} of ${files.length}…`);
      try { const r = await assets.upload(await flShrink(f)); if (r && r.id) { await st.db.collection('media').add({ assetId: r.id, name: String(f.name || 'Photo').slice(0, 120), bookingId: bookingId || '', type: 'photo', addedAt: new Date().toISOString() }); ids.push(r.id); } } catch (e) { console.error(e); }
    }
    toast(ids.length ? `Added ${ids.length} photo${ids.length === 1 ? '' : 's'} to Media` : "Couldn't add those photos. Try again.");
    if (ids.length && after) after(ids);
  }
  function flAddPhotos(bookingId, after) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = () => { const files = [...(i.files || [])]; i.remove(); flAddFiles(files, bookingId, after); };
    i.click();
  }
  async function flRemovePhoto(kind, docId, assetId) {
    if (kind === 'kit') { try { await st.db.collection('kitFiles').doc(docId).delete(); } catch (_) {} }
    else { await st.db.collection('media').doc(docId).delete().catch(() => {}); FL.media = FL.media.filter(x => x.id !== docId); }
    if (flCfg().epkPhoto === assetId) flSave({ epkPhoto: '' });
    try { const a = await flAssets(); a && await a.delete(assetId); } catch (_) {}
    toast('Photo removed'); flSoon(); try { if (EPK.el) epkRender(); } catch (_) {}
  }
  function flAsk(id) {
    const b = flBk().find(x => x.id === id), m = b && contact(b.mediaId); if (!b || !m) return;
    const name = bookingName(b), f = flFolder(b);
    try { composeSheet({ booking: b.id, to: m.id, subject: `Photos & video from ${name}`, body: `Hi ${(cName(m) || '').split(' ')[0] || 'there'},\n\nThank you for shooting ${name}! Whenever they're ready, could you drop the photos and video here?\n${f || '(folder link)'}\n\nThanks so much,\n${myName()}` }); } catch (_) {}
  }
  const flLinkKind = u => { const s = String(u || '').toLowerCase(); return /youtu\.?be|vimeo|tiktok/.test(s) ? 'Video' : /soundcloud|mixcloud|spotify|bandcamp|music\.apple|audiomack/.test(s) ? 'Music' : /instagram/.test(s) ? 'Instagram' : /drive\.google|dropbox|photos\.google|wetransfer|icloud/.test(s) ? 'Folder' : 'Link'; };
  const flHost = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return u; } };
  // every link the Kit link form can pick from: saved media links plus each show's media folder
  function flMediaLinks() {
    const out = flLinks().map(l => { const b = l.bookingId && flBk().find(x => x.id === l.bookingId); return { id: l.id, url: l.url, label: l.title || (b ? `${bookingName(b)} – ${flLinkKind(l.url).toLowerCase()}` : flHost(l.url)), kind: flLinkKind(l.url), b }; });
    flBk().filter(b => b.date && flKind(b.status) !== 'lost' && flFolder(b)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).forEach(b => out.push({ id: 'f:' + b.id, url: flFolder(b), label: `${bookingName(b)} photos (${dueShort(b.date)})`, kind: 'Folder', b, auto: true }));
    return out;
  }
  function flLinkSheet(l = {}) {
    const bks = flShows();
    sheet(`<h3>${l.id ? 'Edit link' : 'Add a media link'}</h3><p class="note" style="margin:0">A video, mix, Instagram post or photo folder. It shows up when you add links to your Kit and EPK.</p>
      <div class="f"><label for="ssx-fl-lu">Link</label><input id="ssx-fl-lu" type="url" value="${esc(l.url || '')}" placeholder="https://"></div>
      <div class="f"><label for="ssx-fl-lt">Name (optional)</label><input id="ssx-fl-lt" value="${esc(l.title || '')}" placeholder="e.g. Freakuency set recording"></div>
      <div class="f"><label for="ssx-fl-lb">From show (optional)</label><select id="ssx-fl-lb" class="srch"><option value="">Not linked to a show</option>${bks.map(b => `<option value="${esc(b.id)}" ${b.id === l.bookingId ? 'selected' : ''}>${esc(bookingName(b) + (b.date ? ' · ' + dueShort(b.date) : ''))}</option>`).join('')}</select></div>
      <div class="actions">${l.id ? '<button class="btn danger" data-fl-ldel>Remove</button>' : ''}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = close;
      const del = root.querySelector('[data-fl-ldel]'); if (del) del.onclick = () => flTwoTap(del, 'Tap again to remove', async () => { await st.db.collection('media').doc(l.id).delete().catch(() => {}); close(); toast('Link removed'); });
      root.querySelector('[data-save]').onclick = async () => {
        let url = root.querySelector('#ssx-fl-lu').value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        try { new URL(url); } catch (_) { toast('Paste a full link'); root.querySelector('#ssx-fl-lu').focus(); return; }
        const d = { type: 'link', url, title: root.querySelector('#ssx-fl-lt').value.trim().slice(0, 120), bookingId: root.querySelector('#ssx-fl-lb').value, addedAt: l.addedAt || new Date().toISOString() };
        if (l.id) await st.db.collection('media').doc(l.id).set(d); else await st.db.collection('media').add(d);
        close(); toast('Link saved');
      };
    });
  }
  // the Kit "Add link" form: pick from your media links instead of pasting
  function flLinkPicker(root) {
    const u = root.querySelector('#l-url'), lab = root.querySelector('#l-label'); if (!u || !lab || root.querySelector('#ssx-fl-lpick') || u.value) return;
    const opts = flMediaLinks().slice(0, 12); if (!opts.length) return;
    const box = document.createElement('div'); box.id = 'ssx-fl-lpick'; box.className = 'f';
    box.innerHTML = `<label>Pick from Media</label><div class="chips">${opts.map((o, i) => `<button type="button" class="chip" data-fl-lp="${i}">${esc(o.label)}</button>`).join('')}</div><span class="note">Or paste any link below.</span>`;
    const h = root.querySelector('h3'); h ? h.after(box) : root.prepend(box);
    box.querySelectorAll('[data-fl-lp]').forEach(b => b.onclick = () => {
      const o = opts[+b.dataset.flLp]; u.value = o.url; lab.value = o.label; const g = root.querySelector('#l-group');
      if (g) { g.value = o.kind === 'Video' || o.kind === 'Music' ? 'music' : 'press'; if (typeof g._sync === 'function') g._sync(); }
      [u, lab].forEach(x => x.dispatchEvent(new Event('input', { bubbles: true })));
      box.querySelectorAll('[data-fl-lp]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
  }

  // post plan: the posts each show needs, with captions written from the booking
  const FL_POSTS = { announce: ['Announce it', 'let people know you are playing', -14], countdown: ['Countdown', 'a reminder a couple of days before', -2], dayof: ['Tonight', 'a day-of post or story', 0], recap: ['Recap and thank-you', 'photos and a thank-you to the venue and crew', 1] };
  const flHandle = c => c && c.instagram ? '@' + String(c.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '').trim() : '';
  function flPlan(all) {
    return []; // the post plan was taken out of Media
    const t = todayStr(), plan = flCfg().plan || {}, out = [];
    for (const b of flBk()) {
      if (!b.date) continue; const k = flKind(b.status), past = b.date < t;
      for (const [kind, [, , off]] of Object.entries(FL_POSTS)) {
        if (plan[kind] === false) continue; const p = FL.posts[`${b.id}__${kind}`];
        if (p && (p.status === 'posted' || p.status === 'skipped')) continue;
        let due = addDays(b.date, off);
        if (kind === 'recap') { if (!(['played', 'paid'].includes(k) || (k === 'confirmed' && past)) || daysBetween(b.date, t) > 14) continue; }
        else { if (k !== 'confirmed' || past) continue; if (kind === 'announce' && daysBetween(t, b.date) <= 2 && plan.countdown !== false) continue; if (due < t) due = t; }
        if (!all && daysBetween(t, due) > 21) continue;
        out.push({ b, kind, due, draft: p && p.caption });
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }
  function flCaption(b, kind) {
    const v = contact(b.venueId), pr = contact(b.promoterId), m = contact(b.mediaId), show = bookingName(b), where = cName(v) || '';
    const day = parseD(b.date) ? parseD(b.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
    const at = where && where !== show ? ` at ${where}` : '', city = b.city ? ` in ${b.city}` : '';
    const tags = [...new Set([flHandle(v), flHandle(pr)].filter(Boolean))].join(' ');
    const tix = b.ticketUrl ? `\nTickets: ${b.ticketUrl}` : '', time = b.setTime ? ` I'm on ${b.setTime}.` : '';
    const own = String(flCfg().tags || '').trim(), city2 = b.city ? '#' + b.city.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const foot = [tags, [own, own.toLowerCase().includes(city2) ? '' : city2].filter(Boolean).join(' ')].filter(Boolean).join('\n');
    const body = {
      announce: `${day}: catch me live for ${show}${at}${city}.${tix}`,
      countdown: `2 days until ${show}${at}! Who's coming?${tix}`,
      dayof: `Tonight: ${show}${at}.${time} See you there.${tix}`,
      recap: `Thank you${where ? ' ' + where : ''} for having me at ${show}. What a night!${m ? ` 📸 ${flHandle(m) || cName(m)}` : ''}`
    }[kind];
    return body + (foot ? '\n\n' + foot : '');
  }
  const clKeys = b => { try { return [...new Set(STAGES.flatMap(st0 => clFor(b, st0).map(x => x.key)))]; } catch (_) { return []; } };
  async function flMarkPost(b, kind, status, caption) {
    await st.db.collection('posts').doc(`${b.id}__${kind}`).set({ bookingId: b.id, kind, status, caption: caption || '', at: new Date().toISOString() });
    if (status !== 'posted') return;
    const keys = { ['post_' + kind]: true }, ck = clKeys(b);
    if (kind === 'announce' && ck.includes('promo')) keys.promo = true;
    if (kind === 'recap' && ck.includes('pl_recap')) keys.pl_recap = true;
    await window.patch('bookings', b.id, { tasks: keys });
    if (kind === 'recap') { try { apMark('done', 'recap:' + b.id); } catch (_) {} }
  }
  function flPostSheet(bid, kind) {
    const b = flBk().find(x => x.id === bid); if (!b) return;
    const saved = FL.posts[`${bid}__${kind}`] || {}, mine = flPhotos().filter(m => m.bookingId === bid), others = flPhotos().filter(m => m.bookingId !== bid).slice(0, 12), pics = [...mine, ...others];
    let picked = FL.sel[bid + kind] || (mine[0] || {}).assetId || '', touched = !!saved.caption;
    const cap0 = saved.caption || flCaption(b, kind);
    sheet(`<h3>${esc(FL_POSTS[kind][0])}: ${esc(bookingName(b))}</h3><p class="note" style="margin:0">${esc(fmtD(b.date))}. Written from the booking, so just check it and post.</p>
      <div class="f"><label for="ssx-fl-cap">Caption</label><textarea id="ssx-fl-cap" style="min-height:150px">${esc(cap0)}</textarea></div>
      <div class="f"><label>Photo</label><div class="ssx-fl-picks">${pics.map(p => `<button type="button" class="ssx-fl-pick" data-fl-pp="${esc(p.assetId)}" aria-pressed="${p.assetId === picked}" aria-label="Use ${esc(p.name || 'photo')}"><img src="${esc(flSrc(p.assetId))}" alt=""></button>`).join('')}<button type="button" class="ssx-chip" data-fl-pup>+ Add photo</button></div>${pics.length ? '' : '<span class="note">No photos yet. Text posts and stories work too.</span>'}</div>
      <div class="f"><label for="ssx-fl-tags">Hashtags for every post</label><input id="ssx-fl-tags" value="${esc(flCfg().tags || '')}" placeholder="#sandiego #livemusic"></div>
      <div class="ssx-row"><button type="button" class="btn primary small" data-fl-share>Copy caption and share</button><button type="button" class="btn small" data-fl-copy>Copy caption</button></div>
      <p class="note" style="margin:0">On a phone, Share opens Instagram, TikTok or any app with the photo. Paste the caption there.</p>
      <div class="actions"><button class="btn" data-fl-skip>Skip this post</button><button class="btn" data-cancel>Close</button><button class="btn primary" data-fl-done>I posted it</button></div>`, root => {
      const cap = root.querySelector('#ssx-fl-cap'), tg = root.querySelector('#ssx-fl-tags');
      let tmr = 0; cap.addEventListener('input', () => { touched = true; clearTimeout(tmr); tmr = setTimeout(() => st.db.collection('posts').doc(`${bid}__${kind}`).set({ bookingId: bid, kind, status: 'draft', caption: cap.value, at: new Date().toISOString() }).catch(() => {}), 800); });
      tg.addEventListener('change', () => { flSave({ tags: tg.value.trim() }); if (!touched) cap.value = flCaption(b, kind); });
      root.querySelectorAll('[data-fl-pp]').forEach(x => x.onclick = () => { picked = x.getAttribute('aria-pressed') === 'true' ? '' : x.dataset.flPp; FL.sel[bid + kind] = picked; root.querySelectorAll('[data-fl-pp]').forEach(y => y.setAttribute('aria-pressed', String(y.dataset.flPp === picked))); });
      root.querySelector('[data-fl-pup]').onclick = () => flAddPhotos(bid, ids => { FL.sel[bid + kind] = ids[0]; flPostSheet(bid, kind); });
      const copy = async () => { try { await navigator.clipboard.writeText(cap.value); return true; } catch (_) { cap.select(); try { return document.execCommand('copy'); } catch (__) { return false; } } };
      root.querySelector('[data-fl-copy]').onclick = async () => toast(await copy() ? 'Caption copied' : 'Select the caption and copy it');
      root.querySelector('[data-fl-share]').onclick = async () => {
        const ok = await copy(); let file = null;
        if (picked) { try { const r = await fetch(flSrc(picked)); const bl = await r.blob(); file = new File([bl], (bookingName(b).replace(/[^\w\- ]+/g, '').trim() || 'photo') + (/png/.test(bl.type) ? '.png' : '.jpg'), { type: bl.type || 'image/jpeg' }); } catch (_) {} }
        try {
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: cap.value });
          else if (!file && navigator.share) await navigator.share({ text: cap.value });
          else { if (file) await window.dl(file.name, file); toast(ok ? 'Caption copied and photo saved. Post it from your phone or Instagram.' : 'Photo saved. Copy the caption, then post.'); return; }
          toast('Posted it? Tap "I posted it" to check it off.');
        } catch (e) { if (e && e.name !== 'AbortError') toast(ok ? 'Caption copied' : "Couldn't open sharing here"); }
      };
      root.querySelector('[data-cancel]').onclick = () => { close(); };
      root.querySelector('[data-fl-skip]').onclick = async () => { await flMarkPost(b, kind, 'skipped', cap.value); close(); toast('Skipped', () => st.db.collection('posts').doc(`${bid}__${kind}`).delete().catch(() => {})); };
      root.querySelector('[data-fl-done]').onclick = async () => { await flMarkPost(b, kind, 'posted', cap.value); close(); toast('Nice! Checked off.'); };
    });
  }

  // the Media tab
  const FL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';
  function flMediaTab() {
    const main = document.getElementById('main'), kit = document.querySelector('section[data-view="kit"]'); if (!main || !kit) return;
    let sec = document.querySelector('section[data-view="media"]');
    if (!sec) {
      sec = document.createElement('section'); sec.dataset.view = 'media'; sec.hidden = true;
      sec.innerHTML = `<div class="head"><div><h2>Media</h2><p class="note" style="margin:2px 0 0">Photos, videos and links from your shows, and a simple plan for posting about them.</p></div><div class="chips"><button type="button" class="btn" data-fl-addlink>+ Add link</button><button type="button" class="btn primary" data-fl-add>Add photos</button></div></div><div id="ssx-fl-mhost"></div>`;
      kit.after(sec); sec.querySelector('[data-fl-addlink]').onclick = () => flLinkSheet(); sec.querySelector('[data-fl-add]').onclick = () => flAddPhotos('');
    }
    const tabs = document.getElementById('tabs'); if (tabs && !tabs.querySelector('[data-tab="media"]')) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'media'; b.setAttribute('aria-current', 'false'); b.innerHTML = FL_ICON + 'Media'; b.onclick = () => window.goTab('media');
      const k = tabs.querySelector('[data-tab="kit"]'); k ? k.after(b) : tabs.appendChild(b);
    }
    try { if (typeof TAB_NAMES === 'object' && !TAB_NAMES.media) TAB_NAMES.media = 'Media'; } catch (_) {}
  }
  const flThumb = (m, x) => `<span class="ssx-fl-thw"><button type="button" class="ssx-fl-th${flEpkAsset() === m.assetId ? ' on' : ''}" data-fl-ph="${esc(m.id)}" aria-label="Open photo ${esc(m.name || '')}"><img src="${esc(flSrc(m.assetId))}" alt="" loading="lazy">${flEpkAsset() === m.assetId ? '<span class="ssx-fl-badge">EPK</span>' : ''}</button>${x ? `<button type="button" class="ssx-fl-x" data-fl-rm="${esc(m.id)}" aria-label="Remove photo ${esc(m.name || '')}">×</button>` : ''}</span>`;
  const flWaitRow = b => { const m = contact(b.mediaId), f = flFolder(b);
    return `<div class="ssx-fl-wrow"><span><b>${esc(bookingName(b))}</b><span class="note">${esc(fmtD(b.date))}${m ? ' · ' + esc(cName(m)) : ''}</span></span><span class="ssx-fl-wact">${f ? `<a class="btn small" href="${esc(f)}" target="_blank" rel="noopener">Open folder</a>` : ''}${m && m.email ? `<button type="button" class="btn small" data-fl-ask="${esc(b.id)}">Ask for files</button>` : ''}<button type="button" class="btn small primary" data-fl-addb="${esc(b.id)}">Add photos</button><button type="button" class="btn small" data-fl-skip="${esc(b.id)}" aria-label="No photos coming for ${esc(bookingName(b))}">Skip</button></span></div>`; };
  function flMediaPage() {
    const host = document.getElementById('ssx-fl-mhost'); if (!host || !st.db) return;
    if (host.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const ph = flPhotos(), wait = flWaiting(), plan = flPlan(false), links = flMediaLinks(), pc = flCfg().plan || {};
    const sig = JSON.stringify([ph.map(m => m.id + m.bookingId), wait.map(b => b.id), plan.map(p => p.b.id + p.kind + p.due), links.map(l => l.id + l.label), flEpkAsset(), pc, flBk().length]);
    if (host.dataset.sig === sig) return; host.dataset.sig = sig;
    const t = todayStr(), grp = p => p.due < t ? 'Late' : p.due === t ? 'Today' : p.due <= addDays(t, 7) ? 'This week' : 'Coming up';
    let last = '', planHtml = '';
    plan.forEach(p => { const g = grp(p); if (g !== last) { last = g; planHtml += `<div class="ssx-fl-pg">${g}</div>`; } planHtml += `<div class="ssx-fl-prow"><span><b>${esc(FL_POSTS[p.kind][0])}</b><span class="note">${esc(bookingName(p.b))} · ${esc(dueShort(p.due))}${p.draft ? ' · draft saved' : ''}</span></span><button type="button" class="btn small primary" data-fl-post="${esc(p.b.id)}|${p.kind}">Write it</button></div>`; });
    const groups = new Map(); ph.forEach(m => { const b = m.bookingId && flBk().find(x => x.id === m.bookingId), k = b ? b.id : ''; if (!groups.has(k)) groups.set(k, { label: b ? `${bookingName(b)}${b.date ? ' · ' + dueShort(b.date) : ''}` : 'Not linked to a show', at: b ? b.date || '' : '', items: [] }); groups.get(k).items.push(m); });
    const G = [...groups.values()].sort((a, b) => (b.at || '0').localeCompare(a.at || '0'));
    host.innerHTML = `
      <div class="card ssx" id="ssx-fl-posts"><div class="ssx-head"><div><h3>Post plan</h3><p class="note">Posts each show needs, with captions already written from the booking. Tap Write it, check the caption, then share.</p></div></div>
        ${plan.length ? `<div class="ssx-fl-plist">${planHtml}</div>` : '<div class="empty">Nothing to post right now. Posts appear here when you confirm a show.</div>'}
        <details class="ssx-det"><summary>Which posts to plan</summary><div class="chips" style="margin-top:8px">${Object.entries(FL_POSTS).map(([k, [l, d]]) => `<button type="button" class="chip" data-fl-plan="${k}" aria-pressed="${pc[k] !== false}" title="${esc(d)}">${esc(l)}</button>`).join('')}</div></details></div>
      <div class="card ssx" id="ssx-fl-photos"><div class="ssx-head"><div><h3>Photos</h3><p class="note">${ph.length ? 'Tap a photo to use it on your EPK, download it or link it to a show.' : 'Photos from your shows, in one place. Add them here or from any booking.'}</p></div></div>
        ${wait.length ? `<div class="eyebrow" style="margin:4px 0 6px">Waiting on photos</div><div class="ssx-fl-wait">${wait.map(flWaitRow).join('')}</div>` : ''}
        ${G.map(g => `<div class="ssx-fl-gl">${esc(g.label)}</div><div class="ssx-fl-grid">${g.items.map(m => flThumb(m, true)).join('')}</div>`).join('')}
        <div class="ssx-row"><button type="button" class="btn small primary" data-fl-add>Add photos</button></div></div>
      <div class="card ssx" id="ssx-fl-links"><div class="ssx-head"><div><h3>Links and folders</h3><p class="note">Videos, mixes, posts and photo folders. Pick any of them when you add links to your Kit and EPK.</p></div></div>
        ${links.length ? `<div class="ssx-fl-llist">${links.map(l => `<div class="ssx-fl-lrow"><span class="ssx-fl-lk">${esc(l.kind)}</span><span class="ssx-fl-lt"><b>${esc(l.label)}</b><span class="note">${esc(flHost(l.url))}</span></span><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Open</a>${l.auto ? '' : `<button type="button" class="btn small" data-fl-ledit="${esc(l.id)}">Edit</button>`}</div>`).join('')}</div>` : '<div class="empty">No links yet.</div>'}
        <div class="ssx-row"><button type="button" class="btn small" data-fl-addlink2>+ Add link</button></div></div>`;
    host.querySelectorAll('[data-fl-post]').forEach(x => x.onclick = () => { const [bid, k] = x.dataset.flPost.split('|'); flPostSheet(bid, k); });
    host.querySelectorAll('[data-fl-plan]').forEach(x => x.onclick = () => { const k = x.dataset.flPlan; flSave({ plan: { ...pc, [k]: pc[k] === false } }); flRefresh(); flSoon(); });
    host.querySelectorAll('[data-fl-add]').forEach(x => x.onclick = () => flAddPhotos(''));
    host.querySelectorAll('[data-fl-addb]').forEach(x => x.onclick = () => flAddPhotos(x.dataset.flAddb));
    host.querySelectorAll('[data-fl-ask]').forEach(x => x.onclick = () => flAsk(x.dataset.flAsk));
    host.querySelectorAll('[data-fl-skip]').forEach(x => x.onclick = () => { const id = x.dataset.flSkip; flSave({ mediaDone: { ...(flCfg().mediaDone || {}), [id]: true } }); flSoon(); toast('Skipped', () => { const md = { ...(flCfg().mediaDone || {}) }; delete md[id]; flSave({ mediaDone: md }); flSoon(); }); });
    host.querySelectorAll('[data-fl-ph]').forEach(x => x.onclick = () => flPhotoSheet(x.dataset.flPh));
    host.querySelectorAll('[data-fl-rm]').forEach(x => x.onclick = () => flTwoTap(x, 'Remove?', () => { const m = FL.media.find(y => y.id === x.dataset.flRm); if (m) flRemovePhoto('media', m.id, m.assetId); }));
    host.querySelectorAll('[data-fl-ledit]').forEach(x => x.onclick = () => flLinkSheet(FL.media.find(y => y.id === x.dataset.flLedit) || {}));
    host.querySelector('[data-fl-addlink2]').onclick = () => flLinkSheet();
  }
  function flPhotoSheet(id) {
    const m = FL.media.find(x => x.id === id); if (!m) return;
    const on = flEpkAsset() === m.assetId, bks = flShows();
    sheet(`<h3>Photo</h3><div class="ssx-fl-prev"><img src="${esc(flSrc(m.assetId))}" alt=""></div>
      <div class="ssx-row"><button type="button" class="btn primary small" data-fl-epk ${on ? 'disabled' : ''}>${on ? 'On your EPK ✓' : 'Use on my EPK'}</button><button type="button" class="btn small" data-fl-dl>Download</button><button type="button" class="btn small danger" data-fl-del>Remove</button></div>
      <div class="f"><label for="ssx-fl-tag">From show</label><select id="ssx-fl-tag" class="srch"><option value="">Not linked to a show</option>${bks.map(b => `<option value="${esc(b.id)}" ${b.id === m.bookingId ? 'selected' : ''}>${esc(bookingName(b) + (b.date ? ' · ' + dueShort(b.date) : ''))}</option>`).join('')}</select></div>
      <div class="actions"><button class="btn" data-cancel>Done</button></div>`, root => {
      root.querySelector('[data-cancel]').onclick = close;
      root.querySelector('[data-fl-epk]').onclick = () => { flSave({ epkPhoto: m.assetId }); toast('This photo is now on your EPK'); try { if (EPK.el) epkRender(); } catch (_) {} flPhotoSheet(id); };
      root.querySelector('[data-fl-dl]').onclick = async () => { try { const r = await fetch(flSrc(m.assetId)); if (!r.ok) throw 0; const blob = await r.blob(); await window.dl((m.name || 'photo').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\- ]+/g, '').trim() + (/png/.test(blob.type) ? '.png' : '.jpg'), blob); } catch (_) { toast("Couldn't get that photo. Try again."); } };
      root.querySelector('#ssx-fl-tag').addEventListener('change', async e => { if (await window.patch('media', id, { bookingId: e.target.value })) toast(e.target.value ? 'Linked to the show' : 'Unlinked'); });
      const del = root.querySelector('[data-fl-del]'); del.onclick = () => flTwoTap(del, 'Tap again to remove', async () => { close(); await flRemovePhoto('media', id, m.assetId); });
    });
  }
  // the EPK's "Picture" row: profile photo or any photo from Media or Kit, each removable
  function flEpkPicRow() {
    let el = null; try { el = EPK.el; } catch (_) {} if (!el) return;
    const side = el.querySelector('[data-epk-pside]'), row0 = side && side.closest('.ssx-epk-row'); if (!row0) return;
    const opts = []; const av = flAvatar(); if (av) opts.push({ id: 'profile', asset: av, label: 'Profile photo' });
    const seen = new Set();
    flPhotos().forEach(p => { if (!seen.has(p.assetId)) { seen.add(p.assetId); opts.push({ id: p.assetId, asset: p.assetId, label: p.name || 'Photo', kind: 'media', doc: p.id }); } });
    flKitPhotos().forEach(p => { if (!seen.has(p.assetId)) { seen.add(p.assetId); opts.push({ id: p.assetId, asset: p.assetId, label: p.label || 'Photo', kind: 'kit', doc: p.id }); } });
    const cur = flEpkAsset() || (av ? 'profile' : ''), sig = opts.map(o => o.id).join() + '|' + cur;
    let row = el.querySelector('#ssx-fl-pic'); if (row && row.dataset.sig === sig && row.previousElementSibling === row0) return;
    if (!row) { row = document.createElement('div'); row.id = 'ssx-fl-pic'; row.className = 'ssx-epk-row'; }
    row0.after(row); row.dataset.sig = sig;
    row.innerHTML = `<span class="ssx-epk-k">Picture</span><span class="ssx-fl-picks">${opts.slice(0, 24).map((o, i) => `<span class="ssx-fl-thw"><button type="button" class="ssx-fl-pick" data-fl-pick="${esc(o.id)}" aria-pressed="${o.id === cur}" aria-label="${esc(o.label)}" title="${esc(o.label)}"><img src="${esc(flSrc(o.asset))}" alt=""></button>${o.kind ? `<button type="button" class="ssx-fl-x" data-fl-prm="${i}" aria-label="Remove ${esc(o.label)}">×</button>` : ''}</span>`).join('')}<button type="button" class="ssx-chip" data-fl-pup>+ Add photo</button></span>`;
    const pick = v => { flSave({ epkPhoto: v }); try { epkRender(); } catch (_) {} };
    row.querySelectorAll('[data-fl-pick]').forEach(b => b.onclick = () => pick(b.dataset.flPick));
    row.querySelectorAll('[data-fl-prm]').forEach(b => b.onclick = () => flTwoTap(b, 'Remove?', () => { const o = opts[+b.dataset.flPrm]; flRemovePhoto(o.kind, o.doc, o.asset); }));
    row.querySelector('[data-fl-pup]').onclick = () => flAddPhotos('', ids => pick(ids[0]));
  }

  /* -- always say why a show was held back, and send upcoming shows to Bookings in one tap */
  const flConf = () => { try { return STAGES.find(s => flKind(s) === 'confirmed') || 'confirmed'; } catch (_) { return 'confirmed'; } };
  const flVenueId = name => { const n = String(name || '').trim().toLowerCase(); if (!n) return ''; try { const c = S.contacts.find(x => x.type === 'venue' && cName(x).trim().toLowerCase() === n); return c ? c.id : ''; } catch (_) { return ''; } };
  const flSame = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const flBooked = r => flBk().some(b => b.date === r.date && flKind(b.status) !== 'lost' && [b.title, b.venueId ? contactName(b.venueId) : ''].some(x => x && [r.title, r.venue].some(y => y && flSame(x, y))));
  async function flAddUpcoming(rows) {
    const t = todayStr(), now = new Date().toISOString(), st0 = flConf(); let added = 0, had = 0;
    for (const r of rows) {
      if (flBooked(r)) { had++; continue; }
      const vid = flVenueId(r.venue);
      const data = { title: r.title || r.venue || 'Show', date: r.date, status: st0, venueId: vid, city: r.city || '', notes: r.venue && !vid ? `Venue: ${r.venue}` : '', tasks: {}, stageAt: { [st0]: t }, epkOff: !!r.epkOff, createdAt: now, updatedAt: now };
      if (await window.save('bookings', null, data)) added++;
    }
    return { added, had };
  }
  const flShowName = r => `${r.title || r.venue || 'Show'} (${nhLabel(r)})`;
  const flList = a => a.slice(0, 5).map(flShowName).join(', ') + (a.length > 5 ? ` and ${a.length - 5} more` : '');
  // a message that stays on screen until the next step, instead of a toast that disappears
  function flNotice(host, where, html, kind) {
    let box = host.querySelector('.ssx-fl-why'); if (!box) { box = document.createElement('div'); box.className = 'ssx-fl-why'; box.setAttribute('role', 'status'); where(box); }
    box.dataset.kind = kind || 'info'; box.innerHTML = html; return box;
  }
  // Check my shows: a summary of what will be added, what's held back and why
  function flWhy(root, list, D) {
    const rows = [...list.querySelectorAll('label')].map(l => { const i = l.querySelector('[data-nh-row]'), r = i && D[+i.dataset.nhRow], why = (l.querySelector('.note') || {}).textContent || ''; return { l, i, r, up: /Upcoming/.test(why), dup: /Already in your history/.test(why), done: !!l.dataset.flDone }; }).filter(x => x.r);
    const up = rows.filter(x => x.up && !x.done), dup = rows.filter(x => x.dup), ready = rows.filter(x => !x.up && !x.dup && !x.done && x.i && !x.i.disabled).length, sig = [ready, up.length, dup.length].join('|');
    let box = root.querySelector('.ssx-fl-why'); if (box && (box.dataset.sig === sig || (box.dataset.kind === 'ok' && !up.length))) return;
    if (!up.length && !dup.length) { if (box && box.dataset.kind !== 'ok') box.remove(); return; }
    const intro = root.querySelector('p.note');
    box = flNotice(root, b => (intro ? intro.after(b) : list.before(b)), `<b>${ready ? `${ready} show${ready === 1 ? '' : 's'} ready to add.` : 'Nothing new to add from this list.'}</b>
      ${dup.length ? `<p>${dup.length} ${dup.length === 1 ? 'is' : 'are'} already in your history, so ${dup.length === 1 ? "it's" : "they're"} greyed out: ${esc(flList(dup.map(x => x.r)))}.</p>` : ''}
      ${up.length ? `<p>${up.length} ${up.length === 1 ? "hasn't" : "haven't"} happened yet: ${esc(flList(up.map(x => x.r)))}. Show history is for past shows. Upcoming shows go in Bookings, where they get reminders and invoices.</p><div class="ssx-row"><button type="button" class="btn small primary" data-fl-up>Add ${up.length === 1 ? 'it' : `these ${up.length}`} to Bookings</button></div>` : ''}`, up.length ? 'warn' : 'info');
    box.dataset.sig = sig;
    const b = box.querySelector('[data-fl-up]'); if (b) b.onclick = async () => {
      b.disabled = true; b.textContent = 'Adding to Bookings…';
      const res = await flAddUpcoming(up.map(x => x.r));
      up.forEach(x => { x.l.dataset.flDone = '1'; const n = x.l.querySelector('.note'); if (n) n.textContent = n.textContent.replace(/Upcoming, add it in Bookings/, 'Added to Bookings'); });
      box.dataset.sig = ''; box.dataset.kind = 'ok';
      box.innerHTML = `<b>${res.added ? `Added ${res.added} upcoming show${res.added === 1 ? '' : 's'} to Bookings as ${esc(stName(flConf()))}.` : 'Those shows were already in Bookings.'}</b>${res.had && res.added ? `<p>${res.had} ${res.had === 1 ? 'was' : 'were'} already there, so ${res.had === 1 ? 'it was' : 'they were'} skipped.</p>` : ''}${ready ? `<p>Tap Add below to save the other ${ready} to your history.</p>` : ''}`;
    };
  }
  // adding one past show with a future date: explain it and offer Bookings, instead of a quick toast
  function flFutureGuard(e) {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const ok = t.closest('[data-nh-ok]'), sv = t.closest('#sheetRoot [data-save]'), btn = ok || sv; if (!btn) return;
    const root = btn.closest('.sheet'), d = root && root.querySelector('#nh-date'); if (!d || !d.value || d.value <= todayStr() || (sv && !root.querySelector('#nh-date[data-k]'))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const v = id => ((root.querySelector(id) || {}).value || '').trim(), r = { date: d.value, approx: false, title: v('#nh-title'), venue: v('#nh-venue'), city: v('#nh-city') };
    const place = b => { const a = btn.closest('.ssx-row') || btn.closest('.actions'); a ? a.before(b) : root.appendChild(b); };
    if (!r.title && !r.venue) { flNotice(root, place, '<b>Add a venue or event name first.</b>', 'warn'); return; }
    const box = flNotice(root, place, `<b>${esc(nhLabel(r))} hasn't happened yet.</b><p>Show history is for past shows. Upcoming shows go in Bookings, where they get reminders and invoices.</p><div class="ssx-row"><button type="button" class="btn small primary" data-fl-up1>Add it to Bookings</button></div>`, 'warn');
    box.querySelector('[data-fl-up1]').onclick = async () => {
      const res = await flAddUpcoming([r]);
      box.dataset.kind = 'ok'; box.innerHTML = `<b>${res.added ? `Added ${esc(r.title || r.venue)} to Bookings as ${esc(stName(flConf()))}.` : `${esc(r.title || r.venue)} is already in Bookings.`}</b>`;
      if (ok) ['#nh-date', '#nh-title', '#nh-venue', '#nh-city'].forEach(id => { const x = root.querySelector(id); if (x) { x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); } });
    };
  }
  // problems stay on screen long enough to read: messages about something going wrong last 7 seconds instead of 2
  function flWrapToast() {
    const o = window.toast; if (typeof o !== 'function' || o.__fl) return;
    const w = function (t) { const out = o.apply(this, arguments); try { const el = document.getElementById('toast'); if (el) { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); } if (el && /couldn't|can't|cannot|not available|isn't|aren't|failed|first|try again|too large|deleted|no shows|connect|add a|add the|pick|name the|enter|paste|type/i.test(String(t))) { clearTimeout(w.t); w.t = setTimeout(() => { el.hidden = true; }, 7000); } } catch (_) {} return out; };
    w.__fl = true; window.toast = w;
  }
  /* -- past shows: never get stuck. A problem is explained right under the show, with a button that moves you forward */
  const flNhVals = root => { const v = id => ((root.querySelector(id) || {}).value || '').trim(); return { date: v('#nh-date'), title: v('#nh-title'), venue: v('#nh-venue'), city: v('#nh-city'), approx: false }; };
  const flNhIdx = root => { const e = root.querySelector('.ssx-hentry .eyebrow'), i = FL.nhEdit; return e && /edit/i.test(e.textContent) && Number.isInteger(i) && flDraft()[i] ? i : -1; };
  const flNhSame = (a, b) => !!a && !!b && ['date', 'title', 'venue', 'city'].every(k => String(a[k] || '').trim() === String(b[k] || '').trim());
  const flNhSheet = () => [...document.querySelectorAll('#sheetRoot .sheet')].find(s => s.querySelector('.ssx-hfile')) || null;
  // a message box that stays until the next step (separate from the Check my shows summary)
  function flMsg(host, where, html, kind) {
    let box = host.querySelector('.ssx-fl-msg'); if (!box) { box = document.createElement('div'); box.className = 'ssx-fl-msg'; where(box); }
    box.dataset.kind = kind || 'warn'; box.setAttribute('role', kind === 'ok' ? 'status' : 'alert'); box.innerHTML = html;
    try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    return box;
  }
  const flNhTop = (s, html, kind) => flMsg(s, b => { const n = s.querySelector('p.note'); n ? n.after(b) : s.prepend(b); }, html, kind);
  // close the open show form (the list stays), then show a message and/or go on to Check my shows
  function flNhClose(root, go, msg) {
    const stop = root.querySelector('[data-nh-stop]');
    if (stop) stop.click(); else ['#nh-date', '#nh-title', '#nh-venue', '#nh-city'].forEach(id => { const x = root.querySelector(id); if (x) x.value = ''; });
    FL.nhEdit = -1;
    setTimeout(() => {
      const s = flNhSheet(), g = s && s.querySelector('[data-go]');
      if (go && g && !g.disabled) { g.click(); const r = [...document.querySelectorAll('#sheetRoot .sheet')].pop(); if (msg && r) flNhTop(r, msg, 'ok'); }
      else if (msg && s) flNhTop(s, msg, 'ok');
    }, 0);
  }
  async function flNhToBookings(root, r, idx, go) {
    const res = await flAddUpcoming([r]), nm = esc(r.title || r.venue);
    if (idx >= 0) flDraft().splice(idx, 1);
    flNhClose(root, go, `<b>${res.added ? `Added ${nm} to Bookings as ${esc(stName(flConf()))}.` : `${nm} is already in Bookings.`}</b>${idx >= 0 ? '<p>It was taken off this list, since show history is only for past shows.</p>' : ''}`);
  }
  function flNhGuard(e) {
    const t = e.target && e.target.closest ? e.target : null; if (!t || !t.closest('#sheetRoot')) return;
    const ed = t.closest('[data-nh-edit]'); if (ed) { FL.nhEdit = +ed.dataset.nhEdit; return; }
    if (t.closest('[data-nh-more]')) { FL.nhEdit = -1; return; }
    const root = t.closest('.sheet'); if (!root) return;
    const sv = t.closest('[data-save]'); if (sv && root.querySelector('#nh-date[data-k]')) { flNhOne(e, root, sv); return; }
    const ok = t.closest('[data-nh-ok]'), go = t.closest('[data-go]'); if (!ok && !go) return;
    const entry = root.querySelector('.ssx-hentry'); if (!entry || (go && !root.querySelector('.ssx-hfile'))) return;
    const r = flNhVals(root), idx = flNhIdx(root), D = flDraft();
    if (go && !r.date && !r.title && !r.venue) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    // opened a show from the list but didn't change it: just close it and carry on
    if (go && idx >= 0 && flNhSame(r, D[idx])) { stop(); flNhClose(root, true); return; }
    const future = !!r.date && r.date > todayStr(), named = !!(r.title || r.venue);
    if (r.date && named && !future) {
      if (go) { stop(); const o = root.querySelector('[data-nh-ok]'); if (o) o.click(); setTimeout(() => { const s = flNhSheet(), g = s && s.querySelector('[data-go]'); if (g && !g.disabled) g.click(); }, 0); }
      return;
    }
    stop();
    const where = b => { const a = (ok && ok.closest('.ssx-row')) || entry.querySelector('[data-nh-ok]')?.closest('.ssx-row'); a ? a.before(b) : entry.appendChild(b); };
    const later = go ? `<button type="button" class="btn small" data-fl-skip>${idx >= 0 ? 'Keep it as it was and continue' : 'Leave it out and continue'}</button>` : idx >= 0 ? '<button type="button" class="btn small" data-fl-drop>Take it off this list</button>' : '';
    let html;
    if (!r.date) html = '<b>Pick the date of this show.</b>';
    else if (!named) html = '<b>Add a venue or event name.</b><p>Each show needs at least one of them.</p>';
    else html = `<b>${esc(r.title || r.venue)} (${esc(nhLabel(r))}) hasn't happened yet.</b><p>Show history is only for past shows. Upcoming shows go in Bookings, where they get reminders and invoices. If the date is a typo, fix it above.</p>`;
    html += `<div class="ssx-row">${future && named ? '<button type="button" class="btn small primary" data-fl-bk>Add it to Bookings</button>' : ''}${later}</div>`;
    const box = flMsg(entry, where, html, 'warn');
    const f = root.querySelector(!r.date ? '#nh-date' : !named ? '#nh-venue' : '#nh-date'); if (f && !future) f.focus();
    const bk = box.querySelector('[data-fl-bk]'); if (bk) bk.onclick = () => { bk.disabled = true; bk.textContent = 'Adding…'; flNhToBookings(root, r, idx, !!go); };
    const sk = box.querySelector('[data-fl-skip]'); if (sk) sk.onclick = () => flNhClose(root, true);
    const dr = box.querySelector('[data-fl-drop]'); if (dr) dr.onclick = () => { const x = flDraft()[idx]; flDraft().splice(idx, 1); flNhClose(root, false, `<b>Took ${esc((x && (x.title || x.venue)) || 'that show')} off the list.</b>`); };
  }
  // the single "Add a past show" / "Edit past show" form
  function flNhOne(e, root, sv) {
    const r = flNhVals(root), named = !!(r.title || r.venue), future = !!r.date && r.date > todayStr();
    if (r.date && named && !future) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const where = b => { const a = sv.closest('.actions'); a ? a.before(b) : root.appendChild(b); };
    if (!r.date) { flMsg(root, where, '<b>Pick the date of this show.</b>', 'warn'); return; }
    if (!named) { flMsg(root, where, '<b>Add a venue or event name.</b><p>Each show needs at least one of them.</p>', 'warn'); return; }
    const h = root.querySelector('h3'), id = h && /edit/i.test(h.textContent) && FL.nhOpen && FL.nhOpen.kind === 'past' ? FL.nhOpen.id : '';
    const box = flMsg(root, where, `<b>${esc(r.title || r.venue)} (${esc(nhLabel(r))}) hasn't happened yet.</b><p>Show history is only for past shows. Upcoming shows go in Bookings, where they get reminders and invoices. If the date is a typo, fix it above.</p><div class="ssx-row"><button type="button" class="btn small primary" data-fl-bk>${id ? 'Move it to Bookings' : 'Add it to Bookings'}</button></div>`, 'warn');
    const bk = box.querySelector('[data-fl-bk]'); bk.onclick = async () => {
      bk.disabled = true; bk.textContent = 'Adding…';
      const res = await flAddUpcoming([r]);
      if (id) { try { await st.db.collection('pastShows').doc(id).delete(); } catch (_) {} }
      close(); toast(res.added ? `${id ? 'Moved' : 'Added'} ${r.title || r.venue} to Bookings` : `${r.title || r.venue} is already in Bookings`);
    };
  }

  /* -- EPK color themes: each one recolors the whole page (background, text, lines, accents), not just the headings */
  // key, name, dark [background, glow, text, accent], light [background, glow, text, accent], metallic button/foil
  function flThemeList() { return [
    ['champagne', 'Champagne', ['#0E100C', '#26301E', '#EFE7D3', '#D4B26E'], ['#F6F1E6', '#EADFC8', '#1C2117', '#8A6A35'], ['#8A6A35', '#F2DDA4', '#C9A55C', '#F7E7BC'], 1],
    ['fl-onyx', 'Onyx & Silver', ['#0A0A0C', '#2E3036', '#EEEFF2', '#C9CED6'], ['#ECECEA', '#D3D4D0', '#141417', '#4F555E'], ['#9DA2AA', '#F4F5F7', '#B9BEC6', '#FFFFFF']],
    ['fl-emerald', 'Emerald', ['#06392C', '#13694F', '#ECF3EC', '#DDBB6A'], ['#DCEDE2', '#B9DCC6', '#0B2A21', '#0E6B4F'], ['#A8843F', '#F2DDA4', '#C9A55C', '#F7E7BC']],
    ['fl-sapphire', 'Sapphire', ['#0B1C52', '#2649A3', '#E9EEF9', '#AFC6F5'], ['#DAE4F7', '#B6CAEF', '#0B193D', '#2446A0'], ['#8FA4D4', '#E3ECFF', '#A9BCE4', '#F4F7FF']],
    ['fl-bordeaux', 'Bordeaux', ['#3D0A1A', '#7C1E38', '#F6E7E4', '#E8AE9E'], ['#F3DCDC', '#E5B7B9', '#3A0C17', '#8C1C34'], ['#C98A7B', '#F6CDBF', '#D9A092', '#FBE3DA']],
    ['fl-amethyst', 'Amethyst', ['#2A0F4A', '#5C2D8C', '#F2EAF9', '#D9B8F2'], ['#E8DCF5', '#D0B8EA', '#261238', '#6B3A9A'], ['#B48FD6', '#F1DDFB', '#C9A4E6', '#FBEFFF']],
    ['fl-scarlet', 'Scarlet Noir', ['#120405', '#7A1019', '#F8EEEB', '#F0505A'], ['#F8E2E0', '#EDBBB8', '#1A0405', '#B3141F'], ['#E06A72', '#F9BDC0', '#E8858C', '#FCDDDF']],
    ['fl-peacock', 'Peacock', ['#043A40', '#0B7076', '#E7F5F3', '#5AD6C9'], ['#D7EEEB', '#B2DDD7', '#06282B', '#0D7470'], ['#6CC1BA', '#CFF5EF', '#8ED3CC', '#E8FBF8']],
    ['fl-copper', 'Copper', ['#34190B', '#76391A', '#F7EADF', '#E8A26B'], ['#F3DFCC', '#E5C09D', '#2E160A', '#9A4E1F'], ['#C98450', '#F7C9A0', '#D9996A', '#FCE2C8']],
    ['fl-rose', 'Rose', ['#4A1D29', '#8C4255', '#FCEEEF', '#F4B8C3'], ['#F7DBDF', '#ECB9C3', '#3B1A20', '#B4566A'], ['#D08F99', '#FBD9DE', '#E0A8B1', '#FFF0F2']],
    ['fl-espresso', 'Espresso & Cream', ['#2A1A0F', '#5C3D24', '#F4EADD', '#DDB98E'], ['#EBDBC6', '#D8BE9E', '#24170E', '#7A5232'], ['#B38B62', '#F3DEC2', '#C9A27A', '#FBEEDC']],
  ]; }
  // the older app colors map to their closest theme, so a saved EPK still looks right
  function flThemeKey(k) { const old = { sage: 'fl-emerald', lavender: 'fl-amethyst', sky: 'fl-sapphire', blush: 'fl-rose', apricot: 'fl-copper', pride: 'fl-scarlet', trans: 'fl-rose', gay: 'fl-peacock', lesbian: 'fl-copper', bi: 'fl-amethyst' }; return old[k] || k || 'champagne'; }
  function flRgba(h, a) { return `rgba(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')},${a})`; }
  function flMix(a, b, t) { return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join(''); }
  function flTheme(key, mode) {
    const th = flThemeList().find(x => x[0] === flThemeKey(key)); if (!th || th[5]) return null; // Champagne keeps the original look
    const dark = mode !== 'light', [bg, glow, ink, solid] = dark ? th[2] : th[3], m = th[4];
    return { bg, glow, ink, solid, muted: dark ? flRgba(ink, .7) : flMix(ink, bg, .36), line: dark ? flRgba(ink, .16) : flMix(ink, bg, .8), panel: dark ? flRgba(ink, .05) : 'rgba(255,255,255,.55)', metal: `linear-gradient(115deg,${m[0]} 0%,${m[1]} 40%,${m[2]} 60%,${m[3]} 100%)`, glow2: flMix(solid, bg, dark ? .84 : .82) };
  }
  function flEpkColors() {
    const opts = EPK.el && EPK.el.querySelector('.ssx-epk-opts'); if (!opts || !EPK.cfg) return;
    const row = [...opts.querySelectorAll('.ssx-epk-row')].find(r => r.querySelector('[data-epk-pal], [data-fl-pal]')); if (!row) return;
    const cur = flThemeKey(EPK.cfg.palette), dark = EPK.cfg.mode !== 'light', sig = cur + '|' + dark; if (row.dataset.fl === sig) return;
    row.dataset.fl = sig; row.classList.add('ssx-fl-themes');
    const sw = t => { const [bg, , , solid] = dark ? t[2] : t[3]; return `linear-gradient(90deg,${bg} 0 46%,${solid} 46% 76%,${t[4][1]} 76%)`; };
    row.innerHTML = '<span class="ssx-epk-k">Colors</span>' + flThemeList().map(t => `<button type="button" class="ssx-chip" data-fl-pal="${t[0]}" aria-pressed="${cur === t[0]}"><span class="ssx-epk-sw" style="background:${sw(t)}"></span>${esc(t[1])}</button>`).join('');
    row.querySelectorAll('[data-fl-pal]').forEach(b => b.onclick = () => { EPK.cfg.palette = b.dataset.flPal; try { if (st.db) st.db.doc('settings/epk').set(EPK.cfg).catch(() => {}); } catch (_) {} epkRender(); });
  }

  /* -- EPK layout: blocks always close up the space. Side-by-side blocks stack into the shorter column,
        a block on its own takes the full width, and leftover room is shared out evenly instead of leaving holes */
  const FL_HALF = { upcoming: 1, played: 1, music: 1, links: 1, press: 1, rider: 1, hosp: 1 };
  function flEpkPack() {
    const wrap = EPK.el && EPK.el.querySelector('.ssx-epk-pages'); if (!wrap || !EPK.cfg) return;
    const pages = [...wrap.querySelectorAll('.epk-page')]; if (!pages.length) return;
    const zoom = wrap.style.zoom; wrap.style.zoom = '1';
    const recent = (EPK.cfg.showsView || 'recent') === 'recent', name = ((wrap.querySelector('h1.epk-name') || {}).textContent || '').trim();
    const blocks = pages.flatMap(p => [...p.querySelectorAll('.epk-body .epk-blk')]);
    blocks.forEach(b => { b.remove(); b.classList.remove('half', 'full'); b.classList.add(FL_HALF[b.dataset.blk] && (b.dataset.blk !== 'played' || recent) ? 'half' : 'full'); });
    const tpl = pages[1] || null; pages.slice(1).forEach(p => p.remove());
    const first = pages[0]; first.querySelector('.epk-body').innerHTML = '';
    const mk = () => {
      const p = (tpl || first).cloneNode(true);
      if (!tpl) { const h = document.createElement('header'); h.className = 'epk-top'; h.innerHTML = `<span class="epk-label" style="color:${first.style.color};margin:0">${esc(name)}</span><span class="epk-label epk-pn" style="color:${first.style.color};opacity:.7;margin:0"></span>`; p.prepend(h); }
      p.querySelector('.epk-body').innerHTML = ''; wrap.appendChild(p); return p;
    };
    let page = first, body = first.querySelector('.epk-body'), duo = null;
    const over = () => body.scrollHeight > body.clientHeight + 2;
    const newDuo = () => { duo = document.createElement('div'); duo.className = 'ssx-fl-duo'; duo.innerHTML = '<div class="ssx-fl-col"></div><div class="ssx-fl-col"></div>'; body.appendChild(duo); };
    const newPage = () => { page = mk(); body = page.querySelector('.epk-body'); duo = null; };
    for (const b of blocks) {
      if (b.classList.contains('half')) {
        if (!duo) newDuo();
        const [a, c] = duo.children; (c.offsetHeight < a.offsetHeight ? c : a).appendChild(b);
        if (over() && body.querySelectorAll('.epk-blk').length > 1) { b.remove(); if (!duo.querySelector('.epk-blk')) duo.remove(); newPage(); newDuo(); duo.children[0].appendChild(b); }
      } else {
        duo = null; body.appendChild(b);
        if (over() && body.children.length > 1) { b.remove(); newPage(); body.appendChild(b); }
      }
    }
    // a side-by-side block with no partner takes the full width
    wrap.querySelectorAll('.ssx-fl-duo').forEach(d => { const bs = d.querySelectorAll('.epk-blk'); if (bs.length === 1) { bs[0].classList.replace('half', 'full'); d.replaceWith(bs[0]); } });
    const all = [...wrap.querySelectorAll('.epk-page')], pad = n => String(n).padStart(2, '0');
    let th = null; try { th = epkTheme(EPK.cfg.palette, EPK.cfg.mode); } catch (_) {}
    all.forEach((p, i) => {
      const bd = p.querySelector('.epk-body'), kids = [...bd.children];
      p.classList.remove('epk-fill'); p.classList.toggle('epk-solo', kids.length === 1 && kids[0].dataset.blk === 'booking'); bd.style.rowGap = '';
      if (i < all.length - 1 && kids.length > 1) { const free = bd.getBoundingClientRect().bottom - kids[kids.length - 1].getBoundingClientRect().bottom; if (free > 8) bd.style.rowGap = Math.round(Math.min(34 + free / (kids.length - 1), 72)) + 'px'; }
      const pn = p.querySelector('.epk-pn'); if (pn) pn.textContent = `${pad(i + 1)} / ${pad(all.length)}`;
      if (th && th.glow2) p.style.background = `radial-gradient(700px 520px at 78% 0%, ${th.glow} 0%, transparent 62%), radial-gradient(680px 560px at 0% 100%, ${th.glow2} 0%, transparent 66%), ${th.bg}`;
    });
    wrap.style.zoom = zoom;
  }
  // Highlights: count every show played, or only the shows on the EPK
  function flEpkStatsOpt() {
    const opts = EPK.el && EPK.el.querySelector('.ssx-epk-opts'), v = opts && opts.querySelector('[data-nh-view]'); if (!v || opts.querySelector('#ssx-fl-stats')) return;
    const on = EPK.cfg.statsAll !== false, row = document.createElement('div'); row.className = 'ssx-epk-row'; row.id = 'ssx-fl-stats';
    row.innerHTML = `<span class="ssx-epk-k">Highlights count</span><button type="button" class="ssx-chip" data-fl-sa="1" aria-pressed="${on}">Every show I've played</button><button type="button" class="ssx-chip" data-fl-sa="0" aria-pressed="${!on}">Only shows on my EPK</button>`;
    v.closest('.ssx-epk-row').after(row);
    row.querySelectorAll('[data-fl-sa]').forEach(b => b.onclick = () => { EPK.cfg.statsAll = b.dataset.flSa === '1'; try { if (st.db) st.db.doc('settings/epk').set(EPK.cfg).catch(() => {}); } catch (_) {} epkRender(); });
  }
  // run the layout and the color picker every time the EPK draws itself
  function flEpkHook() {
    if (typeof epkRender !== 'function' || epkRender.__fl) return;
    const o = epkRender;
    epkRender = function () { const out = o.apply(this, arguments); try { flEpkPack(); flEpkColors(); flEpkStatsOpt(); } catch (e) { console.error(e); } return out; };
    epkRender.__fl = true;
    try { if (EPK.el) epkRender(); } catch (_) {}
  }

  /* -- Media is an organizing hub: folders, links and photos from each show, easy to open and share. No new uploads */
  async function flShare(url, title) {
    try { if (navigator.share) { await navigator.share({ title: title || 'Media', url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied. Paste it anywhere to share.'); } catch (_) { toast("Couldn't copy the link. Press and hold it to copy instead."); }
  }
  const flHubWait = () => flWaiting().filter(b => !FL.media.some(m => m.bookingId === b.id));
  const flHubRow = l => `<div class="ssx-fl-lrow"><span class="ssx-fl-lk">${esc(l.kind)}</span><span class="ssx-fl-lt"><b>${esc(l.label)}</b>${l.label === flHost(l.url) ? '' : `<span class="note">${esc(flHost(l.url))}</span>`}</span><span class="ssx-fl-lact"><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Open</a><button type="button" class="btn small" data-fl-share="${esc(l.url)}" data-fl-st="${esc(l.label)}">Share</button>${l.auto ? '' : `<button type="button" class="btn small" data-fl-ledit="${esc(l.id)}">Edit</button>`}</span></div>`;
  function flMediaHub() {
    const sec = document.querySelector('section[data-view="media"]'), host = document.getElementById('ssx-fl-mhost'); if (!sec || !host || !st.db) return;
    const hd = sec.querySelector('.head'); if (hd && !hd.dataset.flHub) {
      hd.dataset.flHub = '1'; const n = hd.querySelector('p.note'); if (n) n.textContent = 'Every photo folder, video and link from your shows in one place. Open it, share it, or add it to your Kit.';
      const up = hd.querySelector('[data-fl-add]'); if (up) up.remove(); const al = hd.querySelector('[data-fl-addlink]'); if (al) al.classList.add('primary');
    }
    const links = flMediaLinks(), old = flPhotos(), wait = flHubWait();
    const sig = JSON.stringify([links.map(l => l.id + l.label + l.url + (l.b ? l.b.id : '')), old.map(m => m.id + m.bookingId), wait.map(b => b.id), flEpkAsset()]);
    if (host.dataset.sig === sig) return; host.dataset.sig = sig;
    // group everything by show, newest first; links with no show go last
    const G = new Map(), grp = b => { const k = b ? b.id : ''; if (!G.has(k)) G.set(k, { b, links: [], photos: [] }); return G.get(k); };
    links.forEach(l => grp(l.b || null).links.push(l));
    old.forEach(m => grp(m.bookingId && flBk().find(x => x.id === m.bookingId) || null).photos.push(m));
    const groups = [...G.values()].sort((a, b) => !a.b ? 1 : !b.b ? -1 : String(b.b.date || '').localeCompare(String(a.b.date || '')));
    const folders = links.filter(l => l.kind === 'Folder').length;
    host.innerHTML = `
      ${wait.length ? `<div class="card ssx" id="ssx-fl-wait"><div class="ssx-head"><div><h3>Waiting on photos</h3><p class="note">Recent shows with a photographer or a photo folder, but no media saved yet. Ask for the files, then add the link here.</p></div></div>
        <div class="ssx-fl-wait">${wait.map(b => { const m = contact(b.mediaId), f = flFolder(b); return `<div class="ssx-fl-wrow"><span><b>${esc(bookingName(b))}</b><span class="note">${esc(fmtD(b.date))}${m ? ' · ' + esc(cName(m)) : ''}</span></span><span class="ssx-fl-wact">${f ? `<a class="btn small" href="${esc(f)}" target="_blank" rel="noopener">Open folder</a>` : ''}${m && m.email ? `<button type="button" class="btn small" data-fl-ask="${esc(b.id)}">Ask for files</button>` : ''}<button type="button" class="btn small primary" data-fl-addl="${esc(b.id)}">Add the link</button><button type="button" class="btn small" data-fl-skip="${esc(b.id)}" aria-label="No photos coming for ${esc(bookingName(b))}">Skip</button></span></div>`; }).join('')}</div></div>` : ''}
      <div class="card ssx" id="ssx-fl-hub"><div class="ssx-head"><div><h3>Your media</h3><p class="note">${links.length ? `${links.length} link${links.length === 1 ? '' : 's'}${folders ? `, ${folders} folder${folders === 1 ? '' : 's'}` : ''}, sorted by show. Share sends the link straight to a text, email or DM.` : 'Paste a link to a photo folder, video, mix or post and pick the show it came from. It lands here, sorted by show, ready to open and share.'}</p></div></div>
        ${groups.length ? groups.map(g => `<div class="ssx-fl-gl">${esc(g.b ? `${bookingName(g.b)}${g.b.date ? ' · ' + dueShort(g.b.date) : ''}` : 'Not linked to a show')}${g.b ? `<button type="button" class="linkbtn" data-fl-addl="${esc(g.b.id)}">+ Add link</button>` : ''}</div>
          ${g.links.length ? `<div class="ssx-fl-llist">${g.links.map(flHubRow).join('')}</div>` : ''}
          ${g.photos.length ? `<div class="ssx-fl-grid">${g.photos.map(m => flThumb(m, true)).join('')}</div>` : ''}`).join('') : '<div class="empty">No media yet.</div>'}
        <div class="ssx-row"><button type="button" class="btn small primary" data-fl-addl="">+ Add link</button></div></div>`;
    host.querySelectorAll('[data-fl-addl]').forEach(x => x.onclick = () => flLinkSheet({ bookingId: x.dataset.flAddl }));
    host.querySelectorAll('[data-fl-share]').forEach(x => x.onclick = () => flShare(x.dataset.flShare, x.dataset.flSt));
    host.querySelectorAll('[data-fl-ledit]').forEach(x => x.onclick = () => flLinkSheet(FL.media.find(y => y.id === x.dataset.flLedit) || {}));
    host.querySelectorAll('[data-fl-ask]').forEach(x => x.onclick = () => flAsk(x.dataset.flAsk));
    host.querySelectorAll('[data-fl-skip]').forEach(x => x.onclick = () => { const id = x.dataset.flSkip; flSave({ mediaDone: { ...(flCfg().mediaDone || {}), [id]: true } }); flSoon(); toast('Skipped', () => { const md = { ...(flCfg().mediaDone || {}) }; delete md[id]; flSave({ mediaDone: md }); flSoon(); }); });
    host.querySelectorAll('[data-fl-ph]').forEach(x => x.onclick = () => flPhotoSheet(x.dataset.flPh));
    host.querySelectorAll('[data-fl-rm]').forEach(x => x.onclick = () => flTwoTap(x, 'Remove?', () => { const m = FL.media.find(y => y.id === x.dataset.flRm); if (m) flRemovePhoto('media', m.id, m.assetId); }));
  }
  // no photo uploads anywhere: a booking shows its media links instead, and the EPK picks from photos you already have
  function flNoUploads() {
    document.querySelectorAll('#sheetRoot .ssx-fl-phrow:not([data-fl-hub])').forEach(dd => {
      const sh = dd.closest('[data-booking]'), id = sh && sh.dataset.booking; if (!id) return;
      dd.dataset.flHub = '1'; const dt = dd.previousElementSibling; if (dt && dt.tagName === 'DT') dt.textContent = 'Media';
      const n = FL.media.filter(m => m.bookingId === id).length;
      const bb = flBk().find(x => x.id === id), folder = bb ? flFolder(bb) : '', picked = !!folder || FL.media.some(m => m.bookingId === id && /drive\.google\.com\/drive\/(u\/\d+\/)?folders|dropbox\.com\/(sh|scl\/fo)\//i.test(String(m.url || '')));
      dd.innerHTML = `${n ? `<button type="button" class="linkbtn" data-fl-goto>${n} in Media</button> ` : ''}${folder ? `<a class="btn small" href="${esc(folder)}" target="_blank" rel="noopener">Open folder</a> ` : ''}<button type="button" class="btn small" data-fl-addl>Add a link</button>${picked ? '' : ' <button type="button" class="btn small" data-fl-mkfold>Create folder</button>'}`;
      dd.querySelector('[data-fl-addl]').onclick = () => flLinkSheet({ bookingId: id });
      // no folder yet: make the show's Google Drive folder (with its Media and Flyers folders) right here
      const mk = dd.querySelector('[data-fl-mkfold]'); if (mk) mk.onclick = async () => {
        const b2 = flBk().find(x => x.id === id); if (!b2) return;
        if (!(b2.title || b2.venueId)) { toast('Add a show name or venue first'); return; }
        mk.disabled = true; mk.textContent = 'Creating…';
        try { const r = await makeEventFolder(b2, 'mkt'); if (r) { toast(`Media folder ready: ${ROOTS.mkt.name} / ${r.year} / ${eventLabel(b2)}`); bookingView(id); return; } } catch (e) { console.error(e); }
        if (mk.isConnected) { mk.disabled = false; mk.textContent = 'Create folder'; }
      };
      const g = dd.querySelector('[data-fl-goto]'); if (g) g.onclick = () => { close(); goTab('media'); };
    });
    let el = null; try { el = EPK.el; } catch (_) {}
    const pic = el && el.querySelector('#ssx-fl-pic'); if (pic) {
      const up = pic.querySelector('[data-fl-pup]'); if (up) up.remove();
      if (!pic.querySelector('[data-fl-pick]') && !pic.querySelector('.ssx-fl-nopic')) { const s = document.createElement('span'); s.className = 'note ssx-fl-nopic'; s.textContent = 'Add a photo to your Kit files and it shows up here.'; (pic.querySelector('.ssx-fl-picks') || pic).appendChild(s); }
    }
  }  
  /* -- email templates: a "Start from a template" pick list in every new email, and the booking link as a fill-in */
  window.ssBookingLink = () => { try { const l = st.link || {}; return l.on && l.slug ? `${location.origin}/?book=${encodeURIComponent(l.slug)}` : ''; } catch (_) { return ''; } };
  const FL_BK_TOKENS = /\{\{\s*(venue|promoter|media_name|show|date|set_time|city|address|fee|ticket_link|media_folder)\s*\}\}/;
  function flTplOptions(bid) {
    const list = (S.templates || []).filter(t => t && t.id); if (!list.length) return '';
    const b = bid && S.bookings.find(x => x.id === bid);
    let groups = [];
    try { const d = SS.templates.templateDropdown(list, b || {}); groups = [...d.groups, ...(d.any ? [d.any] : [])]; } catch (_) { groups = [{ label: 'Your templates', options: list.map(t => ({ value: t.id, label: t.name || 'Untitled' })) }]; }
    return `<option value="">Blank email</option>${groups.map(g => `<optgroup label="${esc(g.label)}">${g.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</optgroup>`).join('')}`;
  }
  function flComposeTpl() {
    const root = document.querySelector('#composeRoot .sheet'); if (!root || root.querySelector('#ssx-fl-tpl')) return;
    const subj = root.querySelector('#cm-subj'), body = root.querySelector('#cm-body'), bk = root.querySelector('#cm-b'), to = root.querySelector('#cm-to'); if (!subj || !body) return;
    const box = document.createElement('div'); box.className = 'f'; box.id = 'ssx-fl-tplbox';
    const has = (S.templates || []).some(t => t && t.id);
    box.innerHTML = has ? `<label for="ssx-fl-tpl">Start from a template</label><select id="ssx-fl-tpl" class="srch">${flTplOptions(bk && bk.value)}</select><span class="note" id="ssx-fl-tplnote">Pick one and it fills in the subject and message. ★ marks the best fit for the booking you pick.</span>`
      : '<label>Start from a template</label><span class="note" id="ssx-fl-tpl">No templates yet. Write this email, then tap Save as template to reuse it.</span>';
    const first = root.querySelector('.frow'); first ? first.before(box) : (root.querySelector('.head') || root.firstChild).after(box);
    const sel = box.querySelector('select'); if (!sel) return;
    const note = box.querySelector('#ssx-fl-tplnote'); let loaded = null;
    const tell = () => {
      const t = loaded, txt = subj.value + '\n' + body.value, msgs = [];
      if (t && FL_BK_TOKENS.test(txt) && !(bk && bk.value)) msgs.push('Pick the booking under "About a booking" so the show details fill in.');
      if (/\{\{\s*booking_link\s*\}\}/.test(txt) && !window.ssBookingLink()) msgs.push('Your booking link is turned off, so it will be left blank. Turn it on in Kit.');
      note.textContent = msgs.length ? msgs.join(' ') : t ? `Using "${t.name || 'template'}". Fill-ins are swapped for the real details when you send.` : 'Pick one and it fills in the subject and message. ★ marks the best fit for the booking you pick.';
      note.classList.toggle('ssx-fl-warnnote', msgs.length > 0);
    };
    const put = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    sel.onchange = () => {
      const t = (S.templates || []).find(x => x.id === sel.value), before = { s: subj.value, b: body.value };
      const typed = (before.s.trim() || before.b.trim()) && !(loaded && before.s === (loaded.subject || '') && before.b === (loaded.body || ''));
      if (!t) { if (loaded && !typed) { put(subj, ''); put(body, ''); } loaded = null; tell(); return; }
      put(subj, t.subject || ''); put(body, t.body || ''); loaded = t;
      try { if (to && !to.value && bk && bk.value) { const b = S.bookings.find(x => x.id === bk.value), r = b && defRecipient(t, b); if (r) { to.value = r; to.dispatchEvent(new Event('change', { bubbles: true })); } } } catch (_) {}
      tell();
      if (typed) toast(`Replaced your draft with "${t.name || 'the template'}"`, () => { put(subj, before.s); put(body, before.b); loaded = null; sel.value = ''; tell(); });
    };
    if (bk) bk.addEventListener('change', () => {
      const v = sel.value; sel.innerHTML = flTplOptions(bk.value); sel.value = v;
      try { if (loaded && to && !to.value) { const b = S.bookings.find(x => x.id === bk.value), r = b && defRecipient(loaded, b); if (r) { to.value = r; to.dispatchEvent(new Event('change', { bubbles: true })); } } } catch (_) {}
      tell();
    });
    [subj, body].forEach(el => el.addEventListener('input', tell));
  }
    /* -- a booking's extra money: add income or an expense right under the fee; it all lands in Financials */
  const flMoneyOf = id => ({ inc: (S.income || []).filter(i => i.bookingId === id), exp: (S.expenses || []).filter(e => e.bookingId === id) });
  function flAddIncome(b, i) {
    const t = todayStr();
    incomeForm(i || { bookingId: b.id, date: b.date && b.date <= t ? b.date : t, sourceId: b.promoterId || b.venueId || '', notes: `For ${bookingName(b)}${b.date ? ' (' + fmtD(b.date) + ')' : ''}` });
    const r = document.querySelector('#sheetRoot .sheet'), n = r && r.querySelector('h3 + p.note');
    if (n) n.textContent = `Extra money from ${bookingName(b)}: merch, tips, a bonus or a door split. It's added to Financials with this show.`;
  }
  function flAddExpense(b, e) { const t = todayStr(); expenseForm(e || { bookingId: b.id, date: b.date && b.date <= t ? b.date : t }); }
  function flMoneyRow(root) {
    const id = root.dataset && root.dataset.booking, b = id && flBk().find(x => x.id === id), dl = root.querySelector('dl.kv'); if (!b || !dl || dl.querySelector('.ssx-fl-money')) return;
    const feeDt = [...dl.querySelectorAll('dt')].find(d => d.textContent.trim() === 'Fee'), feeDd = feeDt && feeDt.nextElementSibling; if (!feeDd) return;
    const { inc, exp } = flMoneyOf(id), fee = +b.fee || 0, ti = inc.reduce((s, i) => s + (+i.amount || 0), 0), te = exp.reduce((s, e) => s + (+e.amount || 0), 0);
    const lines = (b.invoice && b.invoice.lines) || [], onInv = new Set(lines.map(l => l.incomeId || l.expId).filter(Boolean));
    const pen = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const items = [...inc.map(i => ({ k: 'i', id: i.id, amt: +i.amount || 0, label: i.desc || incCatLabel(i) })), ...exp.map(e => ({ k: 'e', id: e.id, amt: +e.amount || 0, label: e.desc || expCatLabel(e) }))];
    // the show's money in one clear box: fee, each extra income or cost (tap to edit), and the total
    const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = 'Money'; dd.className = 'ssx-fl-money';
    dd.innerHTML = `<div class="ssx-mn">
      <div class="ssx-mn-row"><span>Fee</span><span class="num">${money(fee)}</span><button type="button" class="btn small ghost" data-mn-fee aria-label="Edit the fee">${pen} Edit</button></div>
      ${items.map(x => `<div class="ssx-mn-row"><span>${esc(x.label)}${x.k === 'i' && b.invoice && b.invoice.number ? `<span class="ssx-mn-tag">${onInv.has(x.id) ? 'On the invoice' : 'Not on the invoice'}</span>` : ''}</span><span class="num ${x.k === 'e' ? 'out' : 'in'}">${x.k === 'e' ? '−' : '+'}${money(x.amt)}</span><button type="button" class="btn small ghost" data-fl-m="${x.k}:${esc(x.id)}" aria-label="Edit ${esc(x.label)}">${pen} Edit</button></div>`).join('')}
      ${items.length ? `<div class="ssx-mn-row ssx-mn-tot"><span>Show total</span><span class="num">${money(fee + ti - te)}</span><span></span></div>` : ''}
      <div class="ssx-mn-act"><button type="button" class="btn small" data-fl-addinc>＋ Add income</button><button type="button" class="btn small" data-fl-addexp>＋ Add expense</button>${inc.some(i => !onInv.has(i.id)) ? '<button type="button" class="btn small" data-mn-inv>Put extra income on the invoice</button>' : ''}${items.length ? '<button type="button" class="linkbtn" data-fl-fin>See in Financials</button>' : ''}</div></div>`;
    feeDd.after(dt, dd);
    // the old Fee line is shown inside the box now
    feeDt.hidden = true; feeDd.hidden = true;
    dd.querySelector('[data-fl-addinc]').onclick = () => flAddIncome(b);
    dd.querySelector('[data-fl-addexp]').onclick = () => flAddExpense(b);
    dd.querySelector('[data-mn-fee]').onclick = () => { const row = dd.querySelector('[data-mn-fee]').closest('.ssx-mn-row'); row.innerHTML = `<span>Fee</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${fee || ''}" aria-label="Fee in dollars" class="ssx-mn-in"><button type="button" class="btn small primary" data-mn-save>Save</button>`;
      const inp = row.querySelector('input'); inp.focus(); inp.select();
      const go = async () => { const v = Math.max(0, Math.round((Number(inp.value) || 0) * 100) / 100); if (v === fee) { bookingView(id); return; } if (await window.patch('bookings', id, { fee: v, updatedAt: new Date().toISOString() })) { toast(`Fee is now ${money(v)}`, async () => { await window.patch('bookings', id, { fee }); }); bookingView(id); } };
      row.querySelector('[data-mn-save]').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; };
    const toInv = dd.querySelector('[data-mn-inv]'); if (toInv) toInv.onclick = () => { invoiceSheet(id); let n = 0; const t = () => { const c = document.querySelector('#sheetRoot [data-addl="income"]'); if (c) c.click(); else if (n++ < 20) setTimeout(t, 150); }; setTimeout(t, 200); };
    const fin = dd.querySelector('[data-fl-fin]'); if (fin) fin.onclick = () => { closeAll(); goTab('money'); };
    dd.querySelectorAll('[data-fl-m]').forEach(x => x.onclick = () => { const [k, mid] = x.dataset.flM.split(':'); if (k === 'i') { const i = inc.find(y => y.id === mid); if (i) flAddIncome(b, i); } else { const e = exp.find(y => y.id === mid); if (e) flAddExpense(b, e); } });
  }
    /* -- no browser or password-manager suggestions popping up over the app's text boxes (sign-in screen excluded) */
   function flNoAutofill() {
    const blink = /Chrome\//.test(navigator.userAgent);
    document.querySelectorAll('input:not([data-fl-ac2]), textarea:not([data-fl-ac2])').forEach(el => {
      el.dataset.flAc2 = '1'; if (el.closest('#ss-auth') || /^(password|checkbox|radio|file|hidden|range|color|submit|button)$/i.test(el.type || '')) return;
      // Chrome skips any autocomplete word it doesn't know (it sometimes ignores "off"); Safari and Firefox go by "off"
      el.setAttribute('autocomplete', blink ? 'ssx-no-history' : 'off');
      el.setAttribute('aria-autocomplete', 'none'); el.setAttribute('data-lpignore', 'true'); el.setAttribute('data-1p-ignore', ''); el.setAttribute('data-form-type', 'other');
      // a fresh name with "search" in it: browsers keep typing history by field name, and Safari skips its AutoFill for search-style names
      el.setAttribute('name', 'ssx-search-' + Math.random().toString(36).slice(2, 9));
    });
  }
  /* -- public booking page: "Who are you?" first, then only the questions that fit, so the request fills in the booking for the performer */
  const FL_BK_KINDS = [
    ['booker', 'I book talent for a venue'], ['venue', 'I run or own a venue'], ['collective', 'I lead a collective or crew'],
    ['promoter', "I'm an independent promoter"], ['private', "I'm planning a private event"], ['other', 'Something else']];
  // what the booking server understands: venue, promoter, coordinator, other
  const FL_BK_ROLE = { booker: 'promoter', venue: 'venue', collective: 'promoter', promoter: 'promoter', private: 'coordinator', other: 'other' };
  function flBookPage() {
    const main = document.getElementById('ss-book'), form = main && main.querySelector('#bk-form'); if (!form || form.dataset.fl) return;
    form.dataset.fl = '1';
    const $ = s => form.querySelector(s), lab = id => { const i = $('#' + id); return i && i.closest('label'); };
    const two = $('.bk-step:nth-of-type(3) .bk-two'), step3 = two && two.closest('.bk-step'); if (!two) return;
    const V = main.__vals || {}, kindIn = document.createElement('input'); kindIn.type = 'hidden'; kindIn.id = 'bk-x-kind'; kindIn.value = V['bk-x-kind'] || '';
    const fld = (id, label, attrs = '', span) => `<label class="bk-f${span ? ' bk-span' : ''}" data-flk>${label}<input id="${id}" ${attrs}></label>`;
    const opt = ' <i>(optional)</i>';
    // step 3 becomes "About you"; a new step 4 holds the event and the venue
    step3.querySelector('h2').innerHTML = '<span>3</span>About you';
    const who = document.createElement('div'); who.className = 'bk-f'; who.innerHTML = `<span>Who are you?</span><div class="bk-chips ssx-bk-who" role="group" aria-label="Who are you?">${FL_BK_KINDS.map(([k, l]) => `<button type="button" class="bk-chip" data-flk-who="${k}" aria-pressed="false">${l}</button>`).join('')}</div>`;
    two.before(who, kindIn);
    const me = document.createElement('div'); me.className = 'bk-two ssx-bk-me';
    me.innerHTML = fld('bk-x-title', 'Your title' + opt, 'maxlength="60" placeholder="e.g. Talent buyer, GM"') + fld('bk-x-ig', 'Instagram' + opt, 'maxlength="60" placeholder="@handle"') + fld('bk-x-site', 'Website' + opt, 'type="url" maxlength="200" placeholder="https://"');
    two.after(me);
    const s4 = document.createElement('section'); s4.className = 'bk-step ssx-bk-ev';
    s4.innerHTML = `<h2><span>4</span>About the event</h2><div class="bk-two ssx-bk-ev2"></div><div class="bk-two ssx-bk-ven"></div><div class="bk-two ssx-bk-more"></div>`;
    step3.after(s4);
    const ev2 = s4.querySelector('.ssx-bk-ev2'), ven = s4.querySelector('.ssx-bk-ven'), more = s4.querySelector('.ssx-bk-more');
    ev2.append(lab('bk-event'));
    ev2.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="private">Type of event<select id="bk-x-etype"><option value="">Choose…</option>${['Wedding', 'Birthday', 'Corporate event', 'Holiday party', 'House party', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></label>` + fld('bk-x-guests', 'How many guests?' + opt, 'inputmode="numeric" maxlength="6" placeholder="e.g. 120"').replace('data-flk', 'data-flk="private"'));
    ven.append(lab('bk-venue'), lab('bk-city'), lab('bk-address'));
    ven.insertAdjacentHTML('beforeend', fld('bk-x-vsite', 'Venue website or Instagram' + opt, 'maxlength="200"').replace('data-flk', 'data-flk="venue"') + fld('bk-x-cap', 'Capacity' + opt, 'inputmode="numeric" maxlength="6" placeholder="e.g. 300"').replace('data-flk', 'data-flk="venue"'));
    more.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="ages">Ages<select id="bk-x-ages"><option value="">Choose…</option><option>21+</option><option>18+</option><option>All ages</option></select></label>` + fld('bk-x-lineup', 'Who else is playing?' + opt, 'maxlength="200" placeholder="Other acts on the bill"').replace('data-flk', 'data-flk="lineup"'));
    more.append(lab('bk-fee'));
    more.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="rep">Does this night repeat?<select id="bk-x-rep"><option value="">Just this once</option><option value="w1">Every week</option><option value="w2">Every 2 weeks</option><option value="mn">Once a month</option><option value="cu">Something else (tell us in your message)</option></select></label>` + fld('bk-x-repn', 'About how many dates?' + opt, 'inputmode="numeric" maxlength="2" placeholder="e.g. 6"').replace('data-flk', 'data-flk="repn"'));
    const msgL = lab('bk-msg'); s4.append(msgL); const tail = [...step3.children].filter(x => x.matches('.bk-hp, p, button')); s4.append(...tail);
    const msg = $('#bk-msg'); if (msg) msg.maxLength = 1400;
    const roleL = lab('bk-role'); if (roleL) roleL.hidden = true;
    // bring back anything typed before the page redrew (picking a date or a set length redraws it)
    form.querySelectorAll('[id^="bk-x-"]').forEach(x => { if (V[x.id] != null && x.id !== 'bk-x-kind') x.value = V[x.id]; });
    const setLab = (id, text) => { const l = lab(id); if (!l) return; const n = [...l.childNodes].find(c => c.nodeType === 3); if (n) n.textContent = text; const i = l.querySelector('i'); if (i) i.hidden = !/optional/.test(text) ? true : false; };
    const apply = () => {
      const k = kindIn.value, pick = form.querySelectorAll('[data-flk-who]');
      pick.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flkWho === k)));
      const show = (sel, on) => form.querySelectorAll(sel).forEach(x => { x.hidden = !on; });
      const orgL = lab('bk-org'), venL = lab('bk-venue');
      const orgText = { booker: 'Company you work for', venue: 'Venue name', collective: 'Collective or crew name', promoter: 'Company or brand', private: 'Company', other: 'Company or organization' }[k] || 'Company or collective';
      setLab('bk-org', orgText); orgL.querySelector('i') && (orgL.querySelector('i').hidden = k === 'venue' || k === 'collective');
      if (orgL) orgL.hidden = k === 'private';
      setLab('bk-venue', k === 'private' ? 'Where is it?' : k === 'booker' ? 'Venue you book for' : 'Venue');
      if (venL) { venL.hidden = k === 'venue'; const i = venL.querySelector('i'); if (i) i.hidden = k === 'booker'; }
      show('#bk-x-title', true); lab('bk-x-title').hidden = !(k === 'booker' || k === 'venue' || k === 'other');
      lab('bk-x-ig').hidden = !(k === 'collective' || k === 'promoter'); lab('bk-x-site').hidden = !(k === 'collective' || k === 'promoter');
      show('[data-flk="private"]', k === 'private'); show('[data-flk="venue"]', k !== 'private'); show('[data-flk="ages"]', k !== 'private'); show('[data-flk="lineup"]', k !== 'private');
      setLab('bk-event', k === 'private' ? "What's the occasion?" : 'Event name');
      const ev = $('#bk-event'); if (ev) ev.placeholder = k === 'private' ? "e.g. Maria's 30th birthday" : 'e.g. Saturday night at the club';
      const role = $('#bk-role'); if (role) role.value = FL_BK_ROLE[k] || 'other';
      me.hidden = !k || [...me.querySelectorAll('label')].every(l => l.hidden);
      const rp = $('#bk-x-rep'); if (rp) rp.onchange = apply; show('[data-flk="rep"]', k !== 'private'); show('[data-flk="repn"]', k !== 'private' && !!(rp && rp.value));
      s4.hidden = !k; two.hidden = !k;
    };
    form.querySelectorAll('[data-flk-who]').forEach(b => b.onclick = () => { kindIn.value = b.dataset.flkWho; apply(); const f = $('#bk-name'); if (f && !f.value) f.focus(); });
    apply();
  }
  // on send: pack the extra answers for the performer's app, then let the page send it as usual
  function flBookSubmit(e) {
    const form = e.target; if (!form || form.id !== 'bk-form' || !form.dataset.fl) return;
    const $ = s => form.querySelector(s), v = id => (($('#' + id) || {}).value || '').trim(), err = $('#bk-err'), k = v('bk-x-kind');
    const stop = t => { e.preventDefault(); e.stopImmediatePropagation(); if (err) { err.textContent = t; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
    if (!k) return stop('Tell us who you are: tap the option under "Who are you?".');
    if ((k === 'venue' || k === 'collective') && !v('bk-org')) { $('#bk-org').focus(); return stop(k === 'venue' ? 'Add the venue name.' : 'Add the name of your collective or crew.'); }
    if (k === 'booker' && !v('bk-venue')) { $('#bk-venue').focus(); return stop('Add the venue you book for.'); }
    if (k === 'venue') $('#bk-venue').value = v('bk-org');
    const d = { k }; [['t', 'bk-x-title'], ['ig', 'bk-x-ig'], ['site', 'bk-x-site'], ['vsite', 'bk-x-vsite'], ['cap', 'bk-x-cap'], ['ages', 'bk-x-ages'], ['lineup', 'bk-x-lineup'], ['et', 'bk-x-etype'], ['g', 'bk-x-guests'], ['rf', 'bk-x-rep'], ['rn', 'bk-x-repn']].forEach(([a, id]) => { const x = v(id); if (x) d[a] = x.slice(0, 200); });
  const msg = $('#bk-msg'); if (!msg) return;
  if (BKX_GEO.lat && ((BKX_GEO.name && BKX_GEO.name === v('bk-venue')) || (BKX_GEO.addr && BKX_GEO.addr === v('bk-address')))) d.ll = [+BKX_GEO.lat.toFixed(5), +BKX_GEO.lon.toFixed(5)];
    const own = msg.value.replace(/\n*\[details\]\{[\s\S]*$/, '');
    msg.value = (own.trim() ? own.trim() + '\n\n' : '') + '[details]' + JSON.stringify(d);
    setTimeout(() => { msg.value = own; }, 0); // the page reads the message right away; put back what they typed
  }
  if (/[?&]book=/.test(location.search)) {
    const mo = new MutationObserver(() => { try { flBookPage(); } catch (err) { console.error(err); } });
    const start = () => { mo.observe(document.body, { childList: true, subtree: true }); flBookPage(); };
    document.body ? start() : document.addEventListener('DOMContentLoaded', start);
    document.addEventListener('submit', flBookSubmit, true);
  }

  /* -- performer's app: turn a booking-link request into a filled-in booking (venue, promoter or collective, person to talk to) */
  const FL_REQ = new Set();
  const flSameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const flKindLabel = k => (FL_BK_KINDS.find(x => x[0] === k) || [, ''])[1];
  async function flFillContact(c, data) {
    if (!c) return; const upd = {}; Object.keys(data).forEach(k => { const val = data[k]; if (val && (Array.isArray(val) ? val.some(x => !(c[k] || []).includes(x)) : !c[k])) upd[k] = Array.isArray(val) ? [...new Set([...(c[k] || []), ...val])] : val; });
    if (Object.keys(upd).length) { await window.patch('contacts', c.id, { ...upd, updatedAt: new Date().toISOString() }); Object.assign(c, upd); }
  }
  async function flFindOrMake(test, data) {
    const hit = S.contacts.find(test); if (hit) { await flFillContact(hit, data); return hit.id; }
    const now = new Date().toISOString(), id = await window.save('contacts', null, { ...data, createdAt: now, updatedAt: now });
    if (id && !S.contacts.some(x => x.id === id)) S.contacts.push({ id, ...data });
    return id || '';
  }
  async function flReqOne(b) {
    const m = String(b.notes || '').match(/\n*\[details\](\{[\s\S]*\})\s*$/); if (!m) return;
    let d; try { d = JSON.parse(m[1]); } catch (_) { d = null; }
    const base = String(b.notes).slice(0, m.index);
    if (!d || !d.k) { await window.patch('bookings', b.id, { notes: base }); return; }
    const k = d.k, personId = b.promoterId || '', person = contact(personId), venueAsPerson = k === 'venue' ? contact(b.venueId) : null;
    const upd = {}, lines = [];
    const vName = (base.match(/\nVenue: (.+)/) || [])[1] || '', city = b.city || '';
    // the person who asked
    if (person) await flFillContact(person, { instagram: d.ig || '', website: d.site || '' });
    // the venue
    let venueId = '';
    if (k === 'venue' && venueAsPerson) { venueId = venueAsPerson.id; await flFillContact(venueAsPerson, { address: b.address || '', city, website: d.vsite || '', capacity: d.cap || '', vkind: 'club' }); }
    else if (vName && k !== 'private') venueId = await flFindOrMake(c => c.type === 'venue' && flSameName(cName(c), vName), { type: 'venue', vkind: 'club', org: vName, address: b.address || '', city, website: d.vsite || '', capacity: d.cap || '', ...(k === 'booker' && personId ? { bookingContactId: personId } : {}), promoterIds: personId ? [personId] : [] });
    if (venueId) upd.venueId = venueId;
    // who you're working with
    if (k === 'booker' && personId) { upd.promoterId = ''; upd.contactPersonId = personId; const vc = venueId && contact(venueId); if (vc) await flFillContact(vc, { bookingContactId: personId }); }
    if (k === 'collective' && person) {
      const org = person.org || ''; const cid = org ? await flFindOrMake(c => c.type === 'promoter' && c.pkind === 'collective' && flSameName(c.org, org), { type: 'promoter', pkind: 'collective', org, instagram: d.ig || '', website: d.site || '', city, mainContactId: personId, venueIds: venueId ? [venueId] : [] }) : '';
      if (cid) { upd.promoterId = cid; upd.contactPersonId = personId; await flFillContact(person, { collectiveIds: [cid] }); }
    }
    if (k === 'private' && person && person.type !== 'other' && person.createdAt && person.createdAt === b.createdAt) await window.patch('contacts', person.id, { type: 'other' }); // only a contact this request just made
    // a clean note: who they are, plus the extra answers
    lines.push(`From: ${person ? cName(person) : (venueAsPerson ? venueAsPerson.name || cName(venueAsPerson) : 'the booking link')}${d.t ? ', ' + d.t : ''} (${flArtist().group === 'service' ? 'Client' : flKindLabel(k)})`);
    if (d.et || d.g) lines.push(`Event: ${[d.et, d.g ? d.g + ' guests' : ''].filter(Boolean).join(' · ')}`);
    if (d.cap || d.ages) lines.push(`Room: ${[d.cap ? 'capacity ' + d.cap : '', d.ages || ''].filter(Boolean).join(' · ')}`);
    if (d.lineup) lines.push(`Also playing: ${d.lineup}`);
    if (d.rf && FL_REP_DEF[d.rf]) { const n = Math.max(2, Math.min(52, parseInt(d.rn, 10) || FL_REP_DEF[d.rf])); lines.push(d.rf === 'cu' ? `Repeats: a custom schedule (see their message), about ${n} dates` : `Repeats: ${FL_REP_NAMES[d.rf]}, about ${n} dates`);upd.repeatReq = { freq: d.rf, count: n }; }
    if (d.ig || d.site || d.vsite) lines.push(`Links: ${[d.ig, d.site, d.vsite].filter(Boolean).join(' · ')}`);
    if (d.q && typeof d.q === 'object') for (const [qid, val] of Object.entries(d.q)) if (/^[a-z0-9]{1,20}$/.test(qid) && typeof val === 'string') upd['cf_' + qid] = val.slice(0, 200);
    Object.assign(upd, flFoundFromRequest(d, b));
    if (Array.isArray(d.ll) && isFinite(+d.ll[0]) && isFinite(+d.ll[1]) && Math.abs(+d.ll[0]) <= 90 && Math.abs(+d.ll[1]) <= 180) upd.geo = { lat: +d.ll[0], lon: +d.ll[1] };
    upd.notes = base.replace(/\nRole: [^\n]*/, '\n' + lines.join('\n')); upd.requestKind = k; upd.updatedAt = new Date().toISOString();
    await window.patch('bookings', b.id, upd);
  }
  function flReqSweep() {
    let list = []; try { list = flBk().filter(b => b.source === 'booking-link' && /\[details\]\{/.test(String(b.notes || '')) && !FL_REQ.has(b.id)); } catch (_) { return; }
    list.slice(0, 5).forEach(b => { FL_REQ.add(b.id); flReqOne(b).catch(e => { console.error(e); FL_REQ.delete(b.id); }); });
  }

  /* -- Lost shows: off the calendar. Keep trying to take a lost show off Google Calendar, and offer to clear old leftovers */
  const FL_LOSTTRY = {};
  function flLostSweep() {
    let L = []; try { L = flBk().filter(b => flKind(b.status) === 'lost' && b.gcal && b.gcal.eventId); } catch (_) { return; }
    const now = Date.now(); L.slice(0, 3).forEach(async b => { if (now - (FL_LOSTTRY[b.id] || 0) < 10 * 60e3) return; FL_LOSTTRY[b.id] = now; try { if (await dropEvent(b.gcal)) await window.patch('bookings', b.id, { gcal: { eventId: '', calendarId: '', link: '' } }); } catch (_) {} });
  }
  // Google events the app made for shows that are now Lost (from before this fix): same day, same show name
  function flLostLeftovers() {
    let out = []; try {
      const lost = flBk().filter(b => flKind(b.status) === 'lost' && b.date), names = {}; Object.entries(G.calNames || {}).forEach(([id, n]) => { names[n] = id; });
      lost.forEach(b => (G.byDate[b.date] || []).forEach(ev => { const t = String(ev.title || '').replace(/^HOLD · /, ''); if (t.endsWith(': ' + showName(b)) && !out.some(x => x.ev.id === ev.id)) out.push({ b, ev, cal: names[ev.cal] || '' }); }));
    } catch (_) {}
    return out;
  }
  function flLostCard() {
    const bar = document.getElementById('syncbar'); if (!bar) return;
    const left = flLostLeftovers(), sig = left.map(x => x.ev.id).join('|'); let box = document.getElementById('ssx-fl-lost');
    if (!left.length) { if (box && box.dataset.kind !== 'ok') box.remove(); return; }
    if (box && box.dataset.sig === sig) return;
    if (!box) { box = document.createElement('div'); box.id = 'ssx-fl-lost'; box.className = 'ssx-fl-msg'; bar.after(box); }
    box.dataset.sig = sig; box.dataset.kind = 'warn';
        box.innerHTML = `<b>${left.length} Lost show${left.length === 1 ? ' is' : 's are'} still on your Google Calendar.</b><p>${esc(left.slice(0, 4).map(x => `${showName(x.b)} (${fmtD(x.b.date)})`).join(', '))}${left.length > 4 ? ` and ${left.length - 4} more` : ''}. The bookings stay saved in Bookings under Lost.</p><div class="ssx-row"><button type="button" class="btn small primary" data-fl-lostgo>Remove from Google Calendar</button></div>`;
    box.querySelector('[data-fl-lostgo]').onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Removing…'; let ok = 0, bad = 0;
      for (const x of left) { try { await G.mcp.callTool('Google Calendar', 'delete_event', { eventId: x.ev.id, ...(x.cal && x.cal !== 'primary' ? { calendarId: x.cal } : {}), notificationLevel: 'NONE' }); ok++; if (x.b.gcal && x.b.gcal.eventId === x.ev.id) await window.patch('bookings', x.b.id, { gcal: { eventId: '', calendarId: '', link: '' } }); } catch (_) { bad++; } }
      box.dataset.kind = 'ok'; box.innerHTML = `<b>${ok ? `Removed ${ok} from Google Calendar.` : "Couldn't remove them."}</b>${bad ? `<p>${bad} couldn't be removed. Check that Google Calendar is connected in Settings, then try again.</p>` : ''}`;
      try { gSync(true); } catch (_) {}
    };
  } 
  /* -- Home Screen app on iPhone: a solid strip behind the clock and notch so the top bar never looks blurred */
  function flStandalone() {
    const sa = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (!sa || document.getElementById('ssx-fl-sbar')) return;
    document.documentElement.classList.add('ssx-standalone');
    const s = document.createElement('div'); s.id = 'ssx-fl-sbar'; s.setAttribute('aria-hidden', 'true'); document.body.appendChild(s);
  }
  /* -- booking view: the promoter's (and the person you're talking to's) phone, with a quick way to add one */
  function flContactPhone(root) {
    const id = root.dataset && root.dataset.booking, b = id && flBk().find(x => x.id === id), dl = root.querySelector('dl.kv'); if (!b || !dl) return;
    [['Promoter', b.promoterId], ['Talking to', b.contactPersonId]].forEach(([label, cid]) => {
      const c = cid && contact(cid), dt = [...dl.querySelectorAll('dt')].find(d => d.textContent.trim() === label), dd = dt && dt.nextElementSibling; if (!c || !dd || dd.querySelector('.ssx-fl-ph')) return;
      const box = document.createElement('div'); box.className = 'ssx-fl-ph';
      const draw = () => {
        const ph = (contact(cid) || c).phone || '';
        box.innerHTML = ph ? `<a href="tel:${esc(ph.replace(/[^\d+]/g, ''))}">${esc(ph)}</a> <button type="button" class="linkbtn" data-fl-phed>Edit</button>` : '<button type="button" class="linkbtn" data-fl-phed>+ Add phone</button>';
        box.querySelector('[data-fl-phed]').onclick = () => {
          box.innerHTML = `<input type="tel" inputmode="tel" autocomplete="off" value="${esc(ph)}" aria-label="Phone for ${esc(cName(c))}" placeholder="Phone number"><button type="button" class="btn small primary" data-fl-phsave>Save</button><button type="button" class="btn small" data-fl-phx>Cancel</button>`;
          const inp = box.querySelector('input'); inp.focus();
          const saveIt = async () => { const v = inp.value.trim(); if (v && v.replace(/\D/g, '').length < 7) { toast('That phone number looks too short'); inp.focus(); return; }
            if (await window.patch('contacts', cid, { phone: v })) { try { const x = contact(cid); if (x) x.phone = v; } catch (_) {} toast(v ? `Phone saved for ${cName(c)}` : 'Phone removed'); } draw(); };
          box.querySelector('[data-fl-phsave]').onclick = saveIt; box.querySelector('[data-fl-phx]').onclick = draw;
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveIt(); } if (e.key === 'Escape') { e.stopPropagation(); draw(); } });
        };
      };
      draw(); dd.appendChild(box);
    });
  }
  /* -- first-run tour: 15 short stops (about 3 minutes). Set up the few things that fill in everything else, then a quick look at each page */
  const FL_TOUR = [
    { title: 'Welcome to Set & Settled', body: 'Your home base as an artist: shows, people, money, emails, media and your press kit in one place. This tour takes about 3 minutes. First we set up the few things that fill in everything else, then a quick look around.' },
    { tab: 'settings', group: 'profile', target: '#ssx-fl-art, #ssx-profile', title: 'Start with you', body: 'Pick what kind of artist you are and how you want to be called. Then add your name, contact details and socials. They fill in your EPK, emails, invoices and booking page, so you only type them once.' },
    { tab: 'settings', group: 'google', target: '#ss-google', title: 'Connect Google', body: 'Gmail sends emails and invoices from your own address, Drive keeps your files together, and Calendar shows your other plans next to your shows. Connect only what you want. You can change it anytime.' },
    { tab: 'calendar', target: '#availEdit', title: 'When are you available?', body: 'Your Calendar is under your shows in the menu. Set the days you are available and tap any date to block it. Your booking link uses this same list, so you only keep one calendar up to date.', action: ['Open Edit availability', () => { const n = document.getElementById('availEdit'), a = document.getElementById('availPanel'); if (n && (!a || a.hidden)) n.click(); }] },
    { tab: 'bookings', target: '#ssx-bklink', title: 'Let promoters come to you', body: 'Share your booking link. People pick an open date and tell you who they are (a talent buyer, a venue, a collective, a private event). Their request lands here as a Lead with the venue and contacts already filled in.' },
    { tab: 'bookings', target: '[data-new="booking"]', title: 'Every show in one place', body: 'Calendar opens right under this in the menu. Add a show, even a new venue or promoter, without leaving the form. Move it from Lead to Confirmed, Played and Paid, and each stage brings its own checklist. Add tips, merch or expenses under the fee. A Lost show leaves your calendar but stays saved.' },
    { tab: 'home', target: '#ssx-upnext, #nextShow', title: 'Home keeps watch', body: 'Home suggests your next step for every show: an invoice to send, a thank-you, a late payment to chase. Your next show and open tasks are here too.' },
    { tab: 'contacts', target: '[data-new="contact"]', title: 'Your people', body: 'Promoters, venues, collectives and photographers, each with their notes, phone and the shows you have done together. People you add from a booking land here on their own.' },
    { tab: 'comms', target: '#composeBtn, [data-new="template"]', title: 'Emails in a tap', body: 'Messages & templates opens under People in the menu. Tap New email and start from a template. Fill-ins like the venue, date and your booking link fill themselves in from the show. Every email opens for you to check before it goes out from your Gmail.' },
    { tab: 'money', target: '[data-new="expense"]', title: 'Your money, organized', body: 'Fees, extra income and expenses in one list, with invoices, receipts and mileage. When tax time comes, it shows what to set aside and builds your tax packet. It keeps your records organized, and it is not tax advice.' },
    { tab: 'media', target: '#ssx-fl-mhost, section[data-view="media"] .head', title: 'Media from every show', body: 'Media opens under Kit in the menu. Photo folders, videos and links, sorted by show. Open them, share them in a tap, and ask your photographer for files when a show has none yet.' },
    { tab: 'kit', target: '#ssx-hist', title: 'Bring your history', body: 'Add the shows you did before Set & Settled: one at a time, from a Google Sheet, or with our template. They build your EPK without touching your bookings or money.', action: ['Add past shows', () => { const b = document.querySelector('#ssx-hist [data-nh-import]'); if (b) b.click(); }] },
    { tab: 'kit', target: '#tabs [data-tab="epk"]', title: 'Your EPK', body: 'Your Kit and your shows become a designed press kit. Pick a color theme, choose and reorder the sections, edit any text, then download a PDF for venues.', action: ['Create my EPK', () => { const b = document.getElementById('ssx-epk-btn'); if (b) b.click(); }] },
    { tab: 'settings', group: 'reminders', target: '#ssx-notify', title: 'Reminders', body: 'Choose phone and laptop alerts, a morning email, or both. They come from your checklists and goals, so nothing slips.' },
    { title: "You're all set", body: 'Two shortcuts to remember: search anything with the magnifying glass (or press / on a computer), and use Arrange on any page to show only what you need. Take this tour again anytime from Settings, under Account. Have a great season!' },
  ];
  function flTourSetup() {
    if (!FL.tour) { FL.tour = 1; try { TOUR.splice(0, TOUR.length, ...FL_TOUR); } catch (_) {} }
    const offer = document.querySelector('.ssx-tour-offer .ssx-tour-card > p:not(.note)');
    if (offer && !offer.dataset.fl) { offer.dataset.fl = '1'; offer.textContent = "A 3-minute walk-through. We'll set up the few things that fill in everything else (your profile, Google and when you're available), then show you around."; }
  }

  /* -- invoice: "Bill to" can add a new person or company right there, the same way the booking form does */
  function flInvoiceHook(root) {
    const s = root.querySelector('#iv-to'); if (!s || root.__flInv) return; root.__flInv = true;
    if (!s.querySelector('option[value="__new__"]')) { const o = document.createElement('option'); o.value = '__new__'; o.textContent = '＋ Add new contact…'; const first = s.querySelector('option'); first ? first.after(o) : s.prepend(o); if (typeof s._sync === 'function') s._sync(); }
    s.__flPrev = s.value;
    root.addEventListener('change', e => {
      if (e.target !== s) return;
      if (s.value !== '__new__') { s.__flPrev = s.value; return; }
      e.stopImmediatePropagation();
      s.value = [...s.options].some(o => o.value === s.__flPrev) ? s.__flPrev : ''; if (typeof s._sync === 'function') s._sync();
      flNewPanel(root, s, 'promoter');
      const h = root.querySelector('#ssx-fl-new h4'); if (h) h.textContent = 'New person or company to bill';
    }, true);
  }
  /* -- repeating gigs (residencies, monthly nights): set a repeat in the booking form, each date becomes its own booking in one series */
  const FL_REP_DEF = { w1: 12, w2: 8, mn: 6, md: 6, cu: 6 };
  const FL_REP_NAMES = { w1: 'every week', w2: 'every 2 weeks', mn: 'once a month', md: 'once a month', cu: 'on a custom schedule' };
  const flYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const flPD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const FL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const FL_DS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const flOrd = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
  const flAnd = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1];
  function flNth(d) { const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return d.getDate() + 7 > last ? -1 : Math.ceil(d.getDate() / 7); }
  // rule (custom only): { unit: 'w' | 'm' | 'd', every, days: [0-6], mon: 'nth' | 'date', dates: ['YYYY-MM-DD'] }
  function flRepLabel(freq, date, rule) {
    if (freq === 'cu') {
      const r = rule || {}; if (r.unit === 'd') return 'On dates you picked';
      if (!date) return 'Custom';
      const e = Math.max(1, (r.every | 0) || 1), d = flPD(date), n = flNth(d);
      if (r.unit === 'm') { const on = r.mon === 'date' ? `the ${flOrd(d.getDate())}` : `the ${n < 0 ? 'last' : flOrd(n)} ${FL_DAYS[d.getDay()]}`; return e === 1 ? `Monthly on ${on}` : `Every ${e} months on ${on}`; }
      const days = [...new Set((r.days && r.days.length ? r.days : [d.getDay()]).map(Number))].sort((a, b) => a - b);
      const dn = days.length === 1 ? FL_DAYS[days[0]] : flAnd(days.map(x => FL_DS[x]));
      return e === 1 ? `Every ${dn}` : `Every ${e} weeks on ${dn}`;
    }
    if (!date) return { w1: 'Every week', w2: 'Every 2 weeks', mn: 'Once a month, same weekday', md: 'Once a month, same date' }[freq];
    const d = flPD(date), wd = FL_DAYS[d.getDay()], n = flNth(d);
    return { w1: `Every ${wd}`, w2: `Every other ${wd}`, mn: `Monthly on the ${n < 0 ? 'last' : flOrd(n)} ${wd}`, md: `Monthly on the ${flOrd(d.getDate())}` }[freq] || '';
  }
  // every date in the series, starting with the first show; stops at count shows or the last date (until), whichever comes first
  function flRepDates(start, freq, count, rule, until) {
    const s = flPD(start), n = flNth(s), wd = s.getDay(), dom = s.getDate(), r = freq === 'cu' ? (rule || { unit: 'w' }) : null;
    count = Math.max(1, Math.min(52, (count | 0) || 52));
    const ok = y => !until || y <= until, out = [];
    const fin = () => { if (out[0] !== start) out.unshift(start); return [...new Set(out)].slice(0, count); };
    if (r && r.unit === 'd') { out.push(...(r.dates || []).filter(x => x > start)); out.sort(); return fin(); }
    const every = r ? Math.max(1, Math.min(12, (r.every | 0) || 1)) : 1;
    if (r && r.unit !== 'm') {
      const days = [...new Set((r.days && r.days.length ? r.days : [wd]).map(Number))].sort((a, b) => a - b), sow = new Date(s); sow.setDate(s.getDate() - wd);
      for (let k = 0; out.length < count && k < 600; k += every) for (const day of days) {
        if (out.length >= count) break;
        const d = new Date(sow); d.setDate(sow.getDate() + k * 7 + day); const y = flYmd(d);
        if (y < start) continue; if (!ok(y)) return fin(); out.push(y);
      }
      return fin();
    }
    const byDate = freq === 'md' || (r && r.mon === 'date');
    for (let i = 0; out.length < count && i < 600; i += every) {
      let d;
      if (freq === 'w1' || freq === 'w2') { d = new Date(s); d.setDate(s.getDate() + i * (freq === 'w1' ? 7 : 14)); }
      else {
        const y = s.getFullYear(), m = s.getMonth() + i;
        if (byDate) { const last = new Date(y, m + 1, 0).getDate(); d = new Date(y, m, Math.min(dom, last), 12); }
        else if (n < 0) { d = new Date(y, m + 1, 0, 12); while (d.getDay() !== wd) d.setDate(d.getDate() - 1); }
        else { d = new Date(y, m, 1, 12); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + (n - 1) * 7); if (d.getMonth() !== ((m % 12) + 12) % 12) continue; }
      }
      const y = flYmd(d); if (!ok(y)) break; out.push(y);
    }
    return fin();
  }
  const flSeriesOf = sid => flBk().filter(x => x.seriesId === sid).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // the Repeats box in the booking form
  function flRepeatUI(root) {
    const dateIn = root.querySelector('#b-date'), title = root.querySelector('#b-title'); if (!dateIn || !title || root.querySelector('#ssx-fl-rep')) return;
    const h = root.querySelector('h3'), isNew = h && /new booking/i.test(h.textContent);
    const b = !isNew && FL.editing ? flBk().find(x => x.id === FL.editing) : null, sid = b && b.seriesId, sibs = sid ? flSeriesOf(sid) : [];
    const box = document.createElement('div'); box.id = 'ssx-fl-rep'; box.className = 'ssx-fl-rep';
    const frow = dateIn.closest('.frow') || dateIn.closest('.f'); frow.after(box);
    if (sid && sibs.length > 1) {
      const later = sibs.filter(x => x.date > (b.date || '') && !['lost', 'paid', 'played'].includes(flKind(x.status))).length, ser = b.series || {};
      box.innerHTML = `<div class="f"><label class="ssx-fl-replbl">Repeats</label><span class="note">${esc(ser.freq ? flRepLabel(ser.freq, sibs[0].date, ser.rule) : 'Part of a series')} · show ${sibs.findIndex(x => x.id === b.id) + 1} of ${sibs.length}</span>
        ${later ? `<div class="seg" data-fl-apply style="flex-wrap:wrap;margin-top:6px"><button type="button" data-v="one" aria-pressed="true">Change this show only</button><button type="button" data-v="future" aria-pressed="false">This and the ${later} later show${later === 1 ? '' : 's'}</button></div><span class="note">Dates and status always stay per show.</span>` : ''}</div>`;
      box.querySelectorAll('[data-fl-apply] [data-v]').forEach(x => x.onclick = () => box.querySelectorAll('[data-fl-apply] [data-v]').forEach(y => y.setAttribute('aria-pressed', String(y === x))));
      box.dataset.mode = 'series'; return;
    }
    box.innerHTML = `<div class="frow"><div class="f"><label for="ssx-fl-repf">Repeats</label><select id="ssx-fl-repf"></select></div>
      <div class="f" data-fl-rpend hidden><label for="ssx-fl-repe">Ends</label><select id="ssx-fl-repe"><option value="n">After a number of shows</option><option value="u">On a date</option></select></div></div>
      <div class="ssx-fl-repcu" data-fl-rpcu hidden>
        <div class="frow"><div class="f"><label for="ssx-fl-cuu">Custom repeat</label><select id="ssx-fl-cuu"><option value="w">By the week</option><option value="m">By the month</option><option value="d">I'll pick each date</option></select></div>
        <div class="f" data-fl-cuev><label for="ssx-fl-cue">Every</label><select id="ssx-fl-cue"></select></div></div>
        <div class="f" data-fl-cuw><label class="ssx-fl-replbl">On</label><div class="ssx-fl-days" role="group" aria-label="Days of the week">${FL_DS.map((x, i) => `<button type="button" class="ssx-fl-day" data-d="${i}" aria-pressed="false">${x}</button>`).join('')}</div></div>
        <div class="f" data-fl-cum hidden><label for="ssx-fl-cum">On</label><select id="ssx-fl-cum"></select></div>
        <div class="f" data-fl-cud hidden><label for="ssx-fl-cud">Add the other dates</label><div class="ssx-fl-addd"><input id="ssx-fl-cud" type="date"><button type="button" class="btn small" data-fl-cuadd>Add</button></div><div class="ssx-fl-chips"></div></div>
      </div>
      <div class="frow" data-fl-rpn hidden><div class="f" data-fl-repn><label for="ssx-fl-repc">How many shows</label><input id="ssx-fl-repc" type="number" inputmode="numeric" min="2" max="52" value="12"></div>
        <div class="f" data-fl-repu hidden><label for="ssx-fl-repu">Last show on or before</label><input id="ssx-fl-repu" type="date"></div></div>
      <p class="note ssx-fl-repnote" hidden></p>`;
    const q = s => box.querySelector(s), sel = q('#ssx-fl-repf'), endSel = q('#ssx-fl-repe'), cnt = q('#ssx-fl-repc'), untilIn = q('#ssx-fl-repu'), note = q('.ssx-fl-repnote');
    const cuU = q('#ssx-fl-cuu'), cuE = q('#ssx-fl-cue'), cuM = q('#ssx-fl-cum'), cuD = q('#ssx-fl-cud'), chips = q('.ssx-fl-chips');
    const R = { days: [], dates: [], daysTouched: false };
    let lastDate = null, lastF = '', lastU = '';
    const rule = () => sel.value === 'cu' ? { unit: cuU.value, every: +cuE.value || 1, days: R.days.slice(), mon: cuM.value || 'nth', dates: R.dates.slice() } : null;
    box.__rep = () => {
      const f = sel.value; if (!f) return null;
      const r = rule(), u = endSel.value === 'u' && !(r && r.unit === 'd') ? untilIn.value : '';
      const c = r && r.unit === 'd' ? 52 : u ? 52 : Math.max(2, Math.min(52, +cnt.value || FL_REP_DEF[f]));
      return { freq: f, count: c, until: u, rule: r };
    };
    const draw = () => {
      const d = dateIn.value, f = sel.value, cu = f === 'cu', unit = cuU.value;
      if (d !== lastDate) {
        lastDate = d; const keep = sel.value, keepM = cuM.value;
        sel.innerHTML = `<option value="">${isNew ? "Doesn't repeat" : "Doesn't repeat (just this show)"}</option>` + ['w1', 'w2', 'mn', 'md'].map(k => `<option value="${k}">${esc(flRepLabel(k, d))}</option>`).join('') + '<option value="cu">Custom…</option>';
        sel.value = keep;
        if (d) { const x = flPD(d), n = flNth(x); cuM.innerHTML = `<option value="nth">the ${n < 0 ? 'last' : flOrd(n)} ${FL_DAYS[x.getDay()]}</option><option value="date">the ${flOrd(x.getDate())}</option>`; cuM.value = keepM || 'nth'; if (!R.daysTouched) R.days = [x.getDay()]; }
        untilIn.min = d || '';
        cuD.min = d || '';
      }
      if (unit !== lastU) { const keepE = cuE.value || '1', w = unit !== 'm'; cuE.innerHTML = Array.from({ length: w ? 8 : 12 }, (_, i) => `<option value="${i + 1}">${i + 1} ${w ? 'week' : 'month'}${i ? 's' : ''}</option>`).join(''); cuE.value = +keepE <= (w ? 8 : 12) ? keepE : '1'; lastU = unit; }
      if (f !== lastF) { if (f && !cnt.dataset.touched) cnt.value = FL_REP_DEF[f]; lastF = f; }
      const picks = cu && unit === 'd';
      q('[data-fl-rpcu]').hidden = !cu;
      q('[data-fl-cuw]').hidden = unit !== 'w'; q('[data-fl-cum]').hidden = unit !== 'm'; q('[data-fl-cud]').hidden = unit !== 'd'; q('[data-fl-cuev]').hidden = unit === 'd';
      q('[data-fl-rpend]').hidden = !f || picks; q('[data-fl-rpn]').hidden = !f || picks;
      q('[data-fl-repn]').hidden = endSel.value === 'u'; q('[data-fl-repu]').hidden = endSel.value !== 'u';
      box.querySelectorAll('.ssx-fl-day').forEach(x => x.setAttribute('aria-pressed', String(R.days.includes(+x.dataset.d))));
      chips.innerHTML = R.dates.map(x => `<span class="ssx-fl-chip">${esc(fmtD(x))}<button type="button" data-fl-cux="${x}" aria-label="Remove ${esc(fmtD(x))}">×</button></span>`).join('');
      note.hidden = !f;
      if (!f) return;
      if (!d) { note.textContent = 'Pick the first date above.'; return; }
      const j = box.__rep();
      if (!picks && endSel.value === 'u' && !j.until) { note.textContent = 'Pick the last date the series can run to.'; return; }
      const ds = flRepDates(d, f, j.count, j.rule, j.until);
      if (ds.length < 2) { note.textContent = picks ? 'Add the other dates above. The date at the top is the first show.' : 'That only makes one show. Pick a later end date or more shows.'; return; }
      const busy = ds.filter(x => flBk().some(o => o.date === x && flKind(o.status) !== 'lost' && (!b || o.id !== b.id)));
      note.innerHTML = `<b>${ds.length} shows</b>${cu ? ` (${esc(flRepLabel('cu', d, j.rule))})` : ''}: ${esc(fmtD(ds[0]))} to ${esc(fmtD(ds[ds.length - 1]))}. ${isNew ? 'Each one is its own booking, so you can mark them Played or Paid one by one.' : 'This show stays as it is; the later dates are added as their own bookings.'}${busy.length ? ` <span class="ssx-fl-warnnote">${busy.length === 1 ? 'One of these dates already has a show' : `${busy.length} of these dates already have shows`}: ${esc(busy.slice(0, 3).map(x => fmtD(x)).join(', '))}${busy.length > 3 ? '…' : ''}.</span>` : ''}`;
    };
    sel.onchange = draw; endSel.onchange = draw; cuU.onchange = draw; cuE.onchange = draw; cuM.onchange = draw; untilIn.onchange = draw; untilIn.oninput = draw;
    cnt.oninput = () => { cnt.dataset.touched = '1'; draw(); };
    box.querySelectorAll('.ssx-fl-day').forEach(x => x.onclick = () => {
      const v = +x.dataset.d; R.daysTouched = true;
      R.days = R.days.includes(v) ? R.days.filter(y => y !== v) : [...R.days, v];
      if (!R.days.length) { R.days = [v]; toast('Keep at least one day picked'); }
      draw();
    });
    const addDate = () => {
      const v = cuD.value;
      if (!v) { toast('Pick a date first, then tap Add'); return; }
      if (dateIn.value && v <= dateIn.value) { toast('Pick a date after the first show. The first show is the date at the top.'); return; }
      if (!R.dates.includes(v)) { R.dates.push(v); R.dates.sort(); }
      cuD.value = ''; draw();
    };
    q('[data-fl-cuadd]').onclick = addDate;
    cuD.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } });
    chips.onclick = e => { const x = e.target.closest('[data-fl-cux]'); if (!x) return; R.dates = R.dates.filter(y => y !== x.dataset.flCux); draw(); };
    const t = setInterval(() => { if (!box.isConnected) return clearInterval(t); if (dateIn.value !== lastDate) draw(); }, 400);
    draw();
  }
  // remember what the Repeats box says when Save is tapped
  function flRepeatClick(e) {
    const sv = e.target && e.target.closest && e.target.closest('#sheetRoot [data-save]'); if (!sv) return;
    const root = sv.closest('.sheet'), box = root && root.querySelector('#ssx-fl-rep'), dateIn = root && root.querySelector('#b-date'); if (!box || !dateIn) { FL.rep = null; return; }
    if (box.dataset.mode === 'series') { const fut = box.querySelector('[data-fl-apply] [aria-pressed="true"]'); FL.rep = fut && fut.dataset.v === 'future' ? { mode: 'future', date: dateIn.value, at: Date.now() } : null; return; }
    const j = box.__rep ? box.__rep() : null;
    FL.rep = j && dateIn.value ? { mode: 'create', ...j, date: dateIn.value, at: Date.now() } : null;
  }
  const FL_SER_SHARED = ['title', 'venueId', 'promoterId', 'contactPersonId', 'city', 'address', 'fee', 'setStart', 'setEnd', 'setTime', 'payPrefs', 'incType', 'mediaId', 'gcalOff'];
  const FL_SER_DROP = ['invoice', 'gcal', 'driveUrl', 'driveId', 'folders', 'paidDate', 'payMethod', 'payRef', 'mediaSharedWith', 'checklists', 'repeatReq', 'source'];
  async function flSeriesCreate(id, data, freq, count, rule, until) {
    const sid = data.seriesId || 'sr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const series = { freq, count, start: data.date, ...(rule ? { rule } : {}), ...(until ? { until } : {}) };
    await window.patch('bookings', id, { seriesId: sid, series, ...(data.repeatReq ? { repeatReq: null } : {}) });
    const all = flRepDates(data.date, freq, count, rule, until).filter(d => d !== data.date && !flBk().some(o => o.seriesId === sid && o.date === d)), now = new Date().toISOString(), t = todayStr();
    let made = 0;
    for (const d of all) {
      const c = { ...data, date: d, seriesId: sid, series, tasks: {}, stageAt: { [data.status]: t }, createdAt: now, updatedAt: now };
      FL_SER_DROP.forEach(k => delete c[k]);
      const nid = await window.save('bookings', null, c);
      if (nid) { made++; try { syncBookingEvent(nid, c); } catch (_) {} }
    }
    toast(made < all.length ? `Added ${made} of ${all.length} dates. The rest couldn't be saved. Check your connection, then add them from the show.` : made ? `Added ${made} more date${made === 1 ? '' : 's'} to this series` : 'Those dates were already in the series');
    return made;
  }
  // more dates for a series, copied from its last show
  async function flSeriesAdd(sibs, dates) {
    const last = sibs[sibs.length - 1], base = flBk().find(x => x.id === last.id) || last, now = new Date().toISOString(), t = todayStr(); let made = 0;
    for (const d of dates) {
      const c = { ...base, date: d, tasks: {}, createdAt: now, updatedAt: now }; delete c.id;
      FL_SER_DROP.forEach(k => delete c[k]);
      if (['played', 'paid', 'lost'].includes(flKind(c.status))) c.status = STAGES.find(s => flKind(s) === 'confirmed') || 'confirmed';
      c.stageAt = { [c.status]: t };
      const nid = await window.save('bookings', null, c); if (nid) { made++; try { syncBookingEvent(nid, c); } catch (_) {} }
    }
    return made;
  }
  async function flSeriesFuture(data) {
    const later = flSeriesOf(data.seriesId).filter(x => x.date > data.date && !['lost', 'paid', 'played'].includes(flKind(x.status)));
    const upd = {}; FL_SER_SHARED.forEach(k => { if (k in data) upd[k] = data[k]; }); upd.updatedAt = new Date().toISOString();
    for (const x of later) { await window.patch('bookings', x.id, upd); try { syncBookingEvent(x.id, { ...x, ...upd }); } catch (_) {} }
    toast(`Updated ${later.length} later show${later.length === 1 ? '' : 's'} too`);
  }
  function flRepeatWrapSave() {
    const o = window.save; if (typeof o !== 'function' || o.__flRep) return;
    const w = async function (col, id, data) {
      const r = await o.apply(this, arguments);
      try {
        const j = FL.rep;
        if (r && col === 'bookings' && j && Date.now() - j.at < 20000 && data && data.date === j.date) {
          FL.rep = null;
          setTimeout(() => { (j.mode === 'create' ? flSeriesCreate(r, data, j.freq, j.count, j.rule, j.until) : data.seriesId ? flSeriesFuture(data) : null); }, 0);
        }
      } catch (e) { console.error(e); }
      return r;
    };
    w.__flRep = true; window.save = w;
    const bf = window.bookingForm; if (typeof bf === 'function' && !bf.__flRep) { const wf = function (bk) { FL.editing = bk && bk.id || null; return bf.apply(this, arguments); }; wf.__flRep = true; window.bookingForm = wf; }
    document.addEventListener('click', flRepeatClick, true);
  }
  // booking view: which series this show belongs to, add more dates, end it, or set up what a request asked for
  function flSeriesRow(root) {
    const id = root.dataset && root.dataset.booking, b = id && flBk().find(x => x.id === id), dl = root.querySelector('dl.kv'); if (!b || !dl || dl.querySelector('.ssx-fl-ser')) return;
    if (!b.seriesId && !b.repeatReq) return;
    const dateDt = [...dl.querySelectorAll('dt')].find(d => d.textContent.trim() === 'Date'), dateDd = dateDt && dateDt.nextElementSibling; if (!dateDd) return;
    const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = 'Repeats'; dd.className = 'ssx-fl-ser';
    if (b.seriesId) {
      const sibs = flSeriesOf(b.seriesId), i = sibs.findIndex(x => x.id === b.id), ser = b.series || {}, freq = ser.freq, picks = freq === 'cu' && ser.rule && ser.rule.unit === 'd';
      const later = sibs.filter(x => x.date > b.date && !['paid', 'played'].includes(flKind(x.status)));
      dd.innerHTML = `<span>${esc(freq ? flRepLabel(freq, sibs[0].date, ser.rule) : 'Series')} · show ${i + 1} of ${sibs.length}${sibs.length ? `, through ${esc(fmtD(sibs[sibs.length - 1].date))}` : ''}</span>
        <span class="ssx-fl-mact">${freq && !picks ? '<button type="button" class="btn small" data-fl-sermore>+ 4 more dates</button>' : ''}<button type="button" class="btn small" data-fl-seradd>+ Add a date</button>${later.length ? `<button type="button" class="btn small" data-fl-serend>End after this show</button>` : ''}</span>`;
      const more = dd.querySelector('[data-fl-sermore]');
      if (more) more.onclick = async () => {
        more.disabled = true; more.textContent = 'Adding…';
        const have = new Set(sibs.map(x => x.date)), lastD = sibs[sibs.length - 1].date;
        const add = flRepDates(sibs[0].date, freq, 52, ser.rule).filter(d => !have.has(d) && d > lastD).slice(0, 4);
        const made = add.length ? await flSeriesAdd(sibs, add) : 0;
        toast(!add.length ? 'No more dates fit this repeat' : made < add.length ? `Added ${made} of ${add.length} dates. Check your connection and try again.` : `Added ${made} more date${made === 1 ? '' : 's'}`);
        if (made < add.length) { more.disabled = false; more.textContent = '+ 4 more dates'; }
      };
      const addB = dd.querySelector('[data-fl-seradd]');
      addB.onclick = () => {
        if (dd.querySelector('.ssx-fl-addd')) { dd.querySelector('.ssx-fl-addd input').focus(); return; }
        const w = document.createElement('span'); w.className = 'ssx-fl-addd';
        w.innerHTML = `<input type="date" aria-label="New date for this series"><button type="button" class="btn small primary">Add</button>`;
        dd.append(w); const [inp, go] = w.children; setTimeout(() => { const pb = w.querySelector('.pick-btn'); pb ? pb.click() : inp.focus(); }, 60);
        go.onclick = async () => {
          const v = inp.value;
          if (!v) { toast('Pick a date first, then tap Add'); return; }
          if (flSeriesOf(b.seriesId).some(x => x.date === v)) { toast('That date is already in this series'); return; }
          go.disabled = true; go.textContent = 'Adding…';
          const made = await flSeriesAdd(flSeriesOf(b.seriesId), [v]);
          if (made) { toast(`Added ${fmtD(v)} to this series`); w.remove(); } else { toast("Couldn't add that date. Check your connection and try again."); go.disabled = false; go.textContent = 'Add'; }
        };
      };
      const end = dd.querySelector('[data-fl-serend]'); if (end) end.onclick = async () => {
        if (!end.dataset.armed) { end.dataset.armed = '1'; end.textContent = `Remove the ${later.length} later date${later.length === 1 ? '' : 's'}? Tap again`; setTimeout(() => { if (end.isConnected) { delete end.dataset.armed; end.textContent = 'End after this show'; } }, 4000); return; }
        end.disabled = true; end.textContent = 'Removing…';
        const gone = []; let fail = 0;
        for (const x of later) { try { if (x.gcal && x.gcal.eventId) await dropEvent(x.gcal); } catch (_) {} try { await st.db.collection('bookings').doc(x.id).delete(); gone.push(x); } catch (_) { fail++; } }
        if (fail) { toast(`Couldn't remove ${fail} of the later dates. Check your connection and try again.`); end.disabled = false; end.textContent = 'End after this show'; delete end.dataset.armed; return; }
        toast(`Ended the series after ${fmtD(b.date)}. ${gone.length} later date${gone.length === 1 ? ' was' : 's were'} removed.`, async () => {
          for (const x of gone) { const { id: xid, gcal: _g, ...d } = x; await st.db.collection('bookings').doc(xid).set(d).catch(() => {}); setTimeout(() => { try { syncBookingEvent(xid, { ...d, id: xid }); } catch (_) {} }, 800); }
          toast(`Put back ${gone.length} date${gone.length === 1 ? '' : 's'}`);
        });
      };
    } else {
      const r = b.repeatReq, n = r.count || FL_REP_DEF[r.freq] || 6, cu = r.freq === 'cu';
      dd.innerHTML = `<span>${cu ? `They asked for a custom schedule, about ${n} dates. Their message has the details.` : `They asked for this ${esc(FL_REP_NAMES[r.freq] || r.freq)}, about ${n} dates (${esc(flRepLabel(r.freq, b.date))}).`}</span><span class="ssx-fl-mact"><button type="button" class="btn small primary" data-fl-serset>${cu ? 'Set up the dates' : `Set up all ${n} dates`}</button>${cu ? '' : '<button type="button" class="btn small" data-fl-sercu>Change the schedule</button>'}</span>`;
      const openCustom = () => {
        const bk = flBk().find(y => y.id === b.id) || b; window.bookingForm(bk);
        setTimeout(() => { const s = document.querySelector('#ssx-fl-repf'); if (s) { s.value = 'cu'; s.dispatchEvent(new Event('change')); const c = document.querySelector('#ssx-fl-repc'); if (c) { c.value = n; c.dispatchEvent(new Event('input')); } s.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 350);
      };
      if (cu) dd.querySelector('[data-fl-serset]').onclick = openCustom;
      else {
        dd.querySelector('[data-fl-serset]').onclick = async e => { const x = e.currentTarget; x.disabled = true; x.textContent = 'Adding…'; const { id: _i, ...data } = flBk().find(y => y.id === b.id) || b; await flSeriesCreate(b.id, data, r.freq, n); };
        dd.querySelector('[data-fl-sercu]').onclick = openCustom;
      }
    }
    dateDd.after(dt, dd);
  }
  /* -- every pop-up: a bar that stays at the top with Back (when there's somewhere to go back to) and Close, so you never scroll to the bottom to get out.
     Close taps the pop-up's own Cancel / Done / Close button, so anything those do first (like asking about unsaved changes) still happens. Short Save / Done rows stay pinned to the bottom. */
  function flSheetBar(root) {
    if (!root.closest('#sheetRoot') || root.querySelector(':scope > .ssx-sbar')) return;
    const bar = document.createElement('div'); bar.className = 'ssx-sbar';
    const back = root.querySelector(':scope > .sheet-back'); if (back) bar.append(back);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ssx-sx'; x.setAttribute('aria-label', 'Close'); x.title = 'Close';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    x.onclick = () => {
      const own = root.querySelector(':scope > .actions [data-cancel], :scope > .actions [data-close]') || [...root.querySelectorAll('[data-cancel], [data-close]')].pop();
      if (own) own.click(); else if (typeof window.close === 'function') window.close();
    };
    bar.append(x); root.prepend(bar);
    const cs = getComputedStyle(root); root.style.setProperty('--ssx-px', cs.paddingLeft); root.style.setProperty('--ssx-pt', cs.paddingTop);
    const acts = [...root.children].filter(c => c.classList.contains('actions')).pop();
    if (acts && acts.offsetHeight && acts.offsetHeight <= 110) acts.classList.add('ssx-stick');
  }
  /* -- tasks on Google Calendar: any task with a due date can go on your calendar as an all-day reminder (shown as free time, so it never blocks
     your availability). Checking it off in the app marks the calendar entry "✓ Done"; changing the due date or name moves or renames it; deleting the
     task takes it off. Saved on the booking as taskCal[taskKey] = { eventId, calendarId, link, sig }. */
  const FL_TC = { busy: new Set(), at: 0, warned: 0, t: 0 };
  const flTcSig = t => `${t.due || ''}|${t.label || ''}|${t.done ? 1 : 0}`;
  function flTcBody(b, t) {
    const show = typeof bookingName === 'function' ? bookingName(b) : showName(b);
    return {
      summary: `${t.done ? '✓ Done' : 'To do'}: ${t.label}`, allDay: true, startTime: `${t.due}T00:00:00`, endTime: `${addDays(t.due, 1)}T00:00:00`,
      availability: 'AVAILABILITY_FREE', notificationLevel: 'NONE', timeZone: tz(),
      description: [`Task for ${show}${b.date ? ` (show ${fmtD(b.date)})` : ''}.`, 'Check it off in Set & Settled: https://setnsettled.com'].join('\n'),
    };
  }
  function flTcErr(e) {
    const c = e && e.code; if (Date.now() - FL_TC.warned < 8000) return; FL_TC.warned = Date.now();
    toast(c === 'server_not_connected' ? 'Connect Google Calendar in Settings → Google account to put tasks on your calendar'
      : c === 'approval_required' || c === 'not_in_manifest' || c === 'not_granted' ? 'Allow Google Calendar for this page to put tasks on your calendar'
      : "Couldn't update Google Calendar. Check your connection and try again.");
  }
  async function flTcMcp() { const m = (typeof G !== 'undefined' && G.mcp) || await window.claude.use('mcp'); if (!m) throw { code: 'server_not_connected' }; return m; }
  async function flTcAdd(bid, key) {
    const b = flBk().find(x => x.id === bid), t = b && tasksOf(b).find(x => x.key === key); if (!t) return false;
    if (!t.due) { toast('Pick a due date first, then put it on your calendar'); return false; }
    try {
      const mcp = await flTcMcp(), cal = (typeof G !== 'undefined' && G.writeTo) || '';
      const r = await mcp.callTool(GC, 'create_event', { ...(cal ? { calendarId: cal } : {}), ...flTcBody(b, t) }); const p = r.payload || {}, ev = p.event || p;
      if (!ev.id) throw { code: 'tool_error' };
      await window.patch('bookings', bid, { taskCal: { [key]: { eventId: ev.id, calendarId: cal, link: ev.htmlLink || '', sig: flTcSig(t) } } });
      toast(`On your Google Calendar for ${fmtD(t.due)}`); return true;
    } catch (e) { console.error(e); flTcErr(e); return false; }
  }
  async function flTcDrop(bid, key, quiet) {
    const b = flBk().find(x => x.id === bid), ge = b && (b.taskCal || {})[key]; if (!ge) return true;
    const ok = await dropEvent(ge);
    if (ok) { await window.patch('bookings', bid, { taskCal: { [key]: null } }); if (!quiet) toast('Taken off Google Calendar'); }
    else if (!quiet) toast("Couldn't take it off Google Calendar yet. Check your connection and try again.");
    return ok;
  }
  // keep calendar entries in step with the app: done / not done, due date, name, deleted tasks, lost shows
  async function flTaskCalSweep() {
    if (Date.now() - FL_TC.at < 1500) { if (!FL_TC.t) FL_TC.t = setTimeout(() => { FL_TC.t = 0; flTaskCalSweep(); }, 1600); return; }
    FL_TC.at = Date.now();
    let list = []; try { list = flBk().filter(b => b.taskCal && Object.values(b.taskCal).some(Boolean)); } catch (_) { return; }
    for (const b of list) {
      const ts = tasksOf(b), lost = flKind(b.status) === 'lost';
      for (const [key, ge] of Object.entries(b.taskCal)) {
        if (!ge || !ge.eventId || FL_TC.busy.has(b.id + key)) continue;
        const t = ts.find(x => x.key === key);
        if (!t || !t.due || lost) { FL_TC.busy.add(b.id + key); flTcDrop(b.id, key, true).finally(() => FL_TC.busy.delete(b.id + key)); continue; }
        const sig = flTcSig(t); if (sig === ge.sig) continue;
        FL_TC.busy.add(b.id + key);
        (async () => {
          try {
            const mcp = await flTcMcp();
            await mcp.callTool(GC, 'update_event', { eventId: ge.eventId, ...(ge.calendarId ? { calendarId: ge.calendarId } : {}), ...flTcBody(b, t) });
            await window.patch('bookings', b.id, { taskCal: { [key]: { ...ge, sig } } });
          } catch (e) {
            if (e && e.code === 'tool_error' && /not.?found|deleted|gone|404|410/i.test(String(e.message || ''))) await window.patch('bookings', b.id, { taskCal: { [key]: null } });
            else { console.error(e); flTcErr(e); }
          } finally { FL_TC.busy.delete(b.id + key); }
        })();
      }
    }
  }
  // the task screen gets a Google Calendar row; the booking's checklist shows a small calendar mark on tasks that are on it
  function flTaskCal(root) {
    const bid = root.dataset && root.dataset.booking;
    if (bid) {
      const b = flBk().find(x => x.id === bid), tc = (b && b.taskCal) || {};
      root.querySelectorAll('[data-topen]').forEach(x => {
        const v = x.dataset.topen, key = v.slice(v.indexOf(':') + 1), on = !!(tc[key] && tc[key].eventId), mark = x.querySelector('.ssx-tcmark');
        if (on && !mark) x.insertAdjacentHTML('beforeend', ' <span class="ssx-tcmark" title="On Google Calendar" aria-label="On Google Calendar">📅</span>');
        if (!on && mark) mark.remove();
      });
      return;
    }
    const dIn = root.querySelector('#ts-d'), lab = root.querySelector('#ts-l'), cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key;
    if (!dIn || !lab || !cur || !/^t:/.test(cur)) return;
    const rest = cur.slice(2), i = rest.indexOf(':'), tbid = rest.slice(0, i), key = rest.slice(i + 1);
        const b = flBk().find(x => x.id === tbid), ge = b && (b.taskCal || {})[key], on = !!(ge && ge.eventId), state = on ? 'on' : 'off';
    let box = root.querySelector('.ssx-tcal:not(.ssx-gt)');
    // new calendar reminders aren't offered anymore (Google Tasks covers it); a task that already has one can still take it off
    if (!on) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'f ssx-tcal'; (dIn.closest('.f') || dIn).after(box); }
    if (box.dataset.state === state) return; box.dataset.state = state;
    box.innerHTML = `<label>Google Calendar</label><div class="ssx-tcal-row">${on
      ? `<span class="note">On your calendar as an all-day reminder.${ge.link ? ` <a href="${esc(ge.link)}" target="_blank" rel="noopener">Open in Google Calendar</a>` : ''}</span><button type="button" class="btn small" data-tc-off>Take it off</button>`
      : `<button type="button" class="btn small" data-tc-on>＋ Put on Google Calendar</button><span class="note">An all-day reminder on the due date. Checking it off here marks it done there.</span>`}</div>`;
    const on1 = box.querySelector('[data-tc-on]'), off1 = box.querySelector('[data-tc-off]');
    if (on1) on1.onclick = async () => {
      if (dIn.value && dIn.value !== (tasksOf(b).find(x => x.key === key) || {}).due) { toast('Tap Save first so the new due date is used, then put it on your calendar'); return; }
      on1.disabled = true; on1.textContent = 'Adding…'; const ok = await flTcAdd(tbid, key);
      if (!ok) { on1.disabled = false; on1.textContent = '＋ Put on Google Calendar'; } else delete box.dataset.state;
    };
    if (off1) off1.onclick = async () => { off1.disabled = true; off1.textContent = 'Removing…'; await flTcDrop(tbid, key); delete box.dataset.state; off1.disabled = false; off1.textContent = 'Take it off'; };
  }  
  /* -- Reach-outs: a log of every time you contact someone (email, DM, text, call, in person) with a follow-up date, saved on the contact.
     Works for anyone in People, with or without a booking. Follow-ups that are due show at the top of People and on Home.
     Emails the app sends to someone in People (not about a booking) and "Copy & open DM" are logged for you. */
  const FL_RO_VIA = [['email', 'Email'], ['dm', 'Instagram DM'], ['text', 'Text'], ['call', 'Call'], ['inperson', 'In person'], ['other', 'Other']];
  const FL_RO_ST = [['waiting', 'Waiting to hear back'], ['replied', 'They replied'], ['interested', 'Interested'], ['notnow', 'Not right now (stops follow-ups)'], ['booked', 'Booked a show (stops follow-ups)'], ['noreply', 'Never replied (stops follow-ups)']];
  const FL_RO_OPEN = new Set(['waiting', 'replied', 'interested']);
  const flRoList = c => (Array.isArray(c && c.outreach) ? c.outreach : []).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id)));
  const flRoVia = k => (FL_RO_VIA.find(x => x[0] === k) || [, 'Other'])[1];
  const flRoSt = k => (FL_RO_ST.find(x => x[0] === k) || [, k])[1];
  const flRoShort = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return d; } };
  const flRoNext = c => { for (const l of flRoList(c)) { const b = l.bookingId && bk().find(x => x.id === l.bookingId), open = FL_RO_OPEN.has(l.status || 'waiting') && !(b && !['lead', 'pitched'].includes(stat(b))); if (l.follow && open && !l.fuDone) return l; if (l.fuDone || !open) return null; } return null; }; // newest open follow-up; a newer reach-out without a date doesn't hide it; ends once its show is Confirmed or Lost
  const flRoDue = () => S.contacts.map(c => { const l = flRoNext(c); return l && l.follow <= todayStr() ? { c, l } : null; }).filter(Boolean).sort((a, b) => a.l.follow.localeCompare(b.l.follow));
  async function flRoSave(cid, list) { const ok = await window.patch('contacts', cid, { outreach: list, updatedAt: new Date().toISOString() }); if (!ok) toast("Couldn't save that. Check your connection and try again."); return ok; }
  async function flRoAdd(cid, e, quiet) {
    const c = contact(cid); if (!c) return false;
    const entry = { id: 'ro' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: todayStr(), via: 'email', note: '', status: 'waiting', follow: addDays(todayStr(), 7), ...e };
    const ok = await flRoSave(cid, [entry, ...flRoList(c)].slice(0, 200)); if (ok && !quiet) toast(`Logged: ${flRoVia(entry.via)} to ${cName(c)}`); return ok;
  }
  async function flRoEdit(cid, id, upd) { const c = contact(cid); if (!c) return; return flRoSave(cid, flRoList(c).map(x => x.id === id ? { ...x, ...upd } : x)); }
  // log automatically: emails sent from the app to someone in People (not about a booking), and Instagram DMs opened from a contact
  function flRoWrap() {
    const gs = window.gmailSend;
    if (typeof gs === 'function' && !gs.__flRo) {
      const w = async function (o) {
        const r = await gs.apply(this, arguments);
        try {
          const ob = o && o.bookingId && bk().find(x => x.id === o.bookingId), pitch = !!(ob && ['lead', 'pitched'].includes(stat(ob))); // emails about a Lead or Pitched show count as reach-outs too
          if (o && (!o.bookingId || pitch)) {
            const mails = [...[].concat(o.to || []), ...[].concat(o.cc || [])].map(x => String(x).trim().toLowerCase()).filter(Boolean);
            const hit = S.contacts.filter(c => c.email && mails.includes(String(c.email).trim().toLowerCase()));
            for (const c of hit) await flRoAdd(c.id, { via: 'email', note: String(o.subject || '').slice(0, 200), ...(pitch ? { bookingId: ob.id, follow: addDays(todayStr(), ob.source === 'booking-link' ? 3 : 7) } : {}) }, true);
          }
        } catch (e) { console.error(e); }
        return r;
      };
      w.__flRo = true; window.gmailSend = w;
    }
    const sv = window.save; // a contact saved from the edit form never overwrites reach-outs logged while the form was open
    if (typeof sv === 'function' && !sv.__flRoSave) {
      const w2 = async function (col, id, data) { if (col === 'contacts' && id && data && typeof data === 'object') { const cur = contact(id); if (cur && Array.isArray(cur.outreach)) arguments[2] = { ...data, outreach: cur.outreach }; } return sv.apply(this, arguments); };
      w2.__flRoSave = true; Object.keys(sv).forEach(k => { try { w2[k] = sv[k]; } catch (_) {} }); window.save = w2;
    }
    if (!FL.roClick) {
      FL.roClick = true;
      document.addEventListener('click', e => {
        const dm = e.target.closest && e.target.closest('#sheetRoot [data-dm]'); if (!dm) return;
        const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key; if (!cur || !/^r:/.test(cur)) return;
        const cid = cur.slice(2), c = contact(cid), last = c && flRoList(c)[0];
        if (c && !(last && last.via === 'dm' && last.at === todayStr())) setTimeout(() => flRoAdd(cid, { via: 'dm', note: 'Instagram DM' }, true), 300);
      }, true);
    }
  }
  const flRoRow = (c, l, who) => { const nx = flRoNext(c), live = !!(nx && nx.id === l.id), t = todayStr(); return `<div class="ssx-ro-row" data-ro-id="${esc(l.id)}">
      <div class="ssx-ro-main">${who ? `<button type="button" class="ssx-ro-who" data-reach="${esc(c.id)}">${esc(cName(c))}</button>` : ''}<span><b>${esc(flRoShort(l.at))}</b> · ${esc(flRoVia(l.via))}${l.note && l.note !== flRoVia(l.via) ? ` · ${esc(l.note)}` : ''}</span>
        <span class="note">${live ? `${l.follow < t ? 'Follow-up was due' : l.follow === t ? 'Follow up today' : 'Follow up'} ${esc(flRoShort(l.follow))}` : l.fuDone ? 'Follow-up done' : esc(flRoSt(l.status || 'waiting'))}</span></div>
      <div class="ssx-ro-act">${who ? `<button type="button" class="btn small" data-reach="${esc(c.id)}">Open</button>` : `<select data-ro-st aria-label="How it went">${FL_RO_ST.map(([k, n]) => `<option value="${k}" ${k === (l.status || 'waiting') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`}
        ${live && who ? `<button type="button" class="btn small" data-ro-snooze title="Push the follow-up a week">+1 week</button><button type="button" class="btn small" data-ro-clear title="Mark this follow-up done">Done</button>` : ''}
        ${who ? '' : `<button type="button" class="x" data-ro-del aria-label="Delete this reach-out">×</button>`}</div></div>`; };
  function flRoWire(box, cidOf) {
    box.onclick = async e => {
      const row = e.target.closest('[data-ro-id]'); if (!row) return; const id = row.dataset.roId, cid = cidOf(row);
      const l = flRoList(contact(cid)).find(x => x.id === id); if (!l) return;
      if (e.target.closest('[data-ro-snooze]')) { const base = l.follow > todayStr() ? l.follow : todayStr(); if (await flRoEdit(cid, id, { follow: addDays(base, 7) })) toast(`Follow up ${flRoShort(addDays(base, 7))}`); }
      else if (e.target.closest('[data-ro-clear]')) { if (await flRoEdit(cid, id, { follow: '', fuDone: todayStr() })) toast('Follow-up done'); }
      else if (e.target.closest('[data-ro-del]')) {
        const c = contact(cid), before = flRoList(c);
        if (l.g && l.g.id) flGtCall('delete_task', { taskId: l.g.id }).catch(() => {}); // its Google Task goes too
        if (await flRoSave(cid, before.filter(x => x.id !== id))) toast('Reach-out deleted', async () => { await flRoSave(cid, before.map(x => x.id === id ? { ...x, g: null } : x)); toast('Put back'); });
      }
    };
    box.onchange = async e => {
      const s = e.target.closest('[data-ro-st]'); if (!s) return; const row = s.closest('[data-ro-id]'), cid = cidOf(row), v = s.value;
      if (await flRoEdit(cid, row.dataset.roId, { status: v, ...(FL_RO_OPEN.has(v) ? {} : { follow: '' }) })) toast(flRoSt(v));
    };
  }
  // the Contact screen: log a reach-out, see the history, change how it went
  function flRoSheet(root) {
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key; if (!cur || !/^r:/.test(cur) || !root.querySelector('[data-editc]')) return;
    const cid = cur.slice(2), c = contact(cid); if (!c) return;
    let box = root.querySelector('.ssx-ro');
    if (!box) {
      box = document.createElement('div'); box.className = 'card ssx-ro';
      box.innerHTML = `<div class="head"><h3>Reach-outs</h3><button type="button" class="btn small" data-ro-add>＋ Log a reach-out</button></div>
        <div class="ssx-ro-form" hidden>
          <div class="f"><label>How</label><div class="chips" role="group" aria-label="How you reached out">${FL_RO_VIA.map(([k, n], i) => `<button type="button" class="chip" data-ro-via="${k}" aria-pressed="${i === 0}">${esc(n)}</button>`).join('')}</div></div>
          <div class="frow"><div class="f"><label for="ssx-ro-at">When</label><input type="date" id="ssx-ro-at"></div><div class="f"><label for="ssx-ro-fu">Follow up on</label><input type="date" id="ssx-ro-fu"></div></div>
          <div class="f"><label for="ssx-ro-note">What it was about (optional)</label><input id="ssx-ro-note" maxlength="200" placeholder="e.g. Pitched a Friday in March"></div>
          <div class="actions"><button type="button" class="btn" data-ro-cancel>Cancel</button><button type="button" class="btn primary" data-ro-save>Save</button></div>
        </div><p class="note ssx-ro-sum"></p><div class="ssx-ro-list"></div>`;
      const slot = root.querySelector('.ssx-cp-slot'), acts = [...root.children].filter(x => x.classList.contains('actions')).pop(); slot ? slot.prepend(box) : acts ? acts.before(box) : root.append(box);
      const form = box.querySelector('.ssx-ro-form'), addB = box.querySelector('[data-ro-add]');
      addB.onclick = () => { form.hidden = false; addB.hidden = true; box.querySelector('#ssx-ro-at').value = todayStr(); box.querySelector('#ssx-ro-fu').value = addDays(todayStr(), 7); box.querySelector('#ssx-ro-note').focus(); };
      box.querySelectorAll('[data-ro-via]').forEach(b => b.onclick = () => box.querySelectorAll('[data-ro-via]').forEach(x => x.setAttribute('aria-pressed', String(x === b))));
      box.querySelector('[data-ro-cancel]').onclick = () => { form.hidden = true; addB.hidden = false; };
      box.querySelector('[data-ro-save]').onclick = async e => {
        const btn = e.currentTarget, via = (box.querySelector('[data-ro-via][aria-pressed="true"]') || {}).dataset?.roVia || 'other';
        const at = box.querySelector('#ssx-ro-at').value || todayStr(), fu = box.querySelector('#ssx-ro-fu').value;
        if (fu && fu < at) { toast('The follow-up date is before the reach-out. Pick a later date or clear it.'); return; }
        btn.disabled = true; const ok = await flRoAdd(cid, { via, at, follow: fu, note: box.querySelector('#ssx-ro-note').value.trim().slice(0, 200) });
        btn.disabled = false; if (ok) { form.hidden = true; addB.hidden = false; box.querySelector('#ssx-ro-note').value = ''; }
      };
      flRoWire(box.querySelector('.ssx-ro-list'), () => cid);
    }
    const list = flRoList(c), sig = JSON.stringify(list); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    const n = flRoNext(c);
    box.querySelector('.ssx-ro-sum').textContent = list.length ? `Last reached out ${flRoShort(list[0].at)} by ${flRoVia(list[0].via).toLowerCase()}.${n ? ` Follow up ${flRoShort(n.follow)}.` : ''}` : 'Nothing logged yet. Log each time you email, DM, text or call so follow-ups never slip.';
    box.querySelector('.ssx-ro-list').innerHTML = list.slice(0, 20).map(l => flRoRow(c, l, false)).join('') + (list.length > 20 ? `<p class="note">Showing the latest 20 of ${list.length}.</p>` : '');
  }
  // follow-ups that are due: top of People and on Home; a "Follow up" note on people in the list
  function flRoDueCards() {
    const due = flRoDue(), sig = JSON.stringify(due.map(x => [x.c.id, x.l.id, x.l.follow, x.l.status]));
    { const old = document.querySelector('section[data-view="home"] > .ssx-ro-due'); if (old) old.remove(); } // Home shows follow-ups in Next moves now
    for (const [view, max] of [['contacts', 50]]) {
      const sec = document.querySelector(`section[data-view="${view}"]`); if (!sec) continue;
      let card = sec.querySelector(':scope > .ssx-ro-due');
      if (!due.length) { if (card) card.remove(); continue; }
      if (!card) {
        card = document.createElement('div'); card.className = 'card ssx-ro-due';
        const anchor = view === 'contacts' ? sec.querySelector('#contactList') && sec.querySelector('#contactList').closest('.card') : sec.querySelector(':scope > #welcome');
        if (anchor && view === 'contacts') anchor.before(card); else if (anchor) anchor.after(card); else sec.prepend(card);
        flRoWire(card, row => row.dataset.roCid);
      }
      if (card.dataset.sig === sig) continue; card.dataset.sig = sig;
      card.innerHTML = `<div class="head"><h3>Follow-ups due</h3><span class="note">${due.length} ${due.length === 1 ? 'person' : 'people'}</span></div>
        <div class="ssx-ro-list">${due.slice(0, max).map(({ c, l }) => flRoRow(c, l, true).replace('class="ssx-ro-row"', `class="ssx-ro-row" data-ro-cid="${esc(c.id)}"`)).join('')}</div>
        ${due.length > max ? `<button type="button" class="btn small" data-goto="contacts">See all ${due.length} in People</button>` : ''}`;
    }
    const lst = document.getElementById('contactList'); if (!lst) return;
    lst.querySelectorAll('[data-open-contact]').forEach(b => {
      const c = contact(b.dataset.openContact), n = c && flRoNext(c), main = b.querySelector('.main'); if (!main) return;
      const txt = n ? `${n.follow < todayStr() ? 'Follow-up due' : 'Follow up'} ${flRoShort(n.follow)}` : '', pill = main.querySelector('.ssx-ro-pill');
      if (!txt) { if (pill) pill.remove(); return; }
      const cls = 'ssx-ro-pill' + (n.follow <= todayStr() ? ' due' : '');
      if (pill) { if (pill.textContent !== txt) pill.textContent = txt; if (pill.className !== cls) pill.className = cls; } else main.insertAdjacentHTML('beforeend', `<span class="${cls}">${esc(txt)}</span>`);
    });
  }  
  /* -- Google Tasks: put any task in your Google Tasks ("Set & Settled" list) and tick it off in either place. Ticking it in Google marks it
     done here; ticking it here marks it done there. Name and due-date changes follow. Deleting the task here (or the show being lost) removes it
     there; deleting it in Google just unlinks it. Optional: add every new task with a due date automatically.
     Saved on the booking as taskG[taskKey] = { id, link, sig, at } ({ off: true } = you took it out, so it isn't added again automatically). */
  const FL_GT = { list: '', busy: new Set(), at: 0, t: 0, pulled: 0, pulling: false, warned: 0, auto: false, cfg: {}, loaded: false, askKey: '' };
  const flGtSig = t => `${t.due || ''}|${t.label || ''}|${t.done ? 1 : 0}`;
  async function flGtMcp() { const m = await window.claude.use('mcp'); if (!m) throw { code: 'server_not_connected' }; return m; }
  function flGtErr(e) {
    const c = e && e.code; if (Date.now() - FL_GT.warned < 8000) return; FL_GT.warned = Date.now();
    toast(c === 'server_not_connected' || c === 'needs_reauth' ? 'Connect Google Tasks in Settings → Google account to use Google Tasks'
      : c === 'rate_limited' ? 'Google Tasks is busy. The app will try again in a minute.' : "Couldn't reach Google Tasks. Check your connection and try again.");
  }
  async function flGtCall(tool, input) {
    const mcp = await flGtMcp();
    if (!FL_GT.list) FL_GT.list = ((await mcp.callTool('Google Tasks', 'get_list', {})).payload || {}).id || '';
    if (!FL_GT.list) throw { code: 'unavailable' };
    try { return (await mcp.callTool('Google Tasks', tool, { ...input, listId: FL_GT.list })).payload || {}; }
    catch (e) { // the list was renamed or deleted in Google: make a fresh one and try once more
      if (e && e.code === 'tool_error' && /not_app_list|not_found/.test(String(e.message || ''))) { FL_GT.list = ''; FL_GT.list = ((await mcp.callTool('Google Tasks', 'get_list', {})).payload || {}).id || ''; return (await mcp.callTool('Google Tasks', tool, { ...input, listId: FL_GT.list })).payload || {}; }
      throw e;
    }
  }
  const flGtBody = (b, t) => ({ title: t.label, due: t.due || '', completed: !!t.done, notes: `For ${typeof bookingName === 'function' ? bookingName(b) : showName(b)}${b.date ? ` (show ${fmtD(b.date)})` : ''}.\nOpen Set & Settled: https://setnsettled.com` });
  async function flGtAdd(bid, key, quiet) {
    const b = flBk().find(x => x.id === bid), t = b && tasksOf(b).find(x => x.key === key); if (!t) return false;
    const mk = bid + ':' + key; FL_GT.made = FL_GT.made || {}; if (FL_GT.made[mk] && Date.now() - FL_GT.made[mk] < 600000) return true; // never send the same task twice
    try {
      FL_GT.made[mk] = Date.now();
      const r = (await flGtFindSame(t.label, t.due)) || await flGtCall('create_task', flGtBody(b, t)); // already in Google Tasks? link it instead of adding a copy
      if (!r.id) { delete FL_GT.made[mk]; throw { code: 'unavailable' }; }
      await window.patch('bookings', bid, { taskG: { [key]: { id: r.id, link: r.link || '', sig: flGtSig(t), at: r.updated || new Date().toISOString() } } });
      if (!quiet) toast('Added to Google Tasks'); return true;
    } catch (e) { console.error(e); if (!quiet) flGtErr(e); return false; }
  }
  async function flGtRemove(bid, key, quiet, keepOff) {
    const b = flBk().find(x => x.id === bid), g = b && (b.taskG || {})[key];
    try { if (g && g.id) await flGtCall('delete_task', { taskId: g.id }); }
    catch (e) { console.error(e); if (!quiet) flGtErr(e); return false; }
    await window.patch('bookings', bid, { taskG: { [key]: keepOff ? { id: '', link: '', off: true } : null } });
    if (!quiet) toast('Taken out of Google Tasks'); return true;
  }
  // app → Google: push changes; add new tasks automatically when that's turned on
  async function flGtSweep() {
    if (Date.now() - FL_GT.at < 1500) { if (!FL_GT.t) FL_GT.t = setTimeout(() => { FL_GT.t = 0; flGtSweep(); }, 1600); return; }
    FL_GT.at = Date.now();
    let books = []; try { books = flBk(); } catch (_) { return; }
    let added = 0;
    for (const b of books) {
      const tg = b.taskG || {}, lost = flKind(b.status) === 'lost', ts = tasksOf(b);
      for (const [key, g] of Object.entries(tg)) {
        if (!g || !g.id || FL_GT.busy.has(b.id + key)) continue;
        const t = ts.find(x => x.key === key), k2 = b.id + key;
        if (!t || lost) { FL_GT.busy.add(k2); flGtRemove(b.id, key, true).finally(() => FL_GT.busy.delete(k2)); continue; }
        const sig = flGtSig(t); if (sig === g.sig) continue;
        FL_GT.busy.add(k2);
        flGtCall('update_task', { taskId: g.id, ...flGtBody(b, t) })
          .then(r => window.patch('bookings', b.id, { taskG: { [key]: { ...g, sig, at: r.updated || new Date().toISOString() } } }))
          .catch(async e => { if (e && e.code === 'tool_error' && /not_found/.test(String(e.message || ''))) await window.patch('bookings', b.id, { taskG: { [key]: null } }); else { console.error(e); flGtErr(e); } })
          .finally(() => FL_GT.busy.delete(k2));
      }
      if (FL_GT.auto && !lost && added < 10) for (const t of ts) {
        if (added >= 10) break;
        if (t.done || !t.due || t.due < todayStr() || (tg[t.key] && (tg[t.key].id || tg[t.key].off)) || FL_GT.busy.has(b.id + t.key)) continue; // taken out or deleted in Google: don't add it back
        added++; const k2 = b.id + t.key; FL_GT.busy.add(k2); flGtAdd(b.id, t.key, true).finally(() => FL_GT.busy.delete(k2));
      }
    }
  }
  // Google → app: ticked or unticked in Google Tasks
  async function flGtPull(force) {
    if (FL_GT.pulling || (!force && (document.hidden || Date.now() - FL_GT.pulled < 180000))) return;
    let mapped = []; try { mapped = flBk().flatMap(b => Object.entries(b.taskG || {}).filter(([, g]) => g && g.id).map(([key, g]) => ({ b, key, g }))); } catch (_) { return; }
    if (!mapped.length) return;
    FL_GT.pulling = true; FL_GT.pulled = Date.now();
    try {
      const items = (await flGtCall('list_tasks', {})).tasks || [], byId = new Map(items.map(x => [x.id, x]));
      for (const { b, key, g } of mapped) {
        const it = byId.get(g.id), t = tasksOf(flBk().find(x => x.id === b.id) || b).find(x => x.key === key);
        if (!t) continue;
        if (!it || it.deleted) { await window.patch('bookings', b.id, { taskG: { [key]: { id: '', link: '', off: true } } }); continue; } // deleted in Google: just unlink
        const gDone = it.status === 'completed'; if (gDone === !!t.done || String(it.updated || '') <= String(g.at || '')) continue;
        await setTask(b.id, key, gDone); syncChecks(b.id, key, gDone);
        await window.patch('bookings', b.id, { taskG: { [key]: { ...g, sig: flGtSig({ ...t, done: gDone }), at: it.updated } } });
        toast(`${gDone ? 'Done' : 'Not done'} in Google Tasks: ${t.label}`);
      }
    } catch (e) { console.error(e); } finally { FL_GT.pulling = false; }
  }
  function flGtHook() {
    if (FL.gtHooked || !st.db) return; FL.gtHooked = true;
    st.db.doc('settings/gtasks').onSnapshot(s => { FL_GT.cfg = (s.exists && s.data()) || {}; FL_GT.loaded = true; FL_GT.auto = !!FL_GT.cfg.auto; if (FL_GT.auto) flGtSweep(); flGtSettings(); }, () => {});
    setInterval(() => flGtPull(), 60000); window.addEventListener('focus', () => flGtPull(true)); setTimeout(() => flGtPull(true), 4000);
  }
  // the task screen: a Google Tasks row; the checklist shows ☑︎ on tasks that are in Google Tasks
  function flGtRow(root) {
    const bid = root.dataset && root.dataset.booking;
    if (bid) {
      const b = flBk().find(x => x.id === bid), tg = (b && b.taskG) || {};
      root.querySelectorAll('[data-topen]').forEach(x => {
        const v = x.dataset.topen, key = v.slice(v.indexOf(':') + 1), on = !!(tg[key] && tg[key].id), mark = x.querySelector('.ssx-gtmark');
        if (on && !mark) x.insertAdjacentHTML('beforeend', ' <span class="ssx-gtmark" title="In Google Tasks" aria-label="In Google Tasks">☑︎</span>');
        if (!on && mark) mark.remove();
      });
      return;
    }
    const dIn = root.querySelector('#ts-d'), lab = root.querySelector('#ts-l'), cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key;
    if (!dIn || !lab || !cur || !/^t:/.test(cur) || !FL_GT.loaded) return;
    const rest = cur.slice(2), i = rest.indexOf(':'), tbid = rest.slice(0, i), key = rest.slice(i + 1);
    // the "add automatically" choice shows once, on the first task opened; after that it lives in Settings → Google
    if (FL_GT.askKey && FL_GT.askKey !== cur) FL_GT.askKey = '';
    if (!FL_GT.cfg.asked && !FL_GT.askKey) { FL_GT.askKey = cur; FL_GT.cfg = { ...FL_GT.cfg, asked: true }; flGtSave({}).catch(() => {}); }
    const ask = FL_GT.askKey === cur;
    let box = root.querySelector('.ssx-gt');
    if (!box) { box = document.createElement('div'); box.className = 'f ssx-tcal ssx-gt'; const after = root.querySelector('.ssx-tcal:not(.ssx-gt)') || dIn.closest('.f') || dIn; after.after(box); }
    const b = flBk().find(x => x.id === tbid), t = b && tasksOf(b).find(x => x.key === key), g = b && (b.taskG || {})[key], on = !!(g && g.id);
    const past = !!(t && t.due && t.due < todayStr()), manual = !FL_GT.auto || past; // automatic mode never adds past-due tasks, so those keep the button
    const state = [on ? 'on' : 'off', FL_GT.auto ? 'A' : '', ask ? 'Q' : '', t && t.due, t && t.done ? 1 : 0].join('|');
    if (box.dataset.state === state) return; box.dataset.state = state;
    const autoNote = !t || !t.due ? 'Goes to Google Tasks on its own once it has a due date.' : t.done ? 'Done tasks aren\u2019t added to Google Tasks.' : 'Adding it to Google Tasks…';
    box.innerHTML = `<label>Google Tasks</label><div class="ssx-tcal-row">${on
      ? `<span class="note">In your Google Tasks ("Set & Settled" list). Tick it off there or here.${g.link ? ` <a href="${esc(g.link)}" target="_blank" rel="noopener">Open in Google Tasks</a>` : ''}</span>${FL_GT.auto ? '' : '<button type="button" class="btn small" data-gt-off>Take it out</button>'}`
      : manual
        ? `<button type="button" class="btn small" data-gt-on>＋ Add to Google Tasks</button><span class="note">${FL_GT.auto ? 'Past-due tasks aren\u2019t added on their own. Add this one if you still need it.' : 'Shows in Google Tasks and on Google Calendar\u2019s task list. Tick it off in either place.'}</span>`
        : `<span class="note">${autoNote}</span>`}</div>${ask
      ? `<label class="note ssx-gt-auto"><input type="checkbox" data-gt-auto ${FL_GT.auto ? 'checked' : ''}> Add every task with a due date to Google Tasks automatically</label><span class="note">You can change this anytime in Settings → Google.</span>`
      : ''}`;
    const on1 = box.querySelector('[data-gt-on]'), off1 = box.querySelector('[data-gt-off]'), auto = box.querySelector('[data-gt-auto]');
    if (on1) on1.onclick = async () => {
      if (dIn.value && dIn.value !== (t || {}).due) { toast('Tap Save first so the new due date is used, then add it to Google Tasks'); return; }
      if (!(await flGtReady())) return;
      on1.disabled = true; on1.textContent = 'Adding…'; const ok = await flGtAdd(tbid, key);
      if (!ok) { on1.disabled = false; on1.textContent = '＋ Add to Google Tasks'; } else delete box.dataset.state;
    };
    if (off1) off1.onclick = async () => { off1.disabled = true; off1.textContent = 'Removing…'; await flGtRemove(tbid, key, false, true); delete box.dataset.state; off1.disabled = false; off1.textContent = 'Take it out'; };
    if (auto) auto.onchange = () => flGtSetAuto(auto);
  }
  const flGtSave = patch => Promise.resolve(window.save('settings', 'gtasks', { ...FL_GT.cfg, ...patch }));
  const flGtReady = async () => !(window.SS && typeof SS.ensureGoogle === 'function') || await SS.ensureGoogle('tasks');
  // one switch used by both the first-time question and Settings → Google
  async function flGtSetAuto(chk) {
    const want = chk.checked;
    if (want && !(await flGtReady())) { chk.checked = false; return; }
    try {
      if (!(await flGtSave({ auto: want, asked: true }))) throw 0;
      FL_GT.cfg = { ...FL_GT.cfg, auto: want, asked: true }; FL_GT.auto = want; if (want) flGtSweep();
      toast(want ? 'Tasks with a due date will go to Google Tasks on their own' : 'Add tasks to Google Tasks one at a time from each task');
    } catch (e) { chk.checked = !want; toast("Couldn't save that. Check your connection and try again."); }
    document.querySelectorAll('#sheetRoot .ssx-gt').forEach(x => delete x.dataset.state); flGtSettings(); flSoon();
  }
  // Settings → Google gets a Google Tasks card with the same switch
  function flGtSettings() {
    if (FL_GT.askKey && !document.querySelector('#sheetRoot #ts-d')) FL_GT.askKey = '';
    const grp = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="google"]'); if (!grp) return;
    let card = document.getElementById('ssx-gt-set');
    if (!card) {
      card = document.createElement('div'); card.className = 'card'; card.id = 'ssx-gt-set';
      card.innerHTML = `<div class="head"><h3>Google Tasks</h3></div>
        <label class="ssx-gt-auto"><input type="checkbox" data-gt-auto> Add every task with a due date to Google Tasks automatically</label>
        <p class="note">On: tasks with an upcoming due date go to a "Set & Settled" list in Google Tasks on their own. Off: add the ones you want from each task.</p>`;
      const chk0 = card.querySelector('[data-gt-auto]'); chk0.onchange = () => flGtSetAuto(chk0);
    }
    if (card.parentElement !== grp) grp.appendChild(card);
    const chk = card.querySelector('[data-gt-auto]'); if (document.activeElement !== chk && chk.checked !== FL_GT.auto) chk.checked = FL_GT.auto;
  }
  /* -- Booking form you can arrange: every field can sit in the main form, under "More details", or be hidden; fields can be renamed and
     reordered; performers can add their own fields (saved on each booking as cf_<id>). The starting layout and wording follow the artist type.
     Settings → Bookings → "Booking form". Saved in settings/bookingform { fields: [{ key, place, label? }], custom: [{ id, label, type, options }] }. */
  const FL_BF = [
    // key, default label, wrapper finder, half width, required
    ['title', 'Show / event name', r => r.querySelector('#b-title'), 0, 1],
    ['status', 'Status', r => r.querySelector('#b-status'), 1, 1],
    ['date', 'Date', r => r.querySelector('#b-date'), 1, 1],
    ['times', 'Set times', null, 0, 0],
    ['venue', 'Venue / festival', r => r.querySelector('#b-venue'), 1, 0],
    ['promoter', 'Promoter / collective', r => r.querySelector('#b-promo'), 1, 0],
    ['city', 'City', r => r.querySelector('#b-city'), 1, 0],
    ['address', 'Event address', r => r.querySelector('#b-addr'), 1, 0],
    ['fee', 'Fee ($)', r => r.querySelector('#b-fee'), 1, 0],
    ['payDue', 'Payment due on', r => r.querySelector('#b-due'), 1, 0],
    ['incomeType', 'Income type', r => r.querySelector('#b-inctype'), 0, 0],
    ['pay', "How you'd like to be paid", r => r.querySelector('#b-pp'), 0, 0],
    ['media', 'Media person', r => r.querySelector('#b-media'), 1, 0],
    ['ticket', 'Ticket / event link', r => r.querySelector('#b-tix'), 1, 0],
    ['drive', 'Media folder (Google Drive)', r => r.querySelector('#b-drive'), 0, 0],
    ['notes', 'Notes', r => r.querySelector('#b-notes'), 0, 0]];
  const FL_BF_TYPES = [['text', 'Short text'], ['long', 'Long text'], ['number', 'Number'], ['yesno', 'Yes / No'], ['choice', 'Dropdown']];
  const flBfDefault = group => group === 'service'
    ? [['title', 'main'], ['status', 'main'], ['date', 'main'], ['times', 'main'], ['promoter', 'main'], ['address', 'main'], ['fee', 'main'], ['payDue', 'main'], ['venue', 'more'], ['city', 'more'], ['incomeType', 'more'], ['pay', 'more'], ['notes', 'more'], ['media', 'hidden'], ['ticket', 'hidden'], ['drive', 'hidden']]
    : [['title', 'main'], ['status', 'main'], ['date', 'main'], ['times', 'main'], ['venue', 'main'], ['promoter', 'main'], ['city', 'main'], ['fee', 'main'], ['payDue', 'main'], ['address', 'more'], ['incomeType', 'more'], ['pay', 'more'], ['media', 'more'], ['ticket', 'more'], ['drive', 'more'], ['notes', 'more']];
  // wording that follows the artist type (your own renames always win)
  const flBfWords = group => group === 'service'
    ? { title: 'Appointment', times: 'Appointment time', venue: 'Studio / location', promoter: 'Client', address: 'Address', fee: 'Price ($)', ph: 'e.g. Half-sleeve session with Ana', start: 'Starts', end: 'Ends', view: { Venue: 'Location', Promoter: 'Client', Fee: 'Price' } }
    : group === 'movement' || group === 'other' ? { times: 'Performance times', start: 'Starts', end: 'Ends', view: {} } : { view: {} };
  const FL_BFS = { cfg: null, hooked: false, edit: '' };
  const flBfCustom = () => ((FL_BFS.cfg || {}).custom || []).filter(c => c && c.id && c.label);
  // the full ordered list: saved layout (or the artist type's default), new built-in fields added at their default place, deleted custom fields dropped
  function flBfList() {
    const g = flArtist().group, def = flBfDefault(g), cust = flBfCustom(), saved = FL_BFS.cfg && Array.isArray(FL_BFS.cfg.fields) ? FL_BFS.cfg.fields : null;
    const ok = k => FL_BF.some(f => f[0] === k) || (k.startsWith('cf:') && cust.some(c => 'cf:' + c.id === k));
    let list = saved ? saved.filter(x => x && ok(x.key)).map(x => ({ key: x.key, place: ['main', 'more', 'hidden'].includes(x.place) ? x.place : 'more', label: x.label || '' })) : def.map(([key, place]) => ({ key, place, label: '' }));
    for (const [key, place] of def) if (!list.some(x => x.key === key)) list.push({ key, place, label: '' });
    for (const c of cust) if (!list.some(x => x.key === 'cf:' + c.id)) list.push({ key: 'cf:' + c.id, place: 'more', label: '' });
    for (const x of list) { const f = FL_BF.find(y => y[0] === x.key); if (f && f[4]) x.place = 'main'; }
    return list;
  }
  function flBfLabel(x) {
    if (x.label) return x.label;
    if (x.key.startsWith('cf:')) return (flBfCustom().find(c => 'cf:' + c.id === x.key) || {}).label || 'Field';
    return flBfWords(flArtist().group)[x.key] || (FL_BF.find(f => f[0] === x.key) || [])[1] || x.key;
  }
  const flBfSave = patch => { FL_BFS.cfg = { ...(FL_BFS.cfg || {}), ...patch }; return st.db ? st.db.doc('settings/bookingform').set(FL_BFS.cfg).catch(() => toast("Couldn't save your booking form. Check your connection and try again.")) : null; };
  function flBfHook() {
    if (FL_BFS.hooked || !st.db) return; FL_BFS.hooked = true;
    st.db.doc('settings/bookingform').onSnapshot(s => { FL_BFS.cfg = s.exists ? s.data() : null; flSoon(); }, () => {});
  }
  // set a label's own text without removing buttons inside it (Income type has "Edit types")
  function flBfSetLabel(lab, text) {
    if (!lab) return; const t = [...lab.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
    if (t) { if (t.__flBf == null) t.__flBf = t.nodeValue; const v = text + (lab.children.length ? ' ' : ''); if (t.nodeValue !== v) t.nodeValue = v; } else if (!lab.children.length) lab.textContent = text;
  }
  function flBfCustomEl(c, b) {
    const id = 'cf-' + c.id, k = 'cf_' + c.id, v = b && b[k] != null ? b[k] : '', wrap = document.createElement('div'); wrap.className = 'f ssx-bf-cf';
    const opts = list => list.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('');
    const input = c.type === 'long' ? `<textarea id="${id}" data-k="${k}" style="min-height:64px">${esc(v)}</textarea>`
      : c.type === 'yesno' ? `<select id="${id}" data-k="${k}"><option value=""></option>${opts(['Yes', 'No'])}</select>`
      : c.type === 'choice' ? `<select id="${id}" data-k="${k}"><option value=""></option>${opts([...(c.options || []), ...(v && !(c.options || []).includes(v) ? [v] : [])])}</select>`
      : `<input id="${id}" data-k="${k}" type="${c.type === 'number' ? 'number' : 'text'}" ${c.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}">`;
    wrap.innerHTML = `<label for="${id}">${esc(c.label)}</label>${input}`;
    if (c.type !== 'long') wrap.classList.add('ssx-bf-half');
    return wrap;
  }
  // pieces that belong right after a field and must travel with it
  const flBfAttach = (root, blocks) => {
    const after = (key, els) => { const a = blocks[key]; if (!a || !a.isConnected) return; let at = a; for (const e of els) { if (!e) continue; if (at.nextElementSibling !== e) at.after(e); at = e; } };
    const note = [...root.querySelectorAll('p.note')].find(p => /Venues and promoters come from People/.test(p.textContent));
    const epk = root.querySelector('#ssx-b-epk'), prefill = root.querySelector('.ssx-prefill');
    after('date', [root.querySelector('#ssx-fl-rep'), root.querySelector('#b-warn')]);
    after('times', [epk && epk.closest('label')]);
    after('promoter', [root.querySelector('#b-talkWrap'), flArtist().group === 'service' ? null : note]);
    if (note && flArtist().group === 'service') note.hidden = true;
    if (prefill && blocks.venue && prefill.parentElement !== blocks.venue) blocks.venue.appendChild(prefill);
    after('pay', [root.querySelector('#b-paidBlock')]);
  };
  // lay out the booking form the performer's way
  function flBookForm(root) {
    const ti = root.querySelector('#b-title'), ve = root.querySelector('#b-venue'), acts = root.querySelector('.actions'); if (!ti || !ve || !acts) return;
    const g = flArtist().group, W = flBfWords(g);
    if (root.__flBf) { flBfAttach(root, root.__flBf); flBfWords2(root, W); return; }
    const blocks = {};
    for (const [key, , find] of FL_BF) { if (!find) continue; const el = find(root), w = el && el.closest('.f'); if (w) blocks[key] = w; }
    const ts = root.querySelector('#b-ts'), tRow = ts && ts.closest('.frow');
    if (tRow) {
      const tw = document.createElement('div'); tw.className = 'ssx-bf-times'; tRow.before(tw); tw.appendChild(tRow);
      const gl = root.querySelector('#b-gcal'), gLab = gl && gl.closest('label'), am = [...root.querySelectorAll('p.note')].find(p => /Start times before 6 AM/.test(p.textContent));
      if (gLab) tw.appendChild(gLab); if (am) tw.appendChild(am); blocks.times = tw;
    }
    const b = FL.formB || {}, list = flBfList();
    for (const c of flBfCustom()) blocks['cf:' + c.id] = flBfCustomEl(c, b);
    // containers: main grid where the title was, "More details" above the buttons, hidden holder (hidden fields keep their saved values)
    const main = document.createElement('div'); main.className = 'ssx-bf-grid'; (blocks.title || ti).before(main);
    const old = root.querySelector('.ssx-more'), det = document.createElement('details'); det.className = 'ssx-more ssx-bf-more';
    det.innerHTML = '<summary>More details <span class="note"></span></summary><div class="ssx-morebody ssx-bf-grid"></div>';
    const more = det.querySelector('.ssx-morebody'), hid = document.createElement('div'); hid.className = 'ssx-bf-hidden'; hid.hidden = true;
    for (const x of list) {
      const el = blocks[x.key]; if (!el) continue;
      const f = FL_BF.find(y => y[0] === x.key); if (f && f[3]) el.classList.add('ssx-bf-half');
      el.dataset.bf = x.key; (x.place === 'main' ? main : x.place === 'hidden' ? hid : more).appendChild(el);
      if (x.key !== 'times') flBfSetLabel(el.querySelector('label'), flBfLabel(x));
    }
    if (old) old.remove();
    root.querySelectorAll('.frow').forEach(r => { if (!r.closest('.ssx-bf-times') && !r.querySelector('input, select, textarea, button')) r.remove(); });
    acts.before(det); acts.before(hid);
    const inMore = list.filter(x => x.place === 'more' && blocks[x.key]);
    det.hidden = !inMore.length;
    const filled = inMore.some(x => [...blocks[x.key].querySelectorAll('input:not([type=checkbox]), textarea, select:not(#b-inctype)')].some(i => i.value && i.value !== '__new__') || blocks[x.key].querySelector('[aria-pressed="true"]'));
    det.querySelector('summary .note').textContent = inMore.slice(0, 4).map(x => flBfLabel(x).replace(/\s*\(.*\)$/, '').toLowerCase()).join(', ') + (inMore.length > 4 ? '…' : '') + (filled ? ' · has info' : '');
    root.__flBf = blocks; flBfAttach(root, blocks); flBfWords2(root, W);
  }
  // type wording inside fields (placeholders, start/end, client choices)
  function flBfWords2(root, W) {
    if (W.ph) { const t = root.querySelector('#b-title'); if (t && t.placeholder !== W.ph) t.placeholder = W.ph; }
    const tw = root.querySelector('.ssx-bf-times');
    if (tw && W.start) { const ls = tw.querySelectorAll('.frow > .f > label'); if (ls[0]) flBfSetLabel(ls[0], W.start); if (ls[1]) flBfSetLabel(ls[1], W.end); }
    const gl = root.querySelector('#b-gcal'), gLab = gl && gl.closest('label');
    if (gLab && W.start) for (const n of gLab.childNodes) if (n.nodeType === 3 && /this set/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace('this set', 'this');
    if (flArtist().group === 'service') {
      const p = root.querySelector('#b-promo');
      if (p) { let ch = 0; for (const o of p.options) { const v = o.value === '' ? 'No client picked' : o.value === '__new__' ? 'Add new client…' : null; if (v && o.textContent !== v) { o.textContent = v; ch = 1; } } if (ch && typeof p._sync === 'function') p._sync(); }
      const h = root.querySelector('#ssx-fl-new h4'); if (h && /^New promoter or collective$/.test(h.textContent)) h.textContent = 'New client';
      const epk = root.querySelector('#ssx-b-epk'); if (epk) epk.closest('label').hidden = true;
    }
  }
  // the opened booking shows your own fields, and the type's wording
  function flBfView(root) {
    const bid = root.dataset && root.dataset.booking, dl = bid && root.querySelector('dl.kv'); if (!dl) return;
    const b = flBk().find(x => x.id === bid); if (!b) return;
    const list = flBfList(), cust = flBfCustom(), W = flBfWords(flArtist().group);
    const rows = list.filter(x => x.key.startsWith('cf:') && x.place !== 'hidden').map(x => { const c = cust.find(y => 'cf:' + y.id === x.key), v = b['cf_' + (c || {}).id]; return c && v !== '' && v != null ? [flBfLabel(x), String(v)] : null; }).filter(Boolean);
    const sig = JSON.stringify([rows, list.map(x => x.key + x.place + x.label), flArtist().group]); if (dl.dataset.bf === sig) return; dl.dataset.bf = sig;
    dl.querySelectorAll('.ssx-bf-v').forEach(x => x.remove());
    const dts = [...dl.children].filter(x => x.tagName === 'DT');
    const byText = t => dts.find(d => (d.__flBfT || d.textContent.trim()) === t);
    // built-in rows: your label (or the type's word), hidden fields with nothing in them drop out
    for (const [key, txt] of [['venue', 'Venue'], ['promoter', 'Promoter'], ['city', 'City'], ['address', 'Address'], ['fee', 'Fee'], ['media', 'Media'], ['ticket', 'Tickets'], ['notes', 'Notes']]) {
      const dt = byText(txt); if (!dt) continue; if (dt.__flBfT == null) dt.__flBfT = txt;
      const x = list.find(y => y.key === key), dd = dt.nextElementSibling, empty = dd && dd.textContent.trim() === '—';
      dt.hidden = !!(x && x.place === 'hidden' && empty); if (dd) dd.hidden = dt.hidden;
      const lab = x && x.label ? x.label.replace(/\s*\(\$\)$/, '') : W.view[txt] || txt; if (dt.textContent !== lab) dt.textContent = lab;
    }
    if (!rows.length) return;
    const notes = byText('Notes'), html = rows.map(([l, v]) => `<dt class="ssx-bf-v">${esc(l)}</dt><dd class="ssx-bf-v" style="white-space:pre-wrap">${esc(v)}</dd>`).join('');
    if (notes) notes.insertAdjacentHTML('beforebegin', html); else dl.insertAdjacentHTML('beforeend', html);
  }
  // Settings → Bookings: the "Booking form" card
  function flBfSettings(force) {
    const grp = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="bookings"]'); if (!grp || !FL.cfg) return;
    let card = document.getElementById('ssx-bf-set');
    if (!card) { card = document.createElement('div'); card.className = 'card'; card.id = 'ssx-bf-set'; }
    if (card.parentElement !== grp) grp.appendChild(card);
    const list = flBfList(), cust = flBfCustom(), A = flArtist(), sig = JSON.stringify([list, cust, A.group, FL_BFS.edit]);
    if (!force && (card.dataset.sig === sig || card.contains(document.activeElement) && document.activeElement.matches('input, select'))) return; card.dataset.sig = sig;
    const kind = (FL_PRESETS[flPresetFor(A.group, A.kind)] || {}).title || 'default';
    const row = (x, i) => {
      const f = FL_BF.find(y => y[0] === x.key), req = f && f[4], c = x.key.startsWith('cf:') && cust.find(y => 'cf:' + y.id === x.key), name = flBfLabel(x);
      const seg = req ? '<span class="note">Always shown</span>' : `<div class="seg ssx-bf-place">${[['main', 'Main'], ['more', 'More'], ['hidden', 'Hidden']].map(([p, l]) => `<button type="button" data-bf-place="${p}" aria-pressed="${x.place === p}">${l}</button>`).join('')}</div>`;
      return `<div class="ssx-bf-row" data-bf-key="${esc(x.key)}" data-place="${x.place}">
        <div class="ssx-bf-name">${FL_BFS.edit === x.key ? `<input class="ssx-bf-ren" value="${esc(name)}" maxlength="40" aria-label="New name for ${esc(name)}">` : `<span>${esc(name)}</span>`}${c ? ` <span class="note">${esc((FL_BF_TYPES.find(t => t[0] === c.type) || [])[1] || '')}</span>` : ''}</div>
        ${seg}
        <div class="ssx-bf-tools">${x.key !== 'times' ? `<button type="button" class="x" data-bf-ren aria-label="Rename ${esc(name)}" title="Rename"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>` : ''}<button type="button" class="x" data-bf-up aria-label="Move ${esc(name)} up" ${i ? '' : 'disabled'}>↑</button><button type="button" class="x" data-bf-down aria-label="Move ${esc(name)} down" ${i < list.length - 1 ? '' : 'disabled'}>↓</button>${c ? `<button type="button" class="x" data-bf-del aria-label="Delete ${esc(name)}" title="Delete">×</button>` : ''}</div></div>`;
    };
    card.innerHTML = `<div class="head"><h3>Booking form</h3></div>
      <p class="note">Choose what shows on your booking form: up top, under "More details", or hidden. Use ↑ ↓ to change the order, the pencil to rename, and add your own fields. Hidden fields keep anything already saved.</p>
      <div class="ssx-bf-list">${list.map(row).join('')}</div>
      <div class="ssx-bf-add"><div class="ssx-fl-k">Add your own field</div>
        <div class="ssx-bf-addrow"><input id="ssx-bf-nl" maxlength="40" placeholder="Field name, e.g. Placement, Dress code, Hours" aria-label="New field name">
        <select id="ssx-bf-nt" aria-label="Kind of field">${FL_BF_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <input id="ssx-bf-no" hidden maxlength="300" placeholder="Choices, separated by commas" aria-label="Dropdown choices">
        <div class="ssx-row"><button type="button" class="btn small primary" data-bf-add>Add field</button></div></div>
      <div class="ssx-row ssx-bf-foot"><button type="button" class="linkbtn" data-bf-reset>Reset to the ${esc(kind)} layout</button><span class="note">Your own fields stay.</span></div>`;
    const keyOf = el => el.closest('[data-bf-key]').dataset.bfKey, put = list2 => flBfSave({ fields: list2.map(({ key, place, label }) => ({ key, place, ...(label ? { label } : {}) })) });
    card.querySelectorAll('[data-bf-place]').forEach(b => b.onclick = () => { const k = keyOf(b), l = flBfList(); const x = l.find(y => y.key === k); x.place = b.dataset.bfPlace; put(l); flBfSettings(true); });
    card.querySelectorAll('[data-bf-up],[data-bf-down]').forEach(b => b.onclick = () => { const k = keyOf(b), l = flBfList(), i = l.findIndex(y => y.key === k), j = i + (b.hasAttribute('data-bf-up') ? -1 : 1); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; put(l); flBfSettings(true); const nb = card.querySelector(`[data-bf-key="${CSS.escape(k)}"] ${b.hasAttribute('data-bf-up') ? '[data-bf-up]' : '[data-bf-down]'}`); if (nb && !nb.disabled) nb.focus(); });
    card.querySelectorAll('[data-bf-ren]').forEach(b => b.onclick = () => { FL_BFS.edit = keyOf(b); flBfSettings(true); const i = card.querySelector('.ssx-bf-ren'); if (i) { i.focus(); i.select(); } });
    const ren = card.querySelector('.ssx-bf-ren');
    if (ren) { const done = keep => { if (!FL_BFS.edit) return; const k = FL_BFS.edit; FL_BFS.edit = ''; if (keep) { const l = flBfList(), x = l.find(y => y.key === k), v = ren.value.trim().replace(/\s+/g, ' '); if (k.startsWith('cf:') && v) { flBfSave({ custom: flBfCustom().map(c => 'cf:' + c.id === k ? { ...c, label: v } : c) }); } else { x.label = v; put(l); } } flBfSettings(true); };
      ren.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); }; ren.onblur = () => done(true); }
    card.querySelectorAll('[data-bf-del]').forEach(b => b.onclick = () => flTwoTap(b, 'Delete?', () => {
      const k = keyOf(b), was = { custom: flBfCustom(), fields: flBfList() };
      flBfSave({ custom: was.custom.filter(c => 'cf:' + c.id !== k), fields: was.fields.filter(x => x.key !== k).map(({ key, place, label }) => ({ key, place, ...(label ? { label } : {}) })) }); flBfSettings(true);
      toast('Field deleted. Answers already saved on bookings are kept.', () => { flBfSave({ custom: was.custom, fields: was.fields.map(({ key, place, label }) => ({ key, place, ...(label ? { label } : {}) })) }); flBfSettings(true); });
    }));
    const nt = card.querySelector('#ssx-bf-nt'), no = card.querySelector('#ssx-bf-no'), nl = card.querySelector('#ssx-bf-nl');
    nt.onchange = () => { no.hidden = nt.value !== 'choice'; };
    const add = () => {
      const label = nl.value.trim().replace(/\s+/g, ' '); if (!label) { toast('Type a name for the field'); nl.focus(); return; }
      const options = nt.value === 'choice' ? [...new Set(no.value.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 30) : [];
      if (nt.value === 'choice' && options.length < 2) { toast('Add at least two choices, separated by commas'); no.focus(); return; }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), l = flBfList();
      l.push({ key: 'cf:' + id, place: 'main', label: '' });
      FL_BFS.cfg = { ...(FL_BFS.cfg || {}), custom: [...flBfCustom(), { id, label, type: nt.value, options }] }; put(l);
      flBfSettings(true); toast(`Added "${label}" to your booking form`);
    };
    card.querySelector('[data-bf-add]').onclick = add; nl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    const rs = card.querySelector('[data-bf-reset]');
    rs.onclick = () => flTwoTap(rs, 'Tap again to reset', () => { const was = flBfList(); flBfSave({ fields: [] }); FL_BFS.cfg.fields = null; flBfSettings(true); toast('Booking form reset', () => { put(was); flBfSettings(true); }); });
  }
  /* -- Settings → Bookings: "Booking request page" card. Which built-in questions show, and which of your own fields to ask (and require).
     Saved in settings/bookingform.page { hide: [...], ask: [ids], req: [ids] }; the book function sends it to the public page. */
  const FL_BKP = [['phone', 'Their phone'], ['address', 'Address'], ['fee', 'Their offer / budget'], ['title', 'Their job title'], ['ig', 'Their Instagram'], ['site', 'Their website'], ['vsite', 'Venue website'], ['cap', 'Venue capacity'], ['ages', 'Ages'], ['lineup', 'Who else is playing'], ['etype', 'Type of private event'], ['guests', 'Guest count'], ['rep', 'Does it repeat?']];
  function flBkpSettings(force) {
    const grp = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="bookings"]'); if (!grp || !FL.cfg) return;
    let card = document.getElementById('ssx-bkp-set');
    if (!card) { card = document.createElement('div'); card.className = 'card'; card.id = 'ssx-bkp-set'; }
    const bf = document.getElementById('ssx-bf-set'); if (bf && bf.parentElement === grp) { if (bf.nextElementSibling !== card) bf.after(card); } else if (card.parentElement !== grp) grp.appendChild(card);
    const P = (FL_BFS.cfg || {}).page || {}, hide = new Set(P.hide || []), ask = new Set(P.ask || []), req = new Set(P.req || []), cust = flBfCustom(), svc = flArtist().group === 'service';
    const sig = JSON.stringify([P, cust, svc]); if (!force && card.dataset.sig === sig) return; card.dataset.sig = sig;
    const items = svc ? FL_BKP.filter(([k]) => ['phone', 'address', 'fee'].includes(k)) : FL_BKP;
    card.innerHTML = `<div class="head"><h3>Booking request page</h3></div>
      <p class="note">What people answer when they request you through your booking link.${svc ? ' As a service provider, your page skips venue and event questions and asks about the appointment.' : ''} Name, email, date, time${svc ? '' : ', event name'} and city are always asked.</p>
      <div class="ssx-fl-k">Questions on your page</div>
      <div class="ssx-bkp-list">${items.map(([k, l]) => `<label class="ssx-bkp-opt"><input type="checkbox" data-bkp-show="${k}" ${hide.has(k) ? '' : 'checked'}> ${esc(l)}</label>`).join('')}</div>
      <div class="ssx-fl-k">Your own fields</div>
      ${cust.length ? `<div class="ssx-bkp-own">${cust.map(c => `<div class="ssx-bkp-row"><span>${esc(c.label)}</span><label class="ssx-bkp-opt"><input type="checkbox" data-bkp-ask="${esc(c.id)}" ${ask.has(c.id) ? 'checked' : ''}> Ask on my page</label><label class="ssx-bkp-opt"><input type="checkbox" data-bkp-req="${esc(c.id)}" ${req.has(c.id) ? 'checked' : ''} ${ask.has(c.id) ? '' : 'disabled'}> Required</label></div>`).join('')}</div>
        <p class="note">Their answers fill in those fields on the booking.</p>` : '<p class="note">Add your own fields in "Booking form" above, then choose which ones to ask here.</p>'}`;
    const save = () => {
      const p = { hide: [...card.querySelectorAll('[data-bkp-show]')].filter(x => !x.checked).map(x => x.dataset.bkpShow).concat([...hide].filter(k => !items.some(([i]) => i === k))),
        ask: [...card.querySelectorAll('[data-bkp-ask]')].filter(x => x.checked).map(x => x.dataset.bkpAsk), req: [] };
      p.req = [...card.querySelectorAll('[data-bkp-req]')].filter(x => x.checked && p.ask.includes(x.dataset.bkpReq)).map(x => x.dataset.bkpReq);
      flBfSave({ page: p }); flBkpSettings(true); toast('Saved. Your booking page shows this right away.');
    };
    card.querySelectorAll('input[type="checkbox"]').forEach(x => x.onchange = save);
  }
  /* -- W-9 in Financials: fills the official IRS Form W-9 (Rev. March 2024, saved in the site as /fw9.pdf) in the browser.
     Name, business, tax type and address are saved in settings/w9; the SSN or EIN is typed each time, never saved, and cleared after. */
  const FL_W9 = { saved: null, hooked: false };
  const FL_W9_CLS = [['ind', 'Individual / sole proprietor', 0], ['llc', 'LLC', 5], ['ccorp', 'C corporation', 1], ['scorp', 'S corporation', 2], ['part', 'Partnership', 3], ['trust', 'Trust / estate', 4], ['other', 'Other', 6]];
  function flW9Card() {
    if (!FL_W9.hooked && st.db) { FL_W9.hooked = true; st.db.doc('settings/w9').onSnapshot(s => { FL_W9.saved = s.exists ? s.data() : null; }, () => {}); }
    const sec = document.querySelector('section[data-view="money"]'), fin = document.getElementById('ssx-fin'); if (!sec || !fin) return;
    let card = document.getElementById('ssx-w9'); if (card && card.previousElementSibling === fin) return;
    if (!card) {
      card = document.createElement('div'); card.className = 'card ssx'; card.id = 'ssx-w9';
      card.innerHTML = `<div class="ssx-head"><div><h3>W-9 for venues and clients</h3><p class="note">Venues, promoters and clients often ask for a W-9 before they pay you. Fill it in once here and download a ready-to-send copy of the official IRS form any time. Your Social Security or EIN number is never saved.</p></div></div>
        <div class="ssx-row"><button type="button" class="btn primary small" data-w9-go>Make my W-9</button><a class="linkbtn" href="https://www.irs.gov/forms-pubs/about-form-w-9" target="_blank" rel="noopener">About Form W-9 (IRS)</a></div>`;
      card.querySelector('[data-w9-go]').onclick = () => flW9Sheet();
    }
    fin.after(card);
  }
  function flW9Sheet() {
    if (typeof sheet !== 'function') return;
    const k = (() => { try { return S.invset || {}; } catch (_) { return {}; } })(), p = (() => { try { return S.profile || {}; } catch (_) { return {}; } })(), w = FL_W9.saved || {};
    const addr = String(k.address || '').split('\n').map(x => x.trim()).filter(Boolean);
    const v = { name: w.name ?? (k.name || p.myName || ''), biz: w.biz ?? (k.biz && k.biz !== (k.name || p.myName) ? k.biz : ''), cls: w.cls || 'ind', llc: w.llc || '', other: w.other || '', street: w.street ?? (addr[0] || ''), city: w.city ?? addr.slice(1).join(', ') };
    const f = (id, label, val, attrs = '') => `<div class="f"><label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" ${attrs}></div>`;
    sheet(`<h3>Your W-9</h3>
      <p class="note">This fills in the official IRS Form W-9. Check each line before you send it. If you're not sure which tax type you are, most solo performers are "Individual / sole proprietor". This isn't tax advice.</p>
      ${f('w9-name', '1. Your name (as shown on your tax return)', v.name, 'maxlength="80" autocomplete="name"')}
      ${f('w9-biz', '2. Business name, if different <i class="note">(optional)</i>', v.biz, 'maxlength="80"')}
      <div class="f"><label for="w9-cls">3. Tax type</label><select id="w9-cls">${FL_W9_CLS.map(([c, l]) => `<option value="${c}" ${c === v.cls ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f" id="w9-llcw" ${v.cls === 'llc' ? '' : 'hidden'}><label for="w9-llc">How your LLC is taxed</label><select id="w9-llc"><option value="">Choose…</option>${[['C', 'C corporation'], ['S', 'S corporation'], ['P', 'Partnership']].map(([c, l]) => `<option value="${c}" ${c === v.llc ? 'selected' : ''}>${c}: ${l}</option>`).join('')}</select><span class="note">A one-person LLC taxed as a sole proprietor picks "Individual / sole proprietor" above instead.</span></div>
      <div id="w9-otherw" ${v.cls === 'other' ? '' : 'hidden'}>${f('w9-other', 'Describe it', v.other, 'maxlength="60"')}</div>
      ${f('w9-street', '5. Street address', v.street, 'maxlength="100" autocomplete="street-address"')}
      ${f('w9-city', '6. City, state and ZIP', v.city, 'maxlength="80" placeholder="e.g. San Diego, CA 92104"')}
      ${f('w9-req', "Who's asking for it <i class=\"note\">(optional: their name and address)</i>", '', 'maxlength="100"')}
      <div class="f ssx-w9-tin"><label>Part I. Your taxpayer number</label>
        <div class="seg" id="w9-kind"><button type="button" data-tk="ssn" aria-pressed="${w.tinKind !== 'ein'}">SSN</button><button type="button" data-tk="ein" aria-pressed="${w.tinKind === 'ein'}">EIN</button></div>
        <input id="w9-tin" inputmode="numeric" maxlength="11" autocomplete="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="${w.tinKind === 'ein' ? '12-3456789' : '123-45-6789'}" aria-label="Taxpayer number">
        <span class="note">Only goes into the PDF you download. Never saved in Set &amp; Settled, and the box clears after.</span></div>
      <div class="f"><label>Signature</label>
        <div class="seg" id="w9-sig"><button type="button" data-s="draw" aria-pressed="true">Draw</button><button type="button" data-s="type" aria-pressed="false">Type</button><button type="button" data-s="none" aria-pressed="false">Sign it myself later</button></div>
        <div id="w9-draw" class="ssx-w9-pad"><canvas width="600" height="140" aria-label="Sign here with your finger or mouse"></canvas><button type="button" class="linkbtn" data-w9-clear>Clear</button></div>
        <div id="w9-typew" hidden><input id="w9-type" maxlength="60" placeholder="Type your full name" aria-label="Typed signature"></div>
        <span class="note">Dated today, ${esc(new Date().toLocaleDateString('en-US'))}. By signing you certify the statements in Part II of the form.</span></div>
      <p class="note ssx-w9-err" id="w9-err" role="alert"></p>
      <div class="actions"><button class="btn" data-cancel>Close</button><button class="btn primary" data-w9-make>Download W-9 (PDF)</button></div>`, root => {
      const $ = s => root.querySelector(s), cls = $('#w9-cls'), tin = $('#w9-tin');
      root.querySelector('[data-cancel]').onclick = () => { tin.value = ''; close(); };
      cls.onchange = () => { $('#w9-llcw').hidden = cls.value !== 'llc'; $('#w9-otherw').hidden = cls.value !== 'other'; };
      let kind = w.tinKind === 'ein' ? 'ein' : 'ssn';
      $('#w9-kind').querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { kind = b.dataset.tk; $('#w9-kind').querySelectorAll('[data-tk]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); tin.placeholder = kind === 'ein' ? '12-3456789' : '123-45-6789'; fmt(); });
      const fmt = () => { const d = tin.value.replace(/\D/g, '').slice(0, 9); tin.value = kind === 'ein' ? (d.length > 2 ? d.slice(0, 2) + '-' + d.slice(2) : d) : [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-'); };
      tin.addEventListener('input', fmt);
      // signature pad
      let sig = 'draw', inked = false; const cv = $('#w9-draw canvas'), cx = cv.getContext('2d');
      cx.lineWidth = 3; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#111';
      const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
      let down = false;
      cv.addEventListener('pointerdown', e => { down = true; inked = true; cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); cx.beginPath(); cx.moveTo(x, y); e.preventDefault(); });
      cv.addEventListener('pointermove', e => { if (!down) return; const [x, y] = pt(e); cx.lineTo(x, y); cx.stroke(); e.preventDefault(); });
      ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { down = false; }));
      $('[data-w9-clear]').onclick = () => { cx.clearRect(0, 0, cv.width, cv.height); inked = false; };
      $('#w9-sig').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { sig = b.dataset.s; $('#w9-sig').querySelectorAll('[data-s]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#w9-draw').hidden = sig !== 'draw'; $('#w9-typew').hidden = sig !== 'type'; });
      const err = t => { const e = $('#w9-err'); e.textContent = t || ''; if (t) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      $('[data-w9-make]').onclick = async () => {
        const btn = $('[data-w9-make]'), val = s => $(s).value.trim(), digits = tin.value.replace(/\D/g, '');
        const d = { name: val('#w9-name'), biz: val('#w9-biz'), cls: cls.value, llc: $('#w9-llc').value, other: val('#w9-other'), street: val('#w9-street'), city: val('#w9-city'), tinKind: kind };
        if (!d.name) { $('#w9-name').focus(); return err('Add your name (line 1).'); }
        if (d.cls === 'llc' && !d.llc) { $('#w9-llc').focus(); return err('Pick how your LLC is taxed.'); }
        if (!d.street || !d.city) { (d.street ? $('#w9-city') : $('#w9-street')).focus(); return err('Add your street address and your city, state and ZIP (lines 5 and 6).'); }
        if (digits.length !== 9) { tin.focus(); return err(`Type your full ${kind === 'ein' ? 'EIN' : 'Social Security number'} (9 digits).`); }
        if (sig === 'draw' && !inked) return err('Sign in the box, or pick "Type" or "Sign it myself later".');
        if (sig === 'type' && !val('#w9-type')) { $('#w9-type').focus(); return err('Type your name as your signature.'); }
        err(''); btn.disabled = true; btn.textContent = 'Making your W-9…';
        try {
          const bytes = await flW9Pdf(d, digits, val('#w9-req'), sig === 'draw' ? cv.toDataURL('image/png') : '', sig === 'type' ? val('#w9-type') : '');
          tin.value = '';
          const file = `W-9 ${d.biz || d.name}.pdf`.replace(/[\\/:*?"<>|]+/g, ''), blob = new Blob([bytes], { type: 'application/pdf' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
          if (st.db) st.db.doc('settings/w9').set(d).catch(() => {});
          toast('W-9 downloaded. It has your full taxpayer number, so send it only to the people paying you.');
        } catch (e) {
          console.error(e);
          err(e && e.message === 'form' ? "Couldn't load the W-9 form file. Try again in a minute; if it keeps happening, the site's fw9.pdf file is missing." : "Couldn't make the PDF. Check the details and try again.");
        }
        btn.disabled = false; btn.textContent = 'Download W-9 (PDF)';
      };
    });
  }
  // fills the official form's own fields, then adds the signature and date on the signature line
  async function flW9Pdf(d, digits, req, sigPng, sigText) {
    const { PDFDocument, StandardFonts, rgb } = await window.ssxPdfLib();
    const src = await fetch('/fw9.pdf', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('form'); return r.arrayBuffer(); }).catch(e => { throw new Error(e && e.message === 'form' ? 'form' : 'form'); });
    const pdf = await PDFDocument.load(src), form = pdf.getForm(), all = form.getFields();
    try { form.deleteXFA(); } catch (_) {}
    const field = short => { const x = all.find(f => f.getName().endsWith('.' + short) || f.getName() === short); if (!x) throw new Error('field ' + short); return x; };
    const text = (short, v) => { const x = field(short); if (typeof x.setText === 'function') x.setText(String(v || '')); };
    text('f1_01[0]', d.name); text('f1_02[0]', d.biz);
    const c = FL_W9_CLS.find(x => x[0] === d.cls) || FL_W9_CLS[0], box = field(`c1_1[${c[2]}]`); if (typeof box.check === 'function') box.check();
    if (d.cls === 'llc') text('f1_03[0]', d.llc);
    if (d.cls === 'other') text('f1_04[0]', d.other);
    text('f1_07[0]', d.street); text('f1_08[0]', d.city); if (req) text('f1_09[0]', req);
    if (d.tinKind === 'ein') { text('f1_14[0]', digits.slice(0, 2)); text('f1_15[0]', digits.slice(2)); }
    else { text('f1_11[0]', digits.slice(0, 3)); text('f1_12[0]', digits.slice(3, 5)); text('f1_13[0]', digits.slice(5)); }
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(helv); form.flatten();
    const page = pdf.getPages()[0];
    // Part II signature line: "Signature of U.S. person" box runs x 120–380, y 192–216; "Date" at x 405
    if (sigPng) { const img = await pdf.embedPng(sigPng), h = 22, wd = Math.min(250, img.width * h / img.height); page.drawImage(img, { x: 122, y: 193, width: wd, height: h }); }
    else if (sigText) { const ti = await pdf.embedFont(StandardFonts.TimesRomanItalic); page.drawText(sigText, { x: 124, y: 198, size: 14, font: ti, color: rgb(0.05, 0.05, 0.15) }); }
    if (sigPng || sigText) page.drawText(new Date().toLocaleDateString('en-US'), { x: 410, y: 198, size: 10, font: helv, color: rgb(0, 0, 0) });
    return pdf.save();
  }
  // welcome email: asks the server once per visit; the server decides (new accounts only, once ever) and sends it through Resend
  function flWelcome() {
    if (FL.welcomed || !st.db) return; FL.welcomed = true;
    st.db.doc('settings/welcome').get().then(s => { if (!s.exists) return sb.functions.invoke('welcome', { body: {} }); }).catch(() => {});
  }
  /* -- Follow-ups from Reach-outs work like tasks: they show in Tasks (a "Follow-ups" group), in your reminders, and in Google Tasks
     (added on their own when "Add every task with a due date" is on, or with one tap on the person's profile). Ticking one off anywhere,
     here or in Google Tasks, clears it. The Google link is saved on the reach-out as g = { id, link, sig, at } ({ off: true } = deleted in Google). */
  const FL_FU = { at: 0, t: 0, pulled: 0, pulling: false, hooked: false };
  const flFuTitle = c => `Follow up with ${cName(c)}`;
  const flFuOpen = () => S.contacts.map(c => { const l = flRoNext(c); return l ? { c, l } : null; }).filter(Boolean).sort((a, b) => a.l.follow.localeCompare(b.l.follow));
  const flFuSub = l => { const b = l.bookingId && bk().find(x => x.id === l.bookingId); return `${flRoVia(l.via)} on ${flRoShort(l.at)}${l.note && l.note !== flRoVia(l.via) ? ' · ' + l.note : ''}${b ? ' · re: ' + bName(b) : ''}`; };
  const flFuBody = (c, l, done) => ({ title: flFuTitle(c), due: done ? '' : (l.follow || ''), completed: !!done, notes: `Last reached out ${flRoShort(l.at)} by ${flRoVia(l.via).toLowerCase()}${l.note ? `: ${l.note}` : ''}.\nOpen Set & Settled: https://setnsettled.com` });
  const flFuSig = (c, l, done) => `${done ? '' : l.follow || ''}|${cName(c)}|${done ? 1 : 0}`;
  async function flFuDone(cid, lid) {
    const l = flRoList(contact(cid)).find(x => x.id === lid); if (!l) return;
    if (await flRoEdit(cid, lid, { follow: '', fuDone: todayStr() })) toast('Follow-up done', async () => { if (await flRoEdit(cid, lid, { follow: l.follow, fuDone: '' })) toast('Follow-up back on'); });
  }
  async function flFuAdd(cid, quiet) {
    const c = contact(cid), l = c && flRoNext(c); if (!l) return false;
    const mk = 'fu:' + cid + ':' + l.id; FL_GT.made = FL_GT.made || {}; if (FL_GT.made[mk] && Date.now() - FL_GT.made[mk] < 600000) return true; // never send the same follow-up twice
    try {
      FL_GT.made[mk] = Date.now();
      const r = (await flGtFindSame(flFuTitle(c), l.follow)) || await flGtCall('create_task', flFuBody(c, l, false)); if (!r.id) { delete FL_GT.made[mk]; throw { code: 'unavailable' }; }
      await flRoEdit(cid, l.id, { g: { id: r.id, link: r.link || '', sig: flFuSig(c, l, false), at: r.updated || new Date().toISOString() } });
      if (!quiet) toast('Follow-up added to Google Tasks'); return true;
    } catch (e) { console.error(e); if (!quiet) flGtErr(e); return false; }
  }
  // app → Google: follow the dates and done state; add new follow-ups automatically when that's on
  function flFuSweep() {
    if (!FL_GT.loaded || !st.db) return;
    if (Date.now() - FL_FU.at < 2000) { if (!FL_FU.t) FL_FU.t = setTimeout(() => { FL_FU.t = 0; flFuSweep(); }, 2100); return; }
    FL_FU.at = Date.now(); let added = 0;
    for (const c of S.contacts) {
      const next = flRoNext(c);
      for (const l of flRoList(c)) {
        const g = l.g, k = 'fu' + l.id; if (!g || !g.id || FL_GT.busy.has(k)) continue;
        const done = !next || next.id !== l.id, sig = flFuSig(c, l, done); if (sig === g.sig) continue;
        FL_GT.busy.add(k);
        flGtCall('update_task', { taskId: g.id, ...flFuBody(c, l, done) })
          .then(r => flRoEdit(c.id, l.id, { g: { ...g, sig, at: r.updated || new Date().toISOString() } }))
          .catch(async e => { if (e && e.code === 'tool_error' && /not_found/.test(String(e.message || ''))) await flRoEdit(c.id, l.id, { g: { id: '', off: true } }); else { console.error(e); flGtErr(e); } })
          .finally(() => FL_GT.busy.delete(k));
      }
      if (FL_GT.auto && next && next.follow >= todayStr() && !(next.g && (next.g.id || next.g.off)) && added < 10 && !FL_GT.busy.has('fu' + next.id)) {
        added++; const k = 'fu' + next.id; FL_GT.busy.add(k); flFuAdd(c.id, true).finally(() => FL_GT.busy.delete(k));
      }
    }
  }
  // Google → app: ticked off in Google Tasks clears the follow-up here; deleted there just unlinks it
  async function flFuPull(force) {
    if (FL_FU.pulling || (!force && (document.hidden || Date.now() - FL_FU.pulled < 180000))) return;
    const mapped = S.contacts.flatMap(c => flRoList(c).filter(l => l.g && l.g.id).map(l => ({ c, l }))); if (!mapped.length) return;
    FL_FU.pulling = true; FL_FU.pulled = Date.now();
    try {
      const items = (await flGtCall('list_tasks', {})).tasks || [], byId = new Map(items.map(x => [x.id, x]));
      for (const { c, l } of mapped) {
        const it = byId.get(l.g.id);
        if (!it || it.deleted) { await flRoEdit(c.id, l.id, { g: { id: '', off: true } }); continue; }
        const next = flRoNext(contact(c.id) || c);
        if (it.status === 'completed' && next && next.id === l.id && String(it.updated || '') > String(l.g.at || '')) {
          await flRoEdit(c.id, l.id, { follow: '', fuDone: todayStr(), g: { ...l.g, sig: flFuSig(c, l, true), at: it.updated } });
          toast(`Done in Google Tasks: ${flFuTitle(c)}`);
        }
      }
    } catch (e) { console.error(e); } finally { FL_FU.pulling = false; }
  }
  function flFuHook() {
    if (FL_FU.hooked || !st.db) return; FL_FU.hooked = true;
    setInterval(() => flFuPull(), 60000); window.addEventListener('focus', () => flFuPull(true)); setTimeout(() => flFuPull(true), 6000);
  }
  // Tasks page: a "Follow-ups" group at the top (open tasks, no event or stage filter)
  function flFuTasks() {
    const host = document.getElementById('tList'); if (!host || typeof TF === 'undefined') return;
    const t0 = todayStr(), w = addDays(t0, 7), m = addDays(t0, 30);
    const okWhen = d => { switch (TF.when) { case 'late': return d < t0; case 'today': return d <= t0; case 'week': return d <= w; case 'month': return d <= m; case 'nodate': return false; case 'custom': return d >= (TF.from || '0000') && d <= (TF.to || '9999'); default: return true; } };
    const list = TF.show === 'done' ? [] : flFuOpen().filter(x => okWhen(x.l.follow));
    const sig = JSON.stringify([list.map(x => [x.c.id, x.l.id, x.l.follow]), TF.show, TF.when]);
    let box = host.querySelector('.ssx-fu-tasks');
    if (box && box.dataset.sig === sig) return;
    if (box) box.remove(); if (!list.length) return;
    box = document.createElement('div'); box.className = 'list ssx-fu-tasks'; box.dataset.sig = sig;
    box.innerHTML = `<div class="tgrp">Follow-ups</div>${list.map(({ c, l }) => { const late = l.follow < t0, soon = !late && l.follow <= addDays(t0, 3);
      return `<div class="row trow" style="cursor:default"><input type="checkbox" class="tcb" data-fu="${esc(c.id)}|${esc(l.id)}" aria-label="${esc(flFuTitle(c))}">
        <button class="main tmain" data-reach="${esc(c.id)}"><span class="t" style="display:block">${esc(flFuTitle(c))}</span><span class="sub" style="display:block">${esc(flFuSub(l))}${l.g && l.g.id ? ' · ☑︎ Google Tasks' : ''}</span></button>
        <span class="duepill ${late ? 'late' : soon ? 'soon' : ''}">${late ? 'Overdue · ' : ''}${esc(flRoShort(l.follow))}</span></div>`; }).join('')}`;
    host.prepend(box);
    box.querySelectorAll('[data-fu]').forEach(x => x.onchange = () => { const [cid, lid] = x.dataset.fu.split('|'); flFuDone(cid, lid); });
  }
  // the person's profile: Google Tasks status for their follow-up, or one tap to add it
  function flFuRow(root) {
    const ro = root.querySelector('.ssx-ro'), sum = ro && ro.querySelector('.ssx-ro-sum'); if (!sum) return;
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, c = cur && /^r:/.test(cur) && contact(cur.slice(2)); if (!c) return;
    const l = flRoNext(c), linked = !!(l && l.g && l.g.id), past = !!(l && l.follow < todayStr());
    const state = !l ? '' : [linked ? 'in' : 'out', FL_GT.auto ? 'A' : '', past ? 'P' : '', l.id, l.follow].join('|');
    let row = ro.querySelector('.ssx-fu-g');
    if (!state) { if (row) row.remove(); return; }
    if (row && row.dataset.state === state) return;
    if (!row) { row = document.createElement('div'); row.className = 'ssx-fu-g'; sum.after(row); }
    row.dataset.state = state;
    row.innerHTML = linked ? `<span class="note">☑︎ This follow-up is in your Google Tasks${l.g.link ? `: <a href="${esc(l.g.link)}" target="_blank" rel="noopener">open it</a>` : ''}. Tick it off there or here.</span><button type="button" class="btn small" data-fu-done>Mark done</button>`
      : FL_GT.auto && !past ? `<span class="note">Goes to your Google Tasks on its own, due ${esc(flRoShort(l.follow))}.</span><button type="button" class="btn small" data-fu-done>Mark done</button>`
      : `<button type="button" class="btn small" data-fu-add>＋ Add follow-up to Google Tasks</button><button type="button" class="btn small" data-fu-done>Mark done</button>`;
    const add = row.querySelector('[data-fu-add]'), done = row.querySelector('[data-fu-done]');
    if (add) add.onclick = async () => { if (!(await flGtReady())) return; add.disabled = true; add.textContent = 'Adding…'; if (!(await flFuAdd(c.id))) { add.disabled = false; add.textContent = '＋ Add follow-up to Google Tasks'; } };
    done.onclick = () => flFuDone(c.id, l.id);
  }
  /* -- Next moves: one list on Home for everything that needs you. It replaces Up next, the Home To do card and the Home
     Follow-ups due card. After-show steps for a show become one "Wrap up" row with a checklist sheet. Tasks due in the next
     3 days (or overdue) and reach-out follow-ups that are due join the same list. The full Tasks page is unchanged. */
  const NM = { sig: '', at: 0, t: 0, all: false };
  const NM_WRAP = ['played', 'invoice', 'paidq', 'thanks', 'media', 'recap'];
  const nmWhen = d => { const t = todayStr(); if (!d) return ''; if (d < t) return 'Overdue · ' + flRoShort(d); if (d === t) return 'Today'; if (d === addDays(t, 1)) return 'Tomorrow'; return flRoShort(d); };
  const nmBk = id => bk().find(b => b.id === id);
  const nmTaskHidden = k => { const s = apCfg().snooze[k]; return !!(s && s > todayStr()); }; // "×" on a task hides it until tomorrow
  // the steps for wrapping up one show; each is done, skipped or still to do
  function nmSteps(b) {
    const c = apCfg(), s = stat(b), id = b.id, fee = +b.fee > 0, t = todayStr(), inv = b.invoice || {};
    const off = k => !!(c.dismissed[k + ':' + id]);
    const exps = (() => { try { return (S.expenses || []).filter(x => x.bookingId === id); } catch (_) { return []; } })();
    const trip = AP.mileage.find(m => m.bookingId === id), pk = stageKey('paid'), m = person(b.mediaId);
    const out = [
      { k: 'played', icon: '🎧', label: 'Mark it Played', done: s === 'played' || s === 'paid', btn: 'Mark Played', go: () => window.patch('bookings', id, { status: 'played', stageAt: { ...(b.stageAt || {}), played: (b.stageAt || {}).played || t }, updatedAt: new Date().toISOString() }) },
      fee && { k: 'invoice', icon: '🧾', label: `Send the invoice (${'$' + Number(b.fee).toLocaleString('en-US')})`, done: !!(inv.fileId || inv.sentAt) || s === 'paid', note: inv.sentAt ? 'Sent ' + flRoShort(String(inv.sentAt).slice(0, 10)) : '', btn: inv.fileId ? 'Open invoice' : 'Make invoice', keep: true, go: () => invoiceSheet(id) },
      { k: 'thanks', icon: '💌', label: 'Send a thank-you', done: !!c.done['thanks:' + id], btn: 'Write it', mark: true, keep: true, go: () => thanksMail(b) },
      m && { k: 'media', icon: '📸', label: `Ask ${cName(m)} for photos and video`, done: !!c.done['media:' + id], btn: 'Ask for files', mark: true, keep: true, go: () => composeSheet({ booking: id, to: m.id, subject: `Photos & video from ${bName(b)}`, body: `Hi ${(cName(m) || '').split(' ')[0] || 'there'},\n\nThank you for shooting ${bName(b)}! Whenever they're ready, could you drop the photos and video here?\n${b.driveUrl || '(folder link)'}\n\nThanks so much,\n${myName()}` }) },
      { k: 'recap', icon: '📣', label: 'Post a recap and thank the venue and promoter', done: !!c.done['recap:' + id], btn: 'I posted it', mark: true },
      { k: 'costs', icon: '🧾', label: exps.length ? `Costs for this show: ${exps.length} logged` : c.done['costs:' + id] ? 'No costs for this show' : 'Add costs or a receipt (parking, gear, travel)', done: exps.length > 0 || !!c.done['costs:' + id], btn: exps.length ? 'Add another' : 'Add a cost', skipLabel: 'No costs', keep: true, go: () => flAddExpense(b) },
      { k: 'miles', icon: '🚗', label: trip ? `Mileage logged: ${trip.miles} mi${trip.auto ? ' (measured for you)' : ''}` : c.noDrive[id] ? "Mileage: you didn't drive" : 'Log your mileage', done: !!trip || !!c.noDrive[id], btn: 'Check miles', skipLabel: "Didn't drive", go: () => { close(); goTab('money'); setTimeout(() => { const el = document.getElementById('ssx-miles'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); } },
      fee && { k: 'paidq', icon: '💸', label: 'Get paid', done: s === 'paid', note: s === 'paid' ? '' : inv.sentAt ? 'Waiting on payment' : '', btn: 'Mark Paid', go: () => window.patch('bookings', id, { status: pk, paidDate: b.paidDate || t, stageAt: { ...(b.stageAt || {}), [pk]: t }, updatedAt: new Date().toISOString() }) },
    ].filter(Boolean);
    out.forEach(x => { x.skipped = !x.done && (x.k === 'miles' ? false : off(x.k)); });
    // three weeks after the show, the social steps (thank-you, photos, recap, costs) drop off unless they were done
    const old = b.date && daysBetween(b.date, t) > 21;
    return old ? out.filter(x => x.done || !['thanks', 'media', 'recap', 'costs'].includes(x.k)) : out;
  }
  // everything for Home, ranked by date (overdue first)
  function nmItems() {
    const t = todayStr(), c = apCfg(), out = [], wrap = new Map(), soon = addDays(t, 3);
    for (const it of upNext()) {
      const [kind, bid] = String(it.k).split(':');
      if (NM_WRAP.includes(kind) && nmBk(bid)) { if (!wrap.has(bid)) wrap.set(bid, it.at); continue; }
      out.push({ ...it, type: 'ap' });
    }
    for (const [bid, at] of wrap) {
      const b = nmBk(bid); if (!b || (c.snooze['wrap:' + bid] && c.snooze['wrap:' + bid] > t)) continue;
      const st = nmSteps(b), left = st.filter(x => !x.done && !x.skipped).length; if (!left) continue;
      out.push({ type: 'wrap', k: 'wrap:' + bid, at, b, icon: '🎤', text: `Wrap up <b>${esc(bName(b))}</b>`, sub: `${st.length - left} of ${st.length} done · next: ${esc(st.find(x => !x.done && !x.skipped).label)}`, btn: 'Wrap up' });
    }
    let tasks = []; try { tasks = allTasks(); } catch (_) {}
    for (const x of tasks) {
      if (x.done || !x.due || x.due > soon || !x.b || stat(x.b) === 'lost' || wrap.has(x.b.id) || nmTaskHidden('task:' + x.b.id + ':' + x.key)) continue;
      out.push({ type: 'task', k: 'task:' + x.b.id + ':' + x.key, at: x.due, b: x.b, key: x.key, text: esc(x.label || 'Task'), sub: esc(bName(x.b)), btn: 'Open' });
    }
    try { for (const { c: fc, l } of flRoDue()) out.push({ type: 'fu', k: 'fu:' + fc.id + ':' + l.id, at: l.follow, c: fc, l, text: `Follow up with <b>${esc(cName(fc))}</b>`, sub: esc(flFuSub(l)), btn: 'Follow up' }); } catch (_) {}
    try { out.push(...flHoldItems()); } catch (_) {}
    try { flLockFold(out); } catch (_) {}
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  function nmRender(force) {
    const sec = document.querySelector('section[data-view="home"]'); if (!sec || !st.db) return;
    if (!force && Date.now() - NM.at < 700) { if (!NM.t) NM.t = setTimeout(() => { NM.t = 0; nmRender(true); }, 750); return; }
    NM.at = Date.now();
    // the app's own To do card on Home folds into this list (the Tasks page still has every task)
    const todo = document.getElementById('todos'), todoCard = todo && todo.closest('.card'); if (todoCard) todoCard.classList.add('ssx-nm-hide');
    let open = 0; try { open = allTasks().filter(x => !x.done).length; } catch (_) {}
    const items = nmItems(), max = NM.all ? 99 : 7;
    const sig = JSON.stringify([items.map(i => [i.k, i.at, i.text, i.sub || '']), open, NM.all]);
    let box = document.getElementById('ssx-upnext');
    if (box && box.dataset.sig === sig) return;
    if (!box) { box = document.createElement('div'); box.id = 'ssx-upnext'; box.className = 'card ssx ssx-kitcard ssx-up'; const w = document.getElementById('welcome'); w ? w.after(box) : sec.prepend(box); }
    box.dataset.sig = sig;
    const t = todayStr();
    box.innerHTML = `<div class="ssx-head"><div><h3>Next moves${items.length ? ` <span class="ssx-pill on">${items.length}</span>` : ''}</h3><p class="note">Everything that needs you, soonest first. Emails open ready to review; nothing sends without you.</p></div>
        <button type="button" class="btn small" data-nm-tasks>All tasks${open ? ` · ${open} open` : ''}</button></div>
      ${items.length ? `<div class="ssx-uplist">${items.slice(0, max).map((it, i) => {
        const tick = it.type === 'task' || it.type === 'fu', late = it.at && it.at < t;
        return `<div class="ssx-upi ssx-nm-${it.type}" data-up="${i}">${tick ? `<input type="checkbox" class="tcb ssx-nm-cb" data-nm-done aria-label="Done: ${esc(String(it.text).replace(/<[^>]+>/g, ''))}">` : `<span class="ssx-upic" aria-hidden="true">${it.icon}</span>`}
          <span class="ssx-uptx">${it.text}${it.sub ? `<span class="ssx-nm-sub">${it.sub}</span>` : ''}${it.at && it.type !== 'wrap' && it.type !== 'hold' && (it.type !== 'ap' || late) ? `<span class="ssx-nm-when${late ? ' late' : ''}">${esc(nmWhen(it.at))}</span>` : ''}</span>
          <span class="ssx-upbt"><button type="button" class="btn small primary" data-up-go>${esc(it.btn)}</button>${it.btn2 ? `<button type="button" class="btn small" data-up-go2>${esc(it.btn2)}</button>` : ''}<button type="button" class="ssx-upx" data-up-x aria-label="${it.type === 'fu' ? 'Remind me in a week' : it.type === 'task' ? 'Hide for today' : 'Later'}" title="${it.type === 'fu' ? 'Remind me in a week' : 'Later'}">×</button></span></div>`; }).join('')}</div>
      ${items.length > 7 ? `<button type="button" class="btn small" data-nm-more>${NM.all ? 'Show fewer' : `Show all ${items.length}`}</button>` : ''}`
      : `<p class="note" style="margin:0">You're all caught up. New steps show up here as your shows move along.</p>`}`;
    box.querySelector('[data-nm-tasks]').onclick = () => goTab('tasks');
    const more = box.querySelector('[data-nm-more]'); if (more) more.onclick = () => { NM.all = !NM.all; nmRender(true); };
    box.querySelectorAll('[data-up]').forEach(row => {
      const it = items[+row.dataset.up];
      row.querySelector('[data-up-go]').onclick = async e => {
        e.stopPropagation();
        if (it.type === 'wrap') return nmWrap(it.b.id);
        if (it.type === 'hold') return flHoldSet(it.b, it.past ? 'lost' : 'confirmed');
        if (it.type === 'lock') return nmLock(it.b.id);
        if (it.type === 'task') return window.bookingView(it.b.id);
        if (it.type === 'fu') return reachSheet(it.c.id);
        try { await it.go(); } catch (_) {} if (it.mark) apMark('done', it.k); else if (it.snooze) apMark('snooze', it.k, addDays(todayStr(), it.snooze));
      };
      row.querySelector('[data-up-x]').onclick = async e => {
        e.stopPropagation();
        if (it.type === 'wrap' || it.type === 'hold' || it.type === 'lock') { apMark('snooze', it.k, addDays(todayStr(), 2)); toast(it.type === 'hold' ? 'Hold moved to later' : it.type === 'lock' ? 'Lock it in moved to later' : 'Wrap-up moved to later'); return; }
        if (it.type === 'fu') { if (await flRoEdit(it.c.id, it.l.id, { follow: addDays(todayStr(), 7) })) toast(`Follow-up moved to ${flRoShort(addDays(todayStr(), 7))}`, async () => { await flRoEdit(it.c.id, it.l.id, { follow: it.l.follow }); }); nmRender(true); return; }
        if (it.type === 'task') { apMark('snooze', it.k, addDays(todayStr(), 1)); return; }
        it.snooze ? apMark('snooze', it.k, addDays(todayStr(), it.snooze)) : apMark('dismissed', it.k);
      };
      const g2 = row.querySelector('[data-up-go2]'); if (g2) g2.onclick = e => { e.stopPropagation(); if (it.type === 'hold') flHoldSet(it.b, it.past ? 'confirmed' : 'lost'); };
      const cb = row.querySelector('[data-nm-done]');
      if (cb) cb.onchange = async () => {
        if (it.type === 'fu') { await flFuDone(it.c.id, it.l.id); nmRender(true); return; }
        await setTask(it.b.id, it.key, true); try { syncChecks(it.b.id, it.key, true); } catch (_) {}
        toast('Task done', async () => { await setTask(it.b.id, it.key, false); try { syncChecks(it.b.id, it.key, false); } catch (_) {} });
      };
    });
  }
  // Wrap up sheet: every after-show step for one show in one place
  function nmWrap(bid) {
    const b0 = nmBk(bid); if (!b0) return;
    try { navSheet('wrap:' + bid, () => nmWrap(bid)); } catch (_) {} // Back from the invoice or a cost returns here
    sheet(`<h3>Wrap up</h3><p class="note" style="margin:0 0 10px">${esc(bName(b0))}${b0.date ? ' · ' + esc(niceDate(b0.date)) : ''}</p><div class="ssx-wr-bar"><i></i></div><div class="ssx-wr-list"></div><div class="ssx-wr-tasks"></div>
      <div class="actions"><button type="button" class="btn" data-wr-open>Open the show</button><span class="spacer"></span><button type="button" class="btn primary" data-wr-done>Done for now</button></div>`, root => {
      const draw = () => {
        const b = nmBk(bid); if (!b) return close();
        const steps = nmSteps(b), fin = steps.filter(x => x.done || x.skipped).length;
        root.querySelector('.ssx-wr-bar i').style.width = Math.round(fin / steps.length * 100) + '%';
        root.querySelector('.ssx-wr-bar').setAttribute('aria-label', `${fin} of ${steps.length} done`);
        root.querySelector('.ssx-wr-list').innerHTML = steps.map((x, i) => `<div class="ssx-wr-row${x.done ? ' done' : x.skipped ? ' skip' : ''}" data-i="${i}">
          <span class="ssx-wr-ic" aria-hidden="true">${x.done ? '✓' : x.skipped ? '–' : x.icon}</span>
          <span class="ssx-wr-tx">${esc(x.label)}${x.note ? `<span class="note">${esc(x.note)}</span>` : x.skipped ? '<span class="note">Skipped</span>' : ''}</span>
          <span class="ssx-wr-bt">${x.done && !x.keep ? '' : x.skipped ? '<button type="button" class="btn small" data-wr-undo>Bring back</button>' : `${x.go || x.mark ? `<button type="button" class="btn small${x.done ? '' : ' primary'}" data-wr-go>${esc(x.btn)}</button>` : ''}${x.done ? '' : `<button type="button" class="btn small ghost" data-wr-skip>${esc(x.skipLabel || 'Skip')}</button>`}`}</span></div>`).join('');
        let ts = []; try { ts = tasksOf(b).filter(x => !x.done).sort((p, q) => String(p.due || '9999').localeCompare(String(q.due || '9999'))); } catch (_) {}
        root.querySelector('.ssx-wr-tasks').innerHTML = ts.length ? `<p class="eyebrow" style="margin:14px 0 6px">Still on this show's checklist</p>${ts.map(x => `<label class="ssx-wr-task"><input type="checkbox" class="tcb" data-wr-task="${esc(x.key)}"> <span>${esc(x.label)}${x.due ? ` <span class="note">${esc(nmWhen(x.due))}</span>` : ''}</span></label>`).join('')}` : '';
        root.querySelectorAll('.ssx-wr-row').forEach(row => {
          const x = steps[+row.dataset.i], go = row.querySelector('[data-wr-go]'), sk = row.querySelector('[data-wr-skip]'), un = row.querySelector('[data-wr-undo]');
          if (go) go.onclick = async () => {
            if (x.mark) await apSave({ done: { ...apCfg().done, [x.k + ':' + bid]: true } });
            if (['invoice', 'thanks', 'media', 'costs'].includes(x.k)) { try { closeAll(); } catch (_) {} } // the next window opens in front; this list waits in Next moves
            if (x.go) { try { await x.go(); } catch (e) { console.error(e); } }
            if (document.body.contains(root)) setTimeout(draw, 250);
          };
          if (sk) sk.onclick = async () => {
            if (x.k === 'miles') await apSave({ noDrive: { ...apCfg().noDrive, [bid]: true } });
            else if (x.k === 'costs') await apSave({ done: { ...apCfg().done, ['costs:' + bid]: true } });
            else await apSave({ dismissed: { ...apCfg().dismissed, [x.k + ':' + bid]: true } });
            draw();
          };
          if (un) un.onclick = async () => { const d = { ...apCfg().dismissed }; delete d[x.k + ':' + bid]; await apSave({ dismissed: d }); draw(); };
        });
        root.querySelectorAll('[data-wr-task]').forEach(cb => cb.onchange = async () => { const k = cb.dataset.wrTask; await setTask(bid, k, true); try { syncChecks(bid, k, true); } catch (_) {} setTimeout(draw, 250); });
        if (fin === steps.length && !root.dataset.cheered) { root.dataset.cheered = '1'; toast(`${bName(b)} is all wrapped up`); }
      };
      draw();
      root.querySelector('[data-wr-open]').onclick = () => window.bookingView(bid);
      root.querySelector('[data-wr-done]').onclick = () => close();
    });
  }
  // a wrap-up can also be opened from the show itself
  function nmWrapRow(root) {
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, m = cur && /^b:(.+)$/.exec(cur); if (!m) return;
    const b = nmBk(m[1]); if (!b || root.querySelector('.ssx-wr-open') || !root.querySelector('[data-status]')) return;
    const s = stat(b); if (!(s === 'played' || s === 'paid' || (s === 'confirmed' && b.date && b.date < todayStr()))) return;
    const steps = nmSteps(b), left = steps.filter(x => !x.done && !x.skipped).length; if (!left) return;
    const row = document.createElement('div'); row.className = 'ssx-wr-open';
    row.innerHTML = `<span>🎤 <b>Wrap up</b> <span class="note">${steps.length - left} of ${steps.length} done</span></span><button type="button" class="btn small primary">Wrap up</button>`;
    row.querySelector('button').onclick = () => nmWrap(b.id);
    const h = root.querySelector('.head'); h ? h.after(row) : root.prepend(row);
  }
  /* -- Profile v2: "Reach-outs & follow-up" card. The next follow-up sits on top with Mark done / +1 week / change date and its
     Google Tasks status; the history folds away underneath. Tasks gets a "Follow-ups" filter chip. Texts and calls started
     from a profile are added to Reach-outs (with Undo), like emails and Instagram DMs already are. */
  try { FL_FU.only = sessionStorage.getItem('ssxFuOnly') === '1'; } catch (_) { FL_FU.only = false; }
  function flRoSheet2(root) {
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key; if (!cur || !/^r:/.test(cur) || !root.querySelector('[data-editc]')) return;
    const cid = cur.slice(2), c = contact(cid); if (!c) return;
    let box = root.querySelector('.ssx-ro');
    if (!box) {
      box = document.createElement('div'); box.className = 'card ssx-ro ssx-ro2';
      box.innerHTML = `<div class="head"><h3>Reach-outs &amp; follow-up</h3></div>
        <div class="ssx-ro-next"></div><div class="ssx-fu-gslot"></div>
        <div class="ssx-ro-form" hidden>
          <div class="f"><label>How</label><div class="chips" role="group" aria-label="How you reached out">${FL_RO_VIA.map(([k, n], i) => `<button type="button" class="chip" data-ro-via="${k}" aria-pressed="${i === 0}">${esc(n)}</button>`).join('')}</div></div>
          <div class="frow"><div class="f"><label for="ssx-ro-at">When</label><input type="date" id="ssx-ro-at"></div><div class="f"><label for="ssx-ro-fu">Follow up on</label><input type="date" id="ssx-ro-fu"></div></div>
          <div class="f"><label for="ssx-ro-note">What it was about (optional)</label><input id="ssx-ro-note" maxlength="200" placeholder="e.g. Pitched a Friday in March"></div>
          <div class="actions"><button type="button" class="btn" data-ro-cancel>Cancel</button><button type="button" class="btn primary" data-ro-save>Save</button></div>
        </div>
        <div class="ssx-ro-foot"><button type="button" class="btn small" data-ro-add>＋ Log a reach-out</button><span class="note">For anything you did outside the app, like talking in person.</span></div>
        <details class="ssx-ro-hist"><summary>History <span class="ssx-ro-n"></span></summary><div class="ssx-ro-list"></div></details>`;
      const slot = root.querySelector('.ssx-cp-slot'), acts = [...root.children].filter(x => x.classList.contains('actions')).pop(); slot ? slot.prepend(box) : acts ? acts.before(box) : root.append(box);
      const form = box.querySelector('.ssx-ro-form'), foot = box.querySelector('.ssx-ro-foot');
      box.querySelector('[data-ro-add]').onclick = () => { form.hidden = false; foot.hidden = true; box.querySelector('#ssx-ro-at').value = todayStr(); box.querySelector('#ssx-ro-fu').value = addDays(todayStr(), 7); box.querySelector('#ssx-ro-note').focus(); };
      box.querySelectorAll('[data-ro-via]').forEach(b => b.onclick = () => box.querySelectorAll('[data-ro-via]').forEach(x => x.setAttribute('aria-pressed', String(x === b))));
      box.querySelector('[data-ro-cancel]').onclick = () => { form.hidden = true; foot.hidden = false; };
      box.querySelector('[data-ro-save]').onclick = async e => {
        const btn = e.currentTarget, via = (box.querySelector('[data-ro-via][aria-pressed="true"]') || {}).dataset?.roVia || 'other';
        const at = box.querySelector('#ssx-ro-at').value || todayStr(), fu = box.querySelector('#ssx-ro-fu').value;
        if (fu && fu < at) { toast('The follow-up date is before the reach-out. Pick a later date or clear it.'); return; }
        btn.disabled = true; const pick = await flRoShowPick(box, cid); if (!pick) { btn.disabled = false; return; }
        const ok = await flRoAdd(cid, { via, at, follow: fu, note: box.querySelector('#ssx-ro-note').value.trim().slice(0, 200), ...pick.data });
        btn.disabled = false; if (ok) { form.hidden = true; foot.hidden = false; box.querySelector('#ssx-ro-note').value = ''; }
      };
      // the follow-up panel's buttons (it's redrawn, so they're handled here)
      const nx = box.querySelector('.ssx-ro-next');
      nx.onclick = async e => {
        const cc = contact(cid), n = cc && flRoNext(cc);
        if (e.target.closest('[data-fu-done]') && n) flFuDone(cid, n.id);
        else if (e.target.closest('[data-fu-week]') && n) { const d = addDays(n.follow > todayStr() ? n.follow : todayStr(), 7); if (await flRoEdit(cid, n.id, { follow: d })) toast(`Follow up ${flRoShort(d)}`, async () => { await flRoEdit(cid, n.id, { follow: n.follow }); }); }
      };
      nx.onchange = async e => {
        const cc = contact(cid), v = e.target.value; if (!cc || !v) return;
        if (e.target.matches('[data-fu-date]')) { const n = flRoNext(cc); if (n && await flRoEdit(cid, n.id, { follow: v })) toast(`Follow up ${flRoShort(v)}`); }
        else if (e.target.matches('[data-fu-set]')) { const l = flRoList(cc)[0]; if (l && await flRoEdit(cid, l.id, { follow: v, fuDone: '', status: FL_RO_OPEN.has(l.status) ? l.status : 'waiting' })) toast(`Follow up ${flRoShort(v)}`); }
      };
      flRoWire(box.querySelector('.ssx-ro-list'), () => cid);
      if (flRoList(c).length <= 3) box.querySelector('.ssx-ro-hist').open = true;
    }
    const list = flRoList(c), n = flRoNext(c), sig = JSON.stringify([list, todayStr()]); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    const t = todayStr(), late = n && n.follow < t, who = c.type === 'venue' || isColl(c) ? cName(c) : (cName(c).split(' ')[0] || cName(c));
    box.querySelector('.ssx-ro-next').innerHTML = n
      ? `<div class="ssx-ro-fu${late ? ' late' : n.follow === t ? ' today' : ''}"><div class="ssx-ro-fut"><span class="eyebrow">Next follow-up</span><b>${late ? 'Overdue · ' : n.follow === t ? 'Today · ' : ''}${esc(flRoShort(n.follow))}</b><span class="note">After your ${esc(flRoVia(n.via).toLowerCase())} on ${esc(flRoShort(n.at))}${n.note ? ` · ${esc(n.note)}` : ''}. Use "Contact ${esc(who)}" above when you're ready.</span></div>
          <div class="ssx-ro-fua"><button type="button" class="btn small primary" data-fu-done>Mark done</button><button type="button" class="btn small" data-fu-week>+1 week</button><label class="ssx-ro-date"><span>Change date</span><input type="date" data-fu-date value="${esc(n.follow)}" min="${esc(t)}"></label></div></div>`
      : list.length
        ? `<div class="ssx-ro-fu none"><div class="ssx-ro-fut"><span class="eyebrow">No follow-up set</span><span class="note">Last reached out ${esc(flRoShort(list[0].at))} by ${esc(flRoVia(list[0].via).toLowerCase())}.</span></div><div class="ssx-ro-fua"><label class="ssx-ro-date"><span>Set a follow-up</span><input type="date" data-fu-set min="${esc(t)}"></label></div></div>`
        : `<p class="note" style="margin:0">Nothing yet. When you contact ${esc(who)} from the buttons above, it's tracked here with a follow-up a week later.</p>`;
    box.querySelector('.ssx-ro-n').textContent = list.length ? `(${list.length})` : '';
    box.querySelector('.ssx-ro-hist').hidden = !list.length;
    box.querySelector('.ssx-ro-list').innerHTML = list.slice(0, 20).map(l => flRoRow(c, l, false)).join('') + (list.length > 20 ? `<p class="note">Showing the latest 20 of ${list.length}.</p>` : '');
  }
  // the follow-up panel's Google Tasks line
  function flFuRow2(root) {
    const ro = root.querySelector('.ssx-ro2'), slot = ro && ro.querySelector('.ssx-fu-gslot'); if (!slot) return;
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, c = cur && /^r:/.test(cur) && contact(cur.slice(2)); if (!c) return;
    const l = flRoNext(c), linked = !!(l && l.g && l.g.id), past = !!(l && l.follow < todayStr());
    const state = !l ? '' : [linked ? 'in' : 'out', FL_GT.auto ? 'A' : '', past ? 'P' : '', l.id, l.follow].join('|');
    if (slot.dataset.state === state) return; slot.dataset.state = state;
    slot.innerHTML = !l ? '' : linked ? `<span class="note">☑︎ In your Google Tasks${l.g.link ? ` · <a href="${esc(l.g.link)}" target="_blank" rel="noopener">open it</a>` : ''}. Ticking it off there marks it done here too.</span>`
      : FL_GT.auto && !past ? `<span class="note">☑︎ Goes to your Google Tasks on its own.</span>`
      : `<button type="button" class="btn small ghost" data-fu-add>＋ Add to Google Tasks</button>`;
    const add = slot.querySelector('[data-fu-add]');
    if (add) add.onclick = async () => { if (!(await flGtReady())) return; add.disabled = true; add.textContent = 'Adding…'; if (!(await flFuAdd(c.id))) { add.disabled = false; add.textContent = '＋ Add to Google Tasks'; } };
  }
  // Tasks page: Follow-ups group at the top, plus a "Follow-ups" chip that shows only them
  function flFuTasks2() {
    const host = document.getElementById('tList'); if (!host || typeof TF === 'undefined') return;
    const chips = document.getElementById('tStage');
    if (chips && !chips.querySelector('[data-tfu]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip ssx-fu-chip'; b.dataset.tfu = '1'; b.textContent = 'Follow-ups'; chips.appendChild(b); }
    if (chips && !chips.__ssxFu) {
      chips.__ssxFu = true;
      chips.addEventListener('click', e => {
        if (e.target.closest('[data-tfu]')) { FL_FU.only = !FL_FU.only; if (FL_FU.only && TF.show === 'done') TF.show = 'open'; }
        else if (e.target.closest('[data-tstage]')) FL_FU.only = false;
        else return;
        try { FL_FU.only ? sessionStorage.setItem('ssxFuOnly', '1') : sessionStorage.removeItem('ssxFuOnly'); } catch (_) {}
        if (e.target.closest('[data-tfu]')) { try { renderTasks(); } catch (_) {} }
      });
    }
    const only = !!FL_FU.only && TF.show !== 'done', t0 = todayStr(), w = addDays(t0, 7), m = addDays(t0, 30);
    host.classList.toggle('ssx-fu-only', only);
    if (chips) { const fb = chips.querySelector('[data-tfu]'); if (fb && fb.getAttribute('aria-pressed') !== String(only)) fb.setAttribute('aria-pressed', String(only)); if (only) chips.querySelectorAll('[data-tstage][aria-pressed="true"]').forEach(x => x.setAttribute('aria-pressed', 'false')); }
    const okWhen = d => { switch (TF.when) { case 'late': return d < t0; case 'today': return d <= t0; case 'week': return d <= w; case 'month': return d <= m; case 'nodate': return false; case 'custom': return d >= (TF.from || '0000') && d <= (TF.to || '9999'); default: return true; } };
    const all = TF.show === 'done' ? [] : flFuOpen(), list = all.filter(x => okWhen(x.l.follow)), more = all.length - list.length;
    if (only) { const tt = document.getElementById('tTitle'), tc = document.getElementById('tCount'), late = list.filter(x => x.l.follow < t0).length, cnt = `${list.length} follow-up${list.length === 1 ? '' : 's'}${late ? ` · ${late} overdue` : ''}`; if (tt && tt.textContent !== 'Follow-ups') tt.textContent = 'Follow-ups'; if (tc && tc.textContent !== cnt) tc.textContent = cnt; }
    const sig = JSON.stringify([list.map(x => [x.c.id, x.l.id, x.l.follow, !!(x.l.g && x.l.g.id), cName(x.c)]), more, only, TF.show, TF.when]);
    let box = host.querySelector('.ssx-fu-tasks');
    if (box && box.dataset.sig === sig) return;
    if (box) box.remove(); if (!list.length && !more && !only) return;
    box = document.createElement('div'); box.className = 'list ssx-fu-tasks'; box.dataset.sig = sig;
    box.innerHTML = `<div class="tgrp">Follow-ups</div>${list.map(({ c, l }) => { const late = l.follow < t0, soon = !late && l.follow <= addDays(t0, 3);
      return `<div class="row trow" style="cursor:default"><input type="checkbox" class="tcb" data-fu="${esc(c.id)}|${esc(l.id)}" aria-label="Mark done: ${esc(flFuTitle(c))}">
        <button class="main tmain" data-reach="${esc(c.id)}" title="Open ${esc(cName(c))}"><span class="t" style="display:block">${esc(flFuTitle(c))}</span><span class="sub" style="display:block">Last reach-out: ${esc(flFuSub(l))}${l.g && l.g.id ? ' · ☑︎ in Google Tasks' : ''}</span></button>
        <span class="duepill ${late ? 'late' : soon ? 'soon' : ''}">${late ? 'Overdue · ' : l.follow === t0 ? 'Today · ' : ''}${esc(flRoShort(l.follow))}</span></div>`; }).join('')}
      ${!list.length && only ? `<div class="empty">No follow-ups${more ? ' in these dates' : ''}. Open someone in People, contact them or tap "＋ Log a reach-out", and pick a follow-up date.</div>` : ''}
      ${more ? `<p class="note ssx-fu-more">${more} more follow-up${more === 1 ? ' is' : 's are'} outside the date filter. <button type="button" class="linkbtn" data-fu-alldates>Show all dates</button></p>` : ''}`;
    host.prepend(box);
    box.querySelectorAll('[data-fu]').forEach(x => x.onchange = () => { const [cid, lid] = x.dataset.fu.split('|'); flFuDone(cid, lid); });
    const ad = box.querySelector('[data-fu-alldates]'); if (ad) ad.onclick = () => { TF.when = 'all'; try { saveTF(); } catch (_) {} try { renderTasks(); } catch (_) {} };
  }
  // texts and calls started from a profile go into Reach-outs (once a day each), with Undo
  function flRoAutoLog() {
    if (FL.roTC) return; FL.roTC = true;
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('#sheetRoot [data-sms], #sheetRoot [data-call]'); if (!a) return;
      const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key; if (!cur || !/^r:/.test(cur)) return;
      const cid = cur.slice(2), c = contact(cid), via = a.hasAttribute('data-sms') ? 'text' : 'call'; if (!c) return;
      if (flRoList(c).some(l => l.via === via && l.at === todayStr())) return;
      setTimeout(async () => {
        const before = flRoList(contact(cid));
        if (await flRoAdd(cid, { via, note: via === 'text' ? 'Text message' : 'Phone call' }, true)) toast(`Added to Reach-outs: ${via === 'text' ? 'text' : 'call'} to ${cName(c)}`, async () => { await flRoSave(cid, before); });
      }, 300);
    }, true);
  }
  /* -- One follow-up system for pitches. A reach-out can be about a show (reach-out.bookingId): pick one when you log it, or
     "Hold a new date" to create a Pitched show. Emails you send about a Lead or Pitched show are logged on the person
     automatically (request replies get a 3-day follow-up, pitches a week). A show that has reach-outs drops its own
     "Follow up if no reply" checklist tasks, so you're never reminded twice; once it's Confirmed or Lost, its follow-up ends.
     "Interested" or "Booked" on a reach-out offers to add or confirm the show. Holds that are close or past ask you to
     confirm or release them in Next moves. */
  const FL_RO_PITCH = ['lead', 'pitched'];
  const flRoBkOf = l => (l && l.bookingId && bk().find(x => x.id === l.bookingId)) || null;
  const flRoShowsWith = c => bk().filter(b => [b.venueId, b.promoterId, b.bookingContactId].includes(c.id) && FL_RO_PITCH.includes(stat(b))).sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const flRoWhere = c => c.type === 'venue' ? 'venueId' : c.type === 'promoter' ? 'promoterId' : 'bookingContactId';
  async function flRoNewShow(c, date, status, title) {
    const now = new Date().toISOString(), t = todayStr(), pk = stageKey(status);
    const data = { title: String(title || cName(c) || 'Hold').slice(0, 120), date, status: pk, stageAt: { [pk]: t }, city: c.city || '', [flRoWhere(c)]: c.id, createdAt: now, updatedAt: now };
    const id = await window.save('bookings', null, data); if (!id) return null;
    let n = 0; const ev = () => { if (!bk().some(x => x.id === id) && n++ < 20) return setTimeout(ev, 200); try { syncBookingEvent(id, { ...data, id }); } catch (_) {} }; setTimeout(ev, 300);
    return id;
  }
  // the log form: "About a show?"
  function flRoFormShow(root) {
    const form = root.querySelector('.ssx-ro2 .ssx-ro-form'); if (!form || form.querySelector('[data-ro-show]')) return;
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, c = cur && /^r:/.test(cur) && contact(cur.slice(2)); if (!c) return;
    const shows = flRoShowsWith(c), f = document.createElement('div'); f.className = 'f ssx-ro-show';
    f.innerHTML = `<label for="ssx-ro-show">About a show? (optional)</label><select id="ssx-ro-show" data-ro-show><option value="">Not about a specific date</option>${shows.map(b => `<option value="${esc(b.id)}">${esc(bName(b))}${b.date ? ' · ' + esc(flRoShort(b.date)) : ''}</option>`).join('')}<option value="__new__">＋ Hold a new date for them…</option></select>
      <div class="ssx-ro-newdate" hidden><input type="date" data-ro-newdate aria-label="Date to hold" min="${esc(todayStr())}"><span class="note">Saved as a Pitched show, so the date closes on your booking link.</span></div>`;
    const note = form.querySelector('#ssx-ro-note'), at = note && note.closest('.f'); at ? at.before(f) : form.prepend(f);
    const sel = f.querySelector('[data-ro-show]'), nd = f.querySelector('.ssx-ro-newdate'); sel.onchange = () => { nd.hidden = sel.value !== '__new__'; };
  }
  async function flRoShowPick(box, cid) {
    const sel = box.querySelector('[data-ro-show]'); if (!sel || !sel.value) return { data: {} };
    if (sel.value !== '__new__') return { data: { bookingId: sel.value } };
    const d = box.querySelector('[data-ro-newdate]').value; if (!d) { toast('Pick the date to hold, or choose "Not about a specific date".'); return null; }
    const id = await flRoNewShow(contact(cid), d, 'pitched'); if (!id) return null;
    toast(`Held ${niceDate(d)} as a Pitched show`); sel.value = ''; box.querySelector('.ssx-ro-newdate').hidden = true; return { data: { bookingId: id } };
  }
  // on the profile: "Interested" or "Booked" → add or confirm the show
  function flRoOutcome(root) {
    const ro = root.querySelector('.ssx-ro2'); if (!ro) return;
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, c = cur && /^r:/.test(cur) && contact(cur.slice(2)); if (!c) return;
    const l = flRoList(c)[0], st = l && l.status, b = flRoBkOf(l), bs = b && stat(b);
    const show = l && (st === 'interested' || st === 'booked') && !(b && (st === 'interested' ? bs !== 'lead' : !FL_RO_PITCH.includes(bs)));
    const state = show ? [l.id, st, b ? b.id + bs : ''].join('|') : '';
    let box = ro.querySelector('.ssx-ro-out'); if ((box ? box.dataset.state : '') === state) return;
    if (!state) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'ssx-ro-out'; ro.querySelector('.ssx-ro-next').before(box); }
    box.dataset.state = state;
    const who = cName(c), conf = st === 'booked';
    box.innerHTML = b
      ? `<span>${conf ? '🎉' : '✨'} ${conf ? 'They booked you for' : 'They\'re interested in'} <b>${esc(bName(b))}</b>${b.date ? ' · ' + esc(flRoShort(b.date)) : ''}.</span><button type="button" class="btn small primary" data-ro-conf>${conf ? 'Mark it Confirmed' : 'Move it to Pitched'}</button>`
      : `<span>${conf ? '🎉 Booked! Add the show so it\'s on your calendar.' : `✨ ${esc(who)} is interested. Hold a date so it's saved.`}</span>
        <div class="ssx-ro-outf"><input type="date" data-ro-odate aria-label="Show date"><input data-ro-otitle maxlength="120" placeholder="Show name (optional)" aria-label="Show name"><button type="button" class="btn small primary" data-ro-oadd>${conf ? 'Add the show' : 'Hold the date'}</button></div>`;
    const cb = box.querySelector('[data-ro-conf]'), ab = box.querySelector('[data-ro-oadd]');
    if (cb) cb.onclick = async () => { const k = stageKey(conf ? 'confirmed' : 'pitched'), was = b.status; cb.disabled = true; if (await window.patch('bookings', b.id, { status: k, stageAt: { ...(b.stageAt || {}), [k]: todayStr() }, updatedAt: new Date().toISOString() })) toast(`${bName(b)} is ${stageName(k)}`, async () => { await window.patch('bookings', b.id, { status: was }); }); cb.disabled = false; };
    if (ab) ab.onclick = async () => {
      const d = box.querySelector('[data-ro-odate]').value; if (!d) { toast('Pick the date first'); box.querySelector('[data-ro-odate]').focus(); return; }
      ab.disabled = true; const id = await flRoNewShow(c, d, conf ? 'confirmed' : 'pitched', box.querySelector('[data-ro-otitle]').value.trim());
      if (id) { await flRoEdit(c.id, l.id, { bookingId: id }); toast(conf ? `Added ${niceDate(d)} as Confirmed` : `Held ${niceDate(d)} for ${who}`); setTimeout(() => window.bookingView(id), 400); } else ab.disabled = false;
    };
  }
  // on a Lead or Pitched show: its reach-outs and next follow-up
  function flRoBookRow(root) {
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, m = cur && /^b:(.+)$/.exec(cur); if (!m || !root.querySelector('[data-status]')) return;
    const b = bk().find(x => x.id === m[1]); let row = root.querySelector('.ssx-rob');
    if (!b || !FL_RO_PITCH.includes(stat(b))) { if (row) row.remove(); return; }
    const hits = S.contacts.flatMap(c => flRoList(c).filter(l => l.bookingId === b.id).map(l => ({ c, l }))).sort((x, y) => String(y.l.at).localeCompare(String(x.l.at)));
    const last = hits[0], nx = hits.map(h => ({ c: h.c, l: flRoNext(h.c) })).find(h => h.l && h.l.bookingId === b.id);
    const main = person(b.bookingContactId) || person(b.promoterId) || person(b.venueId);
    const state = JSON.stringify([last && [last.l.id, last.l.at], nx && [nx.l.id, nx.l.follow], main && main.id]);
    if (row && row.dataset.state === state) return;
    if (!row) { row = document.createElement('div'); row.className = 'ssx-rob'; const h = root.querySelector('.ssx-wr-open') || root.querySelector('.head'); h ? h.after(row) : root.prepend(row); }
    row.dataset.state = state;
    row.innerHTML = last
      ? `<span>📨 <b>Reach-outs</b> <span class="note">Last: ${esc(flRoVia(last.l.via).toLowerCase())} to ${esc(cName(last.c))} on ${esc(flRoShort(last.l.at))}${nx ? ` · follow up ${esc(flRoShort(nx.l.follow))}` : ''}</span></span><button type="button" class="btn small" data-reach="${esc((nx || last).c.id)}">Open ${esc(cName((nx || last).c))}</button>`
      : `<span>📨 <b>Reach-outs</b> <span class="note">Emails you send about this show are tracked, with a follow-up a week later.</span></span>${main ? `<button type="button" class="btn small" data-reach="${esc(main.id)}">Open ${esc(cName(main))}</button>` : ''}`;
  }
  // a show with reach-outs drops its own "follow up" checklist tasks (the reach-out follow-up covers it)
  function flRoTasksWrap() {
    const f = window.tasksOf; if (typeof f !== 'function' || f.__ssxRo) return;
    let cache = null, at = 0;
    const linked = () => { if (cache && Date.now() - at < 400) return cache; cache = new Set(); at = Date.now(); for (const c of S.contacts || []) for (const l of (Array.isArray(c.outreach) ? c.outreach : [])) if (l && l.bookingId) cache.add(l.bookingId); return cache; };
    const w = function (b) { const r = f.apply(this, arguments); try { if (b && Array.isArray(r) && linked().has(b.id)) return r.filter(x => !(K(x.st) === 'pitched' && /follow/i.test(String(x.label || '')))); } catch (_) {} return r; };
    w.__ssxRo = true; Object.keys(f).forEach(k => { try { w[k] = f[k]; } catch (_) {} }); window.tasksOf = w;
  }
  // Next moves: holds that are close (10 days) or past and still not confirmed
  function flHoldItems() {
    const t = todayStr(), c = apCfg(), out = [];
    for (const b of bk()) {
      if (stat(b) !== 'pitched' || !b.date) continue;
      const days = daysBetween(t, b.date); if (days > 10) continue;
      const past = days < 0, k = 'hold:' + b.id + (past ? ':past' : ':soon');
      if (c.dismissed[k] || (c.snooze[k] && c.snooze[k] > t)) continue;
      out.push({ type: 'hold', k, at: b.date, b, past, icon: '📌', text: past ? `Your hold for <b>${esc(bName(b))}</b> has passed` : `<b>${esc(bName(b))}</b> is still on hold`, sub: `${esc(niceDate(b.date))} · ${past ? 'Release it, or confirm it if the show is happening.' : 'Confirm it, or release the date so it opens on your booking link.'}`, btn: past ? 'Release' : 'Confirm', btn2: past ? 'Confirm' : 'Release' });
    }
    return out;
  }
  async function flHoldSet(b, kind) {
    const k = stageKey(kind), was = b.status;
    if (await window.patch('bookings', b.id, { status: k, stageAt: { ...(b.stageAt || {}), [k]: todayStr() }, updatedAt: new Date().toISOString() }))
      toast(kind === 'lost' ? `Released ${niceDate(b.date)}. It's open on your booking link again.` : `${bName(b)} is Confirmed`, async () => { await window.patch('bookings', b.id, { status: was }); });
  }
  // a show's checklist lists its steps by due date: soonest first, no date after, done last
  function flSortChecklist(root) {
    root.querySelectorAll('.stg-b').forEach(box => {
      const rows = [...box.children].filter(x => x.classList.contains('cl-row')); if (rows.length < 2) return;
      const key = r => { const cb = r.querySelector('[data-btask]'), d = r.querySelector('.duein'); return `${cb && cb.checked ? 1 : 0}|${(d && d.value) || '9999'}`; };
      const sorted = rows.map((r, i) => [r, key(r), i]).sort((a, b) => a[1].localeCompare(b[1]) || a[2] - b[2]).map(x => x[0]);
      if (sorted.every((r, i) => r === rows[i])) return;
      const anchor = rows[rows.length - 1].nextSibling; sorted.forEach(r => box.insertBefore(r, anchor));
    });
  }
  /* -- Lock it in: when a show is Confirmed, everything to lock it down sits in one checklist: Google Calendar, the
     confirmation email, and the Confirmed-stage checklist (contract, deposit, set time and load-in, promo… soonest due
     first). It opens once on its own right after you mark a show Confirmed, shows as one row in Next moves (instead of
     separate task rows), and as a button on the show. */
  const NM_LOCK = { seen: null, opened: {} };
  const nmLockable = b => b && stat(b) === 'confirmed' && b.date && b.date >= todayStr();
  function nmLockSteps(b) {
    const c = apCfg(), id = b.id, since = (b.stageAt || {}).confirmed || '0000';
    // the confirmation counts as done only once an email about this show has actually been sent (or you say you sent it another way)
    const sent = (() => { try { return (S.sentLog || []).some(x => x.bookingId === id && x.kind !== 'invoice' && String(x.at || '').slice(0, 10) >= since); } catch (_) { return false; } })();
    let ts = []; try { ts = tasksOf(b).filter(x => K(x.st) === 'confirmed').sort((p, q) => (p.done ? 1 : 0) - (q.done ? 1 : 0) || String(p.due || '9999').localeCompare(String(q.due || '9999'))); } catch (_) {}
    return [
      { k: 'mail', icon: '✉️', label: sent ? 'Confirmation sent' : 'Send a confirmation: date, set time, fee, contract and load-in', done: sent || !!c.done['lockmail:' + id], skipped: !!c.dismissed['confirm:' + id], btn: 'Write it', keep: !sent, go: () => confirmMail(b), skipKey: 'confirm:' + id, alt: 'lockmail:' + id },
      ...ts.map(x => ({ k: 'task', key: x.key, icon: '☐', label: x.label, due: x.due, done: !!x.done, skipped: false, btn: 'Done', task: true })),
    ];
  }
  // Next moves: one "Lock in" row per Confirmed show coming up in the next 60 days (or confirmed this week)
  function flLockFold(out) {
    const t = todayStr(), c = apCfg(), lock = new Map();
    for (const b of bk()) {
      if (!nmLockable(b)) continue;
      const soon = daysBetween(t, b.date) <= 60 || ((b.stageAt || {}).confirmed || '') >= addDays(t, -7); if (!soon) continue;
      if (c.snooze['lock:' + b.id] && c.snooze['lock:' + b.id] > t) { lock.set(b.id, null); continue; }
      const st = nmLockSteps(b), left = st.filter(x => !x.done && !x.skipped); if (!left.length) continue;
      const nextDue = left.filter(x => x.due).map(x => x.due).sort()[0];
      lock.set(b.id, { type: 'lock', k: 'lock:' + b.id, at: nextDue || t, b, icon: '🔒', text: `Lock in <b>${esc(bName(b))}</b>`, sub: `${esc(niceDate(b.date))} · ${st.length - left.length} of ${st.length} done · next: ${esc(left[0].label)}`, btn: 'Lock it in' });
    }
    if (!lock.size) return;
    for (let i = out.length - 1; i >= 0; i--) { const it = out[i]; if ((it.type === 'task' && it.b && lock.has(it.b.id)) || (it.type === 'ap' && /^confirm:/.test(it.k) && lock.has(String(it.k).slice(8)))) out.splice(i, 1); }
    for (const v of lock.values()) if (v) out.push(v);
  }
  function nmLock(bid) {
    const b0 = nmBk(bid); if (!b0) return;
    try { navSheet('lock:' + bid, () => nmLock(bid)); } catch (_) {}
    sheet(`<h3>Lock it in</h3><p class="note" style="margin:0 0 10px">${esc(bName(b0))}${b0.date ? ' · ' + esc(niceDate(b0.date)) : ''}</p><div class="ssx-wr-bar"><i></i></div><div class="ssx-wr-list"></div><div class="ssx-lk-epk"></div>
      <div class="actions"><button type="button" class="btn" data-wr-open>Open the show</button><span class="spacer"></span><button type="button" class="btn primary" data-wr-done>Done for now</button></div>`, root => {
      const draw = () => {
        const b = nmBk(bid); if (!b) return close();
        const steps = nmLockSteps(b), fin = steps.filter(x => x.done || x.skipped).length;
        root.querySelector('.ssx-wr-bar i').style.width = Math.round(fin / Math.max(1, steps.length) * 100) + '%';
        root.querySelector('.ssx-wr-bar').setAttribute('aria-label', `${fin} of ${steps.length} done`);
        root.querySelector('.ssx-wr-list').innerHTML = steps.map((x, i) => `<div class="ssx-wr-row${x.done ? ' done' : x.skipped ? ' skip' : ''}" data-i="${i}">
          <span class="ssx-wr-ic" aria-hidden="true">${x.done ? '✓' : x.skipped ? '–' : x.icon}</span>
          <span class="ssx-wr-tx">${esc(x.label)}${x.due && !x.done ? `<span class="note">${esc(nmWhen(x.due))}</span>` : x.skipped ? `<span class="note">${x.k === 'cal' && b.gcalOff ? 'Calendar is turned off for this show' : 'Skipped'}</span>` : ''}</span>
          <span class="ssx-wr-bt">${x.task ? (x.done ? '<button type="button" class="btn small ghost" data-lk-undo>Undo</button>' : '<button type="button" class="btn small primary" data-lk-go>Done</button>')
            : x.done && !x.keep ? '' : x.skipped ? (x.k === 'cal' && b.gcalOff ? '' : '<button type="button" class="btn small" data-lk-back>Bring back</button>')
            : `<button type="button" class="btn small${x.done ? '' : ' primary'}" data-lk-go>${esc(x.btn)}</button>${x.done ? '' : `${x.alt ? '<button type="button" class="btn small ghost" data-lk-alt>I sent it another way</button>' : ''}<button type="button" class="btn small ghost" data-lk-skip>Skip</button>`}`}</span></div>`).join('');
        const ep = root.querySelector('.ssx-lk-epk');
        ep.innerHTML = `<label class="ssx-check"><input type="checkbox" ${b.epkOff ? '' : 'checked'}> Show it on my EPK as an upcoming show</label>`;
        ep.querySelector('input').onchange = async e => { const on = e.target.checked; if (await window.patch('bookings', bid, { epkOff: !on })) toast(on ? 'On your EPK' : 'Hidden from your EPK'); };
        root.querySelectorAll('.ssx-wr-row').forEach(row => {
          const x = steps[+row.dataset.i], go = row.querySelector('[data-lk-go]'), sk = row.querySelector('[data-lk-skip]'), back = row.querySelector('[data-lk-back]'), un = row.querySelector('[data-lk-undo]');
          if (go) go.onclick = async () => {
            go.disabled = true;
            if (x.task) { await setTask(bid, x.key, true); try { syncChecks(bid, x.key, true); } catch (_) {} }
            else { try { closeAll(); } catch (_) {} try { await x.go(); } catch (e) { console.error(e); } return; } // the email opens on its own, in front; this list waits in Next moves
            if (document.body.contains(root)) setTimeout(draw, 250);
          };
          const alt = row.querySelector('[data-lk-alt]'); if (alt) alt.onclick = async () => { await apSave({ done: { ...apCfg().done, [x.alt]: true } }); draw(); };
          if (un) un.onclick = async () => { await setTask(bid, x.key, false); try { syncChecks(bid, x.key, false); } catch (_) {} setTimeout(draw, 250); };
          if (sk) sk.onclick = async () => { await apSave({ dismissed: { ...apCfg().dismissed, [x.skipKey]: true } }); draw(); };
          if (back) back.onclick = async () => { const d = { ...apCfg().dismissed }; delete d[x.skipKey]; await apSave({ dismissed: d }); draw(); };
        });
        if (steps.length && fin === steps.length && !root.dataset.cheered) { root.dataset.cheered = '1'; toast(`${bName(b)} is locked in`); }
      };
      draw();
      root.querySelector('[data-wr-open]').onclick = () => window.bookingView(bid);
      root.querySelector('[data-wr-done]').onclick = () => close();
      root.__lkDraw = draw;
    });
  }
  // the show's own page: a Lock it in button while there's something left to do
  function nmLockRow(root) {
    const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key, m = cur && /^b:(.+)$/.exec(cur); if (!m || !root.querySelector('[data-status]')) return;
    const b = nmBk(m[1]); let row = root.querySelector('.ssx-lk-open');
    const steps = nmLockable(b) ? nmLockSteps(b) : [], left = steps.filter(x => !x.done && !x.skipped).length, state = left ? `${steps.length - left}/${steps.length}` : '';
    if ((row ? row.dataset.state : '') === state) return;
    if (!state) { if (row) row.remove(); return; }
    if (!row) { row = document.createElement('div'); row.className = 'ssx-wr-open ssx-lk-open'; const h = root.querySelector('.head'); h ? h.after(row) : root.prepend(row); }
    row.dataset.state = state;
    row.innerHTML = `<span>🔒 <b>Lock it in</b> <span class="note">${steps.length - left} of ${steps.length} done</span></span><button type="button" class="btn small primary">Lock it in</button>`;
    row.querySelector('button').onclick = () => nmLock(b.id);
  }
  // right after you mark a show Confirmed (here, not from another device), Lock it in opens once
  function nmLockWatch() {
    let list = []; try { list = bk(); } catch (_) { return; }
    const now = new Map(list.map(b => [b.id, stat(b)]));
    if (!NM_LOCK.seen) { NM_LOCK.seen = now; return; }
    for (const b of list) {
      const was = NM_LOCK.seen.get(b.id);
      if (was === undefined || was === 'confirmed' || now.get(b.id) !== 'confirmed' || NM_LOCK.opened[b.id] || !nmLockable(b)) continue;
      if (Date.now() - Date.parse(b.updatedAt || 0) > 20000 || b.requestStatus === 'accepted') continue; // accepted requests open the confirmation email instead
      NM_LOCK.opened[b.id] = 1;
      let n = 0; const tryOpen = () => {
        const sr = document.getElementById('sheetRoot'), cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key;
        const free = !sr || !sr.innerHTML.trim() || cur === 'b:' + b.id;
        if (free && nmLockSteps(nmBk(b.id) || b).some(x => !x.done && !x.skipped)) nmLock(b.id); else if (!free && n++ < 20) setTimeout(tryOpen, 500);
      };
      setTimeout(tryOpen, 900);
    }
    NM_LOCK.seen = now;
  }
  /* -- Business profile: your details in one place. Stage name, legal name, business name, email, phone, website, address,
     tax type, tax state and how you get paid. Saving writes them to every place that uses them: Profile (settings/profile),
     invoices (settings/invoice), the W-9 (settings/w9, never the SSN/EIN), mileage (settings/autopilot.home) and Taxes
     (settings/autopilot.state). Each of those still keeps its own copy, so a one-off change on an invoice stays there. */
  const BIZ = { busy: false };
  const bizCur = () => {
    const p = (() => { try { return S.profile || {}; } catch (_) { return {}; } })(), k = (() => { try { return S.invset || {}; } catch (_) { return {}; } })(), w = FL_W9.saved || {}, c = apCfg();
    const lines = String(k.address || '').split('\n').map(x => x.trim()).filter(Boolean);
    const cityLine = w.city || lines.slice(1).join(', ') || '', m = /^(.*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/.exec(cityLine) || /^(.*?),\s*([A-Z]{2})\s*$/.exec(cityLine);
    const stage = p.djName || '', legal = k.name || w.name || p.myName || '';
    return {
      stage, legal, biz: w.biz || (k.biz && k.biz !== stage && k.biz !== legal ? k.biz : ''),
      email: k.email || p.email || '', phone: k.phone || p.phone || '', website: k.website || p.website || '',
      street: w.street || lines[0] || '', city: m ? m[1].trim() : cityLine, st: m ? m[2] : (c.state || ''), zip: m && m[3] ? m[3] : '',
      cls: w.cls || 'ind', llc: w.llc || '', taxState: c.state || (m ? m[2] : ''),
    };
  };
  const bizAddr = v => [v.street, [v.city, [v.st, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join('\n');
  const bizPay = () => { try { const h = PH(); return PH_DEF.filter(([k]) => h[k]).map(([k, l]) => `${l}: ${h[k]}`); } catch (_) { return []; } };
  function bizSheet() {
    const v = bizCur(), f = (id, label, val, attrs = '') => `<div class="f"><label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" ${attrs}></div>`;
    const stOpts = sel => `<option value="">Choose…</option>${STATES.map(s => `<option value="${s[0]}" ${s[0] === sel ? 'selected' : ''}>${esc(s[1])}</option>`).join('')}`, pay = bizPay();
    try { navSheet('biz', () => bizSheet()); } catch (_) {}
    sheet(`<h3>Business profile</h3><p class="note" style="margin:0 0 6px">Fill this in once. Your invoices, W-9, mileage and taxes all use it, and so do your email fill-ins.</p>
      <div class="frow">${f('bz-stage', 'Stage name', v.stage, 'maxlength="80"')}${f('bz-legal', 'Legal name', v.legal, 'maxlength="80" autocomplete="name"')}</div>
      ${f('bz-biz', 'Business name <i class="note">(optional, if you have one)</i>', v.biz, 'maxlength="80"')}
      <div class="frow">${f('bz-email', 'Email', v.email, 'type="email" maxlength="120"')}${f('bz-phone', 'Phone', v.phone, 'type="tel" maxlength="40"')}</div>
      ${f('bz-web', 'Website <i class="note">(optional)</i>', v.website, 'type="url" maxlength="160"')}
      ${f('bz-street', 'Street address', v.street, 'maxlength="100" autocomplete="street-address"')}
      <div class="ssx-bz-city">${f('bz-city', 'City', v.city, 'maxlength="60"')}<div class="f"><label for="bz-st">State</label><select id="bz-st">${stOpts(v.st)}</select></div>${f('bz-zip', 'ZIP', v.zip, 'maxlength="10" inputmode="numeric"')}</div>
      <p class="note" style="margin:-4px 0 4px">Your address goes on invoices and your W-9, and mileage is measured from it.</p>
      <div class="frow"><div class="f"><label for="bz-cls">Tax type</label><select id="bz-cls">${FL_W9_CLS.map(([c, l]) => `<option value="${c}" ${c === v.cls ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><label for="bz-tst">State you pay taxes in</label><select id="bz-tst">${stOpts(v.taxState)}</select></div></div>
      <div class="f" id="bz-llcw" ${v.cls === 'llc' ? '' : 'hidden'}><label for="bz-llc">How your LLC is taxed</label><select id="bz-llc"><option value="">Choose…</option>${[['C', 'C corporation'], ['S', 'S corporation'], ['P', 'Partnership']].map(([c, l]) => `<option value="${c}" ${c === v.llc ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label>How you get paid</label><div class="ssx-bz-pay"><span class="note">${pay.length ? esc(pay.join(' · ')) : 'No Venmo, Zelle, Cash App or PayPal saved yet.'}</span><button type="button" class="btn small" data-bz-pay>${pay.length ? 'Edit' : 'Add'}</button></div></div>
      <p class="note">Your SSN or EIN is never saved. You type it on the W-9 each time.</p>
      <div class="actions"><button type="button" class="btn" data-bz-cancel>Cancel</button><button type="button" class="btn primary" data-bz-save>Save everywhere</button></div>`, root => {
      const q = s => root.querySelector(s), val = s => (q(s) || {}).value ? q(s).value.trim() : '';
      q('#bz-cls').onchange = e => { q('#bz-llcw').hidden = e.target.value !== 'llc'; };
      let tstTouched = false; q('#bz-tst').onchange = () => { tstTouched = true; };
      q('#bz-st').onchange = e => { if (!tstTouched || !q('#bz-tst').value) q('#bz-tst').value = e.target.value; }; // tax state follows your address unless you pick another
      q('[data-bz-pay]').onclick = () => { try { payForm(); } catch (_) {} };
      q('[data-bz-cancel]').onclick = () => close();
      q('[data-bz-save]').onclick = async e => {
        if (BIZ.busy) return; const btn = e.currentTarget;
        const n = { stage: val('#bz-stage'), legal: val('#bz-legal'), biz: val('#bz-biz'), email: val('#bz-email'), phone: val('#bz-phone'), website: val('#bz-web'), street: val('#bz-street'), city: val('#bz-city'), st: q('#bz-st').value, zip: val('#bz-zip'), cls: q('#bz-cls').value, llc: q('#bz-cls').value === 'llc' ? q('#bz-llc').value : '', taxState: q('#bz-tst').value };
        if (n.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.email)) { toast('Check the email address'); q('#bz-email').focus(); return; }
        if (n.zip && !/^\d{5}(-\d{4})?$/.test(n.zip)) { toast('ZIP should look like 92104'); q('#bz-zip').focus(); return; }
        BIZ.busy = true; btn.disabled = true; btn.textContent = 'Saving…';
        try {
          const p = S.profile || {}, k = S.invset || {}, addr = bizAddr(n), cityLine = [n.city, [n.st, n.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          await window.save('settings', 'profile', { ...p, djName: n.stage, myName: p.myName || n.legal, email: n.email, phone: n.phone, website: n.website });
          const inv = { ...k, biz: n.biz || n.stage || n.legal, name: n.legal, email: n.email, phone: n.phone, address: addr, website: n.website };
          if (await window.save('settings', 'invoice', inv)) { try { S.invset = inv; } catch (_) {} }
          const w = { ...(FL_W9.saved || {}), name: n.legal, biz: n.biz, cls: n.cls, llc: n.llc, street: n.street, city: cityLine };
          if (st.db) { await st.db.doc('settings/w9').set(w).catch(() => {}); FL_W9.saved = w; }
          const upd = {}; if (n.taxState) upd.state = n.taxState;
          const home = apCfg().home || {}, full = [n.street, cityLine].filter(Boolean).join(', ');
          let geoNote = '';
          if (n.street && n.city && normAddr(full) !== normAddr(home.address)) {
            let h = null; try { h = await geoFind(full); } catch (_) {}
            if (h) upd.home = { address: full.slice(0, 200), lat: h.lat, lon: h.lon, city: h.city || n.city }; else geoNote = " Mileage couldn't find that address, so it still measures from your old one.";
          }
          if (Object.keys(upd).length) apSave(upd);
          close(); toast('Saved. Your invoices, W-9, mileage and taxes are up to date.' + geoNote);
        } catch (err) { console.error(err); toast("Couldn't save everything. Check your connection and try again."); }
        BIZ.busy = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Save everywhere'; }
      };
    });
  }
  // Settings: the Business profile card under your profile
  function bizCard() {
    const prof = document.getElementById('ssx-profile'); if (!prof || !st.db) return;
    const v = bizCur(), pay = bizPay(), missing = [!v.legal && 'legal name', !v.street && 'address', !v.email && 'email', !pay.length && 'how you get paid'].filter(Boolean);
    const sig = JSON.stringify([v, pay]); let card = document.getElementById('ssx-biz');
    if (card && card.dataset.sig === sig) return;
    if (!card) { card = document.createElement('div'); card.id = 'ssx-biz'; card.className = 'card ssx'; prof.after(card); }
    card.dataset.sig = sig;
    const line = (l, x) => x ? `<div class="ssx-bz-l"><span class="eyebrow">${l}</span><span>${esc(x)}</span></div>` : '';
    card.innerHTML = `<div class="ssx-head"><div><h3>Business profile</h3><p class="note">One place for the details on your invoices, W-9, mileage and taxes.</p></div><button type="button" class="btn small ${missing.length ? 'primary' : ''}" data-bz-open>${missing.length ? 'Finish it' : 'Edit'}</button></div>
      <div class="ssx-bz-sum">${line('Stage name', v.stage)}${line('Legal name', v.legal)}${line('Business', v.biz)}${line('Contact', [v.email, v.phone].filter(Boolean).join(' · '))}${line('Address', bizAddr(v).replace('\n', ', '))}${line('Tax type', ((FL_W9_CLS.find(c => c[0] === v.cls) || [])[1] || '') + (v.taxState ? ` · taxes in ${(STATES.find(s => s[0] === v.taxState) || [, v.taxState])[1]}` : ''))}${line('Paid by', pay.join(' · '))}</div>
      ${missing.length ? `<p class="note ssx-warn" style="margin:8px 0 0">Still missing: ${esc(missing.join(', '))}.</p>` : ''}`;
    card.querySelector('[data-bz-open]').onclick = () => bizSheet();
  }
  // where your details are used, a small note points back to the Business profile
  function bizNotes(root) {
    const spots = [['#ivs-biz', 'details', 'These come from your Business profile. Changes here only affect your invoices.'], ['#w9-name', null, 'Filled in from your Business profile.']];
    for (const [sel, wrapSel, text] of spots) {
      const el = root.querySelector(sel); if (!el || root.querySelector('.ssx-bz-from[data-for="' + sel + '"]')) continue;
      const wrap = wrapSel ? el.closest(wrapSel) : null, at = wrap ? wrap.querySelector('summary') : el.closest('.f');
      const n = document.createElement('p'); n.className = 'note ssx-bz-from'; n.dataset.for = sel;
      n.innerHTML = `${esc(text)} <button type="button" class="linkbtn" data-bz-open>Edit Business profile</button>`;
      n.querySelector('button').onclick = () => bizSheet();
      if (wrap && at) at.after(n); else if (at) at.before(n);
    }
  }
  /* -- Google Tasks without duplicates: every new task first checks your "Set & Settled" list for the same task (same name and
     due date) and links to it instead of adding a copy, and the same task is never sent twice from one device. Every few
     minutes, extra copies are removed: the one the app is linked to stays (or the oldest, if none is linked). */
  const GT_DUP = { items: null, at: 0, cleaned: 0, busy: false, hooked: false };
  async function flGtList(fresh) { if (!fresh && GT_DUP.items && Date.now() - GT_DUP.at < 15000) return GT_DUP.items; GT_DUP.items = (await flGtCall('list_tasks', {})).tasks || []; GT_DUP.at = Date.now(); return GT_DUP.items; }
  function flGtLinked() {
    const s = new Set();
    try { for (const b of flBk()) for (const g of Object.values(b.taskG || {})) if (g && g.id) s.add(g.id); for (const c of S.contacts || []) for (const l of (Array.isArray(c.outreach) ? c.outreach : [])) if (l && l.g && l.g.id) s.add(l.g.id); } catch (_) {}
    return s;
  }
  const gtDay = d => String(d || '').slice(0, 10), gtName = t => String(t || '').trim().toLowerCase();
  async function flGtFindSame(title, due) {
    try { const linked = flGtLinked(), items = await flGtList(true); return items.find(x => !x.deleted && x.status !== 'completed' && gtName(x.title) === gtName(title) && gtDay(x.due) === gtDay(due) && !linked.has(x.id)) || null; } catch (_) { return null; }
  }
  async function flGtClean(force) {
    if (GT_DUP.busy || (!force && (document.hidden || Date.now() - GT_DUP.cleaned < 240000))) return;
    const linked = flGtLinked(); if (!FL_GT.auto && !linked.size) return;
    GT_DUP.busy = true; GT_DUP.cleaned = Date.now();
    try {
      const items = (await flGtList(true)).filter(x => !x.deleted), groups = new Map(); let n = 0;
      for (const x of items) { const k = gtName(x.title) + '|' + gtDay(x.due); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        const mine = list.filter(x => linked.has(x.id)), keep = new Set(mine.length ? mine.map(x => x.id) : [list.slice().sort((a, b) => String(a.updated || '').localeCompare(String(b.updated || '')))[0].id]);
        for (const x of list) if (!keep.has(x.id) && n < 40) { try { await flGtCall('delete_task', { taskId: x.id }); n++; } catch (e) { console.error(e); } }
      }
      if (n) { GT_DUP.items = null; toast(`Removed ${n} duplicate${n === 1 ? '' : 's'} from Google Tasks`); }
    } catch (e) { console.error(e); } finally { GT_DUP.busy = false; }
  }
  function flGtCleanHook() {
    if (GT_DUP.hooked || !st.db || !FL_GT.loaded) return; GT_DUP.hooked = true;
    setTimeout(() => flGtClean(true), 8000); setInterval(() => flGtClean(), 300000); window.addEventListener('focus', () => flGtClean());
  }
  /* -- One "Add a show": on a new booking you can paste an email or DM and the form fills itself in (date, set times, fee,
     venue, promoter or contact, plus the message in Notes), with what was found listed so you can check it. If the date has
     already passed, it offers to save the show to Show history instead (or keep it as a booking to invoice it). */
  const AS_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const asPad = n => String(n).padStart(2, '0');
  function asDate(y, m, d, hasYear) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    const t = todayStr(); let yy = y ? (y < 100 ? 2000 + y : y) : +t.slice(0, 4);
    let s = `${yy}-${asPad(m)}-${asPad(d)}`; if (!hasYear && s < addDays(t, -2)) s = `${yy + 1}-${asPad(m)}-${asPad(d)}`; // no year given: the next one coming up
    return s;
  }
  const asTime = (h, mi, ap) => { h = +h; mi = +(mi || 0); ap = String(ap || '').toLowerCase().replace(/\./g, ''); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return h > 23 || mi > 59 ? '' : `${asPad(h)}:${asPad(mi)}`; };
  function flParseInquiry(text) {
    const T = String(text || ''), low = T.toLowerCase(), out = { found: [] };
    // date: "March 14", "Mar 14th, 2027", "14 March", "3/14", "3/14/27"
    const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
    let m = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(T);
    if (m) out.date = asDate(m[3] ? +m[3] : 0, AS_MON[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3)], +m[2], !!m[3]);
    if (!out.date && (m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(T))) out.date = asDate(m[3] ? +m[3] : 0, AS_MON[m[2].toLowerCase().slice(0, 3)], +m[1], !!m[3]);
    if (!out.date && (m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(T))) out.date = asDate(m[3] ? +m[3] : 0, +m[1], +m[2], !!m[3]);
    // set times: "10pm-2am", "9 to 11 PM", "10:30 PM"
    if ((m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(T))) {
      const ap2 = m[6], ap1 = m[3] || (+m[1] > +m[4] && /p/i.test(ap2) ? 'pm' : ap2);
      out.start = asTime(m[1], m[2], ap1); out.end = asTime(m[4], m[5], ap2);
    } else if ((m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(T))) out.start = asTime(m[1], m[2], m[3]);
    // fee: a $ amount next to fee/pay/guarantee/offer/rate, else the biggest $ amount
    const money = [...T.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?|\b(\d{2,6})\s*(?:dollars|usd)\b/gi)].map(x => ({ v: Number(String(x[1] || x[3]).replace(/,/g, '')) + (x[2] ? +x[2] / 100 : 0), i: x.index }));
    if (money.length) { const near = money.find(x => /(fee|pay|paying|guarantee|offer|rate|budget|flat)/i.test(T.slice(Math.max(0, x.i - 40), x.i + 30))); out.fee = (near || money.slice().sort((a, b) => b.v - a.v)[0]).v; }
    out.emails = [...new Set((T.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(x => x.toLowerCase()))];
    out.phones = [...new Set((T.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || []).map(x => x.trim()))];
    out.handles = [...new Set([...T.matchAll(/(?:^|[\s(])@([A-Za-z0-9._]{2,30})/g)].map(x => x[1].replace(/\.$/, '').toLowerCase()))];
    const subj = /^\s*subject:\s*(.+)$/im.exec(T); if (subj) out.title = subj[1].trim().slice(0, 120);
    // people and venues you already have, by name, email or Instagram
    const has = s => { s = String(s || '').trim().toLowerCase(); return s.length >= 3 && new RegExp(`(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(low); };
    let cs = []; try { cs = S.contacts || []; } catch (_) {}
    const hit = c => (c.email && out.emails.includes(String(c.email).toLowerCase())) || (c.instagram && out.handles.includes(String(c.instagram).replace(/^@/, '').toLowerCase())) || has(cName(c));
    out.venue = cs.find(c => c.type === 'venue' && hit(c)) || null;
    out.promo = cs.find(c => c.type === 'promoter' && isColl(c) && hit(c)) || null;
    out.person = cs.find(c => c.type === 'promoter' && !isColl(c) && hit(c)) || cs.find(c => c.type !== 'venue' && !isColl(c) && c.email && out.emails.includes(String(c.email).toLowerCase())) || null;
    const known = new Set(cs.map(c => String(c.email || '').toLowerCase()).filter(Boolean)); out.newEmails = out.emails.filter(e => !known.has(e));
    return out;
  }
  function asSet(root, sel, val) {
    const el = root.querySelector(sel); if (!el || val == null || val === '') return false;
    if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(val))) return false;
    el.value = String(val); try { if (typeof el._sync === 'function') el._sync(); } catch (_) {}
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }
  function asTimeSet(root, id, hhmm) {
    if (!hhmm) return false; const [h, mi] = hhmm.split(':').map(Number), g = p => root.querySelector(`[data-tsel="${id}"][data-part="${p}"]`); if (!g('h')) return false;
    const h12 = String(h % 12 || 12), ap = h < 12 ? 'AM' : 'PM', mm = g('m'); g('h').value = h12; if (mm && ![...mm.options].some(o => +o.value === mi)) mm.add(new Option(asPad(mi), String(mi))); if (mm) mm.value = String(mi); g('ap').value = ap;
    ['h', 'm', 'ap'].forEach(p => g(p) && g(p).dispatchEvent(new Event('change', { bubbles: true }))); return true;
  }
  function flAddShow(root) {
    const h = root.querySelector('h3'), date = root.querySelector('#b-date'); if (!h || !date || !/^new booking$/i.test(h.textContent.trim())) return;
    if (!root.querySelector('.ssx-as')) {
      const box = document.createElement('details'); box.className = 'ssx-as';
      box.innerHTML = `<summary>📋 Paste an email or DM to fill this in</summary>
        <textarea id="ssx-as-text" placeholder="Paste the message they sent you: date, times, fee, venue…" style="min-height:110px"></textarea>
        <div class="ssx-as-a"><button type="button" class="btn small primary" data-as-go>Fill in the form</button><span class="note">Nothing is saved until you tap Add booking.</span></div><div class="ssx-as-out" aria-live="polite"></div>`;
      h.after(box);
      box.querySelector('[data-as-go]').onclick = () => {
        const txt = box.querySelector('#ssx-as-text').value.trim(), outBox = box.querySelector('.ssx-as-out'); if (!txt) { box.querySelector('#ssx-as-text').focus(); return; }
        const r = flParseInquiry(txt), got = [], miss = [];
        if (r.title && asSet(root, '#b-title', r.title)) got.push(['Name', r.title]);
        if (r.date && asSet(root, '#b-date', r.date)) got.push(['Date', niceDate(r.date)]); else miss.push('date');
        if (asTimeSet(root, 'b-ts', r.start)) got.push(['Set starts', r.start]); if (asTimeSet(root, 'b-te', r.end)) got.push(['Set ends', r.end]);
        if (r.fee && asSet(root, '#b-fee', r.fee)) got.push(['Fee', '$' + r.fee.toLocaleString('en-US')]); else if (!r.fee) miss.push('fee');
        if (r.venue && asSet(root, '#b-venue', r.venue.id)) { got.push(['Venue', cName(r.venue)]); if (r.venue.city) asSet(root, '#b-city', r.venue.city); } else miss.push('venue');
        if (r.promo && asSet(root, '#b-promo', r.promo.id)) got.push(['Promoter', cName(r.promo)]);
        if (r.person) setTimeout(() => { if (asSet(root, '#b-talk', r.person.id) || (!r.promo && asSet(root, '#b-promo', r.person.id))) {} }, 150);
        if (r.person) got.push(['Talking to', cName(r.person)]);
        const notes = root.querySelector('#b-notes'); if (notes && !notes.value.includes(txt.slice(0, 40))) { notes.value = `${notes.value ? notes.value + '\n\n' : ''}From their message:\n${txt.slice(0, 1500)}`; notes.dispatchEvent(new Event('input', { bubbles: true })); }
        const extra = [...r.newEmails, ...r.phones, ...r.handles.map(x => '@' + x)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 6);
        outBox.innerHTML = `${got.length ? `<div class="ssx-as-got">${got.map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</div>` : '<p class="note">I couldn\'t find show details in that message. Fill in the form below.</p>'}
          ${miss.length ? `<p class="note">Didn't find: ${esc(miss.join(', '))}. Check those below.</p>` : ''}
          ${extra.length ? `<p class="note">Not in People yet: ${esc(extra.join(', '))}. The whole message is in Notes, and "Add new…" on Venue or Promoter adds them.</p>` : ''}
          <p class="note">Check everything, then tap <b>Add booking</b>.</p>`;
        box.querySelector('summary').textContent = '📋 Filled in from the pasted message';
      };
    }
    // a date that's already passed: Show history, or keep it as a booking to invoice it
    if (!date.__asPast) {
      date.__asPast = true;
      const check = () => {
        let n = root.querySelector('.ssx-as-past'); const v = date.value;
        if (!v || v >= todayStr()) { if (n) n.remove(); return; }
        if (!n) { n = document.createElement('div'); n.className = 'ssx-as-past'; (date.closest('.frow') || date.closest('.f') || date).after(n); }
        n.innerHTML = `<p style="margin:0"><b>This date has passed.</b> If it's done and paid, save it to your Show history. It shows on your EPK and doesn't make tasks, invoices or reminders.</p>
          <div class="ssx-as-a"><button type="button" class="btn small primary" data-as-hist>Save to Show history</button><button type="button" class="btn small" data-as-keep>Keep it as a booking</button><span class="note">Keep it here if you still need to invoice or get paid.</span></div>`;
        n.querySelector('[data-as-keep]').onclick = () => n.remove();
        n.querySelector('[data-as-hist]').onclick = async e => {
          const btn = e.currentTarget, val = id => ((root.querySelector(id) || {}).value || '').trim(), vSel = root.querySelector('#b-venue'), ven = vSel && vSel.value && contact(vSel.value);
          const title = val('#b-title').slice(0, 120), venName = ven ? cName(ven) : ''; if (!title && !venName) { toast('Add the show name or venue first'); return; }
          btn.disabled = true;
          const id = await window.save('pastShows', null, { date: v, approx: false, title, venue: venName, city: val('#b-city') || (ven && ven.city) || '' });
          if (id) { closeAll(); toast(`Added ${title || venName} to your Show history`); } else btn.disabled = false;
        };
      };
      date.addEventListener('change', check); date.addEventListener('input', check); check();
    }
  }
  /* -- Learned defaults: on a new booking, picking a venue or promoter fills the empty fields from your last show with them:
     fee, set times, who you talk to, media person, income type and when payment is due (same number of days after the
     show). Only empty fields are filled, and a note says what came from where. */
  function flLearn(root) {
    const h = root.querySelector('h3'); if (!h || !/^new booking$/i.test(h.textContent.trim()) || root.__flLearn) return;
    const venue = root.querySelector('#b-venue'), promo = root.querySelector('#b-promo'), date = root.querySelector('#b-date'); if (!venue) return; root.__flLearn = true;
    const note = document.createElement('p'); note.className = 'note ssx-learn'; note.hidden = true; ((promo && (promo.closest('.frow') || promo)) || venue.closest('.frow') || venue).after(note);
    const blank = el => el && !String(el.value || '').trim();
    const setSel = (sel, v, dflt) => { const el = root.querySelector(sel); if (!el || !v || !(blank(el) || (dflt && el.selectedIndex === 0)) || el.value === v || ![...el.options].some(o => o.value === v)) return false; el.value = v; try { if (typeof el._sync === 'function') el._sync(); } catch (_) {} el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const setVal = (sel, v) => { const el = root.querySelector(sel); if (!blank(el) || v == null || v === '') return false; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const lastWith = (k, id) => bk().filter(x => x[k] === id && stat(x) !== 'lost').sort((a, c) => String(c.date || '').localeCompare(String(a.date || '')))[0];
    let dueOff = null, said = [];
    const applyDue = () => { if (dueOff == null || !date || !date.value) return; if (setVal('#b-due', addDays(date.value, dueOff)) && !said.includes('payment due date')) { said.push('payment due date'); show(); } };
    let src = '';
    const show = () => { if (!said.length) return; note.hidden = false; note.textContent = `Filled in the ${said.join(', ')} from ${src}. Change anything that's different.`; };
    const run = (k, id) => {
      if (!id || /^__/.test(id)) return; const last = lastWith(k, id), c = contact(id); if (!last || !c) return;
      if (!src) src = `your last show ${k === 'venueId' ? 'at' : 'with'} ${cName(c)} (${niceDate(last.date)})`;
      const got = [];
      if (+last.fee && setVal('#b-fee', last.fee)) got.push('fee');
      try { if (last.setStart && !readTime(root, 'b-ts')) { setTimeSel(root, 'b-ts', last.setStart); if (last.setEnd) setTimeSel(root, 'b-te', last.setEnd); got.push('set times'); } } catch (_) {}
      if (k === 'venueId' && setSel('#b-promo', last.promoterId)) got.push('promoter');
      if (setSel('#b-inctype', last.incomeType, true)) got.push('income type');
      if (setSel('#b-media', last.mediaId)) got.push('media person');
      setTimeout(() => { if (setSel('#b-talk', last.contactPersonId)) { said.push('who you talk to'); show(); } }, 200); // its list follows the promoter
      if (last.date && last.payDue) { const d = daysBetween(last.date, last.payDue); if (d >= 0 && d <= 120) { dueOff = d; applyDue(); } }
      if (got.length) { said = [...new Set([...said, ...got])]; show(); }
    };
    // runs before the older venue pre-fill, so one note covers everything that was filled in
    root.addEventListener('change', e => { if (e.target === venue) run('venueId', venue.value); else if (promo && e.target === promo) run('promoterId', promo.value); }, true);
    if (date) date.addEventListener('change', applyDue);
  }
  /* -- Fewer places to look: the menu is Home (with Goals), Bookings (named for your artist type, with its list and
     Calendar), Tasks, People, Financials, Kit (with Media) and Settings. The pages themselves don't change: grouped pages get
     a small switch under the title, the menu keeps the group lit while you're on any of its pages, and People gets its own
     clear "Messages & templates" card (with a way back from there). */
  const NAV_GROUP = { calendar: 'bookings', goals: 'home', comms: 'contacts', media: 'kit' };
  const NAV_SUB = { bookings: [['bookings', 'List'], ['calendar', 'Calendar']], kit: [['kit', 'Kit & EPK'], ['media', 'Media']], home: [['home', 'Home'], ['goals', 'Goals']] };
  // what the bookings section is called, by artist type
  const navBookName = () => { let A = {}; try { A = flArtist(); } catch (_) {} return A.kind === 'producer' ? 'Sessions' : A.group === 'service' ? 'Appointments' : A.group === 'movement' ? 'Gigs' : A.group === 'music' || A.group === 'comedy' ? 'Shows' : 'Bookings'; };
  function navGroups() {
    const tabs = document.getElementById('tabs'); if (!tabs) return;
    const bName = navBookName();
    tabs.querySelectorAll('button[data-tab]').forEach(b => {
      const t = b.dataset.tab;
      if (NAV_GROUP[t] && !b.classList.contains('ssx-navhide')) b.classList.add('ssx-navhide');
      if (t === 'bookings' && b.__ssxName !== bName) { const tn = [...b.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (tn) { tn.textContent = bName; b.title = bName; b.__ssxName = bName; } }
    });
    // page titles match the menu
    for (const [v, txt] of [['bookings', bName], ['comms', 'Messages']]) { const h2 = document.querySelector(`section[data-view="${v}"] > .head h2`); if (h2 && !h2.children.length && h2.textContent !== txt) h2.textContent = txt; }
    const secEl = document.querySelector('section[data-view]:not([hidden])'), cur = secEl && secEl.dataset.view; if (!cur) return;
    const grp = NAV_GROUP[cur] || cur;
    tabs.querySelectorAll('button[data-tab]').forEach(b => { const on = String(b.dataset.tab === grp); if (b.getAttribute('aria-current') !== on) b.setAttribute('aria-current', on); });
    const under = el => { const hd = secEl.querySelector(':scope > .head'); hd ? hd.after(el) : secEl.prepend(el); };
    // People: Messages & templates as its own card; on that page, a way back to People
    if (cur === 'contacts' && !secEl.querySelector(':scope > .ssx-msgcard')) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'card ssx-msgcard';
      c.innerHTML = `<span class="ssx-msgcard-ic" aria-hidden="true">✉️</span><span class="ssx-msgcard-tx"><b>Messages &amp; templates</b><span class="note">Your email and DM templates, and the emails you've sent</span></span><span class="ssx-msgcard-go" aria-hidden="true">›</span>`;
      c.onclick = () => window.setTab('comms'); under(c);
    }
    if (cur === 'comms' && !secEl.querySelector(':scope > .ssx-backto')) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'btn small ssx-backto'; c.textContent = '‹ People'; c.onclick = () => window.setTab('contacts');
      const hd = secEl.querySelector(':scope > .head'); hd ? hd.before(c) : secEl.prepend(c);
    }
    const subs = NAV_SUB[grp]; if (!subs) return;
    let sw = secEl.querySelector(':scope > .ssx-subnav');
    if (!sw) {
      sw = document.createElement('div'); sw.className = 'ssx-subnav'; sw.setAttribute('role', 'tablist'); sw.setAttribute('aria-label', 'Pages in this section');
      sw.innerHTML = subs.map(([t, l]) => `<button type="button" role="tab" data-ssx-sub="${t}">${esc(l)}</button>`).join('');
      sw.onclick = e => { const b = e.target.closest('[data-ssx-sub]'); if (b && b.getAttribute('aria-selected') !== 'true') window.setTab(b.dataset.ssxSub); };
      under(sw); // right under the page title
    }
    sw.querySelectorAll('[data-ssx-sub]').forEach(b => { const on = String(b.dataset.ssxSub === cur); if (b.getAttribute('aria-selected') !== on) b.setAttribute('aria-selected', on); });
  }
  // the menu and switches update every time the page changes
  function navWrap() {
    const f = window.setTab; if (typeof f !== 'function' || f.__ssxNav) return;
    const w = function () { const r = f.apply(this, arguments); try { navGroups(); } catch (_) {} return r; };
    w.__ssxNav = true; window.setTab = w; navGroups();
  }
/* -- Menu accordion: grouped pages open underneath their section in the menu instead of a switch inside the page.
     Shows → Calendar, Home → Goals, People → Messages & templates, Kit → Media. Tapping a section opens it (and goes there);
     tapping it again while you're on it closes it. This replaces the earlier navGroups. */
  const NAV_KIDS = { home: [['goals', 'Goals']], bookings: [['calendar', 'Calendar']], contacts: [['comms', 'Messages']], kit: [['media', 'Media']] };
  const NAV_ACC = { open: new Set(), last: '' };
  navGroups = function () {
    const tabs = document.getElementById('tabs'); if (!tabs) return;
    const btn = t => tabs.querySelector(`:scope > button[data-tab="${t}"]`), bName = navBookName();
    const setText = (b, txt) => { if (!b || b.__ssxName === txt) return; const tn = [...b.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (tn) { tn.textContent = txt; b.title = txt; b.__ssxName = txt; } };
    setText(btn('bookings'), bName);
    for (const [v, txt] of [['bookings', bName], ['comms', 'Messages & templates']]) { const h2 = document.querySelector(`section[data-view="${v}"] > .head h2`); if (h2 && !h2.children.length && h2.textContent !== txt) h2.textContent = txt; }
    const secEl = document.querySelector('section[data-view]:not([hidden])'), cur = secEl ? secEl.dataset.view : '', grp = NAV_GROUP[cur] || cur;
    if (cur && cur !== NAV_ACC.last) { NAV_ACC.last = cur; if (NAV_KIDS[grp]) NAV_ACC.open.add(grp); }
    for (const [p, kids] of Object.entries(NAV_KIDS)) {
      const pb = btn(p); if (!pb) continue; const open = NAV_ACC.open.has(p); let after = pb;
      pb.classList.add('ssx-navparent'); pb.classList.toggle('ssx-ingroup', grp === p && cur !== p); if (!pb.querySelector('.ssx-chev')) pb.insertAdjacentHTML('beforeend', '<span class="ssx-chev" aria-hidden="true">›</span>');
      if (pb.getAttribute('aria-expanded') !== String(open)) pb.setAttribute('aria-expanded', String(open));
      for (const [k, label] of kids) {
        const kb = btn(k); if (!kb) continue;
        if (after.nextElementSibling !== kb) after.after(kb); after = kb;
        kb.classList.add('ssx-subtab'); kb.classList.remove('ssx-navhide'); kb.classList.toggle('ssx-accoff', !open); setText(kb, label);
      }
    }
    tabs.querySelectorAll(':scope > button[data-tab]').forEach(b => { const on = String(b.dataset.tab === cur); if (b.getAttribute('aria-current') !== on) b.setAttribute('aria-current', on); });
    // the old in-page switches and links are no longer needed
    document.querySelectorAll('section[data-view] > .ssx-subnav, section[data-view] > .ssx-msgcard, section[data-view] > .ssx-backto').forEach(el => el.remove());
    if (!tabs.__ssxAcc) {
      tabs.__ssxAcc = true;
      tabs.addEventListener('click', e => {
        const b = e.target.closest('button.ssx-navparent'); if (!b || !tabs.contains(b)) return;
        const p = b.dataset.tab, now = (document.querySelector('section[data-view]:not([hidden])') || {}).dataset || {};
        if (now.view === p && NAV_ACC.open.has(p)) { NAV_ACC.open.delete(p); e.stopImmediatePropagation(); e.preventDefault(); navGroups(); return; }
        NAV_ACC.open.add(p);
      }, true);
    }
  };  
  /* -- Media folder fills itself in: a show's Media link always points at the Media folder the app made in Google Drive,
     and when a show is confirmed (with Google Drive set up) its Marketing folders (Media and Flyers) are made on their own. */
  const FL_MA = { tried: new Set(), at: 0 };
  function flMediaAuto() {
    if (Date.now() - FL_MA.at < 15000) return; FL_MA.at = Date.now();
    const list = flBk();
    // a Media folder the app already made, but the show's Media link is still empty
    for (const b of list) { let u = ''; try { u = subUrl(b, 'mkt', 'media'); } catch (_) {} if (u && !b.driveUrl && !FL_MA.tried.has('l' + b.id)) { FL_MA.tried.add('l' + b.id); window.patch('bookings', b.id, { driveUrl: u, driveId: b.folders.mkt.subs.media }); } }
    // confirmed shows coming up get their folders made, one at a time (services don't use a media folder)
    let ready = false; try { ready = flArtist().group !== 'service' && !!rootOf('mkt') && !!(S.drive && S.drive.account); } catch (_) {}
    if (!ready) return;
    const t = todayStr(), next = list.find(b => flKind(b.status) === 'confirmed' && b.date && b.date >= t && !b.driveUrl && !(b.folders || {}).mkt && (b.title || b.venueId) && !FL_MA.tried.has('m' + b.id));
    if (!next) return; FL_MA.tried.add('m' + next.id);
    makeEventFolder(next, 'mkt').then(r => { if (r) toast(`Media folder ready for ${bookingName(next)}`); }).catch(() => {});
  }
/* -- Where your work comes from: "How they found you" on every booking ("How did you hear about me?" on the request page),
     filled in on its own when you've worked with them before, plus a "Where your bookings come from" report on your shows page. */
  const FOUND = () => { let sv = false; try { sv = flArtist().group === 'service'; } catch (_) {} return [['saw', sv ? 'Saw my work' : 'Saw me play'], ['referral', 'Someone referred me'], ['repeat', 'Worked together before'], ['outreach', 'I reached out to them'], ['link', 'My booking link'], ['instagram', 'Instagram'], ['social', 'Other social media'], ['google', 'Google or my website'], ['other', 'Other']]; };
  const foundName = k => (FOUND().find(x => x[0] === k) || [, ''])[1];
  FL_BF.push(['found', 'How they found you', r => r.querySelector('#b-found'), 0, 0]);
  const _flBfList = flBfList;
  flBfList = function () { const l = _flBfList.apply(this, arguments); if (!l.some(x => x.key === 'found')) { const i = l.findIndex(x => x.key === 'notes'); l.splice(i < 0 ? l.length : i, 0, { key: 'found', place: 'more', label: '' }); } return l; };
  // shows they could have seen you at: your past bookings plus Show history
  function foundShows(skipId) {
    const t = todayStr(), out = [];
    for (const b of flBk()) if (b.id !== skipId && b.date && b.date < t && ['played', 'paid', 'confirmed'].includes(flKind(b.status))) out.push([b.id, b.date, bookingName(b)]);
    try { for (const p of S.pastShows || []) if (p.date) out.push(['p:' + p.id, p.date, [p.title, p.venue].filter(Boolean).join(' · ') || 'Past show']); } catch (_) {}
    return out.sort((a, b) => b[1].localeCompare(a[1])).slice(0, 150);
  }
  const foundShowName = id => { if (!id) return ''; if (id.startsWith('p:')) { const p = (S.pastShows || []).find(x => 'p:' + x.id === id); return p ? [p.title, p.venue].filter(Boolean).join(' · ') : ''; } const b = flBk().find(x => x.id === id); return b ? bookingName(b) : ''; };
  function flFoundEl(root) {
    if (!root.querySelector('#b-title') || !root.querySelector('#b-venue') || root.querySelector('#b-found')) return;
    const b = FL.formB || {}, sh = foundShows(b.id), ppl = (S.contacts || []).map(c => [c.id, cName(c)]).filter(x => x[1]).sort((a, c) => a[1].localeCompare(c[1]));
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    const w = document.createElement('div'); w.className = 'f ssx-found';
    w.innerHTML = `<label for="b-found">How they found you</label><select id="b-found" data-k="foundVia">${opt('', 'Not sure', b.foundVia || '')}${FOUND().map(([k, l]) => opt(k, l, b.foundVia || '')).join('')}</select>
      <select id="b-found-show" data-k="foundShowId" aria-label="Which show"${b.foundVia === 'saw' ? '' : ' hidden'}>${opt('', 'Which show? (optional)', b.foundShowId || '')}${sh.map(([id, d, n]) => opt(id, `${niceDate(d)} · ${n}`, b.foundShowId || '')).join('')}</select>
      <select id="b-found-by" data-k="foundById" aria-label="Who referred them"${b.foundVia === 'referral' ? '' : ' hidden'}>${opt('', 'Who? (optional)', b.foundById || '')}${ppl.map(([id, n]) => opt(id, n, b.foundById || '')).join('')}</select>
      <input id="b-found-txt" data-k="foundText" maxlength="120" placeholder="Details (optional)" value="${esc(b.foundText || '')}"${['other', 'social', 'saw', 'referral'].includes(b.foundVia) ? '' : ' hidden'}>`;
    const sel = w.querySelector('#b-found'), sync = () => { const v = sel.value; w.querySelector('#b-found-show').hidden = v !== 'saw'; w.querySelector('#b-found-by').hidden = v !== 'referral'; w.querySelector('#b-found-txt').hidden = !['other', 'social', 'saw', 'referral'].includes(v); };
    sel.addEventListener('change', sync);
    const notes = root.querySelector('#b-notes'), nf = notes && notes.closest('.f'); nf ? nf.before(w) : root.querySelector('.actions').before(w);
  }
  const _flBookForm = flBookForm;
  flBookForm = function (root) { try { flFoundEl(root); } catch (e) { console.error(e); } return _flBookForm.apply(this, arguments); };
  // fill in "Worked together before" on its own, and read the request page's answer
  const FL_FD = { at: 0, done: new Set() };
  function flFoundSweep() {
    if (Date.now() - FL_FD.at < 20000 || !window.patch) return; FL_FD.at = Date.now();
    const all = flBk().filter(b => flKind(b.status) !== 'lost'); let n = 0;
    for (const b of all) {
      if (b.foundVia || FL_FD.done.has(b.id) || !b.date || n >= 10) continue;
      const before = all.find(o => o.id !== b.id && o.date && o.date < b.date && ((b.venueId && o.venueId === b.venueId) || (b.promoterId && o.promoterId === b.promoterId)));
      if (before) { FL_FD.done.add(b.id); n++; window.patch('bookings', b.id, { foundVia: 'repeat', foundAuto: true, foundShowId: before.id }); }
    }
  }
  function flFoundFromRequest(d, b) {
    const upd = {}, ok = FOUND().map(x => x[0]); if (!d || !ok.includes(d.fv)) return upd;
    upd.foundVia = d.fv; const tx = String(d.fx || '').trim().slice(0, 120), low = tx.toLowerCase();
    if (tx && d.fv === 'saw') { const hit = foundShows(b.id).find(([, , n]) => String(n || '').toLowerCase().split(' · ').some(part => part.length >= 4 && (low.includes(part) || part.includes(low)))); if (hit) upd.foundShowId = hit[0]; }
    if (tx && d.fv === 'referral') { const c = (S.contacts || []).find(x => { const n = String(cName(x) || '').toLowerCase(); return n && (n === low || low.includes(n)); }); if (c) upd.foundById = c.id; }
    if (tx) upd.foundText = tx;
    return upd;
  }
  // the report: what brings in your work (this year so far plus everything booked ahead)
  function flFoundCard() {
    const sec = document.querySelector('section[data-view="bookings"]'); if (!sec) return;
    const t = todayStr(), from = addDays(t, -365), list = flBk().filter(b => b.date && b.date >= from && ['confirmed', 'played', 'paid'].includes(flKind(b.status)));
    const sig = list.map(b => b.id + (b.foundVia || '') + (b.foundShowId || '') + (b.foundById || '') + (b.fee || '')).join('|');
    let card = document.getElementById('ssx-found'); if (card && card.__sig === sig) return;
    if (!card) { card = document.createElement('details'); card.id = 'ssx-found'; card.className = 'card ssx ssx-foundcard'; sec.appendChild(card); }
    card.__sig = sig;
    const by = {}, shows = {}, ppl = {}, add = (o, k, b) => { const x = o[k] = o[k] || { n: 0, $: 0 }; x.n++; x.$ += +b.fee || 0; };
    for (const b of list) { add(by, b.foundVia || '', b); if (b.foundVia === 'saw' && b.foundShowId) add(shows, b.foundShowId, b); if (b.foundVia === 'referral' && b.foundById) add(ppl, b.foundById, b); }
    const $ = v => '$' + Math.round(v).toLocaleString('en-US'), rows = (o, name) => Object.entries(o).sort((a, b) => b[1].n - a[1].n || b[1].$ - a[1].$).slice(0, 5).map(([k, v]) => `<li><b>${esc(name(k))}</b><span>${v.n} booking${v.n === 1 ? '' : 's'}${v.$ ? ' · ' + $(v.$) : ''}</span></li>`).join('');
    const known = list.filter(b => b.foundVia), top = Object.entries(by).filter(([k]) => k).sort((a, b) => b[1].n - a[1].n)[0];
    card.innerHTML = `<summary><h3>Where your bookings come from</h3><span class="note">${known.length ? `Last 12 months and ahead: ${top ? `most from <b>${esc(foundName(top[0]))}</b> (${top[1].n})` : ''}` : 'Add "How they found you" to your shows to see what brings in your work.'}</span></summary>
      ${known.length ? `<ul class="ssx-foundlist">${rows(Object.fromEntries(Object.entries(by).filter(([k]) => k)), foundName)}</ul>` : ''}
      ${Object.keys(shows).length ? `<span class="eyebrow">Shows that led to more work</span><ul class="ssx-foundlist">${rows(shows, foundShowName)}</ul>` : ''}
      ${Object.keys(ppl).length ? `<span class="eyebrow">Who sends you work</span><ul class="ssx-foundlist">${rows(ppl, id => { const c = (S.contacts || []).find(x => x.id === id); return c ? cName(c) : 'Someone'; })}</ul>` : ''}
      ${list.length - known.length ? `<p class="note">${list.length - known.length} show${list.length - known.length === 1 ? '' : 's'} without an answer yet. Open a show → Edit → More details → How they found you.</p>` : ''}`;
  }  
/* -- Invoice template: set once how every new invoice reads (the main line, when it's due, invoice numbers, payment
     instructions and the note at the bottom). Saved with your invoice details (settings/invoice); invoices you already
     made keep their own wording. */
  const INV_TPL_DEF = '{perf} – {show}';
  const invTplFill = (t, b) => { let v = null; try { v = contact(b.venueId); } catch (_) {}
    const map = { perf: (() => { try { return flPerf(); } catch (_) { return 'Performance'; } })(), show: (() => { try { return showName(b); } catch (_) { return b.title || ''; } })(), venue: v ? cName(v) : '', date: b.date ? niceDate(b.date) : '', city: b.city || '' };
    return String(t || INV_TPL_DEF).replace(/\{(perf|show|venue|date|city)\}/g, (m, k) => map[k] || '').replace(/\s*(·|–|-|,)\s*(?=(·|–|-|,|$))/g, '').replace(/\(\s*\)/g, '').replace(/^\s*(·|–|-|,)\s*/, '').replace(/\s{2,}/g, ' ').trim() || map.show || map.perf; };
  function invTplWrap() {
    const o = window.newInvoice; if (typeof o !== 'function' || o.__ssxTpl) return;
    const w = function (b) { const inv = o.apply(this, arguments); try { const t = (S.invset || {}).lineTpl; if (t && inv && inv.lines && inv.lines[0] && inv.lines[0].kind === 'service') inv.lines[0].desc = invTplFill(t, b); } catch (_) {} return inv; };
    w.__ssxTpl = true; w.__fl = o.__fl; window.newInvoice = w;
  }
  const invNext = () => (flBk().filter(b => b.date && b.date >= todayStr() && ['confirmed', 'pitched'].includes(flKind(b.status))).sort((a, b) => a.date.localeCompare(b.date))[0]) || flBk().filter(b => b.date).sort((a, b) => b.date.localeCompare(a.date))[0] || { title: 'Friday Night Live', date: todayStr(), city: 'San Diego' };
  function invTplSheet() {
    const k = (() => { try { return INVSET(); } catch (_) { return {}; } })(), s0 = S.invset || {}, ex = invNext();
    const chip = (t, l) => `<button type="button" class="ssx-chip" data-it-ins="{${t}}">${l}</button>`;
    try { navSheet('invtpl', () => invTplSheet()); } catch (_) {}
    sheet(`<h3>Invoice template</h3><p class="note" style="margin:0 0 6px">Every new invoice starts like this. You can still change anything on a single invoice.</p>
      <div class="f"><label for="it-line">Main line</label><input id="it-line" maxlength="120" value="${esc(s0.lineTpl || INV_TPL_DEF)}">
        <div class="ssx-chips" style="margin-top:6px">${chip('perf', 'Performance type')}${chip('show', 'Show name')}${chip('venue', 'Venue')}${chip('date', 'Date')}${chip('city', 'City')}</div>
        <span class="note" id="it-line-ex"></span></div>
      <div class="frow"><div class="f"><label for="it-terms">Payment due</label><select id="it-terms">${[[0, 'When it\'s sent'], [7, '7 days after it\'s sent'], [14, '14 days after'], [15, '15 days after'], [30, '30 days after'], [45, '45 days after']].map(([n, l]) => `<option value="${n}"${Number(k.terms) === n ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="note">A show's own "Payment due on" date wins when it has one.</span></div>
        <div class="f"><label for="it-hourly">Hourly rate <i class="note">(optional)</i></label><input id="it-hourly" inputmode="decimal" maxlength="10" value="${esc(k.hourly || '')}" placeholder="e.g. 150"></div></div>
      <div class="f"><label for="it-prefix">Invoice numbers start with</label><input id="it-prefix" maxlength="12" value="${esc(String(k.prefix || '').replace(/-$/, ''))}"><span class="note">Numbers count up on their own each year, like ${esc((() => { try { return invNum(k); } catch (_) { return 'INV-2026-001'; } })())}.</span></div>
      <div class="f"><label for="it-pay">Extra payment instructions <i class="note">(optional)</i></label><textarea id="it-pay" maxlength="600" style="min-height:56px" placeholder="e.g. Checks payable to …">${esc(k.pay || '')}</textarea><span class="note">Your Venmo, Zelle, Cash App and PayPal are added on their own from your Business profile. Bank and card numbers are never saved.</span></div>
      <div class="f"><label for="it-note">Note at the bottom</label><textarea id="it-note" maxlength="600" style="min-height:56px">${esc(k.note ?? 'Thank you for having me!')}</textarea></div>
      <div class="ssx-itprev" id="it-prev"></div>
      <div class="actions"><button type="button" class="btn" data-it-cancel>Cancel</button>${ex.id ? '<button type="button" class="btn" data-it-try>Save and try it</button>' : ''}<button type="button" class="btn primary" data-it-save>Save template</button></div>`, root => {
      const q = s => root.querySelector(s), line = q('#it-line');
      const prev = () => { const due = Number(q('#it-terms').value) || 0; let num = ''; try { num = invSuggest(q('#it-prefix').value, String(new Date().getFullYear()), '').num; } catch (_) {}
        q('#it-line-ex').textContent = 'Example: ' + invTplFill(line.value, ex);
        q('#it-prev').innerHTML = `<span class="eyebrow">Preview</span><div><b>${esc(invTplFill(line.value, ex))}</b></div><div class="note">Invoice ${esc(num)} · due ${due ? due + ' days after it\'s sent' : 'when it\'s sent'}</div>${q('#it-note').value.trim() ? `<div class="ssx-itnote">${esc(q('#it-note').value.trim())}</div>` : ''}`; };
      root.addEventListener('input', prev); root.addEventListener('change', prev); prev();
      root.querySelectorAll('[data-it-ins]').forEach(b => b.onmousedown = e => e.preventDefault());
      root.querySelectorAll('[data-it-ins]').forEach(b => b.onclick = () => { const t = b.dataset.itIns, a = line.selectionStart ?? line.value.length, z = line.selectionEnd ?? a; line.value = (line.value.slice(0, a) + t + line.value.slice(z)).slice(0, 120); line.focus(); line.setSelectionRange(a + t.length, a + t.length); prev(); });
      q('[data-it-cancel]').onclick = () => close();
      const save = async () => {
        const hr = q('#it-hourly').value.replace(/[$,\s]/g, '');
        if (hr && !/^\d{1,6}(\.\d{1,2})?$/.test(hr)) { toast('Write the hourly rate as a number, like 150'); q('#it-hourly').focus(); return false; }
        const t = line.value.trim() || INV_TPL_DEF, cur = S.invset || {};
        const doc = { ...cur, lineTpl: t === INV_TPL_DEF ? '' : t, terms: Number(q('#it-terms').value) || 0, hourly: hr, prefix: q('#it-prefix').value.trim().slice(0, 12), pay: q('#it-pay').value.trim(), note: q('#it-note').value.trim() };
        if (!(await window.save('settings', 'invoice', doc))) { toast("Couldn't save. Check your connection and try again."); return false; }
        try { S.invset = doc; } catch (_) {} return true;
      };
      q('[data-it-save]').onclick = async () => { if (await save()) { close(); toast('Invoice template saved. New invoices start this way.'); } };
      const tr = q('[data-it-try]'); if (tr) tr.onclick = async () => { if (await save()) { close(); try { invoiceSheet(ex.id); } catch (_) {} } };
    });
  }
  // Settings: the Invoice template card under the Business profile
  function invTplCard() {
    const biz = document.getElementById('ssx-biz'); if (!biz) return;
    const k = (() => { try { return INVSET(); } catch (_) { return {}; } })(), s0 = S.invset || {}, ex = invNext();
    const sig = JSON.stringify([s0.lineTpl, k.terms, k.prefix, k.note, k.pay, k.hourly, ex.id, flBk().length]); let card = document.getElementById('ssx-invtpl');
    if (card && card.dataset.sig === sig) return;
    if (!card) { card = document.createElement('div'); card.id = 'ssx-invtpl'; card.className = 'card ssx'; biz.after(card); }
    card.dataset.sig = sig;
    card.innerHTML = `<div class="ssx-head"><div><h3>Invoice template</h3><p class="note">How every new invoice starts: the main line, when it's due, numbering, payment instructions and your note.</p></div><button type="button" class="btn small" data-it-open>Edit</button></div>
      <div class="ssx-bz-sum"><div class="ssx-bz-l"><span class="eyebrow">Main line</span><span>${esc(invTplFill(s0.lineTpl, ex))}</span></div><div class="ssx-bz-l"><span class="eyebrow">Due</span><span>${Number(k.terms) ? k.terms + ' days after it\'s sent' : 'When it\'s sent'}</span></div><div class="ssx-bz-l"><span class="eyebrow">Next number</span><span>${esc((() => { try { return invNum(k); } catch (_) { return ''; } })())}</span></div>${k.note ? `<div class="ssx-bz-l"><span class="eyebrow">Note</span><span>${esc(k.note)}</span></div>` : ''}</div>`;
    card.querySelector('[data-it-open]').onclick = () => invTplSheet();
  }  
/* -- My page: a public page at setnsettled.com/<your booking link name> with your upcoming confirmed shows (straight from
     your bookings), links, bio, photo and a Book me button, in your EPK colors. Nothing is public until you turn it on, and
     any show can be kept off it. Saved in settings/page; the website reads it through artist_page_public. */
  const PGE = { doc: null, loaded: false, at: 0, busy: false, epk: null };
  async function pgLoad() {
    if (PGE.loaded || !st.db) return; PGE.loaded = true;
    try { const s = await st.db.doc('settings/page').get(); PGE.doc = s.exists ? s.data() : {}; } catch (_) { PGE.doc = {}; }
    try { const e = await st.db.doc('settings/epk').get(); PGE.epk = e.exists ? e.data() : {}; } catch (_) { PGE.epk = {}; }
  }
  const pgSave = async patch => { const next = { ...(PGE.doc || {}), ...patch }; PGE.doc = next; try { await st.db.doc('settings/page').set(next); return true; } catch (_) { toast("Couldn't save your page. " + OFFLINE); return false; } };
  const pgSlug = () => (st.link || {}).slug || '';
  const pgUrl = () => pgSlug() ? `${location.origin}/${pgSlug()}` : '';
  const pgShows = () => flBk().filter(b => flKind(b.status) === 'confirmed' && b.date && b.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
  const pgLinkKey = l => String(l.id || l.url);
  function pgAllLinks() { let L = []; try { L = typeof sortedLinks === 'function' ? sortedLinks() : (S.links || []); } catch (_) {} return L.filter(l => l && /^https?:\/\//i.test(String(l.url || ''))); }
  async function pgPhoto() {
    let id = ''; try { id = flEpkAsset() || flAvatar(); } catch (_) {}
    const d = PGE.doc || {}; if (!id) return d.photo ? { key: '', data: '' } : null; if (d.photoKey === id && d.photo) return null;
    const src = flSrc(id); if (!src) return null;
    const img = new Image(); await new Promise((y, n) => { img.onload = y; img.onerror = n; img.src = src; });
    const N = 480, c = document.createElement('canvas'), s = Math.min(img.naturalWidth, img.naturalHeight); c.width = c.height = N;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, N, N);
    let data = c.toDataURL('image/jpeg', .82); if (data.length > 380000) data = c.toDataURL('image/jpeg', .6);
    return { key: id, data };
  }
  // keeps the page's name, colors, links, photo (and bio and tagline, unless you wrote your own) in step with the app
  async function pgSync(force) {
    if (PGE.busy || (!force && Date.now() - PGE.at < 30000)) return; await pgLoad(); const d = PGE.doc || {}; if (!d.on) return;
    PGE.at = Date.now(); PGE.busy = true;
    try {
      const p = S.profile || {}, k = S.kit || {}; let A = {}; try { A = flArtist(); } catch (_) {}
      let theme = d.theme || {}; try { const c = PGE.epk || {}, T = epkTheme(c.palette || 'champagne', c.mode || 'dark'); theme = { bg: T.bg, glow: T.glow, ink: T.ink, muted: T.muted, line: T.line, panel: T.panel, solid: T.solid, metal: T.metal }; } catch (_) {}
      const off = new Set(d.linkOff || []), links = pgAllLinks().filter(l => !off.has(pgLinkKey(l))).map(l => ({ label: String(l.label || l.url).slice(0, 60), url: String(l.url).slice(0, 500) })).slice(0, 24);
      const auto = { name: p.djName || p.myName || '', kind: A.kind || '', theme, links };
      if (!d.bioSet) auto.bio = k.bioShort || k.bioLong || ''; if (!d.tagSet) auto.tagline = k.genres || '';
      let ph = null; try { ph = await pgPhoto(); } catch (_) {} if (ph) { auto.photo = ph.data; auto.photoKey = ph.key; }
      if (Object.keys(auto).some(x => JSON.stringify(auto[x] ?? '') !== JSON.stringify(d[x] ?? ''))) await pgSave(auto);
    } catch (e) { console.error(e); } finally { PGE.busy = false; }
  }
  function pgSheet() {
    const d = PGE.doc || {}, k = S.kit || {}, hide = new Set(d.hide || []), off = new Set(d.linkOff || []), shows = pgShows().slice(0, 40), links = pgAllLinks();
    try { navSheet('page', () => pgSheet()); } catch (_) {}
    sheet(`<h3>My page</h3><p class="note" style="margin:0 0 6px">Your public page at <b>${esc(pgUrl().replace(/^https?:\/\//, ''))}</b>: upcoming shows, links, bio and a Book me button, in your EPK colors. Share it anywhere, like your Instagram bio.</p>
      <label class="ssx-check"><input type="checkbox" id="pg-on"${d.on ? ' checked' : ''}> <b>My page is public</b></label>
      <div class="f"><label for="pg-tag">One line about you</label><input id="pg-tag" maxlength="160" value="${esc(d.tagSet ? d.tagline || '' : (d.tagline || k.genres || ''))}" placeholder="e.g. Latin indie dance & baile funk"></div>
      <div class="f"><label for="pg-city">Based in <i class="note">(optional)</i></label><input id="pg-city" maxlength="80" value="${esc(d.city || '')}" placeholder="e.g. San Diego"></div>
      <div class="f"><label for="pg-bio">About</label><textarea id="pg-bio" maxlength="3000" style="min-height:110px">${esc(d.bioSet ? d.bio || '' : (d.bio || k.bioShort || k.bioLong || ''))}</textarea><span class="note">Starts from your Kit's short bio. Your picture is the one your EPK uses.</span></div>
      <div class="f"><label>Upcoming shows on your page</label>${shows.length ? `<div class="ssx-pglist">${shows.map(b => `<label class="ssx-check"><input type="checkbox" data-pg-show="${esc(b.id)}"${hide.has(b.id) ? '' : ' checked'}> ${esc(niceDate(b.date))} · ${esc(bookingName(b))}${b.ticketUrl ? ' · <span class="note">tickets</span>' : ''}</label>`).join('')}</div><span class="note">Every confirmed show appears on its own. Untick private ones, like weddings. Add a ticket link to a show and a Tickets button appears.</span>` : '<span class="note">No confirmed shows coming up. They appear here on their own.</span>'}</div>
      <div class="f"><label>Links</label>${links.length ? `<div class="ssx-pglist">${links.map(l => `<label class="ssx-check"><input type="checkbox" data-pg-link="${esc(pgLinkKey(l))}"${off.has(pgLinkKey(l)) ? '' : ' checked'}> ${esc(l.label || l.url)}</label>`).join('')}</div>` : '<span class="note">Add links (Instagram, SoundCloud, Spotify, your website) in Kit and they show up here.</span>'}</div>
      <div class="actions"><button type="button" class="btn" data-pg-cancel>Cancel</button>${d.on ? '<button type="button" class="btn" data-pg-open>Open my page</button>' : ''}<button type="button" class="btn primary" data-pg-save>Save</button></div>`, root => {
      const q = s => root.querySelector(s);
      q('[data-pg-cancel]').onclick = () => close();
      const op = q('[data-pg-open]'); if (op) op.onclick = () => window.open(pgUrl(), '_blank', 'noopener');
      q('[data-pg-save]').onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true;
        const on = q('#pg-on').checked, tag = q('#pg-tag').value.trim(), bio = q('#pg-bio').value.trim();
        const ok = await pgSave({ on, tagline: tag, tagSet: tag !== (k.genres || ''), city: q('#pg-city').value.trim(), bio, bioSet: bio !== (k.bioShort || k.bioLong || ''),
          hide: [...root.querySelectorAll('[data-pg-show]')].filter(c => !c.checked).map(c => c.dataset.pgShow), linkOff: [...root.querySelectorAll('[data-pg-link]')].filter(c => !c.checked).map(c => c.dataset.pgLink), updatedAt: new Date().toISOString() });
        btn.disabled = false; if (!ok) return;
        close(); toast(on ? 'Saved. Your page is live.' : 'Saved. Your page is off.'); if (on) pgSync(true);
      };
    });
  }
  // Kit: the My page card
  function pgCard() {
    const sec = document.querySelector('section[data-view="kit"]'); if (!sec || !st.db) return;
    if (!PGE.loaded) { pgLoad(); return; }
    const d = PGE.doc || {}, slug = pgSlug(), n = pgShows().filter(b => !(d.hide || []).includes(b.id)).length, addr = pgUrl().replace(/^https?:\/\//, '');
    const sig = JSON.stringify([!!d.on, slug, n, !!d.photo, (d.links || []).length]); let card = document.getElementById('ssx-page');
    if (card && card.dataset.sig === sig) return;
    if (!card) { card = document.createElement('div'); card.id = 'ssx-page'; card.className = 'card ssx'; const hd = sec.querySelector(':scope > .head'); hd ? hd.after(card) : sec.prepend(card); }
    card.dataset.sig = sig;
    card.innerHTML = !slug ? `<div class="ssx-head"><div><h3>My page</h3><p class="note">Your own public page with upcoming shows, links and a Book me button. It uses your booking link's name, so set that up first.</p></div><button type="button" class="btn small" data-pg-link-setup>Set up booking link</button></div>`
      : d.on ? `<div class="ssx-head"><div><h3>My page <span class="ssx-pill-on">Live</span></h3><p class="note"><b>${esc(addr)}</b> · ${n} upcoming show${n === 1 ? '' : 's'}</p></div><div class="ssx-row"><button type="button" class="btn small" data-pg-copy>Copy link</button><button type="button" class="btn small" data-pg-openc>Open</button><button type="button" class="btn small" data-pg-edit>Edit</button></div></div>`
      : `<div class="ssx-head"><div><h3>My page</h3><p class="note">Your own page at <b>${esc(addr)}</b>: ${n} upcoming show${n === 1 ? '' : 's'}, your links, bio and a Book me button. A website and link-in-bio in one. Nothing is public until you turn it on.</p></div><button type="button" class="btn small primary" data-pg-edit>Set it up</button></div>`;
    const b = s => card.querySelector(s);
    if (b('[data-pg-edit]')) b('[data-pg-edit]').onclick = () => pgSheet();
    if (b('[data-pg-openc]')) b('[data-pg-openc]').onclick = () => window.open(pgUrl(), '_blank', 'noopener');
    if (b('[data-pg-copy]')) b('[data-pg-copy]').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(pgUrl()) : Promise.reject()).then(() => toast('Page link copied'), () => toast(pgUrl()));
    if (b('[data-pg-link-setup]')) b('[data-pg-link-setup]').onclick = () => { try { curGroup = 'bookings'; localStorage.setItem('ss-setgroup', 'bookings'); } catch (_) {} window.setTab('settings'); };
  }
  /* -- Kit's menu: EPK (or Portfolio / Resume), My page and Media open underneath Kit, instead of living inside the Kit page.
     EPK opens the EPK creator; My page is its own page with the manager right on it. */
  NAV_KIDS.kit = [['epk', 'EPK'], ['mypage', 'My page'], ['media', 'Media']]; NAV_GROUP.mypage = 'kit';
  try { if (typeof TAB_NAMES === 'object') TAB_NAMES.mypage = 'My page'; } catch (_) {}
  const KM_ICON = {
    epk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/></svg>',
    mypage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"/></svg>'
  };
  function kmTabs() {
    const tabs = document.getElementById('tabs'), main = document.getElementById('main'), kit = document.querySelector('section[data-view="kit"]'); if (!tabs || !main || !kit) return;
    const k = tabs.querySelector(':scope > [data-tab="kit"]');
    for (const [t, label] of [['epk', 'EPK'], ['mypage', 'My page']]) {
      if (tabs.querySelector(`:scope > [data-tab="${t}"]`)) continue;
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = t; b.setAttribute('aria-current', 'false'); b.title = label; b.innerHTML = KM_ICON[t] + label;
      b.onclick = t === 'epk' ? () => { const e = document.getElementById('ssx-epk-btn'); if (e) e.click(); else toast('Open Kit once, then try again'); } : () => window.goTab('mypage');
      k ? k.after(b) : tabs.appendChild(b);
    }
    if (!document.querySelector('section[data-view="mypage"]')) {
      const sec = document.createElement('section'); sec.dataset.view = 'mypage'; sec.hidden = true;
      sec.innerHTML = `<div class="head"><div><h2>My page</h2><p class="note" style="margin:2px 0 0">Your public page: upcoming shows, links, bio and a Book me button, in your EPK colors. A website and link-in-bio in one.</p></div></div><div id="ssx-page" class="card ssx"></div><div id="ssx-pgform" class="card ssx"></div>`;
      (document.querySelector('section[data-view="media"]') || kit).after(sec);
    }
  }
  const _navGroupsKM = navGroups;
  navGroups = function () { try { kmTabs(); } catch (e) { console.error(e); } return _navGroupsKM.apply(this, arguments); };
  // My page: status and the editor right on the page (replaces the card in Kit and the pop-up)
  pgCard = function () {
    const sec = document.querySelector('section[data-view="mypage"]'); if (!sec || !st.db) return;
    if (!PGE.loaded) { pgLoad(); return; }
    const d = PGE.doc || {}, slug = pgSlug(), n = pgShows().filter(b => !(d.hide || []).includes(b.id)).length, addr = pgUrl().replace(/^https?:\/\//, '');
    const card = document.getElementById('ssx-page'), form = document.getElementById('ssx-pgform'); if (!card || !form) return;
    const sig = JSON.stringify([!!d.on, slug, n, !!d.photo]);
    if (card.dataset.sig !== sig) {
      card.dataset.sig = sig;
      card.innerHTML = !slug ? `<div class="ssx-head"><div><h3>Choose your page name first</h3><p class="note">Your page uses your booking link's name (like setnsettled.com/yourname). Set up your booking link and come back.</p></div><button type="button" class="btn small primary" data-pg-link-setup>Set up booking link</button></div>`
        : d.on ? `<div class="ssx-head"><div><h3>Live <span class="ssx-pill-on">Public</span></h3><p class="note"><b>${esc(addr)}</b> · ${n} upcoming show${n === 1 ? '' : 's'}</p></div><div class="ssx-row"><button type="button" class="btn small" data-pg-copy>Copy link</button><button type="button" class="btn small primary" data-pg-openc>Open my page</button></div></div>`
        : `<div class="ssx-head"><div><h3>Not public yet</h3><p class="note">It will be at <b>${esc(addr)}</b> with ${n} upcoming show${n === 1 ? '' : 's'}. Check the details below, then tick "My page is public" and save.</p></div></div>`;
      const b = s => card.querySelector(s);
      if (b('[data-pg-openc]')) b('[data-pg-openc]').onclick = () => window.open(pgUrl(), '_blank', 'noopener');
      if (b('[data-pg-copy]')) b('[data-pg-copy]').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(pgUrl()) : Promise.reject()).then(() => toast('Page link copied'), () => toast(pgUrl()));
      if (b('[data-pg-link-setup]')) b('[data-pg-link-setup]').onclick = () => { try { curGroup = 'bookings'; localStorage.setItem('ss-setgroup', 'bookings'); } catch (_) {} window.setTab('settings'); };
    }
    form.hidden = !slug;
    const fsig = JSON.stringify([d.updatedAt || '', pgShows().map(x => x.id + x.date + (x.ticketUrl ? 1 : 0)).join(), pgAllLinks().map(pgLinkKey).join()]);
    if (slug && form.dataset.sig !== fsig && !form.contains(document.activeElement)) { form.dataset.sig = fsig; pgForm(form); }
  };
  function pgForm(form) {
    const d = PGE.doc || {}, k = S.kit || {}, hide = new Set(d.hide || []), off = new Set(d.linkOff || []), shows = pgShows().slice(0, 40), links = pgAllLinks();
    form.innerHTML = `<h3>Page details</h3>
      <label class="ssx-check"><input type="checkbox" id="pg-on"${d.on ? ' checked' : ''}> <b>My page is public</b></label>
      <div class="f"><label for="pg-tag">One line about you</label><input id="pg-tag" maxlength="160" value="${esc(d.tagSet ? d.tagline || '' : (d.tagline || k.genres || ''))}" placeholder="e.g. Latin indie dance & baile funk"></div>
      <div class="f"><label for="pg-city">Based in <i class="note">(optional)</i></label><input id="pg-city" maxlength="80" value="${esc(d.city || '')}" placeholder="e.g. San Diego"></div>
      <div class="f"><label for="pg-bio">About</label><textarea id="pg-bio" maxlength="3000" style="min-height:110px">${esc(d.bioSet ? d.bio || '' : (d.bio || k.bioShort || k.bioLong || ''))}</textarea><span class="note">Starts from your Kit's short bio. Your picture is the one your EPK uses.</span></div>
      <div class="f"><label>Upcoming shows on your page</label>${shows.length ? `<div class="ssx-pglist">${shows.map(b => `<label class="ssx-check"><input type="checkbox" data-pg-show="${esc(b.id)}"${hide.has(b.id) ? '' : ' checked'}> ${esc(niceDate(b.date))} · ${esc(bookingName(b))}${b.ticketUrl ? ' · <span class="note">tickets</span>' : ''}</label>`).join('')}</div><span class="note">Every confirmed show appears on its own. Untick private ones, like weddings. Add a ticket link to a show and a Tickets button appears.</span>` : '<span class="note">No confirmed shows coming up. They appear here on their own.</span>'}</div>
      <div class="f"><label>Links</label>${links.length ? `<div class="ssx-pglist">${links.map(l => `<label class="ssx-check"><input type="checkbox" data-pg-link="${esc(pgLinkKey(l))}"${off.has(pgLinkKey(l)) ? '' : ' checked'}> ${esc(l.label || l.url)}</label>`).join('')}</div>` : '<span class="note">Add links (Instagram, SoundCloud, Spotify, your website) in Kit and they show up here.</span>'}</div>
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn primary" data-pg-save>Save</button></div>`;
    const q = s => form.querySelector(s);
    q('[data-pg-save]').onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true;
      const on = q('#pg-on').checked, tag = q('#pg-tag').value.trim(), bio = q('#pg-bio').value.trim();
      const ok = await pgSave({ on, tagline: tag, tagSet: tag !== (k.genres || ''), city: q('#pg-city').value.trim(), bio, bioSet: bio !== (k.bioShort || k.bioLong || ''),
        hide: [...form.querySelectorAll('[data-pg-show]')].filter(c => !c.checked).map(c => c.dataset.pgShow), linkOff: [...form.querySelectorAll('[data-pg-link]')].filter(c => !c.checked).map(c => c.dataset.pgLink), updatedAt: new Date().toISOString() });
      btn.disabled = false; if (!ok) return;
      btn.blur(); toast(on ? 'Saved. Your page is live.' : 'Saved. Your page is off.'); if (on) pgSync(true);
    };
  }
  pgSheet = () => window.goTab('mypage');
/* -- Ticket links, easy to find: the ticket / event link sits with the main details on the booking form, every show's page
     has a Tickets row with "+ Add ticket or event link" right there, and My page offers "+ ticket link" next to any show without one. */
  const _flBfListT = flBfList;
  flBfList = function () {
    const l = _flBfListT.apply(this, arguments);
    try { if (flArtist().group !== 'service') { const i = l.findIndex(x => x.key === 'ticket'); if (i >= 0 && l[i].place === 'more') { const [t] = l.splice(i, 1); t.place = 'main'; const c = l.findIndex(x => x.key === 'city'); l.splice(c >= 0 ? c + 1 : l.length, 0, t); } } } catch (_) {}
    return l;
  };
  const tixFix = v => { v = String(v || '').trim(); if (v && !/^https?:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) v = 'https://' + v; return v; };
  function flTixRow(root) {
    const id = root.dataset && root.dataset.booking, b = id && flBk().find(x => x.id === id), dl = root.querySelector('dl.kv'); if (!b || !dl || dl.querySelector('.ssx-tix')) return;
    try { if (flArtist().group === 'service') return; } catch (_) {}
    let dt = [...dl.querySelectorAll('dt')].find(d => /^tickets$/i.test(d.textContent.trim())), dd = dt && dt.nextElementSibling;
    if (!dt) { dt = document.createElement('dt'); dt.textContent = 'Tickets'; dd = document.createElement('dd'); const nd = [...dl.querySelectorAll('dt')].find(d => /^notes$/i.test(d.textContent.trim())); if (nd) { nd.before(dt); nd.before(dd); } else dl.append(dt, dd); }
    dd.innerHTML = ''; const box = document.createElement('div'); box.className = 'ssx-tix'; dd.appendChild(box);
    const draw = () => {
      const u = (flBk().find(x => x.id === id) || b).ticketUrl || '';
      box.innerHTML = u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 48))}</a> <button type="button" class="linkbtn" data-tx-ed>Edit</button>` : '<button type="button" class="linkbtn" data-tx-ed>+ Add ticket or event link</button>';
      box.querySelector('[data-tx-ed]').onclick = () => {
        box.innerHTML = `<input type="url" inputmode="url" autocomplete="off" value="${esc(u)}" aria-label="Ticket or event link" placeholder="https://… (Eventbrite, Dice, Posh, RA, the venue's page)"><button type="button" class="btn small primary" data-tx-save>Save</button><button type="button" class="btn small" data-tx-x>Cancel</button>`;
        const inp = box.querySelector('input'); inp.focus();
        const saveIt = async () => { const v = tixFix(inp.value); if (v && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v)) { toast('That link doesn\'t look right. Paste the full address.'); inp.focus(); return; }
          if (await window.patch('bookings', id, { ticketUrl: v })) { try { const x = flBk().find(y => y.id === id); if (x) x.ticketUrl = v; } catch (_) {} toast(v ? ((PGE.doc || {}).on ? 'Ticket link saved. It shows on your page.' : 'Ticket link saved') : 'Ticket link removed'); } draw(); };
        box.querySelector('[data-tx-save]').onclick = saveIt; box.querySelector('[data-tx-x]').onclick = draw;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveIt(); } if (e.key === 'Escape') { e.stopPropagation(); draw(); } });
      };
    };
    draw();
  }
  const _flContactPhoneT = flContactPhone;
  flContactPhone = function (root) { const r = _flContactPhoneT.apply(this, arguments); try { flTixRow(root); } catch (e) { console.error(e); } return r; };
  const _pgFormT = pgForm;
  pgForm = function (form) {
    const r = _pgFormT.apply(this, arguments);
    try { form.querySelectorAll('[data-pg-show]').forEach(c => { const b = flBk().find(x => x.id === c.dataset.pgShow); if (!b || b.ticketUrl) return; const a = document.createElement('button'); a.type = 'button'; a.className = 'linkbtn'; a.textContent = '+ ticket link'; a.onclick = e => { e.preventDefault(); e.stopPropagation(); try { bookingView(b.id); } catch (_) {} }; c.closest('label').append(' ', a); }); } catch (_) {}
    return r;
  };
/* -- My page: the picture is your EPK photo's web address (no copy made), and you choose the order of your page's sections. */
  pgPhoto = async function () {
    let id = ''; try { id = flEpkAsset() || flAvatar(); } catch (_) {}
    const d = PGE.doc || {}; if (!id) return d.photo ? { key: '', data: '' } : null;
    if (d.photoKey === id && d.photo && !/^data:/.test(d.photo)) return null;
    let u = ''; try { u = flSrc(id) || ''; if (!/^https:\/\//.test(u) && typeof cl === 'function') u = cl(id) || ''; } catch (_) {}
    return /^https:\/\//.test(u) ? { key: id, data: u.split('?')[0] } : null;
  };
  const PG_SECS = [['shows', 'Upcoming shows'], ['links', 'Listen & follow'], ['bio', 'About'], ['book', 'Booking']];
  const pgOrder = () => { const d = PGE.doc || {}, o = Array.isArray(d.order) ? d.order : []; return [...new Set([...o.filter(k => PG_SECS.some(s => s[0] === k)), ...PG_SECS.map(s => s[0])])]; };
  function pgSecDraw(box) {
    const off = new Set((PGE.doc || {}).secOff || []), o = pgOrder(), name = k => (PG_SECS.find(s => s[0] === k) || [k, k])[1];
    box.innerHTML = `<label>Page sections</label><ol class="ssx-pgsec">${o.map((k, i) => `<li data-k="${k}"${off.has(k) ? ' class="off"' : ''}>
      <label class="ssx-check"><input type="checkbox" data-sec-on${off.has(k) ? '' : ' checked'} aria-label="Show ${esc(name(k))}"> ${esc(name(k))}</label>
      <span class="mv"><button type="button" class="btn small" data-sec-up aria-label="Move ${esc(name(k))} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-sec-dn aria-label="Move ${esc(name(k))} down"${i < o.length - 1 ? '' : ' disabled'}>↓</button></span></li>`).join('')}</ol>
      <span class="note">Your photo and name always lead. Untick a section to hide it. Changes save right away.</span>`;
    const save = async (patch, msg, focus) => { if (await pgSave({ ...patch, updatedAt: new Date().toISOString() })) toast(msg); pgSecDraw(box); if (focus) { let b = box.querySelector(focus); if (b && b.disabled) b = b.parentNode.querySelector('button:not([disabled])'); if (b) b.focus(); } };
    box.querySelectorAll('li').forEach(li => {
      const k = li.dataset.k;
      li.querySelector('[data-sec-on]').onchange = e => { const s = new Set((PGE.doc || {}).secOff || []); e.target.checked ? s.delete(k) : s.add(k); save({ secOff: [...s] }, e.target.checked ? 'Section shown on your page' : 'Section hidden from your page', `li[data-k="${k}"] [data-sec-on]`); };
      const mv = dir => { const o2 = pgOrder(), i = o2.indexOf(k), j = i + dir; if (j < 0 || j >= o2.length) return; [o2[i], o2[j]] = [o2[j], o2[i]]; save({ order: o2 }, 'Order saved', `li[data-k="${k}"] [data-sec-${dir < 0 ? 'up' : 'dn'}]`); };
      li.querySelector('[data-sec-up]').onclick = () => mv(-1); li.querySelector('[data-sec-dn]').onclick = () => mv(1);
    });
  }
  const _pgFormS = pgForm;
  pgForm = function (form) {
    const r = _pgFormS.apply(this, arguments);
    try { const act = form.querySelector('.actions'); if (act) { const box = document.createElement('div'); box.className = 'f'; act.before(box); pgSecDraw(box); } } catch (e) { console.error(e); }
    return r;
  };  
/* -- My page designer: a Design card on My page. Look (colors, layout, picture size and shape, name font, background, boxes,
     section titles), Sections (order, show or hide, your own titles and icons), Photos (pick up to 12 from Media and Kit) and
     Watch & listen (YouTube, SoundCloud, Spotify, Mixcloud and Vimeo players). Every change saves as you go; Preview shows it. */
  PG_SECS.push(['photos', 'Photos'], ['watch', 'Watch & listen']);
  pgSecDraw = box => box.remove(); // sections now live in the Design card
  const PD_ORDER = ['shows', 'photos', 'watch', 'links', 'bio', 'book'];
  const PD_TITLE = { shows: 'Upcoming', photos: 'Photos', watch: 'Watch & listen', links: 'Listen & follow', bio: 'About', book: 'Booking' };
  const PD_ICON0 = { shows: 'ticket', photos: 'camera', watch: 'play', links: 'link', bio: 'sparkle', book: 'calendar' };
  const PD_ICONS = {
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    vinyl: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 6.5A5.5 5.5 0 0 0 6.5 12"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>'
  };
  const pdSvg = k => PD_ICONS[k] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PD_ICONS[k]}</svg>` : '<span aria-hidden="true">–</span>';
  const PD_FONTS = [['italiana', 'Elegant'], ['playfair', 'Classic'], ['cormorant', 'Romantic'], ['bebas', 'Poster'], ['unbounded', 'Club'], ['grotesk', 'Modern'], ['syne', 'Art'], ['marker', 'Street']];
  const PD = { open: new Set(['look']), ic: '' };
  const pdLook = () => ({ layout: 'center', size: 'm', shape: 'circle', font: 'italiana', name: 'm', bg: 'glow', cards: 'soft', heads: 'caps', icons: true, gallery: 'grid', align: 'center', palette: '', mode: '', ...((PGE.doc || {}).look || {}) });
  function pdOrder() {
    const o = [...new Set(((PGE.doc || {}).order || []).filter(k => PD_ORDER.includes(k)))];
    PD_ORDER.forEach((k, i) => { if (o.includes(k)) return; const prev = PD_ORDER.slice(0, i).reverse().find(x => o.includes(x)); o.splice(prev ? o.indexOf(prev) + 1 : 0, 0, k); });
    return o;
  }
  const PD_PLAYS = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|music\.youtube\.com\/watch\?|youtu\.be\/[\w-]{11}|vimeo\.com\/\d{5,}|open\.spotify\.com\/(intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/|soundcloud\.com\/[\w-]+\/[\w-]+|mixcloud\.com\/[\w-]+\/[\w-]+)/i;
  const pdName = u => { const m = /(youtu|vimeo|spotify|soundcloud|mixcloud)/i.exec(u) || [], t = (/spotify\.com\/(?:intl-[a-z-]+\/)?(\w+)/i.exec(u) || [])[1];
    return ({ youtu: 'YouTube video', vimeo: 'Vimeo video', spotify: 'Spotify ' + (t || 'link'), soundcloud: 'SoundCloud', mixcloud: 'Mixcloud mix' })[String(m[1] || '').toLowerCase()] || 'Player'; };
  const pdUrl = id => { let u = ''; try { u = flSrc(id) || ''; if (!/^https:\/\//.test(u) && typeof cl === 'function') u = cl(id) || ''; } catch (_) {} return /^https:\/\//.test(u) ? u.split('?')[0] : ''; };
  function pdPhotos() {
    const seen = new Set(), out = []; let all = [];
    try { all = [...flPhotos().map(m => m.assetId), ...flKitPhotos().map(f => f.assetId)]; } catch (_) {}
    all.forEach(id => { if (!id || seen.has(id)) return; seen.add(id); const u = pdUrl(id); if (u) out.push({ id, url: u }); });
    return out;
  }
  // the page's colors follow My page's own choice, or the EPK's when it says "Match my EPK"
  pgSync = async function (force) {
    if (PGE.busy || (!force && Date.now() - PGE.at < 30000)) return; await pgLoad(); const d = PGE.doc || {}; if (!d.on) return;
    PGE.at = Date.now(); PGE.busy = true;
    try {
      const p = S.profile || {}, k = S.kit || {}; let A = {}; try { A = flArtist(); } catch (_) {}
      const L = d.look || {}, c = PGE.epk || {};
      let theme = d.theme || {}; try { const T = epkTheme(L.palette || c.palette || 'champagne', L.mode || c.mode || 'dark'); theme = { bg: T.bg, glow: T.glow, ink: T.ink, muted: T.muted, line: T.line, panel: T.panel, solid: T.solid, metal: T.metal }; } catch (_) {}
      const off = new Set(d.linkOff || []), links = pgAllLinks().filter(l => !off.has(pgLinkKey(l))).map(l => ({ label: String(l.label || l.url).slice(0, 60), url: String(l.url).slice(0, 500) })).slice(0, 24);
      const auto = { name: p.djName || p.myName || '', kind: A.kind || '', theme, links };
      if (!d.bioSet) auto.bio = k.bioShort || k.bioLong || ''; if (!d.tagSet) auto.tagline = k.genres || '';
      let ph = null; try { ph = await pgPhoto(); } catch (_) {} if (ph) { auto.photo = ph.data; auto.photoKey = ph.key; }
      if (Object.keys(auto).some(x => JSON.stringify(auto[x] ?? '') !== JSON.stringify(d[x] ?? ''))) await pgSave(auto);
    } catch (e) { console.error(e); } finally { PGE.busy = false; }
  };
  const pdSig = () => { const d = PGE.doc || {}; return JSON.stringify([d.look, d.titles, d.icons, d.order, d.secOff, d.gallery, d.embeds, !!d.on, pdPhotos().map(x => x.id), pgAllLinks().map(l => l.url)]); };
  async function pdSave(el, patch, focus, theme) {
    const ok = await pgSave(patch); pdDraw(el, focus);
    const s = el.querySelector('[data-pd-st]'); if (s && ok) { s.textContent = 'Saved'; clearTimeout(PD.t); PD.t = setTimeout(() => { s.textContent = ''; }, 1600); }
    if (ok && theme) pgSync(true);
  }
  function pdDraw(el, focus) {
    const d = PGE.doc || {}, L = pdLook(), titles = d.titles || {}, icons = d.icons || {}, off = new Set(d.secOff || []), o = pdOrder();
    const gal = (d.gallery || []).filter(g => g && g.url), emb = (d.embeds || []).filter(e => e && e.url), photos = pdPhotos();
    const chips = (k, list) => list.map(([v, n]) => `<button type="button" class="ssx-chip" data-pd-k="${k}" data-pd-v="${v}" aria-pressed="${String(L[k]) === String(v)}">${esc(n)}</button>`).join('');
    const row = (label, k, list) => `<div class="ssx-epk-row"><span class="ssx-epk-k">${label}</span>${chips(k, list)}</div>`;
    let themes = []; try { themes = flThemeList(); } catch (_) {}
    const dark = (L.mode || (PGE.epk || {}).mode || 'dark') !== 'light', sw = t => { const [bg, , , solid] = dark ? t[2] : t[3]; return `linear-gradient(90deg,${bg} 0 46%,${solid} 46% 76%,${t[4][1]} 76%)`; };
    const pal = `<div class="ssx-epk-row ssx-fl-themes"><span class="ssx-epk-k">Colors</span><button type="button" class="ssx-chip" data-pd-k="palette" data-pd-v="" aria-pressed="${!L.palette}">Match my EPK</button>${themes.map(t => `<button type="button" class="ssx-chip" data-pd-k="palette" data-pd-v="${esc(t[0])}" aria-pressed="${L.palette === t[0]}"><span class="ssx-epk-sw" style="background:${sw(t)}"></span>${esc(t[1])}</button>`).join('')}</div>`;
    const name = k => PD_TITLE[k] || k, ic = k => icons[k] === 'none' ? '' : (PD_ICONS[icons[k]] ? icons[k] : PD_ICON0[k]);
    const empty = { photos: !gal.length ? 'Pick photos below' : '', watch: !emb.length ? 'Pick players below' : '' };
    const secs = o.map((k, i) => `<li data-k="${k}"${off.has(k) ? ' class="off"' : ''}>
        <button type="button" class="ssx-pd-ic" data-pd-icbtn aria-expanded="${PD.ic === k}" aria-label="Icon for ${esc(name(k))}" title="Change icon">${L.icons ? pdSvg(ic(k)) : pdSvg('')}</button>
        <input type="text" maxlength="40" data-pd-title value="${esc(titles[k] || '')}" placeholder="${esc(name(k))}" aria-label="Title for ${esc(name(k))}">
        <label class="ssx-check"><input type="checkbox" data-pd-on${off.has(k) ? '' : ' checked'}> Show</label>
        <span class="mv"><button type="button" class="btn small" data-pd-up aria-label="Move ${esc(name(k))} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-pd-dn aria-label="Move ${esc(name(k))} down"${i < o.length - 1 ? '' : ' disabled'}>↓</button></span>
        ${empty[k] && !off.has(k) ? `<span class="note ssx-pd-hint">${empty[k]}</span>` : ''}
        ${PD.ic === k ? `<div class="ssx-pd-icons" role="group" aria-label="Icons">${Object.keys(PD_ICONS).map(x => `<button type="button" data-pd-icon="${x}" aria-pressed="${ic(k) === x}" aria-label="${x}" title="${x}">${pdSvg(x)}</button>`).join('')}<button type="button" data-pd-icon="none" aria-pressed="${!ic(k)}">None</button></div>` : ''}</li>`).join('');
    const pos = new Map(gal.map((g, i) => [g.id || g.url, i + 1]));
    const links = pgAllLinks().filter(l => PD_PLAYS.test(String(l.url))), on = new Set(emb.map(e => e.url)), extra = emb.filter(e => !links.some(l => l.url === e.url));
    el.innerHTML = `<div class="ssx-head"><div><h3>Design</h3><p class="note">Make it yours. Changes save as you go.</p></div><div class="ssx-row"><span class="note" data-pd-st aria-live="polite"></span><button type="button" class="btn small primary" data-pd-prev>Preview</button></div></div>
      <details class="ssx-pd" data-pd="look"${PD.open.has('look') ? ' open' : ''}><summary>Look</summary>
        ${pal}
        ${row('Light or dark', 'mode', [['', 'Match my EPK'], ['dark', 'Dark'], ['light', 'Light']])}
        ${row('Layout', 'layout', [['center', 'Centered'], ['side', 'Side by side'], ['cover', 'Cover photo']])}
        ${row(L.layout === 'cover' ? 'Cover height' : 'Picture size', 'size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']])}
        ${L.layout !== 'cover' ? row('Picture shape', 'shape', [['circle', 'Circle'], ['arch', 'Arch'], ['square', 'Square'], ['portrait', 'Rectangle']]) : ''}
        ${L.layout !== 'side' ? row('Text', 'align', [['center', 'Centered'], ['left', 'Left']]) : ''}
        ${row('Name font', 'font', PD_FONTS)}
        ${row('Name size', 'name', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}
        ${row('Background', 'bg', [['glow', 'Glow'], ['aurora', 'Aurora'], ['grain', 'Film grain'], ['photo', 'My photo'], ['plain', 'Plain']])}
        ${row('Boxes', 'cards', [['soft', 'Soft'], ['outline', 'Outline'], ['glass', 'Glass'], ['bold', 'Bold']])}
        ${row('Section titles', 'heads', [['caps', 'Small caps'], ['big', 'Big']])}
        ${row('Icons', 'icons', [[true, 'On'], [false, 'Off']])}
      </details>
      <details class="ssx-pd" data-pd="sections"${PD.open.has('sections') ? ' open' : ''}><summary>Sections, titles and icons</summary>
        <p class="note">Your picture and name always lead. Rename any section, tap its icon to change it, and use the arrows to reorder.</p>
        <ol class="ssx-pd-secs">${secs}</ol>
      </details>
      <details class="ssx-pd" data-pd="photos"${PD.open.has('photos') ? ' open' : ''}><summary>Photos <span class="note">${gal.length} of 12</span></summary>
        ${photos.length ? `<p class="note">Tap photos to add them, in the order you want. Tap again to remove.</p><div class="ssx-pd-phs">${photos.map(p => { const n = pos.get(p.id) || pos.get(p.url); return `<button type="button" class="ssx-pd-ph" data-pd-ph="${esc(p.id)}" aria-pressed="${!!n}" aria-label="${n ? 'Remove photo ' + n : 'Add photo'}"><img src="${esc(flSrc(p.id) || p.url)}" alt="" loading="lazy">${n ? `<span class="n">${n}</span>` : ''}</button>`; }).join('')}</div>` : '<p class="note">No photos yet. Add some in Media and they show up here.</p>'}
        ${row('Layout', 'gallery', [['grid', 'Grid'], ['mosaic', 'Mosaic'], ['strip', 'Swipe']])}
        <button type="button" class="btn small" data-pd-media>Add photos in Media</button>
      </details>
      <details class="ssx-pd" data-pd="watch"${PD.open.has('watch') ? ' open' : ''}><summary>Watch & listen <span class="note">${emb.length} of 6</span></summary>
        <p class="note">Players for your music and videos, right on your page. Works with YouTube, SoundCloud, Spotify, Mixcloud and Vimeo.</p>
        ${links.length || extra.length ? `<div class="ssx-pglist">${[...links.map(l => ({ url: l.url, label: l.label || l.url })), ...extra].map(l => `<label class="ssx-check"><input type="checkbox" data-pd-emb="${esc(l.url)}" data-pd-lbl="${esc(l.label || '')}"${on.has(l.url) ? ' checked' : ''}> ${esc(l.label || pdName(l.url))}</label>`).join('')}</div>` : ''}
        <div class="ssx-pd-add"><input type="url" inputmode="url" data-pd-new placeholder="Paste a link to a set, track, mix or video" aria-label="Link to add as a player"><button type="button" class="btn small" data-pd-addbtn>Add</button></div>
      </details>`;
    el.dataset.sig = pdSig();
    const q = s => el.querySelector(s), qa = s => el.querySelectorAll(s);
    qa('details.ssx-pd').forEach(x => x.ontoggle = () => { x.open ? PD.open.add(x.dataset.pd) : PD.open.delete(x.dataset.pd); });
    q('[data-pd-prev]').onclick = () => { if (!(PGE.doc || {}).on) { toast('Tick "My page is public" and save first, then Preview'); return; } window.open(pgUrl() + '?v=' + Date.now(), '_blank', 'noopener'); };
    qa('[data-pd-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.pdK, v = k === 'icons' ? b.dataset.pdV === 'true' : b.dataset.pdV;
      pdSave(el, { look: { ...pdLook(), [k]: v } }, `[data-pd-k="${k}"][data-pd-v="${b.dataset.pdV}"]`, k === 'palette' || k === 'mode');
    });
    qa('.ssx-pd-secs li').forEach(li => {
      const k = li.dataset.k, f = s => `li[data-k="${k}"] ${s}`;
      li.querySelector('[data-pd-on]').onchange = e => { const s = new Set((PGE.doc || {}).secOff || []); e.target.checked ? s.delete(k) : s.add(k); pdSave(el, { secOff: [...s] }, f('[data-pd-on]')); };
      const mv = dir => { const o2 = pdOrder(), i = o2.indexOf(k), j = i + dir; if (j < 0 || j >= o2.length) return; [o2[i], o2[j]] = [o2[j], o2[i]]; pdSave(el, { order: o2 }, f(dir < 0 ? '[data-pd-up]' : '[data-pd-dn]')); };
      li.querySelector('[data-pd-up]').onclick = () => mv(-1); li.querySelector('[data-pd-dn]').onclick = () => mv(1);
      li.querySelector('[data-pd-icbtn]').onclick = () => { PD.ic = PD.ic === k ? '' : k; pdDraw(el, PD.ic ? f('[data-pd-icon][aria-pressed="true"]') : f('[data-pd-icbtn]')); };
      li.querySelectorAll('[data-pd-icon]').forEach(b => b.onclick = () => { PD.ic = ''; const look = pdLook(); pdSave(el, { icons: { ...((PGE.doc || {}).icons || {}), [k]: b.dataset.pdIcon }, ...(look.icons ? {} : { look: { ...look, icons: true } }) }, f('[data-pd-icbtn]')); });
      const t = li.querySelector('[data-pd-title]'), saveT = () => { const v = t.value.trim().slice(0, 40), cur = ((PGE.doc || {}).titles || {})[k] || ''; if (v === cur) return; pdSave(el, { titles: { ...((PGE.doc || {}).titles || {}), [k]: v } }); };
      t.onchange = saveT; t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } };
    });
    qa('[data-pd-ph]').forEach(b => b.onclick = () => {
      const id = b.dataset.pdPh, g = ((PGE.doc || {}).gallery || []).filter(x => x && x.url), has = g.some(x => x.id === id);
      if (!has && g.length >= 12) { toast('Your page shows up to 12 photos. Remove one first.'); return; }
      const p = pdPhotos().find(x => x.id === id); if (!p) return;
      pdSave(el, { gallery: has ? g.filter(x => x.id !== id) : [...g, { id, url: p.url }] }, `[data-pd-ph="${id}"]`);
    });
    q('[data-pd-media]').onclick = () => window.goTab('media');
    qa('[data-pd-emb]').forEach(c => c.onchange = () => {
      const e0 = ((PGE.doc || {}).embeds || []).filter(x => x && x.url), u = c.dataset.pdEmb;
      if (c.checked && e0.length >= 6) { c.checked = false; toast('Your page shows up to 6 players. Untick one first.'); return; }
      pdSave(el, { embeds: c.checked ? [...e0.filter(x => x.url !== u), { url: u, label: c.dataset.pdLbl || '' }] : e0.filter(x => x.url !== u) }, `[data-pd-emb="${u.replace(/"/g, '\\"')}"]`);
    });
    const nw = q('[data-pd-new]'), add = () => {
      let u = nw.value.trim(); if (!u) { nw.focus(); return; } if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (!PD_PLAYS.test(u)) { toast('That link can\'t play on your page. Use a YouTube, SoundCloud, Spotify, Mixcloud or Vimeo link.'); nw.focus(); return; }
      const e0 = ((PGE.doc || {}).embeds || []).filter(x => x && x.url); if (e0.some(x => x.url === u)) { nw.value = ''; return; }
      if (e0.length >= 6) { toast('Your page shows up to 6 players. Untick one first.'); return; }
      pdSave(el, { embeds: [...e0, { url: u.slice(0, 500), label: '' }] }, '[data-pd-new]');
    };
    q('[data-pd-addbtn]').onclick = add; nw.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    if (focus) { let b = el.querySelector(focus); if (b && b.disabled) b = b.parentNode.querySelector('button:not([disabled])'); if (b) b.focus(); }
  }
  const _pgCardD = pgCard;
  pgCard = function () {
    const r = _pgCardD.apply(this, arguments);
    try {
      const card = document.getElementById('ssx-page'); if (!card || !PGE.loaded || !PGE.doc) return r;
      let el = document.getElementById('ssx-pgdesign');
      if (!el) { el = document.createElement('div'); el.id = 'ssx-pgdesign'; el.className = 'card ssx'; card.after(el); }
      el.hidden = !pgSlug(); if (el.hidden) return r;
      const a = document.activeElement, typing = el.contains(a) && a.tagName === 'INPUT';
      if (!typing && el.dataset.sig !== pdSig()) pdDraw(el);
    } catch (e) { console.error(e); }
    return r;
  };
/* -- My page designer window: like the EPK creator. Controls on one side, your page on the other, and every change shows
     instantly. Nothing goes live until you tap Publish; close the window and your unpublished changes wait for you. */
  const PW = { el: null, draft: null, dirty: false, dev: 'phone', open: new Set(['look']), ic: '', t: 0, opener: null, armed: false };
  const PW_KEYS = ['look', 'titles', 'icons', 'order', 'secOff', 'gallery', 'embeds'];
  const pwClone = o => JSON.parse(JSON.stringify(o || {}));
  const pwFromDoc = () => { const d = PGE.doc || {}, o = {}; PW_KEYS.forEach(k => { if (d[k] !== undefined) o[k] = pwClone(d[k]); }); return o; };
  const pwLook = () => ({ layout: 'center', size: 'm', shape: 'circle', font: 'italiana', name: 'm', bg: 'glow', cards: 'soft', heads: 'caps', icons: true, gallery: 'grid', align: 'center', palette: '', mode: '', ...((PW.draft || {}).look || {}) });
  function pwOrder() {
    const o = [...new Set(((PW.draft || {}).order || []).filter(k => PD_ORDER.includes(k)))];
    PD_ORDER.forEach((k, i) => { if (o.includes(k)) return; const prev = PD_ORDER.slice(0, i).reverse().find(x => o.includes(x)); o.splice(prev ? o.indexOf(prev) + 1 : 0, 0, k); });
    return o;
  }
  // the shared page design (public/page-render.js): the live page uses the very same file
  const pwRenderer = () => window.SSPage ? Promise.resolve(window.SSPage) : (PW.rp = PW.rp || new Promise((y, n) => { const s = document.createElement('script'); s.src = '/page-render.js?v=1'; s.charset = 'utf-8'; s.onload = () => y(window.SSPage); s.onerror = () => { PW.rp = null; n(new Error('page design file missing')); }; document.head.appendChild(s); }));
  const pwTime = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
  const pwMins = t => { if (!t) return 3000; const [h, m] = t.split(':').map(Number); return h * 60 + m + (h < 6 ? 1440 : 0); };
  // what the page shows, built the same way the server builds it, with the draft design on top
  function pwData() {
    const d = PGE.doc || {}, L = pwLook(), c = PGE.epk || {}, p = S.profile || {}, k = S.kit || {};
    let theme = d.theme || {}; try { const T = epkTheme(L.palette || c.palette || 'champagne', L.mode || c.mode || 'dark'); theme = { bg: T.bg, glow: T.glow, ink: T.ink, muted: T.muted, line: T.line, panel: T.panel, solid: T.solid, metal: T.metal }; } catch (_) {}
    const offL = new Set(d.linkOff || []), links = pgAllLinks().filter(l => !offL.has(pgLinkKey(l))).map(l => ({ label: String(l.label || l.url).slice(0, 60), url: String(l.url) })).slice(0, 24);
    let photo = ''; try { const id = flEpkAsset() || flAvatar(); if (id) photo = flSrc(id) || pdUrl(id); } catch (_) {}
    const hide = new Set(d.hide || []), contacts = (() => { try { return S.contacts || []; } catch (_) { return []; } })();
    const shows = pgShows().filter(b => !hide.has(b.id)).map(b => { const v = contacts.find(x => x.id === b.venueId) || {}; return { date: b.date, time: pwTime(b.setStart) || undefined, title: b.title || '', venue: v.org || v.name || '', city: b.city || v.city || '', address: v.address || '', tickets: /^https?:\/\//i.test(b.ticketUrl || '') ? b.ticketUrl : undefined }; })
      .sort((a, b) => a.date.localeCompare(b.date) || pwMins(a.time) - pwMins(b.time)).slice(0, 60);
    let A = {}; try { A = flArtist(); } catch (_) {}
    return { slug: pgSlug(), name: d.name || p.djName || p.myName || 'Your name', kind: d.kind || A.kind || '', tagline: d.tagSet ? d.tagline || '' : (d.tagline || k.genres || ''), city: d.city || '',
      bio: d.bioSet ? d.bio || '' : (d.bio || k.bioShort || k.bioLong || ''), photo: /^https:\/\//.test(photo) ? photo : '', theme, links, booking: !!(st.link || {}).on, shows,
      look: L, titles: PW.draft.titles || {}, icons: PW.draft.icons || {}, order: pwOrder(), off: PW.draft.secOff || [], gallery: PW.draft.gallery || [], embeds: PW.draft.embeds || [] };
  }
  // two frames take turns so the preview swaps without a flash, and keeps your scroll spot
  function pwPreview() {
    clearTimeout(PW.t); PW.t = setTimeout(async () => {
      if (!PW.el) return; let R; try { R = await pwRenderer(); } catch (_) { PW.el.querySelector('.ssx-pw-stage').innerHTML = '<p class="note" style="padding:24px">The preview needs the latest update. Deploy, then reopen the designer.</p>'; return; }
      const fs = [...PW.el.querySelectorAll('.ssx-pw-frame iframe')], front = fs.find(f => !f.hidden) || fs[0], back = fs.find(f => f !== front);
      let y = 0; try { y = front.contentWindow.scrollY || 0; } catch (_) {}
      back.onload = () => { try { back.contentWindow.scrollTo(0, y); } catch (_) {} back.hidden = false; front.hidden = true; };
      back.srcdoc = R.page(pwData(), location.origin, { preview: true });
    }, 60);
  }
  function pwSet(patch, focus) {
    Object.assign(PW.draft, patch); PW.dirty = true; pwControls(focus); pwPreview();
  }
  function pwControls(focus) {
    const box = PW.el && PW.el.querySelector('.ssx-pw-opts'); if (!box) return;
    const D = PW.draft, L = pwLook(), titles = D.titles || {}, icons = D.icons || {}, off = new Set(D.secOff || []), o = pwOrder();
    const gal = (D.gallery || []).filter(g => g && g.url), emb = (D.embeds || []).filter(e => e && e.url), photos = pdPhotos();
    const chips = (k, list) => list.map(([v, n]) => `<button type="button" class="ssx-chip" data-pd-k="${k}" data-pd-v="${v}" aria-pressed="${String(L[k]) === String(v)}">${esc(n)}</button>`).join('');
    const row = (label, k, list) => `<div class="ssx-epk-row"><span class="ssx-epk-k">${label}</span>${chips(k, list)}</div>`;
    let themes = []; try { themes = flThemeList(); } catch (_) {}
    const dark = (L.mode || (PGE.epk || {}).mode || 'dark') !== 'light', sw = t => { const [bg, , , solid] = dark ? t[2] : t[3]; return `linear-gradient(90deg,${bg} 0 46%,${solid} 46% 76%,${t[4][1]} 76%)`; };
    const pal = `<div class="ssx-epk-row ssx-fl-themes"><span class="ssx-epk-k">Colors</span><button type="button" class="ssx-chip" data-pd-k="palette" data-pd-v="" aria-pressed="${!L.palette}">Match my EPK</button>${themes.map(t => `<button type="button" class="ssx-chip" data-pd-k="palette" data-pd-v="${esc(t[0])}" aria-pressed="${L.palette === t[0]}"><span class="ssx-epk-sw" style="background:${sw(t)}"></span>${esc(t[1])}</button>`).join('')}</div>`;
    const name = k => PD_TITLE[k] || k, ic = k => icons[k] === 'none' ? '' : (PD_ICONS[icons[k]] ? icons[k] : PD_ICON0[k]);
    const empty = { photos: !gal.length ? 'Pick photos below' : '', watch: !emb.length ? 'Pick players below' : '' };
    const secs = o.map((k, i) => `<li data-k="${k}"${off.has(k) ? ' class="off"' : ''}>
        <button type="button" class="ssx-pd-ic" data-pd-icbtn aria-expanded="${PW.ic === k}" aria-label="Icon for ${esc(name(k))}" title="Change icon">${L.icons ? pdSvg(ic(k)) : pdSvg('')}</button>
        <input type="text" maxlength="40" data-pd-title value="${esc(titles[k] || '')}" placeholder="${esc(name(k))}" aria-label="Title for ${esc(name(k))}">
        <label class="ssx-check"><input type="checkbox" data-pd-on${off.has(k) ? '' : ' checked'}> Show</label>
        <span class="mv"><button type="button" class="btn small" data-pd-up aria-label="Move ${esc(name(k))} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-pd-dn aria-label="Move ${esc(name(k))} down"${i < o.length - 1 ? '' : ' disabled'}>↓</button></span>
        ${empty[k] && !off.has(k) ? `<span class="note ssx-pd-hint">${empty[k]}</span>` : ''}
        ${PW.ic === k ? `<div class="ssx-pd-icons" role="group" aria-label="Icons">${Object.keys(PD_ICONS).map(x => `<button type="button" data-pd-icon="${x}" aria-pressed="${ic(k) === x}" aria-label="${x}" title="${x}">${pdSvg(x)}</button>`).join('')}<button type="button" data-pd-icon="none" aria-pressed="${!ic(k)}">None</button></div>` : ''}</li>`).join('');
    const pos = new Map(gal.map((g, i) => [g.id || g.url, i + 1]));
    const links = pgAllLinks().filter(l => PD_PLAYS.test(String(l.url))), on = new Set(emb.map(e => e.url)), extra = emb.filter(e => !links.some(l => l.url === e.url));
    const det = (k, title, body) => `<details class="ssx-pd" data-pd="${k}"${PW.open.has(k) ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
    box.innerHTML = det('look', 'Look', `${pal}
        ${row('Light or dark', 'mode', [['', 'Match my EPK'], ['dark', 'Dark'], ['light', 'Light']])}
        ${row('Layout', 'layout', [['center', 'Centered'], ['side', 'Side by side'], ['cover', 'Cover photo']])}
        ${row(L.layout === 'cover' ? 'Cover height' : 'Picture size', 'size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']])}
        ${L.layout !== 'cover' ? row('Picture shape', 'shape', [['circle', 'Circle'], ['arch', 'Arch'], ['square', 'Square'], ['portrait', 'Rectangle']]) : ''}
        ${L.layout !== 'side' ? row('Text', 'align', [['center', 'Centered'], ['left', 'Left']]) : ''}
        ${row('Name font', 'font', PD_FONTS)}
        ${row('Name size', 'name', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}
        ${row('Background', 'bg', [['glow', 'Glow'], ['aurora', 'Aurora'], ['grain', 'Film grain'], ['photo', 'My photo'], ['plain', 'Plain']])}
        ${row('Boxes', 'cards', [['soft', 'Soft'], ['outline', 'Outline'], ['glass', 'Glass'], ['bold', 'Bold']])}
        ${row('Section titles', 'heads', [['caps', 'Small caps'], ['big', 'Big']])}
        ${row('Icons', 'icons', [[true, 'On'], [false, 'Off']])}`)
      + det('sections', 'Sections, titles and icons', `<p class="note">Your picture and name always lead. Rename any section, tap its icon to change it, and use the arrows to reorder.</p><ol class="ssx-pd-secs">${secs}</ol>`)
      + det('photos', `Photos <span class="note">${gal.length} of 12</span>`, `${photos.length ? `<p class="note">Tap photos to add them, in the order you want. Tap again to remove.</p><div class="ssx-pd-phs">${photos.map(p => { const n = pos.get(p.id) || pos.get(p.url); return `<button type="button" class="ssx-pd-ph" data-pd-ph="${esc(p.id)}" aria-pressed="${!!n}" aria-label="${n ? 'Remove photo ' + n : 'Add photo'}"><img src="${esc(flSrc(p.id) || p.url)}" alt="" loading="lazy">${n ? `<span class="n">${n}</span>` : ''}</button>`; }).join('')}</div>` : '<p class="note">No photos yet. Add some in Media and they show up here.</p>'}
        ${row('Layout', 'gallery', [['grid', 'Grid'], ['mosaic', 'Mosaic'], ['strip', 'Swipe']])}`)
      + det('watch', `Watch & listen <span class="note">${emb.length} of 6</span>`, `<p class="note">Players for your music and videos. Works with YouTube, SoundCloud, Spotify, Mixcloud and Vimeo.</p>
        ${links.length || extra.length ? `<div class="ssx-pglist">${[...links.map(l => ({ url: l.url, label: l.label || '' })), ...extra].map(l => `<label class="ssx-check"><input type="checkbox" data-pd-emb="${esc(l.url)}" data-pd-lbl="${esc(l.label || '')}"${on.has(l.url) ? ' checked' : ''}> ${esc(l.label || pdName(l.url))}</label>`).join('')}</div>` : ''}
        <div class="ssx-pd-add"><input type="url" inputmode="url" data-pd-new placeholder="Paste a link to a set, track, mix or video" aria-label="Link to add as a player"><button type="button" class="btn small" data-pd-addbtn>Add</button></div>`);
    const q = s => box.querySelector(s), qa = s => box.querySelectorAll(s);
    qa('details.ssx-pd').forEach(x => x.ontoggle = () => { x.open ? PW.open.add(x.dataset.pd) : PW.open.delete(x.dataset.pd); });
    qa('[data-pd-k]').forEach(b => b.onclick = () => { const k = b.dataset.pdK, v = k === 'icons' ? b.dataset.pdV === 'true' : b.dataset.pdV; pwSet({ look: { ...pwLook(), [k]: v } }, `[data-pd-k="${k}"][data-pd-v="${b.dataset.pdV}"]`); });
    qa('.ssx-pd-secs li').forEach(li => {
      const k = li.dataset.k, f = s => `li[data-k="${k}"] ${s}`;
      li.querySelector('[data-pd-on]').onchange = e => { const s = new Set(D.secOff || []); e.target.checked ? s.delete(k) : s.add(k); pwSet({ secOff: [...s] }, f('[data-pd-on]')); };
      const mv = dir => { const o2 = pwOrder(), i = o2.indexOf(k), j = i + dir; if (j < 0 || j >= o2.length) return; [o2[i], o2[j]] = [o2[j], o2[i]]; pwSet({ order: o2 }, f(dir < 0 ? '[data-pd-up]' : '[data-pd-dn]')); };
      li.querySelector('[data-pd-up]').onclick = () => mv(-1); li.querySelector('[data-pd-dn]').onclick = () => mv(1);
      li.querySelector('[data-pd-icbtn]').onclick = () => { PW.ic = PW.ic === k ? '' : k; pwControls(PW.ic ? f('[data-pd-icon][aria-pressed="true"]') : f('[data-pd-icbtn]')); };
      li.querySelectorAll('[data-pd-icon]').forEach(b => b.onclick = () => { PW.ic = ''; const look = pwLook(); pwSet({ icons: { ...(D.icons || {}), [k]: b.dataset.pdIcon }, ...(look.icons ? {} : { look: { ...look, icons: true } }) }, f('[data-pd-icbtn]')); });
      // titles update the preview as you type
      const t = li.querySelector('[data-pd-title]');
      t.oninput = () => { PW.draft.titles = { ...(D.titles || {}), [k]: t.value.slice(0, 40) }; PW.dirty = true; pwStatus(); pwPreview(); };
      t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } };
    });
    qa('[data-pd-ph]').forEach(b => b.onclick = () => {
      const id = b.dataset.pdPh, g = (D.gallery || []).filter(x => x && x.url), has = g.some(x => x.id === id);
      if (!has && g.length >= 12) { toast('Your page shows up to 12 photos. Remove one first.'); return; }
      const p = pdPhotos().find(x => x.id === id); if (!p) return;
      pwSet({ gallery: has ? g.filter(x => x.id !== id) : [...g, { id, url: p.url }] }, `[data-pd-ph="${id}"]`);
    });
    qa('[data-pd-emb]').forEach(c => c.onchange = () => {
      const e0 = (D.embeds || []).filter(x => x && x.url), u = c.dataset.pdEmb;
      if (c.checked && e0.length >= 6) { c.checked = false; toast('Your page shows up to 6 players. Untick one first.'); return; }
      pwSet({ embeds: c.checked ? [...e0.filter(x => x.url !== u), { url: u, label: c.dataset.pdLbl || '' }] : e0.filter(x => x.url !== u) }, `[data-pd-emb="${u.replace(/"/g, '\\"')}"]`);
    });
    const nw = q('[data-pd-new]'), add = () => {
      let u = nw.value.trim(); if (!u) { nw.focus(); return; } if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (!PD_PLAYS.test(u)) { toast('That link can\'t play on your page. Use a YouTube, SoundCloud, Spotify, Mixcloud or Vimeo link.'); nw.focus(); return; }
      const e0 = (D.embeds || []).filter(x => x && x.url); if (e0.some(x => x.url === u)) { nw.value = ''; return; }
      if (e0.length >= 6) { toast('Your page shows up to 6 players. Untick one first.'); return; }
      pwSet({ embeds: [...e0, { url: u.slice(0, 500), label: '' }] }, '[data-pd-new]');
    };
    q('[data-pd-addbtn]').onclick = add; nw.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    pwStatus();
    if (focus) { let b = box.querySelector(focus); if (b && b.disabled) b = b.parentNode.querySelector('button:not([disabled])'); if (b) b.focus(); }
  }
  function pwStatus() {
    if (!PW.el) return; const s = PW.el.querySelector('[data-pw-st]'), pub = PW.el.querySelector('[data-pw-pub]'), dis = PW.el.querySelector('[data-pw-discard]');
    s.textContent = PW.dirty ? 'Unpublished changes' : ((PGE.doc || {}).on ? 'Matches your live page' : 'Your page is not public yet');
    s.classList.toggle('dirty', PW.dirty); pub.disabled = !PW.dirty; dis.hidden = !PW.dirty;
  }
  function pwDevice(dev) {
    PW.dev = dev; const fr = PW.el.querySelector('.ssx-pw-frame'); fr.dataset.dev = dev;
    PW.el.querySelectorAll('[data-pw-dev]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pwDev === dev))); pwFit();
  }
  // desktop view: the page is drawn 1280 wide and scaled to fit the stage
  function pwFit() {
    if (!PW.el) return; const fr = PW.el.querySelector('.ssx-pw-frame'), st0 = PW.el.querySelector('.ssx-pw-stage');
    if (PW.dev !== 'desktop') { fr.style.transform = ''; fr.style.width = ''; fr.style.height = ''; return; }
    const z = Math.min(1, (st0.clientWidth - 32) / 1280); fr.style.width = '1280px'; fr.style.height = Math.round((st0.clientHeight - 32) / z) + 'px'; fr.style.transform = `scale(${z})`;
  }
  async function pwPublish() {
    const b = PW.el.querySelector('[data-pw-pub]'); b.disabled = true; const t0 = b.textContent; b.textContent = 'Publishing…';
    const patch = {}; PW_KEYS.forEach(k => { if (PW.draft[k] !== undefined) patch[k] = pwClone(PW.draft[k]); });
    if (patch.titles) Object.keys(patch.titles).forEach(k => { patch.titles[k] = String(patch.titles[k] || '').trim(); });
    const ok = await pgSave(patch); b.textContent = t0;
    if (!ok) { b.disabled = false; return; }
    PW.dirty = false; pwStatus(); try { await pgSync(true); } catch (_) {}
    toast((PGE.doc || {}).on ? 'Published. Your live page updates within a minute.' : 'Saved. Tick "My page is public" on My page to put it live.');
    try { const c = document.getElementById('ssx-pgdesign'); if (c) pdDraw(c); } catch (_) {}
  }
  function pwClose() {
    if (!PW.el) return; PW.el.remove(); PW.el = null; document.documentElement.classList.remove('ssx-pw-open'); removeEventListener('resize', pwFit);
    try { const c = document.getElementById('ssx-pgdesign'); if (c) pdDraw(c); } catch (_) {}
    if (PW.opener && document.contains(PW.opener)) PW.opener.focus();
  }
  async function pwOpen() {
    if (PW.el) return; await pgLoad(); if (!PW.dirty || !PW.draft) { PW.draft = pwFromDoc(); PW.dirty = false; }
    PW.opener = document.activeElement;
    const el = document.createElement('div'); el.id = 'ssx-pw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Design my page');
    el.innerHTML = `<div class="ssx-pw-bar">
        <div class="ssx-pw-head"><div><h2>Design my page</h2><p class="note"><span data-pw-st aria-live="polite"></span></p></div>
          <div class="ssx-row"><button type="button" class="btn small" data-pw-discard hidden>Discard changes</button><button type="button" class="btn primary" data-pw-pub disabled>Publish</button><button type="button" class="btn small" data-pw-close>Close</button></div></div>
        <div class="ssx-pw-opts"></div>
      </div>
      <div class="ssx-pw-main">
        <div class="ssx-pw-view" role="group" aria-label="Preview size"><button type="button" class="ssx-chip" data-pw-dev="phone" aria-pressed="true">Phone</button><button type="button" class="ssx-chip" data-pw-dev="desktop" aria-pressed="false">Computer</button></div>
        <div class="ssx-pw-stage"><div class="ssx-pw-frame" data-dev="phone"><iframe title="Preview of your page" sandbox="allow-same-origin"></iframe><iframe title="Preview of your page" sandbox="allow-same-origin" hidden></iframe></div></div>
      </div>`;
    document.body.appendChild(el); PW.el = el; document.documentElement.classList.add('ssx-pw-open');
    el.querySelector('[data-pw-close]').onclick = pwClose;
    el.querySelector('[data-pw-pub]').onclick = pwPublish;
    const dis = el.querySelector('[data-pw-discard]');
    dis.onclick = () => { if (!PW.armed) { PW.armed = true; dis.textContent = 'Tap again to discard'; setTimeout(() => { PW.armed = false; if (PW.el) dis.textContent = 'Discard changes'; }, 4000); return; }
      PW.armed = false; dis.textContent = 'Discard changes'; PW.draft = pwFromDoc(); PW.dirty = false; pwControls(); pwPreview(); };
    el.querySelectorAll('[data-pw-dev]').forEach(b => b.onclick = () => pwDevice(b.dataset.pwDev));
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && !PW.ic) pwClose(); else if (e.key === 'Escape') { PW.ic = ''; pwControls(); } });
    addEventListener('resize', pwFit);
    pwControls(); pwDevice(PW.dev); pwPreview();
    const first = el.querySelector('.ssx-pw-opts .ssx-chip'); if (first) first.focus();
  }
  window.ssOpenPageDesigner = pwOpen;
  // the Design card on My page: one button into the designer
  pdDraw = function (el) {
    const d = PGE.doc || {}, L = { ...(d.look || {}) }, font = (PD_FONTS.find(f => f[0] === (L.font || 'italiana')) || [0, 'Elegant'])[1];
    const n = ((d.gallery || []).length), m = ((d.embeds || []).length);
    el.innerHTML = `<div class="ssx-head"><div><h3>Design ${PW.dirty ? '<span class="ssx-pw-pill">Unpublished changes</span>' : ''}</h3>
        <p class="note">Colors, layout, your picture, fonts, section titles and icons, photos and players. See every change before it goes live.</p>
        <p class="note">${esc(font)} name · ${n} photo${n === 1 ? '' : 's'} · ${m} player${m === 1 ? '' : 's'}</p></div>
      <div class="ssx-row"><button type="button" class="btn primary" data-pw-openbtn>${PW.dirty ? 'Continue designing' : 'Open designer'}</button></div></div>`;
    el.dataset.sig = pdSig();
    el.querySelector('[data-pw-openbtn]').onclick = pwOpen;
  };  
/* -- Link names stay yours: before a new name is saved, check it isn't one another artist has used (their old links
     must never lead to someone else). Names you used before still work and forward to your current one. */
  const _perfLN = perf;
  perf = async function (op, extra) {
    if (op === 'claim' && extra && extra.slug) {
      let free = true; try { const { data, error } = await sb.rpc('link_name_free', { p_slug: String(extra.slug).toLowerCase() }); if (!error && data === false) free = false; } catch (_) {}
      if (!free) throw Object.assign(new Error('fn'), { code: 'slug_taken' });
    }
    try { return await _perfLN.apply(this, arguments); }
    catch (e) { if (op === 'claim' && e && /slug_taken|23505|duplicate/i.test(String(e.code || ''))) e.code = 'slug_taken'; throw e; }
  };  
/* -- Media for My page, from both sides. In the designer: upload photos right in the Photos section (or drop them on it),
     and pick videos and mixes saved in Media as players. In Media: "Add photos", and an "On my page" switch on every photo
     and every video or mix. Uploads land in Media either way, so both places always show the same photos. */
  PW.open.add('photos');
  const pmMediaPlays = () => { try { return flLinks().filter(l => PD_PLAYS.test(String(l.url))).map(l => ({ url: String(l.url), label: l.title || pdName(l.url) })); } catch (_) { return []; } };
  // Media's switches change the live page right away (and the designer's unpublished copy, so the two never disagree)
  async function pmLive(key, fn, msg) {
    await pgLoad(); const cur = ((PGE.doc || {})[key] || []).filter(x => x && x.url), next = fn(cur); if (!next) return false;
    const ok = await pgSave({ [key]: next }); if (!ok) return false;
    if (PW.draft) PW.draft[key] = fn(((PW.draft[key]) || []).filter(x => x && x.url)) || PW.draft[key];
    try { await pgSync(true); } catch (_) {}
    toast((PGE.doc || {}).on ? msg : msg + '. Tick "My page is public" on My page to show it.'); try { flMediaHub(); } catch (_) {} return true;
  }
  const pmInGal = assetId => ((PGE.doc || {}).gallery || []).some(g => g && g.id === assetId);
  const pmInEmb = url => ((PGE.doc || {}).embeds || []).some(e => e && e.url === url);
  // each switch sets a definite on or off, on the live page and in the designer's unpublished copy alike
  function pmToggleGal(assetId) {
    const u = pdUrl(assetId); if (!u) { toast("That photo can't go on your page"); return; }
    const want = !pmInGal(assetId);
    return pmLive('gallery', g => { const has = g.some(x => x.id === assetId); if (!want) return g.filter(x => x.id !== assetId); if (has) return g; if (g.length >= 12) { toast('Your page shows up to 12 photos. Turn one off first.'); return null; } return [...g, { id: assetId, url: u }]; },
      want ? 'Added to your page' : 'Removed from your page');
  }
  function pmToggleEmb(url, label) {
    const want = !pmInEmb(url);
    return pmLive('embeds', e => { const has = e.some(x => x.url === url); if (!want) return e.filter(x => x.url !== url); if (has) return e; if (e.length >= 6) { toast('Your page shows up to 6 players. Turn one off first.'); return null; } return [...e, { url, label: label || '' }]; },
      want ? 'Player added to your page' : 'Player removed from your page');
  }
  // upload into Media, then (in the designer) add the new photos to the page's photos
  function pmUpload(toDraft, files) {
    const after = ids => {
      if (!toDraft || !PW.draft) return;
      const g = (PW.draft.gallery || []).filter(x => x && x.url), room = 12 - g.length, add = ids.filter(id => !g.some(x => x.id === id)).slice(0, Math.max(0, room)).map(id => ({ id, url: pdUrl(id) })).filter(x => x.url);
      if (add.length) pwSet({ gallery: [...g, ...add] });
      if (ids.length > add.length) toast('Your page shows up to 12 photos. The rest are saved in Media.');
      setTimeout(() => { if (PW.el) pwControls(); }, 1500);
    };
    files ? flAddFiles(files, '', after) : flAddPhotos('', after);
  }
  // designer: upload button and drop zone in Photos; Media's videos and mixes in Watch & listen
  const _pwControlsM = pwControls;
  pwControls = function (focus) {
    const r = _pwControlsM.apply(this, arguments);
    try {
      const box = PW.el && PW.el.querySelector('.ssx-pw-opts'); if (!box) return r;
      const ph = box.querySelector('details[data-pd="photos"]');
      if (ph) {
        const up = document.createElement('div'); up.className = 'ssx-pm-drop';
        up.innerHTML = '<button type="button" class="btn small primary" data-pm-up>Upload photos</button><span class="note">or drop them here. They\'re saved in Media too.</span>';
        const sum = ph.querySelector('summary'); sum.after(up);
        up.querySelector('[data-pm-up]').onclick = () => pmUpload(true);
        const empty = [...ph.querySelectorAll('p.note')].find(p => /No photos yet/.test(p.textContent)); if (empty) empty.remove();
        ['dragenter', 'dragover'].forEach(t => ph.addEventListener(t, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); ph.classList.add('ssx-pm-over'); } }));
        ['dragleave', 'drop'].forEach(t => ph.addEventListener(t, () => ph.classList.remove('ssx-pm-over')));
        ph.addEventListener('drop', e => { const f = [...((e.dataTransfer || {}).files || [])]; if (!f.length) return; e.preventDefault(); pmUpload(true, f); });
      }
      const wt = box.querySelector('details[data-pd="watch"]');
      if (wt) {
        const D = PW.draft, have = new Set([...wt.querySelectorAll('[data-pd-emb]')].map(c => c.dataset.pdEmb)), on = new Set((D.embeds || []).map(e => e.url));
        const extra = pmMediaPlays().filter(l => !have.has(l.url)); if (extra.length) {
          let list = wt.querySelector('.ssx-pglist'); if (!list) { list = document.createElement('div'); list.className = 'ssx-pglist'; wt.querySelector('.ssx-pd-add').before(list); }
          extra.forEach(l => { const lb = document.createElement('label'); lb.className = 'ssx-check'; lb.innerHTML = `<input type="checkbox" data-pm-emb="${esc(l.url)}"${on.has(l.url) ? ' checked' : ''}> ${esc(l.label)} <span class="note">from Media</span>`; list.appendChild(lb);
            lb.querySelector('input').onchange = ev => { const e0 = (D.embeds || []).filter(x => x && x.url);
              if (ev.target.checked && e0.length >= 6) { ev.target.checked = false; toast('Your page shows up to 6 players. Untick one first.'); return; }
              pwSet({ embeds: ev.target.checked ? [...e0.filter(x => x.url !== l.url), { url: l.url, label: l.label }] : e0.filter(x => x.url !== l.url) }, `[data-pm-emb="${l.url.replace(/"/g, '\\"')}"]`); }; });
        }
        const n = wt.querySelector('summary .note'); if (n) n.textContent = `${(D.embeds || []).length} of 6`;
      }
      if (focus && !box.contains(document.activeElement)) { const b = box.querySelector(focus); if (b) b.focus(); }
    } catch (e) { console.error(e); }
    return r;
  };
  // My page's Design card: a quick way in for photos
  const _pdDrawM = pdDraw;
  pdDraw = function (el) {
    const r = _pdDrawM.apply(this, arguments);
    try { const row = el.querySelector('.ssx-row'); if (row && !row.querySelector('[data-pm-addph]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.pmAddph = '1'; b.textContent = 'Add photos'; b.onclick = async () => { await pwOpen(); PW.open.add('photos'); pwControls(); const d = PW.el && PW.el.querySelector('details[data-pd="photos"]'); if (d) { d.scrollIntoView({ block: 'start' }); const u = d.querySelector('[data-pm-up]'); if (u) u.focus(); } }; row.prepend(b); } } catch (_) {}
    return r;
  };
  // Media: "Add photos", and an "On my page" switch on photos, videos and mixes
  const _flMediaHubM = flMediaHub;
  flMediaHub = function () {
    const r = _flMediaHubM.apply(this, arguments);
    try {
      const hub = document.getElementById('ssx-fl-hub'); if (!hub || !PGE.loaded) { if (!PGE.loaded) pgLoad(); return r; }
      const row = hub.querySelector(':scope > .ssx-row'); if (row && !row.querySelector('[data-pm-mup]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.pmMup = '1'; b.textContent = '+ Add photos'; b.onclick = () => pmUpload(false); row.appendChild(b); }
      if (!pgSlug()) return r;
      hub.querySelectorAll('.ssx-fl-thw').forEach(w => {
        const id = (w.querySelector('[data-fl-ph]') || {}).dataset; const m = id && FL.media.find(x => x.id === id.flPh); if (!m || !m.assetId) return;
        let b = w.querySelector('[data-pm-gal]'); if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'ssx-pm-on'; b.dataset.pmGal = m.assetId; b.onclick = () => pmToggleGal(m.assetId); w.appendChild(b); }
        const on = pmInGal(m.assetId); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ On my page' : '+ My page'; b.setAttribute('aria-label', on ? 'Remove from my page' : 'Add to my page');
      });
      hub.querySelectorAll('.ssx-fl-lrow').forEach(lr => {
        const a = lr.querySelector('a[href]'), url = a && a.getAttribute('href'); if (!url || !PD_PLAYS.test(url)) return;
        const act = lr.querySelector('.ssx-fl-lact'); let b = lr.querySelector('[data-pm-emb]');
        if (!b && act) { b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.pmEmb = url; const lbl = (lr.querySelector('.ssx-fl-lt b') || {}).textContent || ''; b.onclick = () => pmToggleEmb(url, lbl); act.prepend(b); }
        if (b) { const on = pmInEmb(url); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ On my page' : 'Play on my page'; }
      });
    } catch (e) { console.error(e); }
    return r;
  };  
/* -- Apple Calendar: a private subscribe link (Settings → Google & calendars). Shows appear in the Calendar app on
     iPhone, iPad and Mac and update on their own. Also works in Outlook or any app that can "subscribe to a calendar". */
  const CF = { doc: null, loaded: false, armed: false };
  const cfApple = () => /iPhone|iPad|Macintosh|Mac OS X/.test(navigator.userAgent);
  const cfToken = () => { const a = new Uint8Array(20); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
  const cfTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'; } catch (_) { return 'America/Los_Angeles'; } };
  const cfUrl = (web) => { const t = (CF.doc || {}).token; if (!t) return ''; return `${web ? 'webcal' : location.protocol.replace(':', '')}://${location.host}/cal/${t}.ics`; };
  async function cfLoad() { if (CF.loaded || !st.db) return; CF.loaded = true; try { const s = await st.db.doc('settings/calfeed').get(); CF.doc = s.exists ? s.data() : {}; } catch (_) { CF.doc = null; CF.loaded = false; } cfCard(); }
  async function cfSave(patch, msg) {
    const next = { ...(CF.doc || {}), ...patch, updatedAt: new Date().toISOString() };
    try { await st.db.doc('settings/calfeed').set(next); CF.doc = next; if (msg) toast(msg); cfCard(true); return true; } catch (_) { toast("Couldn't save. " + OFFLINE); return false; }
  }
  function cfCard(force) {
    const grp = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="google"]'); if (!grp || !st.db) return;
    const nb = document.querySelector('section[data-view="settings"] [data-ssg-go="google"]'); if (nb && nb.textContent !== 'Google & calendars') nb.textContent = 'Google & calendars';
    if (!CF.loaded) { cfLoad(); return; } if (!CF.doc) return;
    let el = document.getElementById('ssx-calfeed');
    if (!el) { el = document.createElement('div'); el.id = 'ssx-calfeed'; el.className = 'card ssx'; const cals = grp.querySelector('#setCals'); (cals && (cals.closest('.card') || cals)) ? (cals.closest('.card') || cals).after(el) : grp.appendChild(el); }
    const d = CF.doc, on = !!(d.on && d.token), sig = JSON.stringify([on, d.token, !!d.holds]);
    if (!force && el.dataset.sig === sig) return; el.dataset.sig = sig;
    const apple = cfApple();
    el.innerHTML = on ? `<div class="ssx-head"><div><h3>Apple Calendar <span class="ssx-pill-on">On</span></h3>
        <p class="note">Your shows appear in the Calendar app and update on their own, about every hour.</p></div></div>
      <div class="ssx-cf-act">${apple ? '<a class="btn primary" data-cf-add>Add to Apple Calendar</a>' : ''}<button type="button" class="btn${apple ? '' : ' primary'}" data-cf-copy>Copy calendar link</button></div>
      <p class="note">${apple ? 'On this device, tap <b>Add to Apple Calendar</b>, then <b>Subscribe</b>. ' : 'On your iPhone: open Set &amp; Settled there and tap <b>Add to Apple Calendar</b>, or paste this link in Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar. '}Outlook and other apps: paste the link where they ask for a calendar "from URL" or "subscribed calendar".</p>
      <label class="ssx-check"><input type="checkbox" data-cf-holds${d.holds ? ' checked' : ''}> Include holds (they show as "Hold:" and don't block your time)</label>
      <p class="note">Only shows the date, set times, show name, venue and address, and ticket link. Never fees, contacts or notes. Anyone with the link can see those details, so keep it to your own devices.${(typeof G !== 'undefined' && G.mcp) ? ' Your Google Calendar is connected: if it\'s already on your iPhone, your shows may show up twice.' : ''}</p>
      <div class="ssx-cf-act"><button type="button" class="btn small" data-cf-reset>Make a new link</button><button type="button" class="btn small" data-cf-off>Turn off</button></div>`
      : `<div class="ssx-head"><div><h3>Apple Calendar</h3>
        <p class="note">See your shows in the Calendar app on your iPhone, iPad and Mac. They update on their own. Works with Outlook too.</p></div>
        <button type="button" class="btn primary" data-cf-on>Turn on</button></div>`;
    const q = s => el.querySelector(s);
    if (q('[data-cf-on]')) q('[data-cf-on]').onclick = async e => { e.currentTarget.disabled = true; if (await cfSave({ on: true, token: d.token || cfToken(), tz: cfTz(), holds: !!d.holds }, 'Calendar link ready')) { const a = q('[data-cf-add]'); if (a) a.focus(); else { const c = q('[data-cf-copy]'); if (c) c.focus(); } } };
    const add = q('[data-cf-add]'); if (add) add.href = cfUrl(true);
    if (q('[data-cf-copy]')) q('[data-cf-copy]').onclick = () => { const u = cfUrl(false); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Calendar link copied'), () => toast(u)); };
    if (q('[data-cf-holds]')) q('[data-cf-holds]').onchange = e => cfSave({ holds: e.target.checked }, e.target.checked ? 'Holds will show in your calendar' : 'Holds removed from your calendar').then(() => { const c = el.querySelector('[data-cf-holds]'); if (c) c.focus(); });
    if (q('[data-cf-off]')) q('[data-cf-off]').onclick = () => cfSave({ on: false }, 'Calendar link turned off. Calendars that subscribed stop updating.');
    const rs = q('[data-cf-reset]'); if (rs) rs.onclick = () => {
      if (!CF.armed) { CF.armed = true; rs.textContent = 'Tap again: the old link stops working'; setTimeout(() => { CF.armed = false; if (rs.isConnected) rs.textContent = 'Make a new link'; }, 5000); return; }
      CF.armed = false; cfSave({ token: cfToken(), on: true }, 'New link made. The old one no longer works. Add this one to your devices.');
    };
  }
  const _pgCardCF = pgCard;
  pgCard = function () { const r = _pgCardCF.apply(this, arguments); try { cfCard(); } catch (e) { console.error(e); } return r; };  
/* -- My page, finished: news posts written in the designer (with the live preview), and a "My page" switch on every
     upcoming confirmed show, so a private gig can stay off the page without leaving the show. */
  if (!PD_ORDER.includes('news')) PD_ORDER.unshift('news');
  PD_TITLE.news = 'News'; PD_ICON0.news = 'bolt'; if (!PW_KEYS.includes('news')) PW_KEYS.push('news');
  const PN = { pick: -1 };
  const pnToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const pnId = () => Math.random().toString(36).slice(2, 10);
  const pnList = () => ((PW.draft || {}).news || []).filter(n => n && typeof n === 'object');
  // the preview gets the draft's posts, today's date and the time zone, like the live page does
  const _pwDataN = pwData;
  pwData = function () {
    const d = _pwDataN.apply(this, arguments);
    d.news = pnList(); d.today = pnToday(); try { d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    return d;
  };
  function pnSet(list, focus) { pwSet({ news: list }, focus); }
  function pnEditor(box) {
    const list = pnList(), photos = pdPhotos(), det = document.createElement('details');
    det.className = 'ssx-pd'; det.dataset.pd = 'news'; if (PW.open.has('news')) det.open = true;
    det.innerHTML = `<summary>News posts <span class="note">${list.length} of 6</span></summary>
      <p class="note">Short updates at the top of your page: a new mix, a residency, a big show. Add an end date and a post disappears on its own after that day.</p>
      ${list.map((n, i) => `<div class="ssx-pn" data-i="${i}">
        <div class="ssx-pn-top"><b>Post ${i + 1}</b>${n.until && n.until < pnToday() ? ' <span class="note">(ended, not showing)</span>' : ''}<span class="mv"><button type="button" class="btn small" data-pn-up aria-label="Move post ${i + 1} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-pn-dn aria-label="Move post ${i + 1} down"${i < list.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="btn small" data-pn-del>Remove</button></span></div>
        <input type="text" data-pn="title" maxlength="80" value="${esc(n.title || '')}" placeholder="Headline, e.g. New mix out now" aria-label="Headline for post ${i + 1}">
        <textarea data-pn="text" maxlength="600" placeholder="A few words (optional)" aria-label="Text for post ${i + 1}">${esc(n.text || '')}</textarea>
        <div class="ssx-pn-row"><input type="url" inputmode="url" data-pn="url" value="${esc(n.url || '')}" placeholder="Link (optional)" aria-label="Link for post ${i + 1}"><input type="text" data-pn="label" maxlength="30" value="${esc(n.label || '')}" placeholder="Button text, e.g. Listen" aria-label="Button text for post ${i + 1}"></div>
        <div class="ssx-pn-row"><label class="ssx-pn-until">Show until <input type="date" data-pn="until" value="${esc(n.until || '')}" min="${pnToday()}"></label>
          <span class="ssx-pn-ph">${n.img && n.img.url ? `<img src="${esc(n.img.id ? (flSrc(n.img.id) || n.img.url) : n.img.url)}" alt="">` : ''}<button type="button" class="btn small" data-pn-pic aria-expanded="${PN.pick === i}">${n.img ? 'Change photo' : 'Add photo'}</button>${n.img ? '<button type="button" class="btn small" data-pn-nopic>Remove photo</button>' : ''}</span></div>
        ${PN.pick === i ? `<div class="ssx-pn-pick"><button type="button" class="btn small primary" data-pn-up-ph>Upload a photo</button>${photos.length ? `<div class="ssx-pd-phs">${photos.map(p => `<button type="button" class="ssx-pd-ph" data-pn-use="${esc(p.id)}" aria-pressed="${!!(n.img && n.img.id === p.id)}" aria-label="Use this photo"><img src="${esc(flSrc(p.id) || p.url)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>` : ''}
      </div>`).join('')}
      ${list.length < 6 ? '<button type="button" class="btn small primary" data-pn-add>+ Add a post</button>' : '<p class="note">Your page shows up to 6 posts. Remove one to add another.</p>'}`;
    const sec = box.querySelector('details[data-pd="sections"]'); sec ? sec.before(det) : box.appendChild(det);
    det.ontoggle = () => { det.open ? PW.open.add('news') : PW.open.delete('news'); };
    const add = det.querySelector('[data-pn-add]'); if (add) add.onclick = () => { PW.open.add('news'); pnSet([{ id: pnId(), title: '', text: '' }, ...list], '.ssx-pn[data-i="0"] [data-pn="title"]'); };
    det.querySelectorAll('.ssx-pn').forEach(row => {
      const i = +row.dataset.i, f = s => `.ssx-pn[data-i="${i}"] ${s}`;
      // typing updates the preview right away, without redrawing the form
      row.querySelectorAll('[data-pn]').forEach(inp => {
        const k = inp.dataset.pn;
        inp.addEventListener(k === 'until' ? 'change' : 'input', () => { const L = pnList().map(x => ({ ...x })); L[i] = { ...L[i], [k]: inp.value }; PW.draft.news = L; PW.dirty = true; pwStatus(); pwPreview(); });
        if (k === 'url') inp.addEventListener('change', () => { let v = inp.value.trim(); if (v && !/^https?:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) { v = 'https://' + v; inp.value = v; } const L = pnList().map(x => ({ ...x })); L[i] = { ...L[i], url: v }; PW.draft.news = L; pwPreview(); });
      });
      const mv = dir => { const L = pnList().slice(), j = i + dir; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; PN.pick = -1; pnSet(L, `.ssx-pn[data-i="${j}"] ${dir < 0 ? '[data-pn-up]' : '[data-pn-dn]'}`); };
      row.querySelector('[data-pn-up]').onclick = () => mv(-1); row.querySelector('[data-pn-dn]').onclick = () => mv(1);
      row.querySelector('[data-pn-del]').onclick = () => { const L = pnList().filter((_, k) => k !== i); PN.pick = -1; pnSet(L, L.length ? `.ssx-pn[data-i="${Math.max(0, i - 1)}"] [data-pn="title"]` : '[data-pn-add]'); toast('Post removed. Discard changes brings it back.'); };
      row.querySelector('[data-pn-pic]').onclick = () => { PN.pick = PN.pick === i ? -1 : i; pwControls(PN.pick === i ? f('[data-pn-up-ph]') : f('[data-pn-pic]')); };
      const np = row.querySelector('[data-pn-nopic]'); if (np) np.onclick = () => { const L = pnList().map(x => ({ ...x })); delete L[i].img; pnSet(L, f('[data-pn-pic]')); };
      const setImg = id => { const u = pdUrl(id); if (!u) return; const L = pnList().map(x => ({ ...x })); if (!L[i]) return; L[i].img = { id, url: u }; PN.pick = -1; pnSet(L, f('[data-pn-pic]')); };
      row.querySelectorAll('[data-pn-use]').forEach(b => b.onclick = () => setImg(b.dataset.pnUse));
      const upb = row.querySelector('[data-pn-up-ph]'); if (upb) upb.onclick = () => flAddPhotos('', ids => { if (ids && ids[0]) setImg(ids[0]); });
    });
  }
  const _pwControlsN = pwControls;
  pwControls = function (focus) {
    const r = _pwControlsN.apply(this, arguments);
    try { const box = PW.el && PW.el.querySelector('.ssx-pw-opts'); if (box && !box.querySelector('details[data-pd="news"]')) { pnEditor(box); if (focus) { const b = box.querySelector(focus); if (b && document.activeElement !== b) b.focus(); } } } catch (e) { console.error(e); }
    return r;
  };
  // on a show: "My page: Shown / Hidden", right under Tickets
  function pgShowRow(root) {
    const id = root.dataset && root.dataset.booking, dl = root.querySelector('dl.kv'); if (!id || !dl || !pgSlug() || !PGE.loaded) { if (!PGE.loaded) pgLoad(); return; }
    const b = flBk().find(x => x.id === id); if (!b || flKind(b.status) !== 'confirmed' || !b.date || b.date < todayStr()) { const old = dl.querySelector('.ssx-pgrow'); if (old) { old.previousElementSibling.remove(); old.remove(); } return; }
    let dd = dl.querySelector('dd.ssx-pgrow');
    if (!dd) {
      const dt = document.createElement('dt'); dt.textContent = 'My page'; dd = document.createElement('dd'); dd.className = 'ssx-pgrow';
      const tix = dl.querySelector('.ssx-tix'), anchor = tix ? tix.closest('dd') : null;
      if (anchor) anchor.after(dt, dd); else dl.append(dt, dd);
    }
    const hidden = ((PGE.doc || {}).hide || []).includes(id), sig = String(hidden); if (dd.dataset.sig === sig) return; dd.dataset.sig = sig;
    dd.innerHTML = `<label class="ssx-check"><input type="checkbox" data-pg-onpage${hidden ? '' : ' checked'}> ${hidden ? 'Hidden from your page' : 'Shown on your page'}</label>`;
    dd.querySelector('input').onchange = async e => {
      const show = e.target.checked, h = new Set((PGE.doc || {}).hide || []); show ? h.delete(id) : h.add(id);
      if (await pgSave({ hide: [...h], updatedAt: new Date().toISOString() })) { toast(show ? 'Shown on your page' : 'Hidden from your page. Still in your calendar and bookings.'); dd.dataset.sig = ''; pgShowRow(root); const c = dd.querySelector('input'); if (c) c.focus(); }
    };
  }
  const _flContactPhoneN = flContactPhone;
  flContactPhone = function (root) { const r = _flContactPhoneN.apply(this, arguments); try { pgShowRow(root); } catch (e) { console.error(e); } return r; };  
/* -- One ＋ for everything. The header button (and a floating ＋ on narrow phones) opens a short menu: show, contact,
     task, invoice, expense, income, email, photos, link, blocked dates. What fits the screen you're on comes first.
     Each choice opens the same form you already know. Shortcut: press N anywhere you're not typing. */
  const QA_ICON = {
    show: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    invoice: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    expense: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    income: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'
  };
  const qaCall = (name, ...a) => { const f = window[name]; if (typeof f === 'function') return f(...a); toast('That form isn\'t available right now'); };
  // [key, label, hint, open, screens where it comes first]
  const QA_ITEMS = [
    ['show', 'Show or booking', 'A gig, a hold or a lead', () => qaCall('bookingForm'), ['home', 'bookings', 'calendar']],
    ['contact', 'Contact', 'Venue, promoter, client, anyone', () => qaCall('contactForm'), ['contacts']],
    ['task', 'Task', 'A to-do for a show', () => qaCall('newTaskSheet'), ['tasks']],
    ['invoice', 'Invoice', 'Bill a show', () => qaInvoice(), ['money']],
    ['expense', 'Expense', 'Gear, travel, subscriptions', () => qaCall('expenseForm'), ['money']],
    ['income', 'Income', 'Tips, merch, streaming', () => qaCall('incomeForm'), ['money']],
    ['email', 'Email', 'Write to a contact', () => qaCall('composeSheet'), ['comms']],
    ['photos', 'Photos', 'Upload to Media', () => flAddPhotos('', ids => toast(ids && ids.length > 1 ? `${ids.length} photos added to Media` : 'Photo added to Media')), ['kit', 'media', 'mypage', 'epk']],
    ['link', 'Link', 'Music, videos, press, socials', () => qaCall('linkForm'), ['kit', 'media', 'mypage']],
    ['block', 'Block dates', 'Trips, nights off', () => qaCall('blockForm'), ['calendar']]
  ];
  const qaVis = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const qaView = () => { const s = [...document.querySelectorAll('section[data-view]')].find(x => !x.hidden && qaVis(x)); return s ? s.dataset.view : 'home'; };
  const qaSvg = k => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${QA_ICON[k]}</svg>`;
  // invoice: pick the show first (unpaid confirmed or played shows, nearest first)
  function qaInvoice() {
    const all = (S.bookings || []).filter(b => ['confirmed', 'played'].includes(flKind(b.status)) && b.status !== 'paid' && b.date);
    if (!all.length) { toast('Add a confirmed show first, then invoice it'); return; }
    const t = todayStr(), rank = b => Math.abs(new Date(b.date) - new Date(t));
    const list = all.sort((a, b) => rank(a) - rank(b)).slice(0, 12);
    const venue = b => { const v = (S.contacts || []).find(c => c.id === b.venueId); return v ? (v.org || v.name || '') : ''; };
    const nice = ds => { try { return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return ds; } };
    sheet(`<h3>Invoice which show?</h3><p class="note" style="margin:0 0 10px">Shows you've confirmed or played and haven't marked paid.</p>
      <div class="ssx-qa-list">${list.map(b => `<button type="button" class="ssx-qa-row" data-qa-inv="${esc(b.id)}"><span class="d">${esc(nice(b.date))}</span><span><b>${esc(b.title || venue(b) || 'Show')}</b>${venue(b) && b.title ? `<small>${esc(venue(b))}</small>` : ''}</span></button>`).join('')}</div>`,
      root => { root.querySelectorAll('[data-qa-inv]').forEach(x => x.onclick = () => qaCall('invoiceSheet', x.dataset.qaInv)); const f = root.querySelector('[data-qa-inv]'); if (f) f.focus(); });
  }
  function qaMenu(anchor) {
    if (typeof openPop !== 'function') { qaCall('bookingForm'); return; }
    if (PK.open && PK.open.anchor === anchor) { closePop(); return; }
    const v = qaView(), first = QA_ITEMS.filter(i => i[4].includes(v)), rest = QA_ITEMS.filter(i => !i[4].includes(v));
    const items = first.length ? [...first, ...rest] : QA_ITEMS;
    openPop(anchor, pop => {
      pop.classList.add('ssx-qa-pop');
      pop.innerHTML = `<div role="menu" aria-label="Add">${items.map((i, n) => `${first.length && n === first.length ? '<div class="ssx-qa-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="ssx-qa-item" data-qa="${i[0]}">${qaSvg(i[0])}<span><b>${i[1]}</b><small>${i[2]}</small></span></button>`).join('')}</div>`;
      const btns = [...pop.querySelectorAll('[data-qa]')];
      btns.forEach(b => b.onclick = () => { const it = QA_ITEMS.find(i => i[0] === b.dataset.qa); PK.refocus = false; closePop(); setTimeout(() => it[3](), 0); });
      pop.addEventListener('keydown', e => {
        const i = btns.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); } else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus(); }
      });
      requestAnimationFrame(() => btns[0] && btns[0].focus());
    }, 260);
  }
  window.ssQuickAdd = qaMenu;
  function qaWire() {
    const qa = document.getElementById('quickAdd');
    if (qa && !qa.dataset.qaWired) {
      qa.dataset.qaWired = '1'; qa.textContent = '+ Add'; qa.setAttribute('aria-haspopup', 'menu'); qa.title = 'Add anything (N)';
      qa.onclick = e => { e.preventDefault(); qaMenu(qa); };
    }
    // narrow phones hide the header button, so a floating ＋ sits above the tabs instead
    let fab = document.getElementById('ssx-qa-fab');
    const app = document.querySelector('#tabs'), signedIn = qaVis(app), open = !!document.querySelector('#sheetRoot .sheet') || document.documentElement.classList.contains('ssx-pw-open');
    const need = signedIn && !open && !qaVis(qa);
    if (need && !fab) { fab = document.createElement('button'); fab.type = 'button'; fab.id = 'ssx-qa-fab'; fab.setAttribute('aria-label', 'Add'); fab.setAttribute('aria-haspopup', 'menu'); fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'; fab.onclick = () => qaMenu(fab); document.body.appendChild(fab); }
    if (fab) fab.hidden = !need;
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'n' && e.key !== 'N') return; if (e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement, typing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    if (typing || document.querySelector('#sheetRoot .sheet') || document.querySelector('.pop') || document.documentElement.classList.contains('ssx-pw-open')) return;
    if (!qaVis(document.querySelector('#tabs'))) return;
    e.preventDefault(); const qa = document.getElementById('quickAdd'), fab = document.getElementById('ssx-qa-fab');
    qaMenu(qaVis(qa) ? qa : (fab && !fab.hidden ? fab : qa));
  });
  const _pgCardQA = pgCard;
  pgCard = function () { const r = _pgCardQA.apply(this, arguments); try { qaWire(); } catch (e) { console.error(e); } return r; };
/* -- Activity timeline on every show and every contact: what happened, newest first, built only from what the app
     already keeps (stage dates, booking-link requests, emails sent from the app, invoices, money, outreach, referrals).
     Tap a line to open it. Also: status buttons on a show now keep the earlier stage dates instead of replacing them. */
  // (applied as soon as the app's save function exists)
  function tlKeepStages() { if (typeof window.patch !== 'function' || window.patch.__tlKeep) return;
    const _patchTL = window.patch;
    window.patch = async function (col, id, data) {
      try {
        if (col === 'bookings' && data && data.stageAt && typeof data.stageAt === 'object') {
          const cur = (S.bookings || []).find(x => x.id === id);
          if (cur && cur.stageAt) data = { ...data, stageAt: { ...cur.stageAt, ...data.stageAt } };
        }
      } catch (_) {}
      return _patchTL.call(this, col, id, data);
    };
    window.patch.__tlKeep = true;
  }
  tlKeepStages();
  const TL = { open: new Set(), N: 5 };
  const tlDay = s => String(s || '').slice(0, 10);
  const tlNice = s => {
    const d = tlDay(s); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    const t = todayStr(); if (d === t) return 'Today'; if (d === addDays(t, -1)) return 'Yesterday'; if (d === addDays(t, 1)) return 'Tomorrow';
    try { const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) }); } catch (_) { return d; }
  };
  const tlMoney = n => { try { return money(n); } catch (_) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); } };
  const tlStat = k => { try { return (STATUSES.find(s => s[0] === k) || [k, k])[1]; } catch (_) { return k; } };
  const tlShowName = b => { try { return bookingName(b); } catch (_) { return b.title || 'Show'; } };
  const TL_VIA = { email: 'Emailed', dm: 'Messaged', call: 'Called', text: 'Texted', meet: 'Met', inperson: 'Met in person' };
  const tlGmail = id => id ? 'https://mail.google.com/mail/#all/' + encodeURIComponent(id) : '';
  function tlFound(b) {
    const v = b.foundVia; if (!v) return '';
    let lab = ''; try { lab = (FOUND().find(f => f[0] === v) || [v, v])[1]; } catch (_) { lab = v; }
    if (v === 'saw' && b.foundShowId) { const n = foundShowName(b.foundShowId); if (n) return `Saw you at ${n}`; }
    if (v === 'referral' && b.foundById) { const c = contact(b.foundById); if (c) return `Referred by ${cName(c)}`; }
    return lab + (b.foundText ? `: ${b.foundText}` : '');
  }
  // one show's story
  function tlForShow(b, withName) {
    const out = [], nm = withName ? ` · ${tlShowName(b)}` : '', open = () => bookingView(b.id), fromLink = b.source === 'booking-link';
    if (b.createdAt) out.push({ at: b.createdAt, k: fromLink ? 'req' : 'new', text: (fromLink ? 'Request came in through your booking link' : 'Added') + nm, sub: tlFound(b), go: withName ? open : null });
    const st = b.stageAt || {}, seen = new Set();
    ['lead', 'pitched', 'confirmed', 'played', 'paid', 'lost'].forEach(k => { if (!st[k]) return; seen.add(k); if (k === 'lead' && tlDay(st[k]) === tlDay(b.createdAt)) return; out.push({ at: st[k], k: 'stage', st: k, text: `${tlStat(k)}${nm}`, go: withName ? open : null }); });
    if (b.paidDate && !seen.has('paid')) out.push({ at: b.paidDate, k: 'stage', st: 'paid', text: `Paid${nm}`, go: withName ? open : null });
    if (!withName && b.requestStatus) { const d = b.requestAt || b.updatedAt; if (d && !Object.keys(st).length) out.push({ at: d, k: 'stage', text: b.requestStatus === 'declined' ? 'Request declined' : 'Request accepted' }); }
    const inv = b.invoice || {};
    if (!withName) {
      if (inv.issueDate) out.push({ at: inv.issueDate, k: 'inv', text: `Invoice${inv.number ? ' ' + inv.number : ''} created`, go: () => invoiceSheet(b.id) });
      if (inv.sentAt) out.push({ at: inv.sentAt, k: 'inv', text: `Invoice${inv.number ? ' ' + inv.number : ''} sent`, go: () => invoiceSheet(b.id) });
      (S.expenses || []).filter(e => e.bookingId === b.id).forEach(e => out.push({ at: e.date || e.createdAt, k: 'money', text: `Expense: ${e.desc || 'expense'} · ${tlMoney(e.amount)}`, go: () => expenseForm(e) }));
      (S.income || []).filter(x => x.bookingId === b.id).forEach(x => out.push({ at: x.date || x.createdAt, k: 'money', text: `Income: ${x.desc || x.source || 'income'} · ${tlMoney(x.amount)}`, go: () => incomeForm(x) }));
      if (b.date && b.date > todayStr() && ['confirmed', 'pitched'].includes(flKind(b.status))) out.push({ at: b.date, k: 'soon', text: 'Show day', future: true });
    }
    return out;
  }
  const tlEmails = f => (S.sentLog || []).filter(f).map(x => ({ at: x.at, k: 'mail', text: `Email sent${x.label ? ': ' + x.label : ''}`, sub: x.attachment ? 'With an attachment' : '', href: tlGmail(x.threadId) }));
  function tlForContact(c) {
    const cid = c.id, rel = (S.bookings || []).filter(b => [b.venueId, b.promoterId, b.contactPersonId, b.mediaId, b.bookingContactId].includes(cid));
    let out = [];
    if (c.createdAt) out.push({ at: c.createdAt, k: 'new', text: 'Added to your contacts' });
    rel.forEach(b => { out = out.concat(tlForShow(b, true)); });
    (S.bookings || []).filter(b => b.foundById === cid && b.createdAt).forEach(b => out.push({ at: b.createdAt, k: 'ref', text: `Referred you · ${tlShowName(b)}`, go: () => bookingView(b.id) }));
    out = out.concat(tlEmails(x => x.contactId === cid));
    (S.income || []).filter(x => x.sourceId === cid).forEach(x => out.push({ at: x.date || x.createdAt, k: 'money', text: `Paid you ${tlMoney(x.amount)}${x.desc ? ' · ' + x.desc : ''}`, go: () => incomeForm(x) }));
    try { flRoList(c).forEach(r => { if (r.via === 'email' && (S.sentLog || []).some(x => x.contactId === cid && tlDay(x.at) === tlDay(r.at))) return; out.push({ at: r.at, k: 'reach', text: `${TL_VIA[r.via] || 'Reached out'}${r.bookingId ? ' about ' + tlShowName((S.bookings || []).find(b => b.id === r.bookingId) || {}) : ''}`, sub: r.note && r.via !== 'email' ? r.note : (r.outcome || '') }); }); } catch (_) {}
    return out;
  }
  function tlDraw(root, key, items, title) {
    const list = items.filter(i => tlDay(i.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const sig = JSON.stringify(list.map(i => [i.at, i.text, i.sub])) + TL.open.has(key);
    let box = root.querySelector(':scope .ssx-tl');
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'ssx-tl'; const act = root.querySelector(':scope > .actions, :scope .sheet-actions'); act ? act.before(box) : root.appendChild(box); }
    if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    const all = TL.open.has(key), shown = all ? list : list.slice(0, TL.N);
    box.innerHTML = `<h4>${esc(title)}</h4><ol>${shown.map((i, n) => {
      const inner = `<span class="when">${esc(tlNice(i.at))}</span><span class="dot k-${i.k}${i.st ? ' s-' + i.st : ''}" aria-hidden="true"></span><span class="what">${esc(i.text)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>`;
      return `<li${i.future ? ' class="future"' : ''}>${i.href ? `<a href="${esc(i.href)}" target="_blank" rel="noopener">${inner}</a>` : i.go ? `<button type="button" data-tl="${n}">${inner}</button>` : `<div>${inner}</div>`}</li>`;
    }).join('')}</ol>${list.length > TL.N ? `<button type="button" class="linkbtn" data-tl-more>${all ? 'Show less' : `Show all ${list.length}`}</button>` : ''}`;
    box.querySelectorAll('[data-tl]').forEach(b => b.onclick = () => { const it = shown[+b.dataset.tl]; if (it && it.go) it.go(); });
    const m = box.querySelector('[data-tl-more]'); if (m) m.onclick = () => { all ? TL.open.delete(key) : TL.open.add(key); box.dataset.sig = ''; tlDraw(root, key, items, title); const mm = box.querySelector('[data-tl-more]'); if (mm) mm.focus(); };
  }
  const _flContactPhoneTL = flContactPhone;
  flContactPhone = function (root) {
    tlKeepStages(); const r = _flContactPhoneTL.apply(this, arguments);
    try { const id = root.dataset && root.dataset.booking, b = id && (S.bookings || []).find(x => x.id === id); if (b) tlDraw(root, 'b:' + id, [...tlForShow(b, false), ...tlEmails(x => x.bookingId === id)], 'Activity'); } catch (e) { console.error(e); }
    return r;
  };
  const _flRoSheet2TL = flRoSheet2;
  flRoSheet2 = function (root) {
    const r = _flRoSheet2TL.apply(this, arguments);
    try { const cur = typeof SH_CUR !== 'undefined' && SH_CUR && SH_CUR.key; if (cur && /^r:/.test(cur) && root.querySelector('[data-editc]')) { const c = contact(cur.slice(2)); if (c) tlDraw(root, cur, tlForContact(c), 'Activity'); } } catch (e) { console.error(e); }
    return r;
  };  
/* -- Get set up: a short checklist at the top of Home for new users. Each step checks itself off when it's really done,
     one tap goes straight to the right place, and the card goes away for good once everything's done (people who
     already finished never see it). "Hide for now" tucks it away; the tour is one tap away for the full walkthrough. */
  const SU = { doc: null, loaded: false };
  const suApple = () => /iPhone|iPad|Macintosh|Mac OS X/.test(navigator.userAgent);
  const suGo = (grp, id) => () => { try { window.ssShowSettings(grp, id); } catch (_) { window.goTab('settings'); } };
  function suSteps() {
    const p = S.profile || {}, link = st.link || {};
    let photo = ''; try { photo = flAvatar() || flEpkAsset(); } catch (_) {}
    const steps = [
      ['profile', 'Add your name and photo', 'Used on your EPK, invoices and page', !!((p.djName || p.myName) && photo), suGo('profile')],
      ['google', 'Connect Google', 'Your calendar and email work together', (typeof G !== 'undefined') && (G.state === 'ok' || !!G.mcp), suGo('google')],
      ['avail', 'Set when you\'re available', 'Your booking link only offers these times', !!(S.avail && Object.keys(S.avail).length), suGo('bookings', 'ssx-host-link')],
      ['link', 'Turn on your booking link', 'Venues pick a time and send a request', !!(link.on && link.slug), suGo('bookings', 'ssx-host-link')],
      ['show', 'Add your first show', 'Past or upcoming, either counts', (S.bookings || []).length > 0, () => window.bookingForm()],
      ['epk', 'Make your EPK', 'Your press kit, ready to send', !!(PGE.epk && Object.keys(PGE.epk).length), () => window.goTab('epk')],
      ['page', 'Publish My page', 'Your shows and music at one link', !!((PGE.doc || {}).on), () => window.goTab('mypage')]
    ];
    if (suApple()) steps.push(['apple', 'Add Apple Calendar', 'Optional: your shows on this device', !!(CF.doc && CF.doc.on), suGo('google', 'ssx-calfeed'), true]);
    return steps;
  }
  async function suLoad() { if (SU.loaded || !st.db) return; SU.loaded = true; try { const s = await st.db.doc('settings/setup').get(); SU.doc = s.exists ? s.data() : {}; } catch (_) { SU.doc = null; SU.loaded = false; } suCard(); }
  const suSave = patch => { SU.doc = { ...(SU.doc || {}), ...patch }; try { st.db.doc('settings/setup').set(SU.doc).catch(() => {}); } catch (_) {} };
  function suCard() {
    const home = document.querySelector('section[data-view="home"]'); if (!home || !st.db) return;
    if (!SU.loaded) { suLoad(); return; } if (!SU.doc) return;
    if (!PGE.loaded) { pgLoad(); } if (!CF.loaded) cfLoad();
    let el = document.getElementById('ssx-setup');
    // decide only once everything it checks has loaded, so people who are done never see a flash of it
    const ready = PGE.loaded && PGE.epk && (!suApple() || CF.doc) && !(typeof G !== 'undefined' && G.state === 'loading');
    if (!ready && !el) return;
    const steps = suSteps(), need = steps.filter(s => !s[5]), done = need.filter(s => s[3]).length, all = done === need.length;
    if (all && !SU.doc.doneAt) suSave({ doneAt: new Date().toISOString() });
    // finished (now or before), or tucked away: no card
    if (SU.doc.doneAt || SU.doc.hidden) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'ssx-setup'; el.className = 'card ssx'; const head = home.querySelector(':scope > .head'); head ? head.after(el) : home.prepend(el); }
    const sig = JSON.stringify(steps.map(s => [s[0], s[3]])); if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    const next = steps.find(s => !s[3] && !s[5]);
    el.innerHTML = `<div class="ssx-head"><div><h3>Get set up</h3><p class="note">${done} of ${need.length} done${next ? `. Next: ${esc(next[1].charAt(0).toLowerCase() + next[1].slice(1))}.` : ''}</p></div>
        <button type="button" class="linkbtn" data-su-hide>Hide for now</button></div>
      <div class="ssx-su-bar" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${need.length}" aria-valuenow="${done}"><span style="width:${Math.round(done / need.length * 100)}%"></span></div>
      <ol class="ssx-su">${steps.map(s => `<li class="${s[3] ? 'done' : ''}${next && next[0] === s[0] ? ' next' : ''}"><button type="button" data-su="${s[0]}"${s[3] ? ' aria-label="' + esc(s[1]) + ', done. Open"' : ''}>
        <span class="ck" aria-hidden="true">${s[3] ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>' : ''}</span>
        <span class="tx"><b>${esc(s[1])}</b><small>${esc(s[2])}</small></span><span class="go" aria-hidden="true">›</span></button></li>`).join('')}</ol>
      <p class="note ssx-su-foot">Want the full walkthrough? <button type="button" class="linkbtn" data-su-tour>Take the tour</button></p>`;
    el.querySelectorAll('[data-su]').forEach(b => b.onclick = () => { const s = suSteps().find(x => x[0] === b.dataset.su); if (s) s[4](); });
    el.querySelector('[data-su-hide]').onclick = () => { suSave({ hidden: true }); el.remove(); toast('Setup hidden. Find it again in Settings → Account.'); };
    el.querySelector('[data-su-tour]').onclick = () => { try { window.ssStartTour(); } catch (_) {} };
  }
  // Settings → Account: bring the checklist back
  function suRestore() {
    const acct = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="account"]'); if (!acct || !SU.doc) return;
    let r = document.getElementById('ssx-setup-back');
    const show = !!(SU.doc.hidden && !SU.doc.doneAt);
    if (!show) { if (r) r.remove(); return; }
    if (!r) { r = document.createElement('div'); r.id = 'ssx-setup-back'; r.className = 'card ssx'; r.innerHTML = '<div class="ssx-head"><div><h3>Get set up</h3><p class="note">Your setup checklist is hidden.</p></div><button type="button" class="btn small" data-su-show>Show it on Home</button></div>'; acct.prepend(r);
      r.querySelector('[data-su-show]').onclick = () => { suSave({ hidden: false }); r.remove(); window.goTab('home'); setTimeout(suCard, 50); }; }
  }
  const _pgCardSU = pgCard;
  pgCard = function () { const r = _pgCardSU.apply(this, arguments); try { suCard(); suRestore(); } catch (e) { console.error(e); } return r; };  
/* -- Connections on Home: is everything hooked up and working? Google (with when it last synced), booking link (and
     requests waiting), My page, reminders (with the next one coming), Apple Calendar. Anything broken shows first, in red,
     with one tap to fix it. When everything's fine it folds into one line. What's due lives in Next moves, right above. */
  const SC = { open: (() => { try { return localStorage.getItem('ss-sc-open') === '1'; } catch (_) { return false; } })() };
  const scAgo = ms => { if (!ms) return ''; const m = Math.round((Date.now() - ms) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`; };
  const scNice = ds => { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return ds; } };
  function scRows() {
    const rows = [], link = st.link || {}, prefs = st.prefs || {};
    // Google: [state, text, fix]
    const gs = typeof G !== 'undefined' ? G : { state: 'none' };
    if (gs.state === 'ok') rows.push(['ok', 'Google', `Calendar and email connected${gs.at ? ' · synced ' + scAgo(gs.at) : ''}`, null]);
    else if (gs.state === 'loading') rows.push(['wait', 'Google', 'Checking your calendars…', null]);
    else if (gs.state === 'partial') rows.push(['warn', 'Google', `Synced ${gs.okCount || 0} of ${gs.total || 0} calendars`, ['Choose calendars', () => window.ssShowSettings('google')]]);
    else if (gs.state === 'error') rows.push(['bad', 'Google', 'Not syncing. It may need you to sign in again.', ['Reconnect', () => window.ssShowSettings('google')]]);
    else rows.push(['bad', 'Google', 'Not connected. Your calendar and email work better together.', ['Connect', () => window.ssShowSettings('google')]]);
    // booking link and requests waiting
    const waiting = (S.bookings || []).filter(b => b.source === 'booking-link' && !b.requestStatus && flKind(b.status) === 'lead').length;
    if (link.on && link.slug) rows.push([waiting ? 'warn' : 'ok', 'Booking link', `Live${waiting ? ` · ${waiting} request${waiting === 1 ? '' : 's'} waiting for you` : ' · no new requests'}`, waiting ? ['See requests', () => window.goTab('bookings')] : ['Copy link', () => { const u = `${location.origin}/?book=${encodeURIComponent(link.slug)}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Booking link copied'), () => toast(u)); }]]);
    else rows.push(['bad', 'Booking link', 'Off. Venues can\'t send you requests.', ['Turn on', () => window.ssShowSettings('bookings', 'ssx-host-link')]]);
    // My page
    const pd = PGE.doc || {}, slug = pgSlug();
    if (pd.on && slug) rows.push(['ok', 'My page', `Public at ${location.host.replace(/^www\./, '')}/${slug}`, ['Open', () => window.open(pgUrl(), '_blank', 'noopener')]]);
    else rows.push(['off', 'My page', 'Not public yet', ['Set it up', () => window.goTab('mypage')]]);
    // reminders, with the next one so you can see they're working
    let nextR = null; try { const t0 = todayStr(); nextR = (buildQueue() || []).find(x => x.at >= t0); } catch (_) {}
    const how = [prefs.push !== false ? 'phone alerts' : '', prefs.email ? 'email digest' : ''].filter(Boolean).join(' and ');
    if (prefs.on) rows.push(['ok', 'Reminders', `On${how ? ' · ' + how : ''}${nextR ? ` · next: ${nextR.kind === 'paid' ? 'check you got paid for ' + nextR.show : [nextR.label, nextR.show].filter(Boolean).join(' for ')} (${scNice(nextR.at)})` : ''}`, null]);
    else rows.push(['bad', 'Reminders', 'Off. You won\'t get alerts for due tasks or unpaid shows.', ['Turn on', () => window.ssShowSettings('reminders')]]);
    // Apple Calendar: shown on Apple devices, or anywhere once it's on
    const apple = /iPhone|iPad|Macintosh|Mac OS X/.test(navigator.userAgent), cf = CF.doc || {};
    if (cf.on) rows.push(['ok', 'Apple Calendar', 'On · updates about every hour', null]);
    else if (apple) rows.push(['off', 'Apple Calendar', 'Off (optional)', ['Add', () => window.ssShowSettings('google', 'ssx-calfeed')]]);
    return rows;
  }
  function scCard() {
    const home = document.querySelector('section[data-view="home"]'); if (!home || !st.db) return;
    if (!PGE.loaded) pgLoad(); if (!CF.loaded) cfLoad();
    const rows = scRows(), bad = rows.filter(r => r[0] === 'bad' || r[0] === 'warn'), healthy = !bad.length && !rows.some(r => r[0] === 'wait');
    let el = document.getElementById('ssx-sync');
    if (!el) { el = document.createElement('div'); el.id = 'ssx-sync'; el.className = 'card ssx'; const nm = home.querySelector('#ssx-upnext'), anchor = nm && (nm.closest('.card') || nm); anchor && anchor.parentElement === home ? anchor.after(el) : home.appendChild(el); }
    const open = SC.open || !healthy, sig = JSON.stringify([rows.map(r => [r[0], r[2]]), open]); if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    const order = { bad: 0, warn: 1, wait: 2, ok: 3, off: 4 }, list = rows.slice().sort((a, b) => order[a[0]] - order[b[0]]);
    const okNames = rows.filter(r => r[0] === 'ok').map(r => r[1]);
    el.innerHTML = `<div class="ssx-head"><div><h3>Connections</h3><p class="note">${healthy ? `<span class="ssx-sc-l ok" aria-hidden="true"></span>All set${okNames.length ? ': ' + esc(okNames.join(', ')) : ''}` : `${bad.length} thing${bad.length === 1 ? '' : 's'} need${bad.length === 1 ? 's' : ''} you`}</p></div>
        ${healthy ? `<button type="button" class="linkbtn" data-sc-tog aria-expanded="${open}">${open ? 'Hide details' : 'Details'}</button>` : ''}</div>
      ${open ? `<ul class="ssx-sc">${list.map((r, i) => `<li class="${r[0]}"><span class="ssx-sc-l ${r[0]}" aria-hidden="true"></span><span class="tx"><b>${esc(r[1])}</b><small>${esc(r[2])}</small></span>${r[3] ? `<button type="button" class="btn small${r[0] === 'bad' ? ' primary' : ''}" data-sc="${i}">${esc(r[3][0])}</button>` : ''}<span class="sr-only">${{ ok: 'Working', bad: 'Needs attention', warn: 'Needs a look', wait: 'Checking', off: 'Off' }[r[0]]}</span></li>`).join('')}</ul>` : ''}`;
    el.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { const r = list[+b.dataset.sc]; if (r && r[3]) r[3][1](); });
    const tg = el.querySelector('[data-sc-tog]'); if (tg) tg.onclick = () => { SC.open = !SC.open; try { localStorage.setItem('ss-sc-open', SC.open ? '1' : '0'); } catch (_) {} el.dataset.sig = ''; scCard(); const t2 = el.querySelector('[data-sc-tog]'); if (t2) t2.focus(); };
  }
  const _pgCardSC = pgCard;
  pgCard = function () { const r = _pgCardSC.apply(this, arguments); try { scCard(); } catch (e) { console.error(e); } return r; }; 
/* -- Settings search: type what you're after ("venmo", "time zone", "dark", "iphone") and jump straight to it.
     It reads the headings and labels actually on the Settings page, so anything added later is searchable too. */
  const SS_SYN = {
    venmo: 'payment', zelle: 'payment', paypal: 'payment', cashapp: 'payment', 'cash app': 'payment', bank: 'payment', paid: 'payment', w9: 'invoice', 'w-9': 'invoice', tax: 'invoice', terms: 'invoice', prefix: 'invoice',
    busy: 'availab', hours: 'availab', days: 'availab', schedule: 'availab', notice: 'availab', block: 'availab', closed: 'availab',
    notification: 'remind', notifications: 'remind', alert: 'remind', alerts: 'remind', digest: 'remind', push: 'remind',
    iphone: 'apple calendar', ical: 'apple calendar', mac: 'apple calendar', outlook: 'apple calendar', subscribe: 'apple calendar',
    dark: 'light or dark', light: 'light or dark', theme: 'light or dark', mode: 'light or dark', colors: 'look', colour: 'look', color: 'look', palette: 'look', motion: 'motion', animation: 'motion',
    gmail: 'google', drive: 'google', calendar: 'calendar', calendars: 'calendar', sync: 'google',
    headshot: 'photo', avatar: 'photo', picture: 'photo', logo: 'photo', name: 'profile', bio: 'profile', genre: 'profile',
    slug: 'booking link', url: 'booking link', link: 'link', requests: 'booking link', form: 'booking',
    password: 'account', logout: 'account', 'log out': 'account', 'sign out': 'account', delete: 'account', privacy: 'privacy', tour: 'tour', help: 'tour',
    timezone: 'time zone', tz: 'time zone', email: 'email', signature: 'signature', template: 'template'
  };
  const ssNorm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function ssIndex() {
    const sec = document.querySelector('section[data-view="settings"]'); if (!sec) return [];
    const out = [], seen = new Set(), navName = k => { const b = sec.querySelector(`[data-ssg-go="${k}"]`); return b ? b.textContent.trim() : k; };
    sec.querySelectorAll(':scope > .ssg').forEach(g => {
      const gk = g.dataset.ssg, gName = navName(gk);
      g.querySelectorAll(':scope > .card, :scope > .ssx-host, :scope > .ssx-host > .card, :scope > .ssx-host > div').forEach(card => {
        const h = card.querySelector('h3, h4, .head h3'), title = h ? h.textContent.replace(/\s+/g, ' ').trim().replace(/\s*(On|Off)$/, '') : '';
        if (title && !seen.has(card)) { seen.add(card); out.push({ g: gk, gName, card: title, text: title, el: card, w: 3 }); }
        card.querySelectorAll('label, legend, .ssx-epk-k, dt, h4').forEach(l => {
          const t = l.textContent.replace(/\s+/g, ' ').trim(); if (!t || t.length > 90 || t === title) return;
          out.push({ g: gk, gName, card: title, text: t, el: l, w: 2 });
        });
        card.querySelectorAll('button, a.btn').forEach(bt => { const t = bt.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 4 || t.length > 40 || /^(save|edit|close|cancel|done|ok|on|off)$/i.test(t)) return; out.push({ g: gk, gName, card: title, text: t, el: bt, w: 1.5 }); });
        const body = (card.querySelector('.note') || {}).textContent || '';
        if (title && body) out.push({ g: gk, gName, card: title, text: title, extra: body.slice(0, 240), el: card, w: 1 });
      });
    });
    return out;
  }
  function ssFind(q) {
    q = ssNorm(q); if (q.length < 2) return [];
    const terms = new Set([q]); Object.entries(SS_SYN).forEach(([k, v]) => { if (k.startsWith(q) || q.includes(k)) terms.add(v); });
    const best = new Map();
    for (const it of ssIndex()) {
      const hay = ssNorm(it.text), more = ssNorm(it.extra || ''), cardT = ssNorm(it.card), grp = ssNorm(it.gName);
      let s = 0;
      for (const t of terms) {
        const syn = t !== q ? 0.6 : 1;
        if (hay.startsWith(t)) s = Math.max(s, (it.w + 2) * syn); else if (hay.includes(t)) s = Math.max(s, (it.w + 1) * syn);
        else if (cardT.includes(t)) s = Math.max(s, it.w * syn); else if (more.includes(t)) s = Math.max(s, 0.8 * syn); else if (grp.includes(t)) s = Math.max(s, 0.5 * syn);
      }
      if (!s) continue;
      const key = it.g + '|' + it.card + '|' + it.text; if (!best.has(key) || best.get(key).s < s) best.set(key, { ...it, s });
    }
    // one result per card unless a specific setting inside it matches
    const list = [...best.values()].sort((a, b) => b.s - a.s), outL = [], perCard = new Map();
    for (const r of list) { const k = r.g + '|' + r.card, n = perCard.get(k) || 0; if (n >= 2) continue; perCard.set(k, n + 1); outL.push(r); if (outL.length >= 8) break; }
    return outL;
  }
  function ssJump(r) {
    try { window.ssShowSettings(r.g); } catch (_) {}
    setTimeout(() => {
      let el = r.el; if (!el || !document.contains(el)) return;
      const det = el.closest('details'); if (det && !det.open) det.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const card = el.closest('.card') || el; card.classList.add('ssx-ss-hit'); setTimeout(() => card.classList.remove('ssx-ss-hit'), 2200);
      let ctl = el.tagName === 'LABEL' ? (el.control || el.querySelector('input, select, textarea, button')) : null;
      if (!ctl) ctl = card.querySelector('input:not([type=hidden]), select, textarea, button');
      if (ctl) setTimeout(() => { try { ctl.focus({ preventScroll: true }); } catch (_) {} }, 350);
    }, 120);
  }
  function ssBox() {
    const sec = document.querySelector('section[data-view="settings"]'); if (!sec || sec.querySelector(':scope > .ssx-ss')) return;
    const nav = sec.querySelector(':scope > .ssg-nav'); if (!nav) return;
    const box = document.createElement('div'); box.className = 'ssx-ss';
    box.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="ssx-ss-in" placeholder="Search settings" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ssx-ss-list" aria-label="Search settings">
      <ul id="ssx-ss-list" role="listbox" hidden></ul>`;
    nav.before(box);
    const inp = box.querySelector('input'), ul = box.querySelector('ul'); let res = [], cur = -1;
    const draw = () => {
      res = ssFind(inp.value); cur = res.length ? 0 : -1;
      const q = ssNorm(inp.value), show = q.length >= 2; ul.hidden = !show; inp.setAttribute('aria-expanded', String(show));
      ul.innerHTML = res.length ? res.map((r, i) => `<li role="option" id="ssx-ss-o${i}" aria-selected="${i === cur}" data-i="${i}"><b>${esc(r.text === r.card ? r.card : r.text)}</b><small>${esc(r.gName)}${r.text !== r.card && r.card ? ' → ' + esc(r.card) : ''}</small></li>`).join('')
        : (show ? `<li class="none" role="presentation">No settings match "${esc(inp.value.trim())}". Try a different word.</li>` : '');
      inp.setAttribute('aria-activedescendant', cur >= 0 ? 'ssx-ss-o' + cur : '');
      ul.querySelectorAll('[data-i]').forEach(li => { li.onmousedown = e => e.preventDefault(); li.onclick = () => go(+li.dataset.i); });
    };
    const mark = () => { ul.querySelectorAll('[data-i]').forEach(li => li.setAttribute('aria-selected', String(+li.dataset.i === cur))); inp.setAttribute('aria-activedescendant', cur >= 0 ? 'ssx-ss-o' + cur : ''); const a = ul.querySelector(`[data-i="${cur}"]`); if (a) a.scrollIntoView({ block: 'nearest' }); };
    const close = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
    const go = i => { const r = res[i]; if (!r) return; close(); ssJump(r); };
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && res.length) { e.preventDefault(); cur = (cur + 1) % res.length; mark(); }
      else if (e.key === 'ArrowUp' && res.length) { e.preventDefault(); cur = (cur - 1 + res.length) % res.length; mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(cur); }
      else if (e.key === 'Escape') { if (!ul.hidden) { e.stopPropagation(); close(); } else { inp.value = ''; } }
    });
    inp.addEventListener('focus', () => { if (ssNorm(inp.value).length >= 2) draw(); });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  }
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement; if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    const sec = document.querySelector('section[data-view="settings"]'), inp = document.getElementById('ssx-ss-in');
    if (!sec || sec.hidden || !inp || document.querySelector('#sheetRoot .sheet')) return;
    e.preventDefault(); inp.focus(); inp.select();
  });
  const _pgCardSS = pgCard;
  pgCard = function () { const r = _pgCardSS.apply(this, arguments); try { ssBox(); } catch (e) { console.error(e); } return r; };  
/* -- "Got your request" reply. When someone books you through your link, a friendly reply is written for them right
     away from your own template. It never sends by itself (the app only sends what you check and send): it waits on the
     request and in Next moves, and one tap opens it in "Check it, then send". Settings → Bookings → Reply to new requests. */
  const AK = { doc: null, loaded: false };
  const AK_DEF = {
    on: true, days: 2,
    subject: 'Got your booking request for {date}',
    body: 'Hi {first},\n\nThanks for reaching out about {show} on {date}{time}. I\'ve got your request and I\'ll get back to you within {days}.\n\nTalk soon,\n{name}'
  };
  const akCfg = () => ({ ...AK_DEF, ...(AK.doc || {}) });
  async function akLoad() { if (AK.loaded || !st.db) return; AK.loaded = true; try { const s = await st.db.doc('settings/ackreply').get(); AK.doc = s.exists ? s.data() : {}; } catch (_) { AK.doc = null; AK.loaded = false; } }
  const akSave = async patch => { AK.doc = { ...akCfg(), ...patch }; try { await st.db.doc('settings/ackreply').set(AK.doc); return true; } catch (_) { toast("Couldn't save. " + OFFLINE); return false; } };
  const akWho = b => b.contactPersonId || b.promoterId || b.venueId || '';
  // requests that still deserve a "got it": from your link, not answered, nothing emailed about them yet, and recent
  function akPending() {
    if (!akCfg().on) return [];
    const t = todayStr(), sent = new Set((S.sentLog || []).map(x => x.bookingId).filter(Boolean));
    return (S.bookings || []).filter(b => b.source === 'booking-link' && !b.requestStatus && flKind(b.status) === 'lead' && akWho(b) && !sent.has(b.id) && !b.ackSkip
      && b.createdAt && String(b.createdAt).slice(0, 10) >= addDays(t, -14));
  }
  function akFill(tpl, b, cfg, asFirst) {
    const who = contact(akWho(b)), first = asFirst || (who ? String(cName(who) || '').split(' ')[0] : ''), p = S.profile || {};
    const d = Number((cfg || akCfg()).days) || 2, tm = b.setStart ? ' at ' + time12(b.setStart) : '';
    const map = { first: first || 'there', show: bName(b) || 'your event', date: b.date ? niceDate(b.date) : 'the date you picked', time: tm, days: `${d} day${d === 1 ? '' : 's'}`, name: p.djName || p.myName || '' };
    return String(tpl || '').replace(/\{(first|show|date|time|days|name)\}/g, (_, k) => map[k]).replace(/\n{3,}/g, '\n\n').trim();
  }
  function akOpen(b) {
    const c = akCfg();
    composeSheet({ booking: b.id, to: akWho(b), title: 'Request received', subject: akFill(c.subject, b), body: akFill(c.body, b) });
  }
  // on each waiting request: "Send 'Got your request'"
  const _renderRequestsAK = renderRequests;
  renderRequests = function () {
    _renderRequestsAK.apply(this, arguments);
    try {
      akLoad(); const pend = new Set(akPending().map(b => b.id));
      document.querySelectorAll('#ssx-requests [data-req]').forEach(item => {
        const id = item.dataset.req, row = item.querySelector('.ssx-row'); let btn = item.querySelector('[data-ak]');
        if (!pend.has(id)) { if (btn) btn.remove(); return; }
        if (!btn && row) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn small'; btn.dataset.ak = id; btn.textContent = 'Send "Got your request"'; btn.onclick = () => { const b = (S.bookings || []).find(x => x.id === id); if (b) akOpen(b); }; row.appendChild(btn); }
      });
    } catch (e) { console.error(e); }
  };
  // in Next moves: one row per waiting request
  const _nmItemsAK = nmItems;
  nmItems = function () {
    const out = _nmItemsAK.apply(this, arguments);
    try {
      akLoad(); const c = apCfg(), t = todayStr();
      for (const b of akPending()) {
        const k = 'ack:' + b.id; if ((c.dismissed || {})[k] || ((c.snooze || {})[k] && c.snooze[k] > t)) continue;
        const who = contact(akWho(b));
        out.push({ type: 'ack', k, at: String(b.createdAt).slice(0, 10), icon: '💬', text: `Let <b>${esc(who ? cName(who) : 'them')}</b> know you got their request`, sub: `${esc(bName(b))}${b.date ? ' · ' + esc(niceDate(b.date)) : ''} · reply is written, you check and send`, btn: 'Review reply', go: () => akOpen(b) });
      }
      out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    } catch (e) { console.error(e); }
    return out;
  };
  // Settings → Bookings: turn it on or off, how soon you promise to answer, and the wording
  function akCard() {
    const grp = document.querySelector('section[data-view="settings"] > .ssg[data-ssg="bookings"]'); if (!grp || !st.db) return;
    if (!AK.loaded) { akLoad().then(akCard); return; } if (!AK.doc) return;
    let el = document.getElementById('ssx-ack');
    if (!el) { el = document.createElement('div'); el.id = 'ssx-ack'; el.className = 'card ssx'; const link = document.getElementById('ssx-host-link'); link && link.parentElement === grp ? link.after(el) : grp.appendChild(el); }
    const c = akCfg(), sig = JSON.stringify(c); if (el.dataset.sig === sig || el.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON' && document.activeElement.type !== 'checkbox') return; el.dataset.sig = sig;
    const sample = { date: addDays(todayStr(), 21), setStart: '22:00', title: 'Friday night', source: 'booking-link' };
    el.innerHTML = `<div class="ssx-head"><div><h3>Reply to new requests</h3><p class="note">When someone books you through your link, a "got your request" reply is written for them right away. It never sends by itself: it waits on the request and in Next moves, and you check it and send in one tap.</p></div></div>
      <label class="ssx-check"><input type="checkbox" data-ak-on${c.on ? ' checked' : ''}> Write a reply for every new request</label>
      ${c.on ? `<div class="f"><label for="ssx-ak-days">I promise to answer within</label><select id="ssx-ak-days">${[1, 2, 3, 5, 7].map(n => `<option value="${n}"${Number(c.days) === n ? ' selected' : ''}>${n} day${n === 1 ? '' : 's'}</option>`).join('')}</select></div>
      <div class="f"><label for="ssx-ak-subj">Subject</label><input id="ssx-ak-subj" maxlength="120" value="${esc(c.subject)}"></div>
      <div class="f"><label for="ssx-ak-body">Message</label><textarea id="ssx-ak-body" rows="7" maxlength="2000">${esc(c.body)}</textarea>
        <span class="note">These fill in for you: {first} their first name, {show} the event, {date}, {time}, {days} how soon you'll answer, {name} your name.</span></div>
      <details class="ssx-ak-prev"><summary>Preview</summary><pre></pre></details>
      <div class="ssx-row"><button type="button" class="btn small primary" data-ak-save>Save wording</button><button type="button" class="btn small" data-ak-reset>Use the default wording</button></div>` : ''}`;
    const q = s => el.querySelector(s);
    // the preview always shows what's in the boxes right now, for a made-up request from "Sam"
    const pv = q('.ssx-ak-prev'); if (pv) { const draw = () => { const live = { ...akCfg(), days: Number((q('#ssx-ak-days') || {}).value) || akCfg().days }; pv.querySelector('pre').textContent = `${akFill(q('#ssx-ak-subj').value || AK_DEF.subject, sample, live, 'Sam')}\n\n${akFill(q('#ssx-ak-body').value || AK_DEF.body, sample, live, 'Sam')}`; };
      pv.ontoggle = () => { if (pv.open) draw(); }; ['#ssx-ak-subj', '#ssx-ak-body', '#ssx-ak-days'].forEach(s2 => { const x = q(s2); if (x) x.addEventListener(s2 === '#ssx-ak-days' ? 'change' : 'input', () => { if (pv.open) draw(); }); }); }
    q('[data-ak-on]').onchange = async e => { if (await akSave({ on: e.target.checked })) { toast(e.target.checked ? 'Replies will be ready for new requests' : 'Replies to new requests turned off'); el.dataset.sig = ''; akCard(); const cb = q('[data-ak-on]'); if (cb) cb.focus(); } };
    const ds = q('#ssx-ak-days'); if (ds) ds.onchange = () => akSave({ days: Number(ds.value) }).then(ok => ok && toast('Saved'));
    const sv = q('[data-ak-save]'); if (sv) sv.onclick = async () => { const subject = q('#ssx-ak-subj').value.trim() || AK_DEF.subject, body = q('#ssx-ak-body').value.trim() || AK_DEF.body; if (await akSave({ subject, body })) { toast('Reply wording saved'); el.dataset.sig = ''; akCard(); } };
    const rs = q('[data-ak-reset]'); if (rs) rs.onclick = async () => { if (await akSave({ subject: AK_DEF.subject, body: AK_DEF.body })) { toast('Back to the default wording'); el.dataset.sig = ''; akCard(); } };
  }
  const _pgCardAK = pgCard;
  pgCard = function () { const r = _pgCardAK.apply(this, arguments); try { akCard(); } catch (e) { console.error(e); } return r; };
/* -- The tour, rewritten for everything built this month. About 3 minutes, 14 stops. Each stop shows one thing and,
     where it helps, offers a button to do it right then, so learning and setting up happen together. */
  const FL_TOUR2 = [
    { title: 'Welcome to Set & Settled', body: 'Your home base as an artist: shows, people, money, email, media, your EPK and your own page. About 3 minutes. Most stops have a button to set that part up right now, or tap Next to keep looking.' },
    { tab: 'settings', group: 'profile', target: '#ssx-fl-art, #ssx-profile', title: 'Start with you', body: 'Pick what kind of artist you are, then add your name, photo and socials. They fill in your EPK, emails, invoices, booking link and page, so you only type them once.' },
    { tab: 'settings', group: 'google', target: '#ss-google', title: 'Connect your calendar and email', body: 'Google lets you send emails and invoices from your own address and see your other plans next to your shows. On an iPhone or Mac, the Apple Calendar card below puts your shows in the Calendar app too.' },
    { tab: 'calendar', target: '#availEdit', title: 'When are you available?', body: 'Pick your days and times and block any date off. One simple rule: you\'re open unless something is already on your calendar or you blocked it. Your booking link follows this automatically.', action: ['Set my availability', () => { const b = document.getElementById('availEdit'); if (b) b.click(); }] },
    { tab: 'bookings', target: '#ssx-bklink, #ssx-requests', title: 'Let people book you', body: 'Share your booking link and people pick an open date and time. Each request shows how it fits your calendar, and a friendly "got your request" reply is already written for you to check and send.', action: ['Copy my booking link', () => { try { const u = window.ssBookingLink && window.ssBookingLink(); if (!u) { window.ssShowSettings('bookings', 'ssx-host-link'); return; } (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Booking link copied'), () => toast(u)); } catch (_) {} }] },
    { tab: 'home', target: '#quickAdd, #ssx-qa-fab', title: 'Add anything from anywhere', body: 'Tap + Add for a show, contact, task, invoice, expense, income, email, photos, link or blocked dates. It puts what fits the page you\'re on first. On a computer, press N.', action: ['Add a show', () => { try { window.bookingForm(); } catch (_) {} }] },
    { tab: 'home', target: '#ssx-upnext, #ssx-setup', title: 'Home keeps watch', body: 'Next moves lists what needs you, soonest first: tasks, follow-ups, invoices and wrap-ups after a show. Below it, Connections shows at a glance that Google, your booking link, your page and reminders are working.' },
    { tab: 'bookings', target: '[data-new="booking"]', title: 'Every show tells its story', body: 'Move a show from Lead to Confirmed, Played and Paid, and each stage brings its checklist. Add a ticket link, choose whether it shows on your page, and scroll down for its Activity: every email, invoice and change in order.' },
    { tab: 'contacts', target: '[data-new="contact"]', title: 'Your people', body: 'Venues, promoters and collectives, each with one profile. Email, DM, text or call from it, log reach-outs with a follow-up date, and see your whole history together under Activity.' },
    { tab: 'money', target: '[data-new="expense"]', title: 'Your money, organized', body: 'Fees, income and expenses in one place, with invoices, receipts and mileage. At tax time it shows what to set aside and builds your tax packet. It keeps your records organized; it isn\'t tax advice.' },
    { tab: 'mypage', target: '#ssx-pgdesign, #ssx-page', title: 'Your EPK and your own page', body: 'Your EPK is the press kit you send venues. My page is for fans: setnsettled.com/you with your shows, photos, music players and news, searchable on Google. Design it with a live preview and publish when it feels like you.', action: ['Open the designer', () => { try { window.goTab('mypage'); setTimeout(() => { if (window.ssOpenPageDesigner) window.ssOpenPageDesigner(); }, 250); } catch (_) {} }] },
    { tab: 'media', target: '#ssx-fl-mhost, #ssx-fl-hub, section[data-view="media"] .head', title: 'Media and your history', body: 'Photos, videos and links, sorted by show. Switch any of them on to show them on your page. Under Kit you can also add the shows you played before Set & Settled, so your EPK starts full.', action: ['Add photos', () => { try { flAddPhotos('', ids => toast(ids && ids.length > 1 ? `${ids.length} photos added` : 'Photo added')); } catch (_) {} }] },
    { tab: 'settings', group: 'reminders', target: '#ssx-notify', title: 'Never miss a step', body: 'Turn on phone alerts, a morning email, or both. They come from your checklists, follow-ups and unpaid shows, so nothing slips.' },
    { title: "You're all set", body: 'Three shortcuts: + Add (or N) adds anything, Settings has a search box (press /), and the Get set up card on Home shows what\'s left. Retake this tour anytime from Settings, under Account. Have a great season!' }
  ];
  try { FL_TOUR.splice(0, FL_TOUR.length, ...FL_TOUR2); if (FL.tour && typeof TOUR !== 'undefined') TOUR.splice(0, TOUR.length, ...FL_TOUR2); } catch (e) { console.error(e); }  
/* -- Phase 1 fixes.
     1. Bookings always opens on Active (a Home stat tile still opens its own filter, and Back keeps where you were).
        If no filter is selected it resets, and "No bookings" only shows when there are none: otherwise it says what's
        hidden, or "Loading your shows…" while they arrive.
     2. Links in templates are clickable everywhere: websites and other links fill in as full https:// addresses, and
        Instagram fills in as its link ("Instagram: https://instagram.com/you", or "@you (https://instagram.com/you)"
        on its own). The Instagram quick insert adds its label. Emails are plain text, so a full address is what every
        mail app turns into a link. */
  const BK = { keep: false, t0: Date.now(), init: null, busy: false };
  const bkLoaded = () => { try { if (BK.init === null) BK.init = S.bookings; return S.bookings !== BK.init || (S.bookings || []).length > 0 || Date.now() - BK.t0 > 6000; } catch (_) { return true; } };
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-filter-go]')) BK.keep = true; }, true);
  function bkAfter() {
    if (BK.busy) return; const bar = document.getElementById('bookingFilter'), list = document.getElementById('bookingList'); if (!bar || !list) return;
    // nothing selected: go back to Active
    if (bar.querySelector('.chip') && !bar.querySelector('.chip[aria-pressed="true"]')) { try { bFilter = 'active'; BK.busy = true; window.renderBookings(); } catch (_) {} finally { BK.busy = false; } return; }
    const empty = list.querySelector(':scope > .empty'); if (!empty) return;
    const all = S.bookings || [];
    if (!all.length) { if (!bkLoaded()) { empty.textContent = 'Loading your shows…'; setTimeout(() => { try { window.renderBookings(); } catch (_) {} }, 1200); } return; }
    const on = bar.querySelector('.chip[aria-pressed="true"]'), lab = on ? on.textContent.trim().toLowerCase() : 'here', shown = on ? on.textContent.trim() : '';
    const act = all.filter(b => !['paid', 'lost'].includes(flKind(b.status))).length;
    empty.innerHTML = `No shows under ${esc(shown || 'this filter')} right now. You have ${all.length} show${all.length === 1 ? '' : 's'} in total.
      <div class="ssx-row" style="margin-top:10px">${lab !== 'active' && act ? `<button type="button" class="btn small" data-bf="active">Show active (${act})</button>` : ''}<button type="button" class="btn small" data-bf="all">Show all (${all.length})</button></div>`;
  }
  function bkWire() {
    if (typeof window.setTab === 'function' && !window.setTab.__bk) {
      const o = window.setTab, w = function (t) {
        if (t === 'bookings') { if (!BK.keep) { try { bFilter = 'active'; } catch (_) {} } }
        BK.keep = false; const r = o.apply(this, arguments);
        if (t === 'bookings') setTimeout(() => { try { window.renderBookings(); } catch (_) {} }, 0);
        return r;
      }; w.__bk = true; window.setTab = w;
    }
    if (typeof window.goBack === 'function' && !window.goBack.__bk) { const o = window.goBack, w = function () { BK.keep = true; return o.apply(this, arguments); }; w.__bk = true; window.goBack = w; }
    if (typeof window.renderBookings === 'function' && !window.renderBookings.__bk) { const o = window.renderBookings, w = function () { const r = o.apply(this, arguments); try { bkAfter(); } catch (e) { console.error(e); } return r; }; w.__bk = true; window.renderBookings = w; }
  }
  // links in templates
  const tlUrl = v => { const s = String(v || '').trim(); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(s)) return 'https://' + s; return s; };
  const tlIg = v => { const t = String(v || '').trim(); if (!t) return ''; const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i); return (m ? m[1] : t).replace(/^@/, '').replace(/[\/?#].*$/, ''); };
  function tlWrapFill(orig) {
    const f = function (str, ctx, b, to) {
      try {
        const c = ctx || {}, p = c.profile || {}, h = tlIg(p.instagram), ig = h ? 'https://instagram.com/' + h : '';
        let s = String(str || '');
        if (ig) s = s.replace(/(instagram\s*[:\-–]\s*)\{\{\s*instagram\s*\}\}/gi, (_, lab) => lab + ig).replace(/\{\{\s*instagram\s*\}\}/gi, `@${h} (${ig})`);
        const ctx2 = { ...c, profile: { ...p, website: tlUrl(p.website), epk: tlUrl(p.epk) }, kit: { ...(c.kit || {}), promoFolderUrl: tlUrl((c.kit || {}).promoFolderUrl) },
          links: (c.links || []).map(l => ({ ...l, url: tlUrl(l.url) })), promoFiles: (c.promoFiles || []).map(x => ({ ...x, shareUrl: tlUrl(x.shareUrl) })) };
        const b2 = b ? { ...b, ticketUrl: tlUrl(b.ticketUrl), driveUrl: tlUrl(b.driveUrl) } : b;
        return orig.call(this, s, ctx2, b2, to);
      } catch (e) { console.error(e); return orig.apply(this, arguments); }
    };
    f.__links = true; return f;
  }
  function tlWire() {
    const s = window.SS; if (!s || !s.templates || typeof s.templates.fill !== 'function' || s.templates.fill.__links) return;
    try { window.SS = Object.freeze({ ...s, templates: Object.freeze({ ...s.templates, fill: tlWrapFill(s.templates.fill) }) }); } catch (e) { console.error(e); }
  }
  // the Instagram quick insert brings its label: right after the app drops in the Instagram bubble, "Instagram: " goes in front of it
  window.addEventListener('change', e => {
    const sel = e.target; if (!sel || !/^(t-fill|cm-fill)$/.test(sel.id) || sel.value !== 'instagram') return;
    const sh = sel.closest('.sheet'), api = sh && sh.__ssxBody; if (!api || !api.ed) return;
    const had = new Set(api.ed.querySelectorAll('[data-tok="instagram"]'));
    setTimeout(() => {
      const pill = [...api.ed.querySelectorAll('[data-tok="instagram"]')].find(x => !had.has(x)); if (!pill) return;
      let prev = '', n = pill.previousSibling; while (n && prev.length < 40) { prev = (n.textContent || '') + prev; n = n.previousSibling; }
      if (/instagram\s*[:\-–]?\s*$/i.test(prev.replace(/\u200b/g, ''))) return;
      pill.before(document.createTextNode('Instagram: ')); api.ed.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  }, true);
  const _pgCardP1 = pgCard;
  pgCard = function () { const r = _pgCardP1.apply(this, arguments); try { bkWire(); tlWire(); } catch (e) { console.error(e); } return r; };
/* -- Links on My page, easy to find and edit. Designer: a Links section (show or hide, page order, edit, delete, add).
     Page details: a button into it. Kit: an "On my page" switch on each link. Links typed without https:// now show
     (with the address fixed) instead of quietly missing. Show/hide and order publish with your design; adding, editing
     or deleting a link changes it everywhere (Kit, EPK, emails) right away. */
  ['linkOff', 'linkOrder'].forEach(k => { if (!PW_KEYS.includes(k)) PW_KEYS.push(k); });
  const PL = { edit: '', armed: '', t: 0 };
  const plUrl = v => { try { return tlUrl(v); } catch (_) { const s = String(v || '').trim(); return /^https?:\/\//i.test(s) ? s : (/\.[a-z]{2,}/i.test(s) ? 'https://' + s : s); } };
  const plHost = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
  const PL_NAMES = [['instagram.com', 'Instagram'], ['soundcloud.com', 'SoundCloud'], ['open.spotify.com', 'Spotify'], ['spotify.com', 'Spotify'], ['music.apple.com', 'Apple Music'], ['youtube.com', 'YouTube'], ['youtu.be', 'YouTube'], ['tiktok.com', 'TikTok'], ['mixcloud.com', 'Mixcloud'], ['bandcamp.com', 'Bandcamp'], ['beatport.com', 'Beatport'], ['facebook.com', 'Facebook'], ['x.com', 'X'], ['twitter.com', 'X'], ['ra.co', 'Resident Advisor'], ['linktr.ee', 'Linktree'], ['vimeo.com', 'Vimeo'], ['threads.net', 'Threads'], ['drive.google.com', 'Google Drive'], ['dropbox.com', 'Dropbox']];
  const plGuess = u => { const h = plHost(plUrl(u)); const n = PL_NAMES.find(([d]) => h === d || h.endsWith('.' + d)); return n ? n[1] : (h ? 'Website' : ''); };
  const plOrder = (list, order) => { const pos = new Map((order || []).map((k, i) => [k, i])); return list.slice().sort((a, b) => (pos.has(pgLinkKey(a)) ? pos.get(pgLinkKey(a)) : 999 + list.indexOf(a)) - (pos.has(pgLinkKey(b)) ? pos.get(pgLinkKey(b)) : 999 + list.indexOf(b))); };
  // every link with a usable address (fixing ones typed without https://), in the page's own order
  pgAllLinks = function () {
    let L = []; try { L = typeof sortedLinks === 'function' ? sortedLinks() : (S.links || []); } catch (_) {}
    L = L.filter(l => l && l.url).map(l => ({ ...l, url: plUrl(l.url) })).filter(l => /^https?:\/\//i.test(l.url));
    return plOrder(L, (PGE.doc || {}).linkOrder);
  };
  // the designer's preview follows the unpublished order and show/hide
  const _pwDataL = pwData;
  pwData = function () {
    const d = _pwDataL.apply(this, arguments);
    try { const D = PW.draft || {}, off = new Set(D.linkOff || []); d.links = plOrder(pgAllLinks(), D.linkOrder).filter(l => !off.has(pgLinkKey(l))).map(l => ({ label: String(l.label || l.url).slice(0, 60), url: l.url })).slice(0, 24); } catch (e) { console.error(e); }
    return d;
  };
  const plKitSave = async (id, data, msg) => { try { const ok = await window.save('links', id || null, data); if (ok) { toast(msg); return ok; } } catch (e) { console.error(e); } toast("Couldn't save that link. Check your connection and try again."); return null; };
  function plEditor(box) {
    const D = PW.draft || {}, off = new Set(D.linkOff || []), list = plOrder(pgAllLinks(), D.linkOrder), shown = list.filter(l => !off.has(pgLinkKey(l))).length;
    const det = document.createElement('details'); det.className = 'ssx-pd'; det.dataset.pd = 'links'; if (PW.open.has('links')) det.open = true;
    det.innerHTML = `<summary>Links <span class="note">${shown} of ${list.length} showing</span></summary>
      <p class="note">Tick the ones to show and use the arrows to order them. Edits to a link update it everywhere (Kit, EPK and emails) right away; showing, hiding and order go live when you Publish.</p>
      ${list.length ? `<ol class="ssx-pl">${list.map((l, i) => { const k = pgLinkKey(l), ed = PL.edit === k; return `<li data-k="${esc(k)}"${off.has(k) ? ' class="off"' : ''}>
        <div class="ssx-pl-row"><label class="ssx-check"><input type="checkbox" data-pl-on${off.has(k) ? '' : ' checked'} aria-label="Show ${esc(l.label || l.url)} on your page"></label>
          <span class="tx"><b>${esc(l.label || plGuess(l.url) || 'Link')}</b><small>${esc(plHost(l.url))}</small></span>
          <span class="mv"><button type="button" class="btn small" data-pl-up aria-label="Move ${esc(l.label)} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-pl-dn aria-label="Move ${esc(l.label)} down"${i < list.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="btn small" data-pl-ed aria-expanded="${ed}">Edit</button></span></div>
        ${ed ? `<div class="ssx-pl-form"><input type="text" data-pl-lbl maxlength="60" value="${esc(l.label || '')}" placeholder="Label, e.g. SoundCloud" aria-label="Label"><input type="url" inputmode="url" data-pl-url value="${esc(l.url)}" placeholder="https://" aria-label="Address">
          <div class="ssx-row"><button type="button" class="btn small primary" data-pl-save>Save</button><button type="button" class="btn small" data-pl-cancel>Cancel</button><button type="button" class="btn small ssx-pl-del" data-pl-del>${PL.armed === k ? 'Tap again to delete everywhere' : 'Delete link'}</button></div></div>` : ''}</li>`; }).join('')}</ol>` : '<p class="note">No links yet. Add your Instagram, music, videos or website below.</p>'}
      <div class="ssx-pl-add"><input type="url" inputmode="url" data-pl-new placeholder="Paste a link, e.g. soundcloud.com/you" aria-label="New link address"><input type="text" data-pl-newlbl maxlength="60" placeholder="Label (fills in for you)" aria-label="New link label"><button type="button" class="btn small primary" data-pl-add>+ Add link</button></div>`;
    const look = box.querySelector('details[data-pd="look"]'); look ? look.after(det) : box.prepend(det);
    det.ontoggle = () => { det.open ? PW.open.add('links') : PW.open.delete('links'); };
    const orderKeys = () => plOrder(pgAllLinks(), (PW.draft || {}).linkOrder).map(pgLinkKey);
    det.querySelectorAll('.ssx-pl > li').forEach(li => {
      const k = li.dataset.k, f = s => `.ssx-pl > li[data-k="${k.replace(/"/g, '\\"')}"] ${s}`, l = list.find(x => pgLinkKey(x) === k);
      li.querySelector('[data-pl-on]').onchange = e => { const s = new Set((PW.draft || {}).linkOff || []); e.target.checked ? s.delete(k) : s.add(k); pwSet({ linkOff: [...s] }, f('[data-pl-on]')); };
      const mv = dir => { const o = orderKeys(), i = o.indexOf(k), j = i + dir; if (i < 0 || j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; pwSet({ linkOrder: o }, f(dir < 0 ? '[data-pl-up]' : '[data-pl-dn]')); };
      li.querySelector('[data-pl-up]').onclick = () => mv(-1); li.querySelector('[data-pl-dn]').onclick = () => mv(1);
      li.querySelector('[data-pl-ed]').onclick = () => { PL.edit = PL.edit === k ? '' : k; PL.armed = ''; pwControls(PL.edit ? f('[data-pl-lbl]') : f('[data-pl-ed]')); };
      const sv = li.querySelector('[data-pl-save]'); if (sv) sv.onclick = async () => {
        const label = li.querySelector('[data-pl-lbl]').value.trim(), url = plUrl(li.querySelector('[data-pl-url]').value);
        if (!/^https?:\/\/\S+\.\S+/i.test(url)) { toast('That address doesn\'t look right. Try something like soundcloud.com/you'); return; }
        if (!l || !l.id) return; sv.disabled = true;
        const cur = (S.links || []).find(x => x.id === l.id) || {}; const { id: _i, ...rest } = cur;
        if (await plKitSave(l.id, { ...rest, label: label || plGuess(url), url }, 'Link saved everywhere')) { PL.edit = ''; setTimeout(() => { pwControls(f('[data-pl-ed]')); pwPreview(); }, 400); } else sv.disabled = false;
      };
      const cc = li.querySelector('[data-pl-cancel]'); if (cc) cc.onclick = () => { PL.edit = ''; PL.armed = ''; pwControls(f('[data-pl-ed]')); };
      const dl = li.querySelector('[data-pl-del]'); if (dl) dl.onclick = async () => {
        if (PL.armed !== k) { PL.armed = k; dl.textContent = 'Tap again to delete everywhere'; clearTimeout(PL.t); PL.t = setTimeout(() => { PL.armed = ''; if (dl.isConnected) dl.textContent = 'Delete link'; }, 4000); return; }
        PL.armed = ''; if (!l || !l.id) return;
        try { await window.remove('links', l.id); toast('Link deleted'); } catch (_) { toast("Couldn't delete that link. Try again."); return; }
        PL.edit = ''; setTimeout(() => { pwControls('[data-pl-new]'); pwPreview(); }, 400);
      };
    });
    const nu = det.querySelector('[data-pl-new]'), nl = det.querySelector('[data-pl-newlbl]');
    nu.addEventListener('input', () => { if (!nl.dataset.typed) nl.value = nu.value.trim() ? plGuess(nu.value) : ''; });
    nl.addEventListener('input', () => { nl.dataset.typed = nl.value ? '1' : ''; });
    const add = async () => {
      const url = plUrl(nu.value); if (!/^https?:\/\/\S+\.\S+/i.test(url)) { toast('Paste a link, like soundcloud.com/you'); nu.focus(); return; }
      if (pgAllLinks().some(x => x.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) { toast('That link is already in your list'); return; }
      const label = nl.value.trim() || plGuess(url), maxO = Math.max(0, ...(S.links || []).map(x => Number(x.order) || 0));
      const b = det.querySelector('[data-pl-add]'); b.disabled = true;
      const id = await plKitSave(null, { label, url, group: 'links', order: maxO + 1 }, `${label} added`);
      b.disabled = false; if (!id) return;
      PW.open.add('links'); setTimeout(() => { pwControls('[data-pl-new]'); pwPreview(); }, 500);
    };
    det.querySelector('[data-pl-add]').onclick = add; [nu, nl].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
  }
  const _pwControlsL = pwControls;
  pwControls = function (focus) {
    const r = _pwControlsL.apply(this, arguments);
    try { const box = PW.el && PW.el.querySelector('.ssx-pw-opts'); if (box && !box.querySelector('details[data-pd="links"]')) { plEditor(box); if (focus) { const b = box.querySelector(focus); if (b && document.activeElement !== b) b.focus(); } } } catch (e) { console.error(e); }
    return r;
  };
  async function plOpenDesigner() { await pwOpen(); PW.open.add('links'); pwControls(); const d = PW.el && PW.el.querySelector('details[data-pd="links"]'); if (d) { d.scrollIntoView({ block: 'start' }); const x = d.querySelector('[data-pl-new]'); if (x) x.focus(); } }
  window.ssEditPageLinks = plOpenDesigner;
  // My page's Design card: "Edit links" next to "Add photos"
  const _pdDrawL = pdDraw;
  pdDraw = function (el) {
    const r = _pdDrawL.apply(this, arguments);
    try { const row = el.querySelector('.ssx-row'); if (row && !row.querySelector('[data-pl-card]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.plCard = '1'; b.textContent = 'Edit links'; b.onclick = plOpenDesigner; row.prepend(b); } } catch (_) {}
    return r;
  };
  // Page details: a way in, right under the link ticks
  const _pgFormL = pgForm;
  pgForm = function (form) {
    const r = _pgFormL.apply(this, arguments);
    try { const any = form.querySelector('[data-pg-link]'), f = any ? any.closest('.f') : [...form.querySelectorAll('.f > label')].find(x => x.textContent.trim() === 'Links'); const host = f && (f.classList.contains('f') ? f : f.parentElement);
      if (host && !host.querySelector('[data-pl-open]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.plOpen = '1'; b.textContent = 'Edit, add or reorder links'; b.onclick = plOpenDesigner; host.appendChild(b); } } catch (e) { console.error(e); }
    return r;
  };
  // Kit: "On my page" on each link (changes the live page, and the designer's unpublished copy)
  async function plToggle(k) {
    await pgLoad(); const cur = new Set((PGE.doc || {}).linkOff || []), on = cur.has(k); on ? cur.delete(k) : cur.add(k);
    if (!(await pgSave({ linkOff: [...cur] }))) return;
    if (PW.draft) { const s = new Set(PW.draft.linkOff || []); on ? s.delete(k) : s.add(k); PW.draft.linkOff = [...s]; }
    try { await pgSync(true); } catch (_) {}
    toast(on ? ((PGE.doc || {}).on ? 'Shown on your page' : 'Will show once your page is public') : 'Hidden from your page'); plKitRows();
  }
  function plKitRows() {
    const box = document.getElementById('linkList'); if (!box || !pgSlug() || !PGE.loaded) { if (!PGE.loaded) pgLoad(); return; }
    const off = new Set((PGE.doc || {}).linkOff || []);
    box.querySelectorAll('[data-open-link]').forEach(btn => {
      const id = btn.dataset.openLink, l = (S.links || []).find(x => x.id === id); if (!l) return;
      const k = pgLinkKey(l), row = btn.parentElement; let t = row.querySelector('[data-pl-kit]');
      if (!t) { t = document.createElement('button'); t.type = 'button'; t.className = 'btn small ssx-pm-on-k'; t.dataset.plKit = k; t.onclick = () => plToggle(k); btn.before(t); }
      const on = !off.has(k); t.setAttribute('aria-pressed', String(on)); t.textContent = on ? '✓ On my page' : '+ My page';
    });
  }
  if (typeof window.renderKit === 'function' && !window.renderKit.__pl) { const o = window.renderKit, w = function () { const r = o.apply(this, arguments); try { plKitRows(); } catch (e) { console.error(e); } return r; }; w.__pl = true; window.renderKit = w; }
  const _pgCardPL = pgCard;
  pgCard = function () { const r = _pgCardPL.apply(this, arguments); try { if (typeof window.renderKit === 'function' && !window.renderKit.__pl) { const o = window.renderKit, w = function () { const r2 = o.apply(this, arguments); try { plKitRows(); } catch (e) { console.error(e); } return r2; }; w.__pl = true; window.renderKit = w; } plKitRows(); } catch (e) { console.error(e); } return r; };  
/* -- What you offer: packages for every kind of artist (a DJ's wedding package, a photographer's headshot session).
     Settings → Profile → "What you offer" (settings/services). Start with suggestions for your artist type (no prices are
     made up: you set them). Packages already work in the show form (fills fee, title and end time), on invoices (package
     and add-ons as their own lines) and in emails ({{packages}}). The booking page uses them next.
     Also: Photographer and Videographer artist types, and Instagram + EPK link in the Business profile. */
  try {
    const svc = FL_GROUPS.find(g => g[0] === 'service');
    if (svc && !svc[2].some(k => k[0] === 'photographer')) {
      svc[1] = 'Photo, video & services';
      svc[2].unshift(['photographer', 'Photographer', 'Photographer'], ['videographer', 'Videographer', 'Videographer']);
      FL_KINDS.push(['photographer', 'Photographer', 'service'], ['videographer', 'Videographer', 'service']);
    }
  } catch (e) { console.error(e); }
  const SV = { doc: null, loaded: false, busy: false };
  const svCfg = () => ({ items: [], custom: true, travel: '', ...(SV.doc || {}) });
  const svItems = () => (svCfg().items || []).filter(p => p && p.id && p.name);
  async function svLoad() { if (SV.loaded || !st.db) return; SV.loaded = true; try { const s = await st.db.doc('settings/services').get(); SV.doc = s.exists ? s.data() : {}; } catch (_) { SV.doc = null; SV.loaded = false; } }
  async function svSave(patch, msg) { const next = { ...svCfg(), ...patch, updatedAt: new Date().toISOString() }; try { await st.db.doc('settings/services').set(next); SV.doc = next; if (msg) toast(msg); return true; } catch (_) { toast("Couldn't save. " + OFFLINE); return false; } }
  const svId = () => 'p' + Math.random().toString(36).slice(2, 9);
  const svLen = m => { m = Number(m) || 0; if (!m) return ''; if (m >= 480 && m % 60 === 0 && m > 600) return `${m / 60} hr`; const h = Math.floor(m / 60), r = m % 60; return h ? `${h}${r ? '.' + Math.round(r / 6) : ''} hr` : `${r} min`; };
  const svMoney = n => { try { return money(n); } catch (_) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); } };
  const svPrice = p => (p.price === '' || p.price == null || isNaN(Number(p.price))) ? 'Price on request' : `${p.from ? 'From ' : ''}${svMoney(p.price)}`;
  const svDeposit = p => p.depKind === 'pct' && Number(p.dep) ? `${Number(p.dep)}% deposit` : p.depKind === 'amt' && Number(p.dep) ? `${svMoney(p.dep)} deposit` : '';
  const SV_LENS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600];
  // starter packages by artist type: names, lengths and what's included; prices stay blank for you to set
  const SV_SUGGEST = {
    dj: [['Club or bar set', 180, 'Up to 3 hours of music. Uses the venue\'s sound system.'], ['Private party', 240, '4 hours of music with sound system, a planning call and your must-play list.'], ['Wedding', 300, 'Ceremony, cocktail hour and reception, with announcements and a planning call.']],
    music: [['Live set', 60, 'A one-hour set with my own instruments.'], ['Private event', 120, 'Two sets for parties and private events, with a planning call.'], ['Wedding ceremony', 60, 'Ceremony music, including your walk down the aisle.']],
    comedy: [['Club set', 30, 'A 30-minute set.'], ['Hosting / MC', 180, 'Hosting your event start to finish, with announcements.'], ['Private show', 60, 'A one-hour show for parties and private events.']],
    movement: [['Performance', 30, 'A 30-minute performance.'], ['Event appearance', 120, 'Roaming or staged performances across two hours.'], ['Workshop', 90, 'A 90-minute class for your group.']],
    photographer: [['Event coverage', 120, 'Up to 2 hours of photos and an online gallery of edited images.', 'Within 7 days'], ['Headshots', 60, 'A one-hour session with two looks and retouched favorites.', 'Within 5 days'], ['Show or concert photos', 180, 'Full-night coverage with edited photos ready for social media.', 'Within 3 days']],
    videographer: [['Event recap video', 180, 'Filming your event and a 60–90 second recap edit.', 'Within 14 days'], ['Music video', 480, 'A planning call, one shoot day and the edited video.', 'Within 21 days'], ['Live set recording', 120, 'Multi-angle recording with audio from the board.', 'Within 10 days']],
    tattoo: [['Small tattoo', 60, 'Simple designs, palm-sized or smaller.'], ['Half-day session', 240, 'Up to 4 hours of tattooing.'], ['Full-day session', 480, 'Up to 8 hours of tattooing.']],
    massage: [['60-minute massage', 60, 'Full-body massage.'], ['90-minute massage', 90, 'Full-body massage with extra focus areas.']],
    acupuncture: [['First visit', 90, 'Intake conversation and your first treatment.'], ['Follow-up visit', 60, 'A treatment session.']],
    hmua: [['Event makeup', 60, 'Makeup for one person.'], ['Bridal hair & makeup', 150, 'Hair and makeup for the person getting married.'], ['Trial', 60, 'A run-through before the big day.']],
    other: [['Standard booking', 60, 'Tell people what\'s included.']]
  };
  function svSuggestions() {
    let A = { kind: '', group: 'music' }; try { A = flArtist(); } catch (_) {}
    const list = SV_SUGGEST[A.kind] || (A.kind && ['singer', 'rapper', 'band', 'instrumentalist', 'producer'].includes(A.kind) ? SV_SUGGEST.music : SV_SUGGEST[A.group]) || SV_SUGGEST.other;
    return list.map(([name, mins, includes, turn]) => ({ id: svId(), name, mins, includes, turn: turn || '', price: '', from: false, depKind: 'none', dep: '', addons: [], online: true }));
  }
  // the package editor
  function svEdit(id) {
    const cur = svItems().find(p => p.id === id) || { id: svId(), name: '', mins: 60, includes: '', price: '', from: false, depKind: 'none', dep: '', turn: '', addons: [], online: true };
    const isNew = !svItems().some(p => p.id === cur.id); let addons = (cur.addons || []).map(a => ({ ...a }));
    let A = { group: 'music' }; try { A = flArtist(); } catch (_) {}
    try { navSheet('svc:' + cur.id, () => svEdit(id)); } catch (_) {}
    const lenOpts = [...new Set([...SV_LENS, Number(cur.mins) || 60])].sort((a, b) => a - b).map(m => `<option value="${m}"${Number(cur.mins) === m ? ' selected' : ''}>${svLen(m)}</option>`).join('');
    sheet(`<h3>${isNew ? 'New package' : 'Edit package'}</h3>
      <div class="f"><label for="sv-name">Name</label><input id="sv-name" maxlength="60" value="${esc(cur.name)}" placeholder="e.g. Wedding, Headshots, Club set"></div>
      <div class="f"><label for="sv-inc">What's included</label><textarea id="sv-inc" maxlength="500" rows="3" placeholder="What they get, in a sentence or two">${esc(cur.includes || '')}</textarea></div>
      <div class="frow"><div class="f"><label for="sv-len">Length</label><select id="sv-len">${lenOpts}</select></div>
        <div class="f"><label for="sv-price">Price <i class="note">(blank = on request)</i></label><input id="sv-price" type="number" min="0" step="1" inputmode="decimal" value="${esc(cur.price ?? '')}" placeholder="e.g. 450"></div></div>
      <label class="ssx-check"><input type="checkbox" id="sv-from"${cur.from ? ' checked' : ''}> Show as "From" (the price can go up)</label>
      <div class="frow"><div class="f"><label for="sv-depk">Deposit</label><select id="sv-depk">${[['none', 'No deposit'], ['pct', 'A percentage'], ['amt', 'A set amount']].map(([v, l]) => `<option value="${v}"${(cur.depKind || 'none') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f" id="sv-depw"${(cur.depKind || 'none') === 'none' ? ' hidden' : ''}><label for="sv-dep">${cur.depKind === 'amt' ? 'Amount ($)' : 'Percent (%)'}</label><input id="sv-dep" type="number" min="0" step="1" value="${esc(cur.dep ?? '')}"></div></div>
      <div class="f"><label for="sv-turn">Turnaround <i class="note">(optional${A.group === 'service' ? '' : ', for things you deliver later'})</i></label><input id="sv-turn" maxlength="60" value="${esc(cur.turn || '')}" placeholder="e.g. Within 7 days"></div>
      <div class="f"><label>Add-ons <i class="note">(optional extras people can add)</i></label><div class="ssx-sv-adds"></div><button type="button" class="btn small" data-sv-addon>+ Add an add-on</button></div>
      <label class="ssx-check"><input type="checkbox" id="sv-online"${cur.online !== false ? ' checked' : ''}> Offer this on your booking page</label>
      <div class="actions">${isNew ? '' : '<button type="button" class="btn ssx-sv-del" data-sv-del>Delete</button>'}<button type="button" class="btn" data-sv-cancel>Cancel</button><button type="button" class="btn primary" data-sv-save>Save package</button></div>`, root => {
      const q = s => root.querySelector(s);
      const drawAdds = () => { const box = q('.ssx-sv-adds'); box.innerHTML = addons.map((a, i) => `<div class="ssx-sv-add" data-i="${i}"><input maxlength="50" data-a="name" value="${esc(a.name || '')}" placeholder="e.g. Extra hour" aria-label="Add-on name"><input type="number" min="0" step="1" data-a="price" value="${esc(a.price ?? '')}" placeholder="$" aria-label="Add-on price"><button type="button" class="x" data-a-del aria-label="Remove add-on">×</button></div>`).join('');
        box.querySelectorAll('.ssx-sv-add').forEach(row => { const i = +row.dataset.i; row.querySelectorAll('[data-a]').forEach(inp => inp.oninput = () => { addons[i][inp.dataset.a] = inp.value; }); row.querySelector('[data-a-del]').onclick = () => { addons.splice(i, 1); drawAdds(); }; }); };
      drawAdds();
      q('[data-sv-addon]').onclick = () => { if (addons.length >= 8) { toast('Up to 8 add-ons per package'); return; } addons.push({ id: svId(), name: '', price: '' }); drawAdds(); const ins = root.querySelectorAll('.ssx-sv-add [data-a="name"]'); if (ins.length) ins[ins.length - 1].focus(); };
      q('#sv-depk').onchange = e => { q('#sv-depw').hidden = e.target.value === 'none'; q('#sv-depw label').textContent = e.target.value === 'amt' ? 'Amount ($)' : 'Percent (%)'; };
      q('[data-sv-cancel]').onclick = () => svSheet();
      const del = q('[data-sv-del]'); if (del) del.onclick = async () => { if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Delete'; } }, 4000); return; }
        if (await svSave({ items: svItems().filter(p => p.id !== cur.id) }, `${cur.name} deleted`)) svSheet(); };
      q('[data-sv-save]').onclick = async e => {
        const name = q('#sv-name').value.trim(); if (!name) { toast('Give the package a name'); q('#sv-name').focus(); return; }
        const priceRaw = q('#sv-price').value.trim(), dk = q('#sv-depk').value;
        const item = { ...cur, name, includes: q('#sv-inc').value.trim(), mins: Number(q('#sv-len').value) || 60, price: priceRaw === '' ? '' : Math.max(0, Number(priceRaw)), from: q('#sv-from').checked,
          depKind: dk, dep: dk === 'none' ? '' : Math.max(0, Number(q('#sv-dep').value) || 0), turn: q('#sv-turn').value.trim(), online: q('#sv-online').checked,
          addons: addons.filter(a => String(a.name || '').trim()).map(a => ({ id: a.id || svId(), name: String(a.name).trim().slice(0, 50), price: a.price === '' || a.price == null ? '' : Math.max(0, Number(a.price) || 0) })) };
        if (dk === 'pct' && item.dep > 100) { toast('A percentage deposit can be at most 100%'); q('#sv-dep').focus(); return; }
        const btn = e.currentTarget; btn.disabled = true;
        const list = svItems(), i = list.findIndex(p => p.id === item.id); i >= 0 ? list.splice(i, 1, item) : list.push(item);
        if (await svSave({ items: list }, `${name} saved`)) svSheet(); else btn.disabled = false;
      };
      if (isNew) q('#sv-name').focus();
    });
  }
  // the list of packages
  function svSheet() {
    const c = svCfg(), list = svItems();
    try { navSheet('svc', () => svSheet()); } catch (_) {}
    sheet(`<h3>What you offer</h3><p class="note" style="margin:0 0 8px">Your packages and prices, in one place. They fill in your shows, invoices and emails, and your booking page offers them.</p>
      ${list.length ? `<ol class="ssx-sv-list">${list.map((p, i) => `<li data-id="${esc(p.id)}"><button type="button" class="ssx-sv-row" data-sv-open><span class="tx"><b>${esc(p.name)}</b><small>${esc([svLen(p.mins), svPrice(p), svDeposit(p), p.turn].filter(Boolean).join(' · '))}${p.online === false ? ' · <i>not on booking page</i>' : ''}</small></span><span aria-hidden="true">›</span></button>
        <span class="mv"><button type="button" class="btn small" data-sv-up aria-label="Move ${esc(p.name)} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-sv-dn aria-label="Move ${esc(p.name)} down"${i < list.length - 1 ? '' : ' disabled'}>↓</button></span></li>`).join('')}</ol>`
        : `<div class="ssx-sv-empty"><p>No packages yet. Start with a few suggestions for your kind of work and set your own prices, or add your own.</p><button type="button" class="btn primary" data-sv-suggest>Start with suggestions</button></div>`}
      <div class="ssx-row"><button type="button" class="btn${list.length ? ' primary' : ''}" data-sv-new>+ Add a package</button></div>
      <label class="ssx-check" style="margin-top:12px"><input type="checkbox" id="sv-custom"${c.custom !== false ? ' checked' : ''}> Let people ask for something custom</label>
      <div class="f"><label for="sv-travel">Travel or other fees <i class="note">(optional)</i></label><input id="sv-travel" maxlength="160" value="${esc(c.travel || '')}" placeholder="e.g. Travel over 30 miles: $1 per mile"></div>
      <div class="actions"><button type="button" class="btn primary" data-sv-done>Done</button></div>`, root => {
      const q = s => root.querySelector(s);
      root.querySelectorAll('.ssx-sv-list > li').forEach(li => {
        const id = li.dataset.id; li.querySelector('[data-sv-open]').onclick = () => svEdit(id);
        const mv = async dir => { const L = svItems(), i = L.findIndex(p => p.id === id), j = i + dir; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; if (await svSave({ items: L })) { svSheet(); const b = document.querySelector(`.ssx-sv-list > li[data-id="${id}"] [data-sv-${dir < 0 ? 'up' : 'dn'}]`); if (b && !b.disabled) b.focus(); } };
        li.querySelector('[data-sv-up]').onclick = () => mv(-1); li.querySelector('[data-sv-dn]').onclick = () => mv(1);
      });
      const sg = q('[data-sv-suggest]'); if (sg) sg.onclick = async () => { const s = svSuggestions(); if (await svSave({ items: s }, `${s.length} packages added. Open each one to set your price.`)) svSheet(); };
      q('[data-sv-new]').onclick = () => svEdit('');
      q('#sv-custom').onchange = e => svSave({ custom: e.target.checked }, e.target.checked ? 'Custom requests on' : 'Custom requests off');
      q('#sv-travel').onchange = e => svSave({ travel: e.target.value.trim() }, 'Saved');
      q('[data-sv-done]').onclick = () => close();
    });
  }
  window.ssServices = svSheet;
  // Settings → Profile: the "What you offer" card under the Business profile
  function svCard() {
    const biz = document.getElementById('ssx-biz'); if (!biz || !st.db) return;
    if (!SV.loaded) { svLoad().then(svCard); return; } if (!SV.doc) return;
    const list = svItems(), sig = JSON.stringify(list.map(p => [p.name, p.mins, p.price, p.from])); let el = document.getElementById('ssx-svc');
    if (!el) { el = document.createElement('div'); el.id = 'ssx-svc'; el.className = 'card ssx'; biz.after(el); }
    if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    const noPrice = list.filter(p => p.price === '' || p.price == null).length;
    el.innerHTML = `<div class="ssx-head"><div><h3>What you offer</h3><p class="note">${list.length ? `${list.length} package${list.length === 1 ? '' : 's'}${noPrice ? ` · ${noPrice} without a price yet` : ''}` : 'Your packages and prices. Your shows, invoices, emails and booking page use them.'}</p></div>
      <button type="button" class="btn small${list.length ? '' : ' primary'}" data-sv-card>${list.length ? 'Edit' : 'Add packages'}</button></div>
      ${list.length ? `<ul class="ssx-sv-sum">${list.slice(0, 5).map(p => `<li><b>${esc(p.name)}</b><span>${esc([svLen(p.mins), svPrice(p)].filter(Boolean).join(' · '))}</span></li>`).join('')}${list.length > 5 ? `<li class="note">and ${list.length - 5} more</li>` : ''}</ul>` : ''}`;
    el.querySelector('[data-sv-card]').onclick = () => svSheet();
  }
  // show form: pick a package (and add-ons) to fill the fee, the title and the end time
  function svBookField(root) {
    if (!root.querySelector('#b-fee') || !root.querySelector('#b-title') || root.querySelector('#b-pkg')) return;
    if (!SV.loaded) { svLoad().then(() => svBookField(root)); return; }
    const list = svItems(); if (!list.length) return;
    const b = FL.formB || {}, chosen = new Set(String(b.addonIds || '').split(',').filter(Boolean));
    const w = document.createElement('div'); w.className = 'f ssx-pkg';
    w.innerHTML = `<label for="b-pkg">Package</label><select id="b-pkg" data-k="packageId"><option value="">No package (custom)</option>${list.map(p => `<option value="${esc(p.id)}"${b.packageId === p.id ? ' selected' : ''}>${esc(p.name)} · ${esc([svLen(p.mins), svPrice(p)].filter(Boolean).join(' · '))}</option>`).join('')}</select>
      <div class="ssx-pkg-adds"></div><input type="hidden" data-k="addonIds" value="${esc([...chosen].join(','))}"><span class="note">Picking one fills in the fee, the title and the end time. You can still change them.</span>`;
    const anchor = root.querySelector('#b-title').closest('.f'); anchor ? anchor.after(w) : root.querySelector('#b-fee').closest('.f').before(w);
    const sel = w.querySelector('#b-pkg'), hid = w.querySelector('[data-k="addonIds"]'), box = w.querySelector('.ssx-pkg-adds');
    const pk = () => list.find(p => p.id === sel.value);
    const total = () => { const p = pk(); if (!p) return null; let t = Number(p.price) || 0; (p.addons || []).forEach(a => { if (chosen.has(a.id)) t += Number(a.price) || 0; }); return (p.price === '' || p.price == null) && !t ? null : t; };
    const fill = first => {
      const p = pk(); if (!p) return;
      const fee = root.querySelector('#b-fee'), t = total(); if (t != null && (!first || !fee.value)) { fee.value = t; fee.dispatchEvent(new Event('input', { bubbles: true })); }
      const ti = root.querySelector('#b-title'); if (!ti.value.trim()) { ti.value = p.name; ti.dispatchEvent(new Event('input', { bubbles: true })); }
      try { const s = readTime(root, 'b-ts'); if (s && p.mins) { const m = toMin(s) + Number(p.mins) + (p.addons || []).filter(a => chosen.has(a.id) && /hour/i.test(a.name)).length * 60; setTimeSel(root, 'b-te', fromMin(m % 1440)); } } catch (_) {}
    };
    const drawAdds = () => { const p = pk(); box.innerHTML = p && (p.addons || []).length ? `<div class="ssx-pkg-al">${p.addons.map(a => `<label class="ssx-check"><input type="checkbox" data-addon="${esc(a.id)}"${chosen.has(a.id) ? ' checked' : ''}> ${esc(a.name)}${a.price !== '' && a.price != null ? ' · +' + esc(svMoney(a.price)) : ''}</label>`).join('')}</div>` : '';
      box.querySelectorAll('[data-addon]').forEach(c => c.onchange = () => { c.checked ? chosen.add(c.dataset.addon) : chosen.delete(c.dataset.addon); hid.value = [...chosen].join(','); fill(false); }); };
    sel.onchange = () => { chosen.clear(); hid.value = ''; drawAdds(); fill(false); };
    drawAdds();
    // set the end time once a start time is picked
    root.addEventListener('change', e => { if (e.target.closest && e.target.closest('[data-tsel="b-ts"]') && pk()) { try { const s = readTime(root, 'b-ts'); if (s) setTimeSel(root, 'b-te', fromMin((toMin(s) + Number(pk().mins)) % 1440)); } catch (_) {} } });
  }
  const _flBookFormSV = flBookForm;
  flBookForm = function (root) { const r = _flBookFormSV.apply(this, arguments); try { svBookField(root); } catch (e) { console.error(e); } return r; };
  // invoices: the package and each add-on as their own lines (they add up to the show's fee)
  function svInvWire() {
    if (typeof window.newInvoice !== 'function' || window.newInvoice.__sv) return;
    const o = window.newInvoice, w = function (b) {
      const inv = o.apply(this, arguments);
      try {
        const p = b && b.packageId && svItems().find(x => x.id === b.packageId); if (!p || !inv || !Array.isArray(inv.lines) || !inv.lines.length) return inv;
        const ids = new Set(String(b.addonIds || '').split(',').filter(Boolean)), adds = (p.addons || []).filter(a => ids.has(a.id));
        const addSum = adds.reduce((s, a) => s + (Number(a.price) || 0), 0), fee = Number(b.fee) || 0, base = fee ? Math.max(0, fee - addSum) : (Number(p.price) || 0);
        const first = inv.lines[0], show = (() => { try { return bookingName(b); } catch (_) { return b.title || ''; } })();
        inv.lines = [{ ...first, desc: `${p.name}${show && show !== p.name ? ' – ' + show : ''}`, qty: 1, unit: 'flat', rate: base }, ...adds.map(a => ({ ...first, desc: a.name, qty: 1, unit: 'flat', rate: Number(a.price) || 0 })), ...inv.lines.slice(1)];
      } catch (e) { console.error(e); }
      return inv;
    };
    w.__sv = true; window.newInvoice = w;
  }
  // emails: a "My packages & prices" fill-in
  try { const g = FILLINS.find(x => x[0] === 'About you'); if (g && !g[1].some(i => i[0] === 'packages')) g[1].push(['packages', 'My packages & prices']); } catch (_) {}
  const svFillText = () => { const L = svItems().filter(p => p.online !== false), c = svCfg(); if (!L.length) return ''; return L.map(p => `• ${p.name} (${[svLen(p.mins), svPrice(p).replace(/^From /, 'from ').replace(/^Price on request$/, 'price on request')].filter(Boolean).join(', ')})${p.includes ? ': ' + p.includes : ''}`).join('\n') + (c.travel ? `\n${c.travel}` : ''); };
  function svFillWire() {
    const s = window.SS; if (!s || !s.templates || typeof s.templates.fill !== 'function' || s.templates.fill.__svc) return;
    const o = s.templates.fill, f = function (str, ...rest) { return o.call(this, String(str || '').replace(/\{\{\s*packages\s*\}\}/g, () => svFillText()), ...rest); }; f.__svc = true; f.__links = o.__links;
    try { window.SS = Object.freeze({ ...s, templates: Object.freeze({ ...s.templates, fill: f }) }); } catch (e) { console.error(e); }
  }
  // Business profile: Instagram and EPK link, saved with everything else
  const _bizSheetSV = bizSheet;
  bizSheet = function () {
    const r = _bizSheetSV.apply(this, arguments);
    try {
      const root = document.querySelector('#sheetRoot .sheet'), web = root && root.querySelector('#bz-web'); if (!web || root.querySelector('#bz-ig')) return r;
      const p = S.profile || {}, w = document.createElement('div'); w.className = 'frow';
      w.innerHTML = `<div class="f"><label for="bz-ig">Instagram <i class="note">(optional)</i></label><input id="bz-ig" maxlength="60" value="${esc(p.instagram ? '@' + String(p.instagram).replace(/^@/, '') : '')}" placeholder="@yourhandle"></div><div class="f"><label for="bz-epk">EPK link <i class="note">(optional)</i></label><input id="bz-epk" type="url" maxlength="200" value="${esc(p.epk || '')}" placeholder="https://"></div>`;
      web.closest('.f').after(w);
      // goes into your profile in the same save (before the Business profile writes it)
      root.querySelector('[data-bz-save]').addEventListener('click', () => {
        const ig = (() => { const t = root.querySelector('#bz-ig').value.trim(); const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i); return (m ? m[1] : t).replace(/^@/, '').replace(/[\/?#].*$/, ''); })();
        let epk = root.querySelector('#bz-epk').value.trim(); if (epk && !/^https?:\/\//i.test(epk) && /\.[a-z]{2,}/i.test(epk)) epk = 'https://' + epk;
        try { S.profile = { ...(S.profile || {}), instagram: ig, epk }; } catch (_) {}
      }, true);
    } catch (e) { console.error(e); }
    return r;
  };
  const _pgCardSV = pgCard;
  pgCard = function () { const r = _pgCardSV.apply(this, arguments); try { svCard(); svInvWire(); svFillWire(); } catch (e) { console.error(e); } return r; };  
  function flScan() {
    try { flMediaAuto(); flFoundSweep(); flFoundCard(); invTplWrap(); invTplCard(); pgCard(); pgSync(); } catch (e) { console.error(e); }
    FL.raf = 0;
    for (const f of [flMediaTab, flStageToggle, flRemindRow, flMediaHub, flEpkPicRow, flNoUploads, flArtistUI, flComposeTpl, flNoAutofill, flReqSweep, flLostSweep, flLostCard, flTourSetup, flStandalone, flRepeatWrapSave, flTaskCalSweep, flRoWrap, flRoDueCards, flGtHook, flGtSweep, flGtSettings, flBfHook, flBfSettings, flBkpSettings, flW9Card, flWelcome, flFuHook, flFuSweep, flFuTasks2, flRoAutoLog, flRoTasksWrap, nmLockWatch, bizCard, flGtCleanHook, navWrap, navGroups, nmRender]) { try { f(); } catch (e) { console.error(e); } }
    const sr = document.getElementById('sheetRoot'); if (!sr) return;
    sr.querySelectorAll('.sheet').forEach(root => { for (const f of [flInlineHook, flFormExtras, flBuilder, flReview, flSeeAll, flPastForm, flLinkPicker, flMoneyRow, flContactPhone, flInvoiceHook, flRepeatUI, flSeriesRow, flSheetBar, flTaskCal, flRoSheet2, flRoFormShow, flRoOutcome, flGtRow, flBookForm, flBfView, flFuRow2, nmWrapRow, nmLockRow, flRoBookRow, flSortChecklist, bizNotes, flAddShow, flLearn]) { try { f(root); } catch (e) { console.error(e); } } });
  }
  function hookFlow() {
    if (window.__ssxFL || !st.db) return; window.__ssxFL = true;
    st.db.doc('settings/flow').onSnapshot(s => { const was = flCfg(); FL.cfg = s.exists ? s.data() : {}; const now = flCfg(); flRefresh(was.closeOld !== now.closeOld || JSON.stringify(was.plan) !== JSON.stringify(now.plan)); if (was.epkPhoto !== now.epkPhoto) { try { if (EPK.el) epkRender(); } catch (_) {} } if (!FL.loaded || JSON.stringify(was.artist) !== JSON.stringify(now.artist)) flRelabel(document.body); FL.loaded = true; flSoon(); }, () => {});
    st.db.collection('media').onSnapshot(s => { const was = flEpkAsset(); FL.media = s.docs.map(d => ({ id: d.id, ...d.data() })); if (was !== flEpkAsset()) { try { if (EPK.el) epkRender(); } catch (_) {} } flSoon(); }, () => {});
    st.db.collection('posts').onSnapshot(s => { FL.posts = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); flRefresh(); flSoon(); }, () => {});
    flWrapTasks(); flWrapForm(); flWrapView(); flWrapSave(); flWrapWords();
    document.addEventListener('click', flDocClick, true);
    document.addEventListener('click', flNhGuard, true); flWrapToast(); flEpkHook();
    document.addEventListener('change', flDocChange, true);
    new MutationObserver(recs => { flSoon(); if (!FL.cfg || flArtist().label === 'DJ') return; for (const r of recs) for (const n of r.addedNodes) { try { flRelabel(n); } catch (_) {} } }).observe(document.body, { childList: true, subtree: true });
    flRefresh(true); flSoon(); flRelabel(document.body);
  }
  /* ---------- Smooth saving.
     1. Every saved change used to redraw all nine pages at once, several times per save (once for the save and again
        when the server echoed it back). With a full season of shows that froze the page for seconds. Now the page
        redraws at most once per frame, only the page you are looking at right away, and the others while the
        browser is idle (or the moment you open them).
     2. Save buttons show "Saving…" while the change is on its way, can't be tapped twice (no duplicate bookings),
        and a "Saving…" note appears at the top; if the connection is slow it says so instead of looking frozen. */
  function speedUp() {
    if (window.__ssxFast || typeof window.render !== 'function') return; window.__ssxFast = true;
    const PAGES = { home: 'renderHome', bookings: 'renderBookings', calendar: 'renderCalendar', tasks: 'renderTasks', contacts: 'renderContacts', money: 'renderMoney', kit: 'renderKit' };
    const stale = new Set(); let queued = false, idleOn = false;
    const cur = () => { try { return tab; } catch (_) { return 'home'; } };
    const runPage = k => { stale.delete(k); const f = window[PAGES[k]]; if (typeof f === 'function') { try { f(); } catch (e) { console.error(e); } } };
    const later = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 1500 }) : f => setTimeout(f, 80);
    const idle = () => { if (idleOn || !stale.size) return; idleOn = true; later(() => { idleOn = false; if (queued) return; const k = [...stale][0]; if (k) runPage(k); idle(); }); };
    const flush = () => {
      queued = false;
      try { const y = document.getElementById('yearLbl'); if (y && typeof year === 'function') y.textContent = year() + ' season'; } catch (_) {}
      Object.keys(PAGES).forEach(k => stale.add(k));
      const t = cur(); if (PAGES[t]) runPage(t);
      try { if (typeof renderAvatars === 'function') renderAvatars(); } catch (_) {}
      idle();
    };
    window.render = () => { if (queued) return; queued = true; requestAnimationFrame(flush); };
    const origSet = window.setTab;
    if (typeof origSet === 'function') window.setTab = function (t) { if (stale.has(t)) runPage(t); return origSet.apply(this, arguments); };
  }
  function submitGuard() {
    if (window.__ssxGuard) return; window.__ssxGuard = true;
    let lastBtn = null, lastAt = 0, pending = 0, slowT = null;
    const busy = new Set();
    const note = document.createElement('div'); note.className = 'ssx-saving'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); note.hidden = true;
    note.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:260;';
    document.body.appendChild(note);
    const say = (t, cls) => { note.textContent = t; note.className = 'ssx-saving' + (cls ? ' ' + cls : ''); note.hidden = !t; };
    // remember which button started this save (taps inside forms, the email window and the EPK)
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button, .btn'); if (!b) return;
      if (busy.has(b)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      lastBtn = b; lastAt = Date.now();
    }, true);
    const markBusy = b => {
      if (!b || busy.has(b) || !b.isConnected || !b.closest('#sheetRoot, #composeRoot, .sheet')) return;
      busy.add(b); b.dataset.ssxLabel = b.textContent; b.classList.add('ssx-busy'); b.setAttribute('aria-busy', 'true'); b.disabled = true;
      if (/save|add|log|create|update/i.test(b.textContent)) b.textContent = 'Saving…';
    };
    const unbusy = () => { busy.forEach(b => { b.classList.remove('ssx-busy'); b.removeAttribute('aria-busy'); if (b.isConnected) { b.disabled = false; if (b.dataset.ssxLabel) b.textContent = b.dataset.ssxLabel; } }); busy.clear(); };
    const wrap = name => {
      const orig = window[name]; if (typeof orig !== 'function' || orig.__ssx) return;
      const w = async function (...args) {
        if (lastBtn && Date.now() - lastAt < 15000) markBusy(lastBtn);
        pending++; clearTimeout(slowT);
        const showT = setTimeout(() => { if (pending) say(name === 'remove' ? 'Deleting…' : 'Saving…'); }, 350);
        slowT = setTimeout(() => { if (pending) { say('Still saving… your connection looks slow. Keep this page open.', 'slow'); unbusy(); } }, 12000);
        try { return await orig.apply(this, args); }
        finally { clearTimeout(showT); pending = Math.max(0, pending - 1); if (!pending) { clearTimeout(slowT); unbusy(); say(''); } }
      };
      w.__ssx = true; window[name] = w;
    };
    ['save', 'patch', 'remove'].forEach(wrap);
    // when you come back to the tab after a while, make sure the connection is awake before your next save
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { sb.auth.getSession().catch(() => {}); } catch (_) {} } });
  }
  /* ---------- Pop-up lists stay open while you type or scroll inside them, and follow the button they belong to */
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement) || !n.classList.contains('pop') || typeof PK === 'undefined' || !PK.open || PK.open.el !== n) continue;
      const orig = PK.scr, w0 = innerWidth;
      PK.scr = e => {
        const o = PK.open; if (!o) return;
        if (e && e.target && e.target.nodeType === 1 && o.el.contains(e.target)) return;
        const r = o.anchor.getBoundingClientRect(), visible = r.bottom > 0 && r.top < innerHeight && r.width > 0;
        const typing = o.el.contains(document.activeElement);
        if ((e && e.type === 'resize' && (typing || innerWidth === w0)) || (visible && (typing || !e || e.type === 'scroll'))) { try { placePop(o.el, o.anchor); } catch (_) {} return; }
        orig(e);
      };
    }
  }).observe(document.body, { childList: true });

  /* ---------- Minimized email: a pill at the bottom right with "+" to reopen and "×" to discard */
  (function dockPill() {
    const dock = document.getElementById('composeDock'); if (!dock) return;
    const pill = document.createElement('div'); pill.className = 'ssx-dock'; pill.hidden = true; pill.setAttribute('role', 'region'); pill.setAttribute('aria-label', 'Minimized email');
    pill.style.position = 'fixed';
    pill.innerHTML = '<span class="ssx-dock-l"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg><span></span></span><button type="button" class="go" aria-label="Reopen email" title="Reopen">+</button><button type="button" class="x" aria-label="Discard email" title="Discard">×</button>';
    document.body.appendChild(pill);
    const label = pill.querySelector('.ssx-dock-l span'), go = pill.querySelector('.go'), x = pill.querySelector('.x');
    let armed = false, at = 0;
    const sync = () => { pill.hidden = dock.hidden; const l = document.getElementById('dockLabel'); if (!armed) label.textContent = l ? l.textContent : 'Draft email'; if (dock.hidden) { armed = false; x.classList.remove('armed'); } };
    new MutationObserver(sync).observe(dock, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true, characterData: true });
    go.onclick = e => { e.stopPropagation(); dock.click(); };
    x.onclick = e => {
      e.stopPropagation();
      if (!armed) { armed = true; at = Date.now(); x.classList.add('armed'); label.textContent = 'Tap × again to discard'; setTimeout(() => { if (armed && Date.now() - at >= 3900) { armed = false; x.classList.remove('armed'); sync(); } }, 4000); return; }
      armed = false; try { if (typeof composeEnd === 'function') composeEnd(); } catch (_) {} pill.hidden = true;
    };
    sync();
  })();

  /* ---------- EPK: a designed, editable press kit built from the Kit and your shows, saved as a PDF.
     Every section can be turned on or off and moved; pages fill themselves in order. */
  const EPK = { el: null, cfg: null, saveT: null, listOpen: true };
  const EPK_BLOCKS = [
    ['hero', 'Cover (name, picture, short bio)', 'full'], ['stats', 'Highlights', 'full'], ['longBio', 'Long bio', 'full'],
    ['upcoming', 'Upcoming shows', 'half'], ['played', 'Recently played', 'half'], ['music', 'Mixes & music', 'half'],
    ['links', 'Website & socials', 'half'], ['press', 'Press', 'half'], ['rider', 'Tech rider', 'half'],
    ['hosp', 'Hospitality rider', 'half'], ['booking', 'Booking', 'full']
  ];
  const EPK_HERO = [['genres', 'Genres'], ['name', 'DJ name'], ['shortBio', 'Short bio']];
  const EPK_BCOLS = [['contact', 'Contact'], ['avail', 'Availability'], ['lengths', 'Set lengths'], ['next', 'Next show']];
  const EPK_CONTACT = [['contactName', 'Name'], ['email', 'Email'], ['phone', 'Phone']];
  const EPK_PARTKEYS = [...EPK_HERO, ['photo'], ...EPK_BCOLS, ...EPK_CONTACT, ['button']].map(x => x[0]);
  const epkDefaults = () => ({
    palette: 'champagne', mode: 'dark', order: EPK_BLOCKS.map(b => b[0]),
    show: Object.fromEntries(EPK_BLOCKS.map(b => [b[0], b[0] !== 'hosp'])),
    parts: Object.fromEntries(EPK_PARTKEYS.map(k => [k, true])),
    heroOrder: EPK_HERO.map(x => x[0]), bookOrder: EPK_BCOLS.map(x => x[0]),
    nameSize: 84, photoSize: 'm', photoShape: 'arch', photoSide: 'right', text: {}
  });
  const epkFixOrder = (saved, known) => [...new Set([...(Array.isArray(saved) ? saved.filter(k => known.includes(k)) : []), ...known])];
  const EPK_PIC = { s: 190, m: 240, l: 300 };
  // long DJ names shrink until they fit on one line
  function epkFitName(root) {
    root.querySelectorAll('h1.epk-name').forEach(h => { let z = Number(EPK.cfg.nameSize) || 84; h.style.fontSize = z + 'px'; h.style.whiteSpace = 'nowrap'; while (h.scrollWidth > h.clientWidth + 1 && z > 18) { z -= 2; h.style.fontSize = z + 'px'; } if (h.scrollWidth > h.clientWidth + 1) h.style.whiteSpace = 'normal'; });
  }
  const hexMix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return .2126 * r + .7152 * g + .0722 * b; };
function epkTheme(key, mode) {
    const flT = flTheme(key, mode); if (flT) return flT;
    const all = typeof PALETTES !== 'undefined' ? PALETTES : [];
    const pal = all.find(p => p[0] === key) || ['champagne', 'Champagne', ['#D4B26E', '#141711', '#EFE7D3']];
    const champ = pal[0] === 'champagne', cs = pal[2].filter(c => /^#[0-9a-f]{6}$/i.test(c) && lum(c) < .93), flag = cs.length > 3;
    const metal = champ ? 'linear-gradient(115deg,#8A6A35 0%,#F2DDA4 40%,#C9A55C 60%,#F7E7BC 100%)' : flag ? `linear-gradient(115deg,${cs.join(',')})` : `linear-gradient(115deg,${cs[0]},${hexMix(cs[0], '#ffffff', .55)} 50%,${cs[0]})`;
    const darkest = [...cs].sort((a, b) => lum(a) - lum(b))[0] || '#8A6A35';
    const solid = champ ? (mode === 'dark' ? '#D4B26E' : '#8A6A35') : mode === 'dark' ? hexMix(flag ? cs[Math.floor(cs.length / 2)] : cs[0], '#ffffff', .35) : (flag ? darkest : hexMix(cs[0], '#000000', .15));
    return mode === 'dark'
      ? { bg: '#0E100C', glow: '#26301E', ink: '#EFE7D3', muted: 'rgba(239,231,211,.68)', line: 'rgba(239,231,211,.14)', panel: 'rgba(239,231,211,.04)', metal, solid }
      : { bg: '#F6F1E6', glow: '#EADFC8', ink: '#1C2117', muted: '#5E5A4E', line: '#E3D9C6', panel: 'rgba(255,252,245,.75)', metal, solid };
  }
  function epkData() {
    let p = {}, k = {}, links = [], bookings = [];
    try { p = S.profile || {}; k = S.kit || {}; links = typeof sortedLinks === 'function' ? sortedLinks() : (S.links || []); bookings = S.bookings || []; } catch (_) {}
    const t0 = todayStr(), venueOf = b => { try { return b.venueId && typeof contactName === 'function' ? contactName(b.venueId) : ''; } catch (_) { return ''; } };
    const show = b => ({ date: b.date, title: b.title || 'Show', where: [venueOf(b), b.city].filter(Boolean).join(' · ') });
    const played = bookings.filter(b => b.date && b.date <= t0 && ['played', 'paid'].includes(String(b.status).toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    const upcoming = bookings.filter(b => b.date && b.date >= t0 && String(b.status).toLowerCase() === 'confirmed').sort((a, b) => a.date.localeCompare(b.date));
    const L = { ...defLink(), ...(st.link || {}) };
    let photo = ''; try { if (p.avatarId && typeof __blob === 'function') photo = __blob(p.avatarId); } catch (_) {}
    try { const alt = flEpkPhoto(); if (alt) photo = alt; } catch (_) {}
    return {
      name: p.djName || p.myName || 'Your name', genres: k.genres || '', shortBio: k.bioShort || '', longBio: k.bioLong || k.bioShort || '',
      rider: k.rider || '', hosp: k.hospitality || '', contactName: p.myName || p.djName || '', email: p.email || '', phone: p.phone || '',
      bookingLink: L.on && L.slug ? `${location.origin}/?book=${encodeURIComponent(L.slug)}` : '', photo,
      avail: L.on && L.slug ? {
        days: [0, 1, 2, 3, 4, 5, 6].filter(i => (L.days || []).includes(i)).map(i => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]).join(', '),
        hours: L.earliest && L.latest ? `${time12(L.earliest)} – ${time12(L.latest)}` : '',
        lengths: (L.lengths || []).slice().sort((a, b) => a - b).map(n => n < 60 ? n + ' min' : (n / 60) + ' hr').join(' · '),
        notice: L.notice ? `${L.notice} day${L.notice > 1 ? 's' : ''} notice` : ''
      } : null,
      music: links.filter(l => l.group === 'music'), socials: links.filter(l => (l.group || 'links') === 'links'), press: links.filter(l => l.group === 'press'),
      played: played.slice(0, 8).map(show), upcoming: upcoming.slice(0, 5).map(show),
      stats: { shows: played.length, cities: new Set(played.map(b => String(b.city || '').trim().toLowerCase()).filter(Boolean)).size, venues: new Set(played.map(b => b.venueId).filter(Boolean)).size, upcoming: upcoming.length }
    };
  }
  const epkDate = d => { const x = new Date(d + 'T12:00:00'); return { m: x.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), d: x.getDate(), y: x.getFullYear() }; };
  const epkHost = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return u; } };
  const epkName = (c, d) => c.text.name ?? d.name;
  /* each section's design; an empty string means "nothing to show" */
  function epkBlocks(c, d, T) {
    const tx = c.text, P = c.parts, nm = epkName(c, d);
    const ed = (key, val, tag, style, ph, cls = '') => `<${tag} class="epk-ed ${cls}" contenteditable="true" spellcheck="true" data-epk-k="${key}" data-ph="${esc(ph || '')}" style="${style}">${esc(tx[key] ?? val)}</${tag}>`;
    const label = (k, t) => ed('lbl_' + k, t, 'div', `color:${T.solid}`, t, 'epk-label');
    const linkRow = l => `<a class="epk-link" href="${esc(l.url)}" style="border-color:${T.line};color:${T.ink}"><span>${esc(l.label || epkHost(l.url))}</span><span style="color:${T.muted}">${esc(epkHost(l.url))} ↗</span></a>`;
    const B = {};
    // cover
    const photo = d.photo ? `<img src="${esc(d.photo)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-family:Italiana,'Bodoni 72',Didot,Georgia,serif;line-height:1;color:${T.solid};font-size:150px">${esc((nm.replace(/[^A-Za-z]/g, '')[0] || 'S').toUpperCase())}</span>`;
    const HP = {
      genres: () => ed('genres', d.genres, 'div', `font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:${T.solid}`, 'Genres & sound'),
      name: () => ed('name', d.name, 'h1', `font-size:${Number(c.nameSize) || 84}px`, 'Your DJ name', 'epk-name'),
      shortBio: () => `<div class="epk-sbio">${P.name ? `<div style="width:56px;height:1px;background:${T.solid};margin-bottom:22px"></div>` : ''}${ed('shortBio', d.shortBio, 'p', 'font-size:18px;line-height:1.7;margin:0', 'A few sentences about you and your sound. Add it in your Kit, or type it here.')}</div>`
    };
    const left = c.heroOrder.filter(k => P[k] && HP[k]).map(k => HP[k]()).join('');
    const pw = EPK_PIC[c.photoSize] || 240, shape = c.photoShape || 'arch';
    const ph = shape === 'arch' ? Math.round(pw * 1.45) : shape === 'portrait' ? Math.round(pw * 1.3) : pw;
    const rad = shape === 'arch' ? `${pw / 2}px ${pw / 2}px 18px 18px` : shape === 'circle' ? '50%' : '18px';
    const pic = P.photo ? `<div class="epk-photo" style="width:${pw}px;height:${ph}px;border-radius:${rad};border-color:${T.solid}">${photo.replace('font-size:150px', `font-size:${Math.round(pw * .5)}px`)}</div>` : '';
    const L1 = left ? `<div class="epk-hero-l">${left}</div>` : '', picLeft = c.photoSide === 'left';
    B.hero = left || pic ? `<div class="epk-hero" style="grid-template-columns:${!pic || !left ? '1fr' : picLeft ? `${pw}px minmax(0,1fr)` : `minmax(0,1fr) ${pw}px`};${!left ? 'justify-items:center' : ''}">${picLeft ? pic + L1 : L1 + pic}</div>` : '';
    // highlights
    const st4 = [['shows', 'Shows played'], ['cities', 'Cities'], ['venues', 'Venues'], ['upcoming', 'Upcoming']].filter(([k]) => d.stats[k]);
    B.stats = st4.length ? `<div class="epk-stats" style="border-color:${T.line}">${st4.map(([k, l]) => `<div><b style="color:${T.solid}">${d.stats[k]}</b><span style="color:${T.muted}">${l}</span></div>`).join('')}</div>` : '';
    B.longBio = `${label('longBio', 'About')}${ed('longBio', d.longBio, 'div', 'font-size:13.5px;line-height:1.75;column-count:2;column-gap:40px;white-space:pre-line;max-height:380px;overflow:hidden', 'Your longer bio for event pages and press.')}`;
    const listShows = (k, arr, t) => arr.length ? `${label(k, t)}${arr.map(s => { const x = epkDate(s.date); return `<div class="epk-show" style="border-color:${T.line}"><span class="epk-date" style="border-color:${T.line}"><b>${x.d}</b><span style="color:${T.solid}">${x.m} ${String(x.y).slice(2)}</span></span><span><b style="font-weight:500">${esc(s.title)}</b><br><span style="color:${T.muted};font-size:12.5px">${esc(s.where)}</span></span></div>`; }).join('')}` : '';
    B.upcoming = listShows('upcoming', d.upcoming, 'Upcoming');
    B.played = listShows('played', d.played, 'Recently played');
    const grp = (k, t, arr) => arr.length ? `${label(k, t)}${arr.slice(0, 8).map(linkRow).join('')}` : '';
    B.music = grp('music', 'Listen', d.music); B.links = grp('links', 'Find me', d.socials); B.press = grp('press', 'Press', d.press);
    B.rider = `${label('rider', 'Tech rider')}${ed('rider', d.rider, 'div', 'font-size:13px;line-height:1.7;white-space:pre-line', 'Your tech rider')}`;
    B.hosp = `${label('hosp', 'Hospitality')}${ed('hosp', d.hosp, 'div', 'font-size:13px;line-height:1.7;white-space:pre-line', 'Your hospitality rider')}`;
    // booking: each line is optional
    const col = (t, lines) => { const l = lines.filter(Boolean); return l.length ? `<div class="epk-bcol"><div class="epk-label" style="color:${T.solid};margin:0 0 8px">${t}</div>${l.map(x => `<div>${x}</div>`).join('')}</div>` : ''; };
    const nx = d.upcoming[0], nxd = nx ? new Date(nx.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const BC = {
      contact: () => col('Contact', [P.contactName && esc(d.contactName), P.email && d.email && `<a href="mailto:${esc(d.email)}" style="color:${T.ink}">${esc(d.email)}</a>`, P.phone && esc(d.phone)]),
      avail: () => d.avail ? col('Availability', [esc(d.avail.days), esc(d.avail.hours), esc(d.avail.notice)]) : '',
      lengths: () => d.avail ? col('Set lengths', [esc(d.avail.lengths)]) : '',
      next: () => nx ? col('Next show', [`<b style="font-weight:500">${esc(nx.title)}</b>`, esc(nxd), `<span style="color:${T.muted}">${esc(nx.where)}</span>`]) : ''
    };
    const cols = c.bookOrder.filter(k => P[k] && BC[k]).map(k => BC[k]()).join('');
    const cta = P.button && d.bookingLink ? `<a href="${esc(d.bookingLink)}" class="epk-cta" style="background:${T.metal};color:#14170F">Book ${esc(nm)}</a>` : '';
    B.booking = `<div class="epk-book" style="border-color:${T.line};background:${T.panel}">
        <div class="epk-bhead"><div>${label('booking', 'Booking')}${ed('bookTitle', "Let's work together", 'div', "font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;line-height:1.05", 'A short invite')}</div>${cta}</div>
        ${cols ? `<div class="epk-bgrid" style="border-color:${T.line}">${cols}</div>` : ''}
      </div>`;
    return B;
  }
  function epkRender() {
    const stage = EPK.el && EPK.el.querySelector('.ssx-epk-pages'); if (!stage) return;
    const c = EPK.cfg, d = epkData(), T = epkTheme(c.palette, c.mode), B = epkBlocks(c, d, T), nm = epkName(c, d);
    stage.style.zoom = '1'; stage.innerHTML = '';
    const wave = `<div class="epk-wave" aria-hidden="true">${Array.from({ length: 72 }, (_, i) => `<i style="height:${Math.round(12 + Math.abs(Math.sin(i * .37) * 50 + Math.cos(i * 1.3) * 14))}%;background:linear-gradient(180deg,${T.solid},transparent)"></i>`).join('')}</div>`;
    const foot = `<div class="epk-foot" style="color:${T.muted}">Made by&nbsp;<a href="https://www.setnsettled.com" target="_blank" rel="noopener" style="color:${T.solid}">SetnSettled.com</a></div>`;
    let body = null, n = 0;
    const newPage = () => {
      n++; const pg = document.createElement('section'); pg.className = 'epk-page';
      pg.style.cssText = `background:radial-gradient(700px 520px at 75% 0%, ${T.glow} 0%, ${T.bg} 62%);color:${T.ink}`;
      pg.innerHTML = `${n > 1 ? `<header class="epk-top"><span class="epk-label" style="color:${T.ink};margin:0">${esc(nm)}</span><span class="epk-label epk-pn" style="color:${T.muted};margin:0"></span></header>` : ''}<div class="epk-body"></div><div class="epk-endslot"></div>${wave}${foot}`;
      stage.appendChild(pg); body = pg.querySelector('.epk-body');
    };
    newPage();
    const nhPlace = (k2, cls, html) => { const el = document.createElement('div'); el.className = 'epk-blk ' + cls; el.dataset.blk = k2; el.innerHTML = html; body.appendChild(el); if (el.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom - 4 && body.children.length > 1) { el.remove(); newPage(); body.appendChild(el); } };
    for (const k of c.order) {
      if (['stats', 'played', 'upcoming'].includes(k)) { if (c.show[k]) nhEpk(k, c, T, nhPlace); continue; }
      const def = EPK_BLOCKS.find(b => b[0] === k); if (!def || !c.show[k] || !B[k]) continue;
      const el = document.createElement('div'); el.className = 'epk-blk ' + def[2]; el.dataset.blk = k; el.innerHTML = B[k];
      const slot = () => body.parentElement.querySelector('.epk-endslot');
      const overflows = () => { const lc = body.lastElementChild; return !!lc && lc.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom - 4; };
      body.appendChild(el); epkFitName(el);
      if (overflows() && body.children.length > 1) { el.remove(); newPage(); body.appendChild(el); }
    }
        nhEpkTidy(stage);
    const pages = stage.querySelectorAll('.epk-page'), two = x => String(x).padStart(2, '0');
    pages.forEach((p, i) => { const pn = p.querySelector('.epk-pn'); if (pn) pn.textContent = `${two(i + 1)} / ${two(pages.length)}`; });
    stage.querySelectorAll('[data-epk-k]').forEach(el => el.addEventListener('input', () => { EPK.cfg.text[el.dataset.epkK] = el.innerText.replace(/\n+$/, '').slice(0, 4000); if (el.dataset.epkK === 'name') epkFitName(stage); epkSave(); }));
    stage.querySelectorAll('h1.epk-name').forEach(h => h.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); h.blur(); } }));
    stage.querySelectorAll('img').forEach(img => img.onerror = () => img.remove());
    epkFit(); epkBar(); nhEpkBar();
  }
  const epkSave = () => { clearTimeout(EPK.saveT); EPK.saveT = setTimeout(() => { if (st.db) st.db.doc('settings/epk').set(EPK.cfg).catch(() => {}); }, 600); };
  function epkFit() { const s = EPK.el && EPK.el.querySelector('.ssx-epk-pages'); if (!s) return; const z = Math.min(1, (EPK.el.querySelector('.ssx-epk-stage').clientWidth - 32) / 816); s.style.zoom = String(z); }
  function epkBar() {
    const bar = EPK.el.querySelector('.ssx-epk-opts'), c = EPK.cfg, P = c.parts, all = typeof PALETTES !== 'undefined' ? PALETTES : [['champagne', 'Champagne', ['#D4B26E']]];
    const chips = (list, attr, isOn) => list.map(([k, n]) => `<button type="button" class="ssx-chip" ${attr}="${k}" aria-pressed="${isOn(k)}">${esc(n)}</button>`).join('');
    const nameOf = (list, k) => (list.find(b => b[0] === k) || [k, k])[1];
    const mv = (grp, k, i, len, name) => `<span class="ssx-epk-mv"><button type="button" data-epk-mv="${grp}|${k}|-1" aria-label="Move ${esc(name)} up" ${i ? '' : 'disabled'}>↑</button><button type="button" data-epk-mv="${grp}|${k}|1" aria-label="Move ${esc(name)} down" ${i < len - 1 ? '' : 'disabled'}>↓</button></span>`;
    const row = (attr, k, name, on, mvHtml, lvl) => `<li class="lv${lvl || 0}"><button type="button" class="ssx-chip" ${attr}="${k}" aria-pressed="${!!on}">${esc(name)}</button>${mvHtml || ''}</li>`;
    const rows = c.order.map((k, i) => {
      const nm = nameOf(EPK_BLOCKS, k); let h = row('data-epk-sec', k, nm, c.show[k], mv('order', k, i, c.order.length, nm));
      if (k === 'hero') {
        h += c.heroOrder.map((x, j) => row('data-epk-part', x, nameOf(EPK_HERO, x), P[x], mv('hero', x, j, c.heroOrder.length, nameOf(EPK_HERO, x)), 1)).join('');
        h += row('data-epk-part', 'photo', 'Picture', P.photo, '', 1);
      }
      if (k === 'booking') {
        h += c.bookOrder.map((x, j) => row('data-epk-part', x, nameOf(EPK_BCOLS, x), P[x], mv('book', x, j, c.bookOrder.length, nameOf(EPK_BCOLS, x)), 1) + (x === 'contact' && P.contact ? EPK_CONTACT.map(([y, n]) => row('data-epk-part', y, n, P[y], '', 2)).join('') : '')).join('');
        h += row('data-epk-part', 'button', 'Book button', P.button, '', 1);
      }
      return h;
    }).join('');
    bar.innerHTML = `<div class="ssx-epk-row"><span class="ssx-epk-k">Colors</span>${all.map(([k, n, cs]) => `<button type="button" class="ssx-chip" data-epk-pal="${k}" aria-pressed="${c.palette === k}"><span class="ssx-epk-sw" style="background:linear-gradient(90deg,${cs.slice(0, 4).join(',')})"></span>${esc(n)}</button>`).join('')}</div>
      <div class="ssx-epk-row"><span class="ssx-epk-k">Look</span>${chips([['dark', 'Dark'], ['light', 'Light']], 'data-epk-mode', k => c.mode === k)}</div>
      <div class="ssx-epk-row"><label class="ssx-epk-k" for="ssx-epk-ns">DJ name size</label><input type="range" id="ssx-epk-ns" min="36" max="120" step="2" value="${Number(c.nameSize) || 84}"><span class="note">Long names shrink to fit on one line.</span></div>
      <div class="ssx-epk-row"><span class="ssx-epk-k">Picture size</span>${chips([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], 'data-epk-psize', k => c.photoSize === k)}</div>
      <div class="ssx-epk-row"><span class="ssx-epk-k">Picture shape</span>${chips([['arch', 'Arch'], ['portrait', 'Rectangle'], ['square', 'Square'], ['circle', 'Circle']], 'data-epk-pshape', k => c.photoShape === k)}</div>
      <div class="ssx-epk-row"><span class="ssx-epk-k">Picture side</span>${chips([['left', 'Left'], ['right', 'Right']], 'data-epk-pside', k => c.photoSide === k)}</div>
      <details class="ssx-epk-sec"${EPK.listOpen ? ' open' : ''}><summary>Sections and order</summary>
        <p class="note">Tap anything to show or hide it. Use the arrows to move it. Pages fill in order.</p>
        <ol class="ssx-epk-list">${rows}</ol>
        <button type="button" class="btn small" data-epk-order>Reset order</button>
      </details>`;
    const redo = () => { epkSave(); epkRender(); };
    bar.querySelector('details').ontoggle = e => { EPK.listOpen = e.target.open; };
    bar.querySelectorAll('[data-epk-pal]').forEach(b => b.onclick = () => { c.palette = b.dataset.epkPal; redo(); });
    bar.querySelectorAll('[data-epk-mode]').forEach(b => b.onclick = () => { c.mode = b.dataset.epkMode; redo(); });
    bar.querySelectorAll('[data-epk-psize]').forEach(b => b.onclick = () => { c.photoSize = b.dataset.epkPsize; redo(); });
    bar.querySelectorAll('[data-epk-pshape]').forEach(b => b.onclick = () => { c.photoShape = b.dataset.epkPshape; redo(); });
    bar.querySelectorAll('[data-epk-pside]').forEach(b => b.onclick = () => { c.photoSide = b.dataset.epkPside; redo(); });
    bar.querySelectorAll('[data-epk-sec]').forEach(b => b.onclick = () => { c.show[b.dataset.epkSec] = !c.show[b.dataset.epkSec]; redo(); });
    bar.querySelectorAll('[data-epk-part]').forEach(b => b.onclick = () => { c.parts[b.dataset.epkPart] = !c.parts[b.dataset.epkPart]; redo(); });
    const ns = bar.querySelector('#ssx-epk-ns');
    ns.oninput = () => { c.nameSize = Number(ns.value); epkFitName(EPK.el); };
    ns.onchange = () => { c.nameSize = Number(ns.value); redo(); const n2 = EPK.el.querySelector('#ssx-epk-ns'); if (n2) n2.focus(); };
    const lists = { order: 'order', hero: 'heroOrder', book: 'bookOrder' };
    bar.querySelectorAll('[data-epk-mv]').forEach(b => b.onclick = () => {
      const [g, k, dir] = b.dataset.epkMv.split('|'), arr = c[lists[g]], i = arr.indexOf(k), j = i + Number(dir); if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; redo();
      const nb = EPK.el.querySelector(`[data-epk-mv="${g}|${k}|${dir}"]`); if (nb && !nb.disabled) nb.focus();
    });
    bar.querySelector('[data-epk-order]').onclick = () => { const d0 = epkDefaults(); c.order = d0.order; c.heroOrder = d0.heroOrder; c.bookOrder = d0.bookOrder; redo(); };
  }
    async function openEPK() {
    if (EPK.el) return;
    let saved = null; try { const s = await st.db.doc('settings/epk').get(); if (s.exists) saved = s.data(); } catch (_) {}
    const def = epkDefaults(), sv = saved || {};
    EPK.cfg = { ...def, ...sv, order: epkFixOrder(sv.order, def.order), heroOrder: epkFixOrder(sv.heroOrder, def.heroOrder), bookOrder: epkFixOrder(sv.bookOrder, def.bookOrder),
      show: { ...def.show, ...(sv.order ? (sv.show || {}) : {}) }, parts: { ...def.parts, ...(sv.parts || {}) }, text: { ...(sv.text || {}) } };
    const el = document.createElement('div'); el.id = 'ssx-epk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Create an EPK');
    el.style.cssText = 'position:fixed;inset:0;z-index:200;';
    el.innerHTML = `<div class="ssx-epk-bar">
        <div class="ssx-epk-head"><div><h2>Your EPK</h2><p class="note">Built from your Kit and your shows. Tap any text on the pages to edit it.</p></div>
          <div class="ssx-row"><button type="button" class="btn primary" data-epk-pdf>Download PDF</button><button type="button" class="btn small" data-epk-reset>Reset text to my Kit</button><button type="button" class="btn small" data-epk-close>${EPK.tab ? 'Close tab' : 'Close'}</button>${EPK.tab ? '<a class="btn small" href="/" data-epk-home>← Back to Set & Settled</a>' : ''}</div></div>
        <div class="ssx-epk-opts"></div>
        <p class="note ssx-epk-tip">Download PDF opens your print window. Choose <b>Save as PDF</b> and keep <b>Background graphics</b> on. Links stay clickable in the PDF.</p>
      </div>
      <div class="ssx-epk-stage"><div class="ssx-epk-pages"></div></div>`;
    document.body.appendChild(el); EPK.el = el; document.documentElement.classList.add('ssx-epk-open');
    el.querySelector('[data-epk-close]').onclick = () => { if (EPK.tab) epkCloseTab(); setTimeout(closeEPK, 150); };
    el.querySelector('[data-epk-pdf]').onclick = () => { epkRender(); const t = document.title; document.title = (EPK.cfg.text.name || epkData().name) + ' EPK'; setTimeout(() => { window.print(); document.title = t; }, 80); };
    let armed = false; const rs = el.querySelector('[data-epk-reset]');
    rs.onclick = () => { if (!armed) { armed = true; rs.textContent = 'Tap again to reset'; setTimeout(() => { armed = false; rs.textContent = 'Reset text to my Kit'; }, 4000); return; } armed = false; rs.textContent = 'Reset text to my Kit'; EPK.cfg.text = {}; epkSave(); epkRender(); };
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('[contenteditable]')) closeEPK(); });
    // after editing text, the pages re-flow so nothing gets cut off
    el.addEventListener('focusout', e => { if (!e.target.closest || !e.target.closest('[data-epk-k]')) return; setTimeout(() => { const a = document.activeElement; if (EPK.el && !(a && a.closest && a.closest('[data-epk-k]'))) epkRender(); }, 250); });
    addEventListener('resize', epkFit);
    if (EPK.tab) document.title = 'Your EPK · Set & Settled';
    epkRender();
    try { document.fonts.ready.then(() => { if (EPK.el) epkRender(); }); } catch (_) {}
    const typing = () => { const a = document.activeElement; return a && a.closest && a.closest('#ssx-epk [data-epk-k], #ssx-epk input'); };
    [800, 2000, 4000].forEach(ms => setTimeout(() => { if (EPK.el && !typing()) epkRender(); }, ms));
  }
  // the app has its own close() for forms, so borrow the browser's real "close this tab" from a blank frame
  function epkCloseTab() {
    try { const f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f); const real = f.contentWindow.close; f.remove(); real.call(window); } catch (_) {}
  }
  function closeEPK() { if (!EPK.el) return; EPK.el.remove(); EPK.el = null; document.documentElement.classList.remove('ssx-epk-open'); removeEventListener('resize', epkFit); }
  window.ssOpenEPK = openEPK;
  function mountEpkButton() {
    const sec = document.querySelector('section[data-view="kit"]'), cp = document.getElementById('copyPress'); if (!sec || !cp || document.getElementById('ssx-epk-btn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'ssx-epk-btn'; b.className = 'btn'; b.textContent = 'Create an EPK';
    b.onclick = e => { e.stopPropagation(); // the Home Screen app on a phone can't share a sign-in with a new browser tab, so it opens in place there
      if (standalone()) return openEPK(); const w = window.open(location.origin + '/?epk=1', '_blank'); if (!w) openEPK(); };
    const wrap = document.createElement('div'); wrap.className = 'ssx-row'; cp.replaceWith(wrap); wrap.append(b, cp);
  }
  setInterval(mountEpkButton, 1000);
    /* ---------- Booking link card in the Kit, and a copy of it at the top of Bookings */
  function renderKit() {
    const L = { ...defLink(), ...(st.link || {}) }, link = L.slug ? `${location.origin}/?book=${encodeURIComponent(L.slug)}` : '';
    const spots = [
      ['kit', 'ssx-kit', 'card ssx ssx-kitcard', 'ssx-kiturl', 'Send this to promoters and coordinators so they can request an open date.'],
      ['bookings', 'ssx-bklink', 'card ssx ssx-kitcard', 'ssx-bkurl', 'Copy it and send it to promoters and coordinators. Their requests show up here as Leads.']
    ];
    for (const [view, id, cls, urlId, blurb] of spots) {
      const sec = document.querySelector(`section[data-view="${view}"]`); if (!sec || !st.db) continue;
      let box = document.getElementById(id);
      if (!box) { box = document.createElement('div'); box.id = id; box.className = cls; const head = sec.querySelector(':scope > .head'); head ? head.after(box) : sec.prepend(box); }
      if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') continue;
      box.innerHTML = L.on && link
        ? `<div class="ssx-head"><div><h3>Booking link</h3><p class="note">${blurb}</p></div></div>
           ${linkBox(link, urlId)}
           <div class="ssx-row">${navigator.share ? '<button type="button" class="btn small" data-ssx-share>Share…</button>' : ''}<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Preview</a><button type="button" class="btn small" data-ssx-edit>Edit</button></div>${msgHTML(view)}`
        : `<div class="ssx-head"><div><h3>Booking link</h3><p class="note">Let promoters and coordinators pick an open date and send you a request. Requests show up as Leads.</p></div></div>
           <div class="ssx-row"><button type="button" class="btn primary small" data-ssx-edit>Set up my booking link</button></div>`;
      wireLink(box, link, L, view);
      const ed = box.querySelector('[data-ssx-edit]'); if (ed) ed.onclick = e => { e.stopPropagation(); window.ssShowSettings('bookings', 'ssx-link'); };
    }
  }

  /* ---------- Booking requests from your booking link: shown at the top of Bookings to accept or decline */
  const REQ = { seen: null, busy: '' };
  const pendingRequests = () => { let bs = []; try { bs = S.bookings || []; } catch (_) {} return bs.filter(b => b.source === 'booking-link' && !b.requestStatus && String(b.status || '').toLowerCase() === 'lead').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); };
  const isRequest = b => b && b.source === 'booking-link' && !b.requestStatus && String(b.status || '').toLowerCase() === 'lead';
  async function decideRequest(b, status) {
    const now = new Date().toISOString(), upd = { status, requestStatus: status === 'lost' ? 'declined' : 'accepted', reviewedAt: now, updatedAt: now, stageAt: { [status]: (b.stageAt || {})[status] || todayStr() } };
    const ok = typeof window.patch === 'function' ? await window.patch('bookings', b.id, upd) : null;
    if (!ok) return false;
    REQ.busy = ''; if (window.toast) window.toast(status === 'lost' ? 'Request declined' : 'Booking accepted and confirmed');
    try { if (status === 'confirmed' && typeof syncBookingEvent === 'function') syncBookingEvent(b.id, { ...b, ...upd }); } catch (_) {}
    renderRequests(); return true;
  }
  // Accept / Reply / Decline inside the opened booking, until you decide
  function requestBar(id) {
    const sh = document.querySelector('#sheetRoot .sheet'); if (!sh) return;
    sh.querySelectorAll('.ssx-reqbar').forEach(x => x.remove());
    let b = null; try { b = (S.bookings || []).find(x => x.id === id); } catch (_) {}
    if (!isRequest(b)) return;
    const bar = document.createElement('div'); bar.className = 'ssx-reqbar';
    bar.innerHTML = `<div><b>Booking request</b><p class="note" style="margin:0">Sent through your booking link. Accept to confirm the show, or decline to close it out.</p></div>
      <div class="ssx-row"><button type="button" class="btn primary small" data-rb-ok>Accept</button><button type="button" class="btn small" data-rb-reply>Reply</button><button type="button" class="btn small" data-rb-no>Decline</button></div>`;
    const head = sh.querySelector(':scope > .head') || sh.querySelector('.head'); head ? head.after(bar) : sh.prepend(bar);
    const ok = bar.querySelector('[data-rb-ok]'), no = bar.querySelector('[data-rb-no]'), all = [...bar.querySelectorAll('button')];
    const go = async status => { all.forEach(x => x.disabled = true); const done = await decideRequest(b, status); if (!done) { all.forEach(x => x.disabled = false); return; } bar.remove(); setTimeout(() => { try { if (document.querySelector('#sheetRoot .sheet')) window.bookingView(id); } catch (_) {} }, 400); };
    ok.onclick = e => { e.stopPropagation(); go('confirmed'); };
    no.onclick = e => { e.stopPropagation(); if (!no.dataset.armed) { no.dataset.armed = '1'; no.textContent = 'Tap again to decline'; setTimeout(() => { if (no.isConnected) { delete no.dataset.armed; no.textContent = 'Decline'; } }, 4000); return; } go('lost'); };
    bar.querySelector('[data-rb-reply]').onclick = e => { e.stopPropagation(); apMark('done', 'ack:' + id); ackMail(b); };
  }
  function hookRequestView() {
    const bv = window.bookingView; if (typeof bv !== 'function' || bv.__ssxReq) return;
    const wrapped = function (id) { const out = bv.apply(this, arguments); try { requestBar(id); } catch (err) { console.error(err); } return out; };
    wrapped.__ssxReq = true; window.bookingView = wrapped;
  }
  function renderRequests() {
    const sec = document.querySelector('section[data-view="bookings"]'); if (!sec || !st.db) return;
    const list = pendingRequests();
    // a small count on the Bookings tab
    const tabBtn = document.querySelector('#tabs [data-tab="bookings"]');
    if (tabBtn) { let bd = tabBtn.querySelector('.ssx-badge'); if (list.length) { if (!bd) { bd = document.createElement('span'); bd.className = 'ssx-badge'; tabBtn.appendChild(bd); } bd.textContent = String(list.length); bd.setAttribute('aria-label', `${list.length} new booking request${list.length === 1 ? '' : 's'}`); } else if (bd) bd.remove(); }
    // a heads-up when a new request arrives while the app is open
    const ids = list.map(b => b.id);
    if (REQ.seen && ids.some(id => !REQ.seen.has(id)) && window.toast) window.toast('New booking request. See Bookings.');
    REQ.seen = new Set(ids);
    let box = document.getElementById('ssx-requests');
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'ssx-requests'; box.className = 'card ssx ssx-kitcard ssx-req'; const head = sec.querySelector(':scope > .head'); head ? head.after(box) : sec.prepend(box); }
    if (box.contains(document.activeElement) && document.activeElement.tagName !== 'BODY' && REQ.busy) return;
    const who = b => { let c = null; try { c = contact(b.promoterId || b.venueId); } catch (_) {} return c || {}; };
    const nm = c => { try { return cName(c); } catch (_) { return c.name || c.org || ''; } };
    const when = b => { const d = b.date ? niceDate(b.date) : 'No date'; const t = b.setStart ? time12(b.setStart) + (b.setEnd ? ' – ' + time12(b.setEnd) : '') : ''; return t ? `${d} · ${t}` : d; };
    const notes = b => String(b.notes || '').split('\n').filter(l => !/^Booking request from your link/.test(l)).join('\n').trim();
    box.innerHTML = `<div class="ssx-head"><div><h3>Booking request${list.length === 1 ? '' : 's'} <span class="ssx-pill on">${list.length} new</span></h3><p class="note">Sent through your booking link. Accept to confirm the show, or decline to close it out.</p></div></div>
      <div class="ssx-reqs">${list.map(b => { const c = who(b); return `<div class="ssx-reqitem" data-req="${esc(b.id)}">
        <div class="ssx-reqtop"><div><b>${esc(b.title || 'Booking request')}</b><div class="note">${esc(when(b))}${b.city ? ' · ' + esc(b.city) : ''}</div></div>${b.fee ? `<span class="ssx-pill">Offer $${esc(Number(b.fee).toLocaleString('en-US'))}</span>` : ''}</div>
        <dl class="ssx-reqkv"><dt>From</dt><dd>${esc(nm(c) || 'Someone')}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.phone ? ` · ${esc(c.phone)}` : ''}</dd>${b.address ? `<dt>Address</dt><dd>${esc(b.address)}</dd>` : ''}${notes(b) ? `<dt>Details</dt><dd class="ssx-reqnote">${esc(notes(b))}</dd>` : ''}<dt>Received</dt><dd>${b.createdAt ? esc(new Date(b.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : '—'}</dd></dl>
        <div class="ssx-row"><button type="button" class="btn primary small" data-req-ok>Accept</button><button type="button" class="btn small" data-req-reply>Reply</button><button type="button" class="btn small" data-req-open>Open</button><button type="button" class="btn small" data-req-no>${REQ.busy === 'no:' + b.id ? 'Tap again to decline' : 'Decline'}</button></div>
      </div>`; }).join('')}</div>`;
    box.querySelectorAll('[data-req]').forEach(item => {
      const id = item.dataset.req, b = list.find(x => x.id === id); if (!b) return;
      const decide = status => decideRequest(b, status);
      item.querySelector('[data-req-ok]').onclick = e => { e.stopPropagation(); decide('confirmed'); };
      item.querySelector('[data-req-no]').onclick = e => { e.stopPropagation(); if (REQ.busy !== 'no:' + id) { REQ.busy = 'no:' + id; renderRequests(); setTimeout(() => { if (REQ.busy === 'no:' + id) { REQ.busy = ''; renderRequests(); } }, 4000); return; } decide('lost'); };
      item.querySelector('[data-req-open]').onclick = e => { e.stopPropagation(); try { bookingView(id); } catch (_) {} };
      item.querySelector('[data-req-reply]').onclick = e => { e.stopPropagation(); apMark('done', 'ack:' + id); ackMail(b); };
    });
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
    P = data; window.__ssxBookForm = data.form || null;
  } catch (_) {
    root.innerHTML = `<div class="bk-wrap">${brand()}<div class="bk-card bk-center"><h1>This booking link isn't active</h1><p class="bk-muted">Check the link with the performer who sent it.</p></div></div>`;
    return;
  }
  document.title = `Book ${P.name || 'a performer'} · Set & Settled`;
  const openFrom = addDays(P.today, P.notice), openTo = addDays(P.today, P.ahead), taken = new Set(P.taken || []);
  // "By the time" days (or a date opened for another booking): only start times that fit around other bookings
  const mins = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const E0 = mins(P.earliest) ?? 1080, L0 = mins(P.latest) ?? 1410, LAST = L0 < E0 ? L0 + 1440 : L0, step = Math.max(5, Number(P.step) || 30), gap = Math.max(0, Number(P.gap) || 0), BUSY = P.busy || {}, OPEN = new Set(P.open || []);
  const timed = d => P.mode === 'time' || OPEN.has(d);
  const busyOn = d => { const iv = [...(BUSY[d] || [])]; for (const [a, b] of BUSY[addDays(d, -1)] || []) if (b > 1440) iv.push([a - 1440, b - 1440]); for (const [a, b] of BUSY[addDays(d, 1)] || []) iv.push([a + 1440, b + 1440]); return iv; };
  const slotsFor = (d, len) => { const out = [], iv = busyOn(d); if (!len) return out; for (let t = E0; t <= LAST && out.length < 300; t += step) if (!iv.some(([a, b]) => t < b + gap && t + len + gap > a)) out.push(t); return out; };
  const isOpen = d => d >= openFrom && d <= openTo && P.days.includes(new Date(d + 'T12:00:00').getDay()) && !taken.has(d) && slotsFor(d, Math.min(...P.lengths)).length > 0;
  const hhmm = t => { const x = ((t % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
  // people pick a start and an end time; the length must fall between your shortest and longest choice
  const minLen = Math.min(...P.lengths), maxLen = Math.max(...P.lengths);
  const startTimes = () => slotsFor(S2.date, minLen).map(hhmm);
  const endOpts = () => { const out = [], s0 = mins(S2.start); if (!S2.date || s0 == null) return out; const st0 = s0 < E0 && L0 < E0 ? s0 + 1440 : s0, iv = busyOn(S2.date);
    for (let m = minLen; m <= maxLen && out.length < 200; m += step) { if (iv.some(([a, b]) => st0 < b + gap && st0 + m + gap > a)) break; out.push(m); } return out; };
  const endLabel = m => { const s0 = mins(S2.start) || 0; return `${time12(hhmm(s0 + m))} (${lenLabel(m)})`; };
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
      root.innerHTML = `<div class="bk-wrap">${brand()}<div class="bk-card bk-center"><div class="bk-check" aria-hidden="true">✓</div><h1>Request sent</h1>
        <p>${esc(P.name || 'The performer')} has your request for <b>${esc(niceDate(S2.date))}</b> at <b>${esc(time12(S2.start))}</b> and will reply to you by email.</p>
        <p class="bk-muted">Thank you!</p></div>${foot()}</div>`; return;
    }
    root.innerHTML = `<div class="bk-wrap">
      ${brand()}<header class="bk-hero"><div class="bk-eyebrow">Booking request</div><h1>${esc(P.name || 'Book a performer')}</h1>${P.headline ? `<p>${esc(P.headline)}</p>` : ''}</header>
      <form class="bk-card" id="bk-form" novalidate>
        <section class="bk-step"><h2><span>1</span>Pick a date</h2>${cal()}<p class="bk-muted bk-small">${S2.date ? `Selected: <b>${esc(niceDate(S2.date))}</b>` : 'Open dates are the ones you can tap.'}</p></section>
        <section class="bk-step"><h2><span>2</span>Set time</h2>
          <div class="bk-two"><label class="bk-f">Start time<select id="bk-start" required><option value="">Choose…</option>${startTimes().map(t => `<option value="${t}"${t === S2.start ? ' selected' : ''}>${time12(t)}</option>`).join('')}</select></label>
          <label class="bk-f">End time<select id="bk-end" required><option value="">${S2.start ? 'Choose…' : 'Pick a start time first'}</option>${endOpts().map(m => `<option value="${m}"${m === S2.length ? ' selected' : ''}>${endLabel(m)}</option>`).join('')}</select></label></div></section>
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
    root.querySelectorAll('.bk-day').forEach(b => b.onclick = () => { remember(); S2.date = b.dataset.bkDate; if (!startTimes().includes(S2.start)) { S2.start = ''; S2.length = 0; } else if (!endOpts().includes(S2.length)) S2.length = 0; draw(); root.querySelector('#bk-start').focus(); });
    root.querySelector('#bk-start').onchange = e => { S2.start = e.target.value; if (!endOpts().includes(S2.length)) S2.length = 0; remember(); draw(); const en = root.querySelector('#bk-end'); if (en) en.focus(); };
    root.querySelector('#bk-end').onchange = e => { S2.length = Number(e.target.value) || 0; };
    root.querySelector('#bk-form').onsubmit = submit;
  }
  function brand() { return `<a class="bk-brand" href="${location.origin}/" target="_blank" rel="noopener" aria-label="Set &amp; Settled website"><img src="/favicon.svg" alt="" width="30" height="30"><span>Set &amp; Settled</span></a>`; }
  function remember() { root.__vals = {}; root.querySelectorAll('input[id^="bk-"],textarea[id^="bk-"],select[id^="bk-"]').forEach(el => { if (el.id !== 'bk-start') root.__vals[el.id] = el.value; }); }
  const foot = () => `<footer class="bk-foot">Booking requests by <b>Set & Settled</b> · <a href="/privacy-policy/" target="_blank" rel="noopener">Privacy</a> · <a href="/terms-of-service/" target="_blank" rel="noopener">Terms</a></footer>`;
  async function submit(e) {
    e.preventDefault();
    const v = id => (root.querySelector('#' + id).value || '').trim(), err = root.querySelector('#bk-err'), btn = root.querySelector('#bk-send');
    S2.start = v('bk-start');
    const miss = !S2.date ? 'Pick a date.' : !S2.start ? 'Pick a start time.' : !S2.length ? 'Pick an end time.' : !v('bk-name') ? 'Add your name.' : !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v('bk-email')) ? 'Add a valid email.' : !v('bk-event') ? 'Add the event name.' : !v('bk-city') ? 'Add the city.' : v('bk-fee') && !/^\$?\d[\d,]*(\.\d{1,2})?$/.test(v('bk-fee')) ? 'Write the offer as a number, like 500.' : '';
    if (miss) { err.textContent = miss; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';
    const body = { slug, t: S2.t, website: v('bk-website'), date: S2.date, start: S2.start, length: S2.length, name: v('bk-name'), email: v('bk-email'), phone: v('bk-phone'), org: v('bk-org'), role: v('bk-role'), event: v('bk-event'), venue: v('bk-venue'), city: v('bk-city'), address: v('bk-address'), fee: v('bk-fee'), message: v('bk-msg') };
    const { error } = await sb.functions.invoke('book', { body });
    if (!error) { S2.sent = true; draw(); window.scrollTo(0, 0); return; }
    const code = await fnErr(error);
    if (code === 'time_unavailable') { S2.start = ''; remember(); draw(); root.querySelector('#bk-err').textContent = 'Sorry, that time was just taken. Please pick another start time.'; return; }
    if (code === 'date_unavailable') { taken.add(S2.date); S2.date = ''; remember(); draw(); root.querySelector('#bk-err').textContent = 'Sorry, that date was just taken. Please pick another.'; return; }
    err.textContent = code === 'rate_limited' ? 'Too many requests from your network. Please try again in an hour.' : code === 'bad_email' ? 'Please check your email address.' : code === 'bad_phone' ? 'Please check your phone number.' : code === 'bad_fee' ? 'Write the offer as a number, like 500.' : code === 'not_found' ? "This booking link isn't active anymore." : "Couldn't send your request. Please try again.";
    btn.disabled = false; btn.textContent = 'Send request';
  }
  draw();
}

/* ============================================================== booking request page upgrades
   Runs on the public booking page itself (appExtras doesn't run there). "Who are you?" first, then only the questions that fit; the
   performer's own questions and hidden questions (from the book function's `form`), and service wording for service providers. */
/* -- Booking request page: type a venue or address and pick it from the list; the address and city fill themselves in
   (free place search from OpenStreetMap, the same one the booking form uses). */
const BKX_GEO = { name: '', lat: 0, lon: 0 };
function bkxPlace(input, kind) {
  if (!input || input.__bkxPlace) return; input.__bkxPlace = true; input.setAttribute('autocomplete', 'off');
  const host = input.closest('label') || input.parentElement; host.classList.add('bk-placewrap');
  const box = document.createElement('div'); box.className = 'bk-place'; box.hidden = true; box.setAttribute('role', 'listbox'); input.after(box);
  let timer = 0, seq = 0, picked = '';
  const form = input.closest('form'), el = id => form && form.querySelector('#' + id), close = () => { box.hidden = true; box.innerHTML = ''; };
  const addr = p => [[p.housenumber, p.street].filter(Boolean).join(' '), p.city || p.town || p.village || p.district, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const search = async () => {
    const q = input.value.trim(); if (q.length < 3 || q === picked) return close();
    if (kind === 'org' && ((el('bk-x-kind') || {}).value !== 'venue')) return close();
    const mine = ++seq, city = kind === 'addr' ? '' : ((el('bk-city') || {}).value || '').trim();
    try {
      const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=en&q=${encodeURIComponent((q + (city ? ' ' + city : '')).slice(0, 120))}${kind === 'addr' ? '&layer=house&layer=street' : ''}`); if (!r.ok || mine !== seq) return;
      const list = ((await r.json()).features || []).map(f => { const p = f.properties || {}; return { name: p.name || '', addr: addr(p), city: p.city || p.town || p.village || '', lat: f.geometry && f.geometry.coordinates[1], lon: f.geometry && f.geometry.coordinates[0] }; }).filter(x => kind === 'addr' ? x.addr : x.name);
      if (mine !== seq || document.activeElement !== input) return; if (!list.length) return close();
      box.innerHTML = list.map((x, i) => `<button type="button" role="option" data-i="${i}"><b>${esc(kind === 'addr' ? x.addr : x.name)}</b>${kind !== 'addr' && x.addr ? `<span>${esc(x.addr)}</span>` : ''}</button>`).join(''); box.hidden = false;
      box.querySelectorAll('button').forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = e => { e.preventDefault(); const x = list[+b.dataset.i]; clearTimeout(timer); seq++;
        if (kind === 'addr') { picked = x.addr; input.value = x.addr; } else { picked = x.name; input.value = x.name; const a = el('bk-address'); if (a && x.addr) a.value = x.addr; }
        const c = el('bk-city'); if (c && x.city) c.value = x.city;
        if (x.lat && x.lon) Object.assign(BKX_GEO, { name: kind === 'addr' ? '' : x.name, addr: x.addr, lat: x.lat, lon: x.lon });
        close(); input.dispatchEvent(new Event('change', { bubbles: true })); }; });
    } catch (_) { close(); }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
function bkxFound(f) {
  if (f.querySelector('#bk-x-fv')) return; const msg = f.querySelector('#bk-msg'), host = msg && msg.closest('label'); if (!host) return;
  const V = (document.getElementById('ss-book') || {}).__vals || {}, sv = ((window.__ssxBookForm || {}).group) === 'service';
  const opts = [['', 'Choose…'], ['saw', sv ? 'I saw their work' : 'I saw them play'], ['referral', 'Someone referred me'], ['repeat', "We've worked together before"], ['instagram', 'Instagram'], ['social', 'Other social media'], ['google', 'Google or their website'], ['other', 'Other']];
  const w = document.createElement('div'); w.className = 'bk-two';
  w.innerHTML = `<label class="bk-f">How did you hear about ${sv ? 'us' : 'me'}? <i>(optional)</i><select id="bk-x-fv">${opts.map(([k, l]) => `<option value="${k}"${V['bk-x-fv'] === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="bk-f" ${['saw', 'referral', 'other', 'social'].includes(V['bk-x-fv']) ? '' : 'hidden'}><span id="bk-x-fxl">Tell us more</span><input id="bk-x-fx" maxlength="120" value="${esc(V['bk-x-fx'] || '')}"></label>`;
  host.before(w);
  const sel = w.querySelector('#bk-x-fv'), more = w.querySelector('#bk-x-fx').closest('label'), lab = w.querySelector('#bk-x-fxl');
  const sync = () => { const v = sel.value; more.hidden = !['saw', 'referral', 'other', 'social'].includes(v); lab.textContent = v === 'saw' ? 'Which show or event?' : v === 'referral' ? 'Who referred you?' : v === 'social' ? 'Which one?' : 'Tell us more'; };
  sel.addEventListener('change', sync); sync();
}
function bkxPlaces() { const f = document.querySelector('#ss-book #bk-form'); if (!f) return; bkxFound(f); bkxPlace(f.querySelector('#bk-venue'), 'venue'); bkxPlace(f.querySelector('#bk-org'), 'org'); bkxPlace(f.querySelector('#bk-address'), 'addr'); }
const BKX_KINDS = [
  ['booker', 'I book talent for a venue'], ['venue', 'I run or own a venue'], ['collective', 'I lead a collective or crew'],
  ['promoter', "I'm an independent promoter"], ['private', "I'm planning a private event"], ['other', 'Something else']];
// what the booking server understands: venue, promoter, coordinator, other
const BKX_ROLE = { booker: 'promoter', venue: 'venue', collective: 'promoter', promoter: 'promoter', private: 'coordinator', other: 'other' };
function bkxPage() {
  const main = document.getElementById('ss-book'), form = main && main.querySelector('#bk-form'); if (!form || form.dataset.fl) return;
  form.dataset.fl = '1';
  const $ = s => form.querySelector(s), lab = id => { const i = $('#' + id); return i && i.closest('label'); };
  const two = $('.bk-step:nth-of-type(3) .bk-two'), step3 = two && two.closest('.bk-step'); if (!two) return;
  const V = main.__vals || {}, kindIn = document.createElement('input'); kindIn.type = 'hidden'; kindIn.id = 'bk-x-kind'; kindIn.value = V['bk-x-kind'] || '';
  const fld = (id, label, attrs = '', span) => `<label class="bk-f${span ? ' bk-span' : ''}" data-flk>${label}<input id="${id}" ${attrs}></label>`;
  const opt = ' <i>(optional)</i>';
  // step 3 becomes "About you"; a new step 4 holds the event and the venue
  step3.querySelector('h2').innerHTML = '<span>3</span>About you';
  const who = document.createElement('div'); who.className = 'bk-f'; who.innerHTML = `<span>Who are you?</span><div class="bk-chips ssx-bk-who" role="group" aria-label="Who are you?">${BKX_KINDS.map(([k, l]) => `<button type="button" class="bk-chip" data-flk-who="${k}" aria-pressed="false">${l}</button>`).join('')}</div>`;
  two.before(who, kindIn);
  const me = document.createElement('div'); me.className = 'bk-two ssx-bk-me';
  me.innerHTML = fld('bk-x-title', 'Your title' + opt, 'maxlength="60" placeholder="e.g. Talent buyer, GM"') + fld('bk-x-ig', 'Instagram' + opt, 'maxlength="60" placeholder="@handle"') + fld('bk-x-site', 'Website' + opt, 'type="url" maxlength="200" placeholder="https://"');
  two.after(me);
  const s4 = document.createElement('section'); s4.className = 'bk-step ssx-bk-ev';
  s4.innerHTML = `<h2><span>4</span>About the event</h2><div class="bk-two ssx-bk-ev2"></div><div class="bk-two ssx-bk-ven"></div><div class="bk-two ssx-bk-more"></div>`;
  step3.after(s4);
  const ev2 = s4.querySelector('.ssx-bk-ev2'), ven = s4.querySelector('.ssx-bk-ven'), more = s4.querySelector('.ssx-bk-more');
  ev2.append(lab('bk-event'));
  ev2.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="private">Type of event<select id="bk-x-etype"><option value="">Choose…</option>${['Wedding', 'Birthday', 'Corporate event', 'Holiday party', 'House party', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></label>` + fld('bk-x-guests', 'How many guests?' + opt, 'inputmode="numeric" maxlength="6" placeholder="e.g. 120"').replace('data-flk', 'data-flk="private"'));
  ven.append(lab('bk-venue'), lab('bk-city'), lab('bk-address'));
  ven.insertAdjacentHTML('beforeend', fld('bk-x-vsite', 'Venue website or Instagram' + opt, 'maxlength="200"').replace('data-flk', 'data-flk="venue"') + fld('bk-x-cap', 'Capacity' + opt, 'inputmode="numeric" maxlength="6" placeholder="e.g. 300"').replace('data-flk', 'data-flk="venue"'));
  more.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="ages">Ages<select id="bk-x-ages"><option value="">Choose…</option><option>21+</option><option>18+</option><option>All ages</option></select></label>` + fld('bk-x-lineup', 'Who else is playing?' + opt, 'maxlength="200" placeholder="Other acts on the bill"').replace('data-flk', 'data-flk="lineup"'));
  more.append(lab('bk-fee'));
  more.insertAdjacentHTML('beforeend', `<label class="bk-f" data-flk="rep">Does this night repeat?<select id="bk-x-rep"><option value="">Just this once</option><option value="w1">Every week</option><option value="w2">Every 2 weeks</option><option value="mn">Once a month</option><option value="cu">Something else (tell us in your message)</option></select></label>` + fld('bk-x-repn', 'About how many dates?' + opt, 'inputmode="numeric" maxlength="2" placeholder="e.g. 6"').replace('data-flk', 'data-flk="repn"'));
  const msgL = lab('bk-msg'); s4.append(msgL); const tail = [...step3.children].filter(x => x.matches('.bk-hp, p, button')); s4.append(...tail);
  const msg = $('#bk-msg'); if (msg) msg.maxLength = 1400;
  const roleL = lab('bk-role'); if (roleL) roleL.hidden = true;
  // bring back anything typed before the page redrew (picking a date or a set length redraws it)
  form.querySelectorAll('[id^="bk-x-"]').forEach(x => { if (V[x.id] != null && x.id !== 'bk-x-kind') x.value = V[x.id]; });
  const setLab = (id, text) => { const l = lab(id); if (!l) return; const n = [...l.childNodes].find(c => c.nodeType === 3); if (n) n.textContent = text; const i = l.querySelector('i'); if (i) i.hidden = !/optional/.test(text) ? true : false; };
  const apply = () => {
    const k = kindIn.value, pick = form.querySelectorAll('[data-flk-who]');
    pick.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flkWho === k)));
    const show = (sel, on) => form.querySelectorAll(sel).forEach(x => { x.hidden = !on; });
    const orgL = lab('bk-org'), venL = lab('bk-venue');
    const orgText = { booker: 'Company you work for', venue: 'Venue name', collective: 'Collective or crew name', promoter: 'Company or brand', private: 'Company', other: 'Company or organization' }[k] || 'Company or collective';
    setLab('bk-org', orgText); orgL.querySelector('i') && (orgL.querySelector('i').hidden = k === 'venue' || k === 'collective');
    if (orgL) orgL.hidden = k === 'private';
    setLab('bk-venue', k === 'private' ? 'Where is it?' : k === 'booker' ? 'Venue you book for' : 'Venue');
    if (venL) { venL.hidden = k === 'venue'; const i = venL.querySelector('i'); if (i) i.hidden = k === 'booker'; }
    show('#bk-x-title', true); lab('bk-x-title').hidden = !(k === 'booker' || k === 'venue' || k === 'other');
    lab('bk-x-ig').hidden = !(k === 'collective' || k === 'promoter'); lab('bk-x-site').hidden = !(k === 'collective' || k === 'promoter');
    show('[data-flk="private"]', k === 'private'); show('[data-flk="venue"]', k !== 'private'); show('[data-flk="ages"]', k !== 'private'); show('[data-flk="lineup"]', k !== 'private');
    setLab('bk-event', k === 'private' ? "What's the occasion?" : 'Event name');
    const ev = $('#bk-event'); if (ev) ev.placeholder = k === 'private' ? "e.g. Maria's 30th birthday" : 'e.g. Saturday night at the club';
    const role = $('#bk-role'); if (role) role.value = BKX_ROLE[k] || 'other';
    me.hidden = !k || [...me.querySelectorAll('label')].every(l => l.hidden);
    const rp = $('#bk-x-rep'); if (rp) rp.onchange = apply; show('[data-flk="rep"]', k !== 'private'); show('[data-flk="repn"]', k !== 'private' && !!(rp && rp.value));
    s4.hidden = !k; two.hidden = !k;
  };
  form.querySelectorAll('[data-flk-who]').forEach(b => b.onclick = () => { kindIn.value = b.dataset.flkWho; apply(); const f = $('#bk-name'); if (f && !f.value) f.focus(); });
  apply();
  bkxCustom({ form, main, $, lab, s4, msgL, who, kindIn, apply });
}
// the performer's choices for this page
const BKX_HIDE = { phone: 'bk-phone', title: 'bk-x-title', ig: 'bk-x-ig', site: 'bk-x-site', vsite: 'bk-x-vsite', cap: 'bk-x-cap', ages: 'bk-x-ages', lineup: 'bk-x-lineup', etype: 'bk-x-etype', guests: 'bk-x-guests', address: 'bk-address', fee: 'bk-fee', rep: 'bk-x-rep' };
function bkxCustom(o) {
  const F = window.__ssxBookForm; if (!F) return;
  const { form, main, $, lab, s4, msgL, who, kindIn, apply } = o, svc = F.group === 'service';
  const off = new Set(F.hide || []); if (svc) ['title', 'ig', 'site', 'vsite', 'cap', 'ages', 'lineup', 'etype', 'guests', 'rep'].forEach(k => off.add(k));
  const hide = id => { const l = lab(id); if (l) l.classList.add('ssx-bk-off'); };
  for (const [k, id] of Object.entries(BKX_HIDE)) if (off.has(k)) { hide(id); if (k === 'rep') hide('bk-x-repn'); }
  const txt = (el, t) => { if (!el) return; const n = [...el.childNodes].find(c => c.nodeType === 3 && c.nodeValue.trim()); if (n) n.nodeValue = t; };
  if (svc) {
    // a client booking an appointment: no "who are you", no venue or company, appointment wording
    hide('bk-venue'); hide('bk-org'); who.classList.add('ssx-bk-off'); kindIn.value = 'private'; apply();
    const h2 = form.querySelectorAll('.bk-step h2'); if (h2[1]) h2[1].innerHTML = '<span>2</span>Time'; s4.querySelector('h2').innerHTML = '<span>4</span>About your appointment';
    const len = [...form.querySelectorAll('.bk-f > span')].find(x => /Set length/.test(x.textContent)); if (len) len.textContent = 'How long';
    txt(lab('bk-event'), "What's it for? "); const ev = $('#bk-event'); if (ev) ev.placeholder = 'e.g. Small forearm piece, 60-minute massage';
    txt(lab('bk-fee'), 'Your budget in $ '); const m = $('#bk-msg'); if (m) m.placeholder = 'What you have in mind, references, any questions…';
  }
  // their own questions, just above "Anything else?"
  if ((F.ask || []).length && !form.querySelector('.ssx-bk-q')) {
    const V = main.__vals || {}, box = document.createElement('div'); box.className = 'bk-two ssx-bk-q';
    box.innerHTML = F.ask.map(q => {
      const id = 'bk-q-' + q.id, head = esc(q.label) + (q.req ? '' : ' <i>(optional)</i>');
      const ctl = q.type === 'long' ? `<textarea id="${id}" rows="3" maxlength="200"></textarea>`
        : q.type === 'yesno' || q.type === 'choice' ? `<select id="${id}"><option value="">Choose…</option>${(q.type === 'yesno' ? ['Yes', 'No'] : q.options || []).map(x => `<option>${esc(x)}</option>`).join('')}</select>`
        : `<input id="${id}" maxlength="200" ${q.type === 'number' ? 'inputmode="decimal"' : ''}>`;
      return `<label class="bk-f${q.type === 'long' ? ' bk-span' : ''}">${head}${ctl}</label>`;
    }).join('');
    msgL ? msgL.before(box) : s4.appendChild(box);
    box.querySelectorAll('[id^="bk-q-"]').forEach(x => { if (V[x.id] != null) x.value = V[x.id]; });
  }
}
// on send: pack the extra answers for the performer's app, then let the page send it as usual
function bkxSubmit(e) {
  const form = e.target; if (!form || form.id !== 'bk-form' || !form.dataset.fl) return;
  const $ = s => form.querySelector(s), v = id => (($('#' + id) || {}).value || '').trim(), err = $('#bk-err'), k = v('bk-x-kind');
  const stop = t => { e.preventDefault(); e.stopImmediatePropagation(); if (err) { err.textContent = t; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  if (!k) return stop('Tell us who you are: tap the option under "Who are you?".');
  if ((k === 'venue' || k === 'collective') && !v('bk-org')) { $('#bk-org').focus(); return stop(k === 'venue' ? 'Add the venue name.' : 'Add the name of your collective or crew.'); }
  if (k === 'booker' && !v('bk-venue')) { $('#bk-venue').focus(); return stop('Add the venue you book for.'); }
  if (k === 'venue') $('#bk-venue').value = v('bk-org');
  const F = window.__ssxBookForm;
  for (const q of (F && F.ask) || []) if (q.req && !v('bk-q-' + q.id)) { const el = $('#bk-q-' + q.id); if (el) el.focus(); return stop(`Please answer "${q.label}".`); }
  const d = { k }; [['t', 'bk-x-title'], ['ig', 'bk-x-ig'], ['site', 'bk-x-site'], ['vsite', 'bk-x-vsite'], ['cap', 'bk-x-cap'], ['ages', 'bk-x-ages'], ['lineup', 'bk-x-lineup'], ['et', 'bk-x-etype'], ['g', 'bk-x-guests'], ['rf', 'bk-x-rep'], ['rn', 'bk-x-repn']].forEach(([a, id]) => { const x = v(id); if (x) d[a] = x.slice(0, 200); });
  const msg = $('#bk-msg'); if (!msg) return;
  [['fv', 'bk-x-fv'], ['fx', 'bk-x-fx']].forEach(([a, id]) => { const x = v(id); if (x) d[a] = x.slice(0, 120); });
  for (const q of (F && F.ask) || []) { const x = v('bk-q-' + q.id); if (x) (d.q = d.q || {})[q.id] = x.slice(0, 200); }
  const own = msg.value.replace(/\n*\[details\]\{[\s\S]*$/, ''), full = (own.trim() ? own.trim() + '\n\n' : '') + '[details]' + JSON.stringify(d);
  if (full.length > 2000) { msg.focus(); return stop(`Your message is ${full.length - 2000} characters too long. Shorten "Anything else?" and send again.`); }
  msg.value = full;
  setTimeout(() => { msg.value = own; }, 0); // the page reads the message right away; put back what they typed
}
if (/[?&]book=/.test(location.search)) {
  const mo = new MutationObserver(() => { try { bkxPage(); bkxPlaces(); } catch (err) { console.error(err); } });
  const start = () => { mo.observe(document.body, { childList: true, subtree: true }); bkxPage(); bkxPlaces(); };
  document.body ? start() : document.addEventListener('DOMContentLoaded', start);
  document.addEventListener('submit', bkxSubmit, true);
}
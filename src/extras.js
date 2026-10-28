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
    speedUp(); submitGuard(); routeProfile(); hookFinance(); hookRequestView();
    st.db = await window.claude.use('db');
    if (!st.db) return;
    hookAutopilot(); hookLayout();
    st.db.doc('settings/notify').onSnapshot(s => { st.prefs = s.exists ? s.data() : {}; render(); queueSoon(); }, () => {});
        st.db.doc('settings/profile').onSnapshot(() => setTimeout(() => fillProfile(), 0), () => {});
    st.db.doc('settings/bookinglink').onSnapshot(s => { st.link = s.exists ? s.data() : {}; render(); renderKit(); }, () => {});
    st.db.collection('goals').onSnapshot(s => { st.goals = s.docs.map(d => ({ id: d.id, ...d.data() })); renderGoals(); renderHomeGoals(); queueSoon(); }, () => {});
    let lastB = null; setInterval(() => { try { if (S.bookings !== lastB) { lastB = S.bookings; renderGoals(); renderHomeGoals(); renderRequests(); } } catch (_) {} }, 1000);
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

  /* ---------- First-time walkthrough: offered once to new performers, can be skipped, replay from Settings */
    const TOUR = [
    { title: 'Welcome to Set & Settled', body: 'Your home base as a performer: bookings, tasks, money, outreach, goals and your press kit in one place. This quick tour shows you around and helps you set up the basics. About 3 minutes.' },
    { tab: 'home', target: '#ssx-railbtn', title: 'Your menu', body: 'Every page lives in the menu on the left. Tap this button at the top to fold the menu away when you want more room, and tap it again to bring it back.' },
    { tab: 'settings', group: 'profile', target: '#ssx-profile', title: 'Start with your profile', body: 'Your DJ name, contact details, website and Instagram live right here. They fill in your Kit, EPK, emails, invoices and booking page so you only type them once.' },
    { tab: 'settings', group: 'look', target: '#palPick', title: 'Make it yours', body: 'Pick a color theme (Champagne is the default) and switch between Light and Dark. Your choice follows you on every device.' },
    { tab: 'goals', target: '#ssx-goals', title: 'Set your goals', body: 'Track followers, releases, shows and income. Some goals count themselves from your bookings, checklist goals can have a due date for every step, and your progress shows on Home.', action: ['Add a goal', () => { const b = document.querySelector('[data-ssx-gadd]'); b && b.click(); }] },
    { tab: 'settings', group: 'bookings', target: '#ssx-link', title: 'Share when you are available', body: 'Turn on your booking link, pick the days you play and block dates you are away. Promoters pick an open date and their request lands in Bookings as a Lead.' },
    { tab: 'settings', group: 'google', target: '#ss-google', title: 'Connect Google', body: 'Connect Gmail to send emails and invoices from your own address, Drive to keep your files together and Calendar to see your shows. You choose what to connect.' },
    { tab: 'bookings', target: '[data-new="booking"]', title: 'Every show in one list', body: 'Add a show and move it from Lead to Confirmed, Played and Paid. Each stage adds its own checklist, with due dates set from the show date.' },
    { tab: 'calendar', target: '#blockBtn', title: 'See your month', body: 'All your shows on a calendar. Block dates here too, and they close on your booking link.' },
    { tab: 'tasks', target: '#newTask', title: 'Never miss a step', body: 'Contracts, deposits, promo posts and set prep, sorted by due date. Due dates never land in the past, and Reminders can nudge you when things are due.' },
    { tab: 'kit', target: '#ssx-kit', title: 'Your Kit', body: 'Bio, photos, mixes, socials and riders in one spot, with your booking link ready to copy. Copy your whole press info into an email in one tap.' },
    { tab: 'kit', target: '#ssx-epk-btn', title: 'Create an EPK', body: 'Turn your Kit and shows into a designed press kit. Pick colors, Light or Dark, and which sections to include, move them around, edit any text, then download a PDF to send to venues.', action: ['Create my EPK', () => openEPK()] },
    { tab: 'contacts', target: '[data-new="contact"]', title: 'Your people', body: 'Promoters, venues, photographers and collaborators. Link them to shows so you always know who to follow up with.' },
    { tab: 'comms', target: '[data-new="template"]', title: 'Emails and templates', body: 'Save your go-to emails for pitches, confirmations and thank-yous, then fill them in from any show. Minimize an email to keep it in the corner, then tap + to reopen it or × to discard it.' },
    { tab: 'money', target: '[data-new="expense"]', title: 'Financials', body: 'Log income and expenses, send invoices and see what you have earned this season.' },
    { tab: 'settings', group: 'email', target: '#ss-signature', title: 'Email signature and payments', body: 'Add your email signature and how you like to be paid, so every email and invoice goes out looking finished.' },
    { tab: 'settings', group: 'reminders', target: '#ssx-notify', title: 'Reminders', body: 'Choose phone and laptop alerts, a morning email digest, or both. Reminders come from your task and goal due dates.' },
    { title: "You're all set", body: 'That is the tour. You can take it again anytime from Settings, under Account. Have a great season!' },
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
    TS.onMove = () => placeTour();
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
    host.innerHTML = `<div class="card ssx" id="ssx-tourcard"><div class="ssx-head"><div><h3>App tour</h3><p class="note">A 2-minute walk through everything Set & Settled can do, and help setting up the basics.</p></div></div><div class="ssx-row"><button type="button" class="btn primary small" data-ssx-treplay>Take the tour</button></div></div>`;
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
    L.push('This packet organizes your records; it is not tax advice. Line numbers refer to the federal IRS Schedule C. California starts from the same federal figures on Form 540 and adjusts some items on Schedule CA.');
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
  const stat = b => String(b.status || '').toLowerCase();
  const bName = b => { try { return bookingName(b); } catch (_) { return b.title || 'your show'; } };
  const person = id => { try { return contact(id) || null; } catch (_) { return null; } };
  // estimated tax due dates for a tax year (weekends move to Monday); California has no September payment
  const estDates = y => { const adj = d => { const x = new Date(d + 'T12:00:00'), w = x.getDay(); if (w === 6) x.setDate(x.getDate() + 2); if (w === 0) x.setDate(x.getDate() + 1); return isoLocal(x); };
    return [[`${y}-04-15`, 'Q1', 30], [`${y}-06-15`, 'Q2', 40], [`${y}-09-15`, 'Q3', 0], [`${y + 1}-01-15`, 'Q4', 30]].map(([d, q, ca]) => ({ date: adj(d), q, ca, year: y })); };
  const nextDue = () => { const t = todayStr(), y = +t.slice(0, 4); return [...estDates(y - 1), ...estDates(y)].find(x => x.date >= t); };
  function taxNumbers(y) {
    let d = null; try { d = window.taxData(yearR(y)); } catch (_) {}
    const c = apCfg(), rate = Math.max(0, Math.min(60, Number(c.taxRate) || 25)) / 100;
    const miles = AP.mileage.filter(m => String(m.date || '').startsWith(String(y))).reduce((s, m) => s + (+m.miles || 0), 0);
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
  const thanksMail = b => tplOr('stage-played', b, `Thank you for ${bName(b)}`, `Hi {first},\n\nThank you for having me at ${bName(b)}. I had a great time and would love to come back.${b.driveUrl ? `\n\nPhotos and video will be here: ${b.driveUrl}` : ''}\n\nLet me know if you have other dates coming up.\n\nThanks again,\n${myName()}`);
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
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  function renderUpNext() {
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
    await st.db.collection('mileage').doc('m-' + b.id).set({ date: b.date, miles, purpose: `Round trip${from} to ${where} for ${bName(b)}`, bookingId: b.id, auto: !!o.auto, createdAt: new Date().toISOString() });
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
    return bk().filter(b => ['confirmed', 'played', 'paid'].includes(stat(b)) && b.date && b.date < t && String(b.date).startsWith(y) && !logged.has(b.id) && !c.noDrive[b.id] && !pend[b.id] && !failed(b.id) && destOf(b));
  }
  // confirmed shows still to come: measured ahead so you can see the miles
  function upcomingShows() {
    const t = todayStr();
    return bk().filter(b => stat(b) === 'confirmed' && b.date && b.date >= t).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  async function autoMiles() {
    const c = apCfg(); if (GEO.busy || !c.autoMiles || !c.home || !c.home.lat || !st.db) return;
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
          if (far) apSave({ pend: { ...(apCfg().pend || {}), [b.id]: { mi: one, city, approx } } });
          else { await logTrip(b, one, { auto: true, from: start ? start.label || 'your start address' : 'home', custom: !!start }); if (window.toast) window.toast(`Logged ${Math.round(one * 2 * 10) / 10} mi for ${bName(b)}`); }
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
    const c = apCfg(), t = todayStr(), y = +t.slice(0, 4), tn = taxNumbers(y), nd = nextDue(), $ = n => '$' + Math.round(n).toLocaleString('en-US');
    const pays = (c.estPayments || []).filter(p => +p.year === y).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const ly = y - 1, m0 = +t.slice(5, 7), nec = ly >= 2026 ? 2000 : 600;
    let payers = []; if (m0 <= 4) { try { payers = window.taxData(yearR(ly)).byPayer.filter(([, v]) => v.amt >= nec); } catch (_) {} }
    const home = c.home || {}, far = Number(c.farMiles) || 50, pendL = Object.entries(c.pend || {}).map(([id, p]) => [bk().find(b => b.id === id), p]).filter(([b]) => b);
    const autoOn = !!(c.autoMiles && home.lat), upc = autoOn ? upcomingShows() : [];
    const ml = mileageToLog(), trips = AP.mileage.filter(m => String(m.date || '').startsWith(String(y))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    wrap.innerHTML = `
    <div class="card ssx" id="ssx-tax">
      <div class="ssx-head"><div><h3>Taxes</h3><p class="note">What to set aside from your ${y} profit, and your estimated payments. Self-employed people usually pay four times a year.</p></div></div>
      <div class="stats ssx-tstats"><div class="stat"><span class="eyebrow">Profit so far</span><b class="num">${$(tn.net)}</b><span class="hint">after expenses${tn.miles ? ' and mileage' : ''}</span></div>
        <div class="stat"><span class="eyebrow">Set aside (${Math.round(tn.rate * 100)}%)</span><b class="num">${$(tn.setAside)}</b><span class="hint">change the rate below</span></div>
        <div class="stat"><span class="eyebrow">Paid so far</span><b class="num">${$(tn.paid)}</b><span class="hint">${pays.length} estimated payment${pays.length === 1 ? '' : 's'}</span></div></div>
      ${nd ? `<p class="ssx-msg">Next estimated payment: <b>${esc(nd.q)} ${nd.year}, due ${esc(niceDate(nd.date))}</b>${nd.ca ? ` (federal, and California ${nd.ca}%)` : ' (federal only; California skips September)'}. Still unpaid from what you've set aside: <b>${$(Math.max(0, tn.setAside - tn.paid))}</b>.</p>` : ''}
      <div class="ssx-row"><label class="ssx-inline" for="ssx-rate">Set aside <input id="ssx-rate" type="number" min="0" max="60" step="1" inputmode="numeric" value="${esc(c.taxRate ?? 25)}" style="width:76px"> % of profit</label><a class="btn small" href="https://www.irs.gov/payments/direct-pay" target="_blank" rel="noopener">Pay the IRS</a><a class="btn small" href="https://www.ftb.ca.gov/pay/bank-account/index.asp" target="_blank" rel="noopener">Pay California</a></div>
      <details class="ssx-det"><summary>Log an estimated payment</summary>
        <div class="ssx-grid2"><div class="f"><label for="ssx-ep-d">Date paid</label><input id="ssx-ep-d" type="date" value="${esc(t)}"></div><div class="f"><label for="ssx-ep-a">Amount ($)</label><input id="ssx-ep-a" type="number" inputmode="decimal" min="0" step="0.01"></div>
          <div class="f"><label for="ssx-ep-w">Paid to</label><select id="ssx-ep-w"><option value="IRS">IRS (federal)</option><option value="CA">California FTB</option></select></div><div class="f"><label for="ssx-ep-q">For</label><select id="ssx-ep-q">${[...estDates(y - 1).slice(3), ...estDates(y)].map(x => `<option value="${x.year}|${x.q}" ${nd && nd.q === x.q && nd.year === x.year ? 'selected' : ''}>${x.q} ${x.year} (due ${esc(niceDate(x.date))})</option>`).join('')}</select></div></div>
        <div class="ssx-row"><button type="button" class="btn primary small" data-ep-add>Save payment</button></div></details>
      ${pays.length ? `<div class="ssx-mini">${pays.map(p => `<div><span>${esc(niceDate(p.date))} · ${esc(p.agency === 'CA' ? 'California' : 'IRS')} · ${esc(p.q)} ${esc(p.year)}</span><b class="num">$${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b><button type="button" class="ssx-upx" data-ep-del="${esc(p.id)}" aria-label="Remove payment">×</button></div>`).join('')}</div>` : ''}
      ${payers.length ? `<div class="ssx-opt"><b>1099s to expect for ${ly}</b><p class="note" style="margin:0">Payers who paid you ${$(nec)} or more. They're due by January 31. Check them off as they arrive and compare the amounts.</p>${payers.map(([n, v]) => { const k = `${ly}|${n}`; return `<label class="ssx-check"><input type="checkbox" data-1099="${esc(k)}" ${c.got1099[k] ? 'checked' : ''}> ${esc(n)} · ${$(v.amt)}</label>`; }).join('')}</div>` : ''}
      <p class="note" style="margin:0">A rough guide, not tax advice: 25–30% of profit covers self-employment tax plus income tax for many performers. Your preparer can fine-tune it.</p>
    </div>
    <div class="card ssx" id="ssx-miles">
      <div class="ssx-head"><div><h3>Mileage</h3><p class="note">${y}: ${trips.reduce((s, m) => s + (+m.miles || 0), 0).toLocaleString('en-US')} miles · about ${$(tn.mileDed)} deduction at the IRS rate of ${(mileRate(y) * 100).toFixed(1)}¢ a mile${MILE_RATE[y] ? '' : ' (check this year\'s rate)'}.</p></div>
        <label class="ssx-switch"><input type="checkbox" id="ssx-am-on" ${c.autoMiles ? 'checked' : ''} aria-label="Count miles automatically"><span></span></label></div>
      <div class="ssx-opt ssx-am">
        <b>Count miles automatically ${c.autoMiles ? (home.lat ? '<span class="ssx-pill on">On</span>' : '<span class="ssx-pill">Needs your home address</span>') : '<span class="ssx-pill">Off</span>'}</b>
        <p class="note" style="margin:0">After each show, the app measures the drive from your home to the venue and logs the round trip. If a show is in another city or more than ${esc(far)} miles away, it asks where you left from first.</p>
        <details class="ssx-det" ${home.lat ? '' : 'open'}><summary>Home address and settings</summary>
        <div class="ssx-grid2"><div class="f"><label for="ssx-am-home">Home (starting address)</label><input id="ssx-am-home" autocomplete="street-address" maxlength="200" placeholder="Street, city, state" value="${esc(home.address || '')}"></div>
          <div class="f"><label for="ssx-am-far">Ask me when it's more than (miles one way)</label><input id="ssx-am-far" type="number" min="5" max="500" step="5" inputmode="numeric" value="${esc(far)}"></div></div>
        <div class="ssx-row"><button type="button" class="btn small primary" data-am-save>Save</button>${home.city ? `<span class="note" style="margin:0">Home city: ${esc(home.city)}</span>` : ''}</div>
        <p class="note" style="margin:0">Addresses are looked up with OpenStreetMap to measure the drive; nothing else is shared. Drives from home count when home is your main place of business (a home studio usually qualifies). Your preparer can confirm.</p><p class="note" style="margin:0;font-size:11px">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Routes by <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a></p></details>
      </div>
      ${pendL.length ? `<div class="ssx-uplist ssx-pend"><b>Where did you drive from?</b>${pendL.map(([b, p]) => `<div class="ssx-upi" data-pd="${esc(b.id)}"><span class="ssx-upic">📍</span><span class="ssx-uptx"><b>${esc(bName(b))}</b> · ${esc(niceDate(b.date))}${p.city ? ' · ' + esc(p.city) : ''}${p.mi ? ` · ${p.approx ? 'about ' : ''}${p.mi} mi one way from home` : ''}${p.approx ? ' (measured to the city center)' : ''}</span><span class="ssx-upbt">${p.mi || home.lat ? `<button type="button" class="btn small primary" data-pd-home>From home${p.mi ? ` (${Math.round(p.mi * 2 * 10) / 10} mi)` : ''}</button>` : ''}<button type="button" class="btn small" data-pd-other>Different start</button><button type="button" class="btn small" data-pd-no>Didn't drive</button></span>
        <div class="ssx-row ssx-pdform" hidden><input data-pd-addr maxlength="200" placeholder="Where you left from (hotel, friend's place…)" aria-label="Starting address" style="flex:1 1 220px"><button type="button" class="btn small primary" data-pd-go>Measure and log</button></div></div>`).join('')}</div>` : ''}
      ${ml.length ? `<div class="ssx-uplist">${ml.slice(0, 6).map(b => { const k = venueKey(b), known = c.venueMiles[k]; return `<div class="ssx-upi" data-ml="${esc(b.id)}"><span class="ssx-upic">🚗</span><span class="ssx-uptx"><b>${esc(bName(b))}</b> · ${esc(niceDate(b.date))}${known ? ` · ${known * 2} mi round trip` : ''}${autoOn ? `<br><span class="note">${!destOf(b) ? 'No address on this booking yet. Add one and the miles count themselves.' : (GEO.fail[b.id] || {}).why === 'noroute' ? 'No driving route found to this address.' : "Couldn't find this address automatically. Check the spelling, or enter the miles."}</span>` : ''}</span><span class="ssx-upbt">${autoOn && !destOf(b) ? '<button type="button" class="btn small" data-ml-addr>Add address</button>' : ''}${known ? `<button type="button" class="btn small primary" data-ml-ok>Log ${known * 2} mi</button>` : `<input type="number" min="0" step="0.1" inputmode="decimal" placeholder="Miles one way" aria-label="Miles one way" style="width:120px" data-ml-in><button type="button" class="btn small primary" data-ml-ok>Log</button>`}<button type="button" class="btn small" data-ml-no>Didn't drive</button></span></div>`; }).join('')}</div>${ml.length > 6 ? `<p class="note" style="margin:0">+ ${ml.length - 6} more</p>` : ''}<p class="note" style="margin:0">Enter the one-way miles once per venue. Next time you play there, it's one tap.</p>` : autoOn ? '' : '<p class="note" style="margin:0">Played shows with a venue or address show up here to log in one tap.</p>'}
      ${autoOn && upc.length ? `<details class="ssx-det" open><summary>Coming up (${upc.length})</summary><div class="ssx-mini">${upc.slice(0, 12).map(b => { const d = destOf(b), x = (c.est || {})[b.id]; return `<div><span>${esc(niceDate(b.date))} · ${esc(bName(b))}${x && x.city ? ' · ' + esc(x.city) : ''}</span><b class="num">${!d ? '<span class="note">no address</span>' : x && d && x.q === d.q ? `${x.approx ? '~' : ''}${Math.round(x.mi * 2 * 10) / 10} mi` : failed(b.id) ? '<span class="note">not found</span>' : '<span class="note">measuring…</span>'}</b></div>`; }).join('')}</div><p class="note" style="margin:6px 0 0">Round trips from home. Each one is logged after the show${far ? `, or asks you first if it's out of town or over ${esc(far)} miles` : ''}.</p></details>` : ''}
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
      row.querySelector('[data-pd-other]').onclick = e => { e.stopPropagation(); form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); };
      row.querySelector('[data-pd-no]').onclick = e => { e.stopPropagation(); const cc = apCfg(), pend = { ...(cc.pend || {}) }; delete pend[b.id]; apSave({ pend, noDrive: { ...cc.noDrive, [b.id]: true } }); };
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
      const body = `Estimated tax payment (${x.q} ${x.year}) is due ${niceDate(x.date)}${x.ca ? '. California is due the same day' : ''}. See how much to pay in Financials, then log it there.`;
      out.push({ id: `est:${x.year}${x.q}:w`, at: addDays(x.date, -7), kind: 'note', show: 'Estimated taxes', body }, { id: `est:${x.year}${x.q}:d`, at: x.date, kind: 'note', show: 'Estimated taxes', body });
    }
    const y = +t.slice(0, 4);
    out.push({ id: `1099:${y - 1}`, at: `${y}-02-02`, kind: 'note', show: 'Tax season', body: `Your ${y - 1} 1099s should have arrived. Check them off in Financials and compare the amounts.` },
      { id: `pack:${y - 1}`, at: `${y}-02-15`, kind: 'note', show: 'Tax season', body: `Your ${y - 1} tax packet is ready: Financials, then Tax report, then Download tax packet.` });
    return out.filter(i => i.at >= addDays(t, -7));
  }

  /* -- for the tax packet */
  function apPacket(R) {
    const y = R.year || +String(R.to).slice(0, 4), c = apCfg();
    const trips = AP.mileage.filter(m => String(m.date || '') >= R.from && String(m.date || '') <= R.to).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const miles = trips.reduce((s, m) => s + (+m.miles || 0), 0), pays = (c.estPayments || []).filter(p => +p.year === y);
    const lines = ['', 'TRACKED IN THE APP'];
    lines.push(`  Mileage: ${miles.toLocaleString('en-US')} business miles in ${trips.length} trip${trips.length === 1 ? '' : 's'}${MILE_RATE[y] ? `, about $${Math.round(miles * MILE_RATE[y]).toLocaleString('en-US')} at the IRS standard rate of ${(MILE_RATE[y] * 100).toFixed(1)} cents` : ''}. Log in "05 Mileage log.csv". Your preparer will choose standard mileage or actual car costs.`);
    if (pays.length) { lines.push(`  Estimated tax payments for ${y}:`); pays.sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(p => lines.push(`    - ${p.date} ${p.agency === 'CA' ? 'California FTB' : 'IRS'} ${p.q}: $${Number(p.amount).toFixed(2)}`)); }
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
    setInterval(() => apTick(false), 1000);
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
    home: { label: 'Home', blocks: [['welcome', 'Getting started', byId('welcome'), 1], ['upnext', 'Up next', byId('ssx-upnext'), 1], ['next', 'Next show', byId('nextShow')], ['season', 'Season goals', sec => sec.querySelector(':scope > .grid')], ['goals', 'Goals', byId('ssx-home-goals'), 1], ['todo', 'To do', byH3('to do')], ['pipeline', 'Pipeline', byH3('pipeline')], ['played', "Where you've played", byH3('where you')]] },
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
    for (const k of c.order) {
      const def = EPK_BLOCKS.find(b => b[0] === k); if (!def || !c.show[k] || !B[k]) continue;
      const el = document.createElement('div'); el.className = 'epk-blk ' + def[2]; el.dataset.blk = k; el.innerHTML = B[k];
      const slot = () => body.parentElement.querySelector('.epk-endslot');
      const overflows = () => { const lc = body.lastElementChild; return !!lc && lc.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom - 4; };
      if (k === 'booking') {
        // booking sits at the bottom of its page as a closing panel
        el.classList.add('epk-pinned'); slot().appendChild(el);
        if (overflows()) { el.remove(); newPage(); slot().appendChild(el); }
        continue;
      }
      body.appendChild(el); epkFitName(el);
      if (overflows() && body.children.length > 1) { el.remove(); newPage(); body.appendChild(el); }
    }
    // a page that only holds the booking panel becomes a closing page
    stage.querySelectorAll('.epk-page').forEach(pg => { if (!pg.querySelector('.epk-body').children.length && pg.querySelector('.epk-pinned')) pg.classList.add('epk-closing'); });
    const pages = stage.querySelectorAll('.epk-page'), two = x => String(x).padStart(2, '0');
    pages.forEach((p, i) => { const pn = p.querySelector('.epk-pn'); if (pn) pn.textContent = `${two(i + 1)} / ${two(pages.length)}`; });
    stage.querySelectorAll('[data-epk-k]').forEach(el => el.addEventListener('input', () => { EPK.cfg.text[el.dataset.epkK] = el.innerText.replace(/\n+$/, '').slice(0, 4000); if (el.dataset.epkK === 'name') epkFitName(stage); epkSave(); }));
    stage.querySelectorAll('h1.epk-name').forEach(h => h.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); h.blur(); } }));
    stage.querySelectorAll('img').forEach(img => img.onerror = () => img.remove());
    epkFit(); epkBar();
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
    bar.querySelector('[data-rb-reply]').onclick = e => { e.stopPropagation(); try { composeSheet({ booking: id, to: b.promoterId || b.venueId || '' }); } catch (_) {} };
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
      item.querySelector('[data-req-reply]').onclick = e => { e.stopPropagation(); try { composeSheet({ booking: id, to: b.promoterId || b.venueId || '' }); } catch (_) {} };
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
    P = data;
  } catch (_) {
    root.innerHTML = `<div class="bk-wrap">${brand()}<div class="bk-card bk-center"><h1>This booking link isn't active</h1><p class="bk-muted">Check the link with the performer who sent it.</p></div></div>`;
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
      root.innerHTML = `<div class="bk-wrap">${brand()}<div class="bk-card bk-center"><div class="bk-check" aria-hidden="true">✓</div><h1>Request sent</h1>
        <p>${esc(P.name || 'The performer')} has your request for <b>${esc(niceDate(S2.date))}</b> at <b>${esc(time12(S2.start))}</b> and will reply to you by email.</p>
        <p class="bk-muted">Thank you!</p></div>${foot()}</div>`; return;
    }
    root.innerHTML = `<div class="bk-wrap">
      ${brand()}<header class="bk-hero"><div class="bk-eyebrow">Booking request</div><h1>${esc(P.name || 'Book a performer')}</h1>${P.headline ? `<p>${esc(P.headline)}</p>` : ''}</header>
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
  function brand() { return `<a class="bk-brand" href="${location.origin}/" target="_blank" rel="noopener" aria-label="Set &amp; Settled website"><img src="/favicon.svg" alt="" width="30" height="30"><span>Set &amp; Settled</span></a>`; }
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
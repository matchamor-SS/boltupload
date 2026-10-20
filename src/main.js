/* Boot order: theme -> sign-in -> runtime (window.claude) -> PDF library -> the app (public/app/app.js, unchanged
 * app code) -> Settings cards. The app script is loaded only after sign-in so it never runs without its data. */
import './shell.css';
import { sb, MOCK, CONFIGURED } from './supabase.js';
import { installRuntime, downloads } from './runtime.js';
import { requireSession, setupNeeded } from './auth.js';
import { mountAccount, refreshGoogleCard } from './account.js';
import { forgetStatus } from './google.js';

const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); });

async function start() {
  let user;
  if (MOCK) {
    const { makeMock } = await import('./mock.js');
    const m = makeMock();
    user = { id: 'demo-user', email: 'demo@example.com' };
    installRuntime(user, { db: m.db, mcp: m.mcp, assets: m.assets, downloads, pickFolder: m.pickFolder });
    document.documentElement.classList.add('ss-demo');
  } else {
    if (!CONFIGURED) return setupNeeded();
    const session = await requireSession();
    user = session.user;
    installRuntime(user);
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('/'); });
  }
  document.getElementById('ss-auth').hidden = true;
  document.documentElement.classList.remove('ss-locked');
  await loadScript('/vendor/jspdf.umd.min.js');
  await loadScript('/app/app.js');
  mountAccount({ demo: MOCK });

  // Back from Google's consent screen
  const p = new URLSearchParams(location.search), g = p.get('google');
  if (g) {
    history.replaceState(null, '', location.pathname + location.hash);
    forgetStatus();
    const msg = { ok: 'Google connected', denied: 'Google access was not granted', expired: 'That Google sign-in expired. Try again.', in_use: 'That Google account is already linked to another user', error: "Couldn't connect Google. Try again." }[g] || '';
    setTimeout(() => { if (window.goTab) window.goTab('settings'); refreshGoogleCard(); if (msg && window.toast) window.toast(msg); }, 300);
  }
}
start().catch(e => { console.error(e); const a = document.getElementById('ss-auth'); a.hidden = false; a.innerHTML = '<main class="ss-auth-wrap"><section class="card ss-auth-card"><h3>Something went wrong</h3><p class="note">Reload the page to try again.</p></section></main>'; });

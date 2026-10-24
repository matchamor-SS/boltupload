/* Google access for the app, replacing the claude.ai connectors.
 * The browser never holds a Google refresh token. Every call goes to the `google` Edge Function, which
 * mints a short-lived, narrowed access token on the server and talks to Google.
 * Permissions (asked one feature at a time, only when needed):
 *   Gmail     -> gmail.send            (send only: no reading, no drafts)
 *   Drive     -> drive.file            (only files/folders the app creates or the user picks)
 *   Calendar  -> calendar.events + calendar.calendarlist.readonly */
import { sb, err } from './supabase.js';

const TIER_OF = { 'Gmail': 'mail', 'Google Drive': 'drive', 'Google Calendar': 'calendar' };
/** Calls the person starts (sending, saving a file, adding a set to the calendar). Background checks never pop a window. */
const ASKS = new Set(['send_message', 'create_file', 'share_file', 'list_calendars', 'create_event', 'update_event', 'picker_token']);

export const TIER_INFO = {
  mail: { name: 'Gmail', what: 'Send the emails and invoices you review and approve, from your own Gmail address.', not: "The app can't read your inbox, sent mail or drafts." },
  drive: { name: 'Google Drive', what: 'Create your Business and Marketing folders and save contracts, invoices and flyers into them.', not: 'The app can only see folders and files it creates or that you pick. Nothing else in your Drive.' },
  calendar: { name: 'Google Calendar', what: 'Check your calendars for conflicts and add your booked sets.', not: "Your other events are read live to check availability and are never saved." },
};

let status = null, statusAt = 0;
export async function googleStatus(force) {
  if (!force && status && Date.now() - statusAt < 30000) return status;
  const { data, error } = await sb.functions.invoke('google', { body: { op: 'status' } });
  status = error ? { connected: false, tiers: {} } : data; statusAt = Date.now();
  return status;
}
export const forgetStatus = () => { status = null; };

async function codeOf(error) {
  try { const j = await error.context.json(); return j.error || 'unavailable'; } catch (_) { return error && error.name === 'FunctionsFetchError' ? 'offline' : 'unavailable'; }
}

export async function startConnect(tier) {
  const { data, error } = await sb.functions.invoke('google-oauth-start', { body: { tier } });
  if (error || !data || !data.url) throw err('unavailable');
  location.assign(data.url);
}
export async function disconnectGoogle() {
  const { error } = await sb.functions.invoke('google-disconnect', { body: {} });
  if (error) throw err('unavailable');
  forgetStatus();
}

/* In-context explanation shown right before Google's consent screen (Google asks apps to explain why they need access). */
let asking = 0;
export function consentPrompt(tier, reconnect) {
  if (Date.now() - asking < 4000 || document.querySelector('.ss-consent')) return;
  asking = Date.now();
  const t = TIER_INFO[tier]; if (!t) return;
  const bg = document.createElement('div'); bg.className = 'notice-bg cs-bg ss-consent';
  bg.innerHTML = `<div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="ssc-t"><button class="x nx" data-no aria-label="Close">×</button>
    <h4 id="ssc-t">${reconnect ? 'Reconnect' : 'Connect'} ${t.name}</h4>
    <p style="margin:0">${t.what}</p>
    <p class="note" style="margin:0">${t.not} You can disconnect any time in Settings. <a href="/privacy-policy/#google" target="_blank" rel="noopener">How we use Google data</a></p>
    <div class="actions"><button class="btn" data-no>Not now</button><button class="btn primary" data-yes>Continue to Google</button></div></div>`;
  document.body.appendChild(bg);
  const done = () => bg.remove();
  bg.addEventListener('click', async e => {
    if (e.target === bg || e.target.closest('[data-no]')) return done();
    if (e.target.closest('[data-yes]')) { e.target.closest('[data-yes]').textContent = 'Opening Google…'; try { await startConnect(tier); } catch (_) { done(); window.toast && window.toast("Couldn't reach Google. Try again."); } }
  });
}

/* Same caching the app relied on before: read calls with {cache:{staleTime}} are reused for that long (and shared while in flight). */
const READS = new Set(['list_events', 'list_calendars', 'search_files', 'get_file_metadata']);
const memo = new Map();
async function callTool(server, tool, input = {}, opts = {}) {
  const c = opts && opts.cache, ttl = c === false ? 0 : c && c.staleTime ? c.staleTime : 0;
  if (ttl && READS.has(tool)) {
    const key = server + '|' + tool + '|' + JSON.stringify(input), hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.p;
    const p = rawCall(server, tool, input); memo.set(key, { at: Date.now(), p, server, tool });
    p.catch(() => memo.delete(key)); return p;
  }
  if (!READS.has(tool)) memo.clear();   // a write can change what reads return
  return rawCall(server, tool, input);
}
async function rawCall(server, tool, input = {}) {
  const tier = TIER_OF[server];
  if (!tier) throw err('not_in_manifest');
  input = { ...input };
  if (tool === 'list_events') for (const k of ['startTime', 'endTime']) if (input[k] && !/(Z|[+-]\d\d:\d\d)$/.test(input[k])) input[k] = new Date(input[k]).toISOString();
  if (tool === 'create_event' || tool === 'update_event') input.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await sb.functions.invoke('google', { body: { server, tool, input } });
  if (!error) return { payload: data };
  const code = await codeOf(error);
  if (code === 'google_not_connected' || code === 'missing_scope') { if (ASKS.has(tool)) consentPrompt(tier); throw err('server_not_connected'); }
  if (code === 'google_reconnect') { if (ASKS.has(tool)) consentPrompt(tier, true); throw err('needs_reauth'); }
  if (code === 'rate_limited' || code === 'daily_limit') throw Object.assign(err('rate_limited'), { retryable: true, retryAfterMs: 2000 });
  if (code === 'offline' || code === 'unavailable' || code === 'server_error') throw Object.assign(err('unavailable'), { retryable: true });
  throw err('tool_error', code);
}

export const mcp = Object.freeze({
  callTool,
  invalidate: async (server, tool) => { for (const [k, v] of memo) if ((!server || v.server === server) && (!tool || v.tool === tool)) memo.delete(k); },
  watchTool: () => () => {},
  describeTool: async () => null,
});

/* Google Picker: how "Use a folder I already have" works with drive.file. Picking a folder grants the app access to that folder only. */
let gapiP = null;
const loadPicker = () => gapiP || (gapiP = new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = 'https://apis.google.com/js/api.js'; s.async = true;
  s.onload = () => window.gapi.load('picker', { callback: res, onerror: rej }); s.onerror = rej; document.head.appendChild(s);
}));
let pickerCfg = null;
async function getPickerConfig() {
  if (pickerCfg) return pickerCfg;
  const { data, error } = await sb.functions.invoke('picker-config');
  if (error || !data || !data.apiKey || !data.appId) return null;
  pickerCfg = data;
  return pickerCfg;
}
export async function pickFolder(title) {
  const cfg = await getPickerConfig();
  if (!cfg) { window.toast && window.toast('Google Picker is not configured yet. Add VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID in Secrets.'); return null; }
  const { apiKey, appId } = cfg;
  let token;
  try { token = (await rawCall('Google Drive', 'picker_token', {})).payload.token; }
  catch (e) { if (e.code !== 'server_not_connected' && e.code !== 'needs_reauth') window.toast && window.toast("Couldn't reach Google Drive. Try again."); return null; }
  try { await loadPicker(); } catch (_) { window.toast && window.toast("Couldn't load Google's folder picker. Check your connection."); return null; }
  const G = window.google.picker;
  return new Promise(resolve => {
    const view = new G.DocsView(G.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
    const picker = new G.PickerBuilder().setTitle(title || 'Choose a folder').addView(view).setOAuthToken(token).setDeveloperKey(apiKey).setAppId(appId)
      .setCallback(async d => {
        if (d.action === G.Action.PICKED) {
          const doc = d.docs[0]; let m = {};
          try { m = (await callTool('Google Drive', 'get_file_metadata', { fileId: doc.id })).payload || {}; } catch (_) {}
          resolve({ id: doc.id, title: m.title || doc.name, viewUrl: m.viewUrl || doc.url, owner: m.owner || '' });
        } else if (d.action === G.Action.CANCEL) resolve(null);
      }).build();
    picker.setVisible(true);
  });
}

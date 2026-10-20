// The app's single doorway to Google. The browser sends {server, tool, input}; only the tools below exist.
// Each tool checks its input, gets a short-lived token narrowed to the scopes it needs, calls Google and returns
// only the fields the app uses. Email content is never stored or logged; the audit log keeps event names only.
import { admin, audit, userFrom } from '../_shared/auth.ts';
import { handler, HttpError, json } from '../_shared/http.ts';
import { accessToken, connection, gfetch, SCOPE } from '../_shared/google.ts';
import { b64url, buildMime, esc, textToHtml } from '../_shared/mime.ts';

type Input = Record<string, unknown>;
type User = { id: string; email?: string };
const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3', CAL = 'https://www.googleapis.com/calendar/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,parents,webViewLink,owners(emailAddress),capabilities(canAddChildren),trashed,modifiedTime';
const EMAIL = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[^@\s<>,;"']+$/;
const DAILY_SEND_LIMIT = 100;

const bad = (why = 'invalid_request') => new HttpError(400, why);
const str = (v: unknown, max: number, name = 'value') => { if (typeof v !== 'string' || v.length > max) throw bad(`invalid_${name}`); return v; };
const optStr = (v: unknown, max: number, name = 'value') => (v == null || v === '' ? undefined : str(v, max, name));
const fileId = (v: unknown) => { const s = str(v, 200, 'file_id'); if (!/^(root|[A-Za-z0-9_-]{10,200})$/.test(s)) throw bad('invalid_file_id'); return s; };
const calId = (v: unknown) => { const s = optStr(v, 300, 'calendar') || 'primary'; if (/[\s/?#]/.test(s.replace(/@/g, ''))) throw bad('invalid_calendar'); return encodeURIComponent(s); };
const emails = (v: unknown, max: number) => { const a = (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean); if (a.length > max || a.some(e => !EMAIL.test(e) || e.length > 254)) throw bad('invalid_recipients'); return a; };
const fileOut = (f: Record<string, any>) => ({ id: f.id, title: f.name, mimeType: f.mimeType, parentId: (f.parents || [])[0] || '', viewUrl: f.webViewLink || `https://drive.google.com/${f.mimeType === FOLDER ? 'drive/folders' : 'file/d'}/${f.id}`, owner: ((f.owners || [])[0] || {}).emailAddress || '', canAddChildren: !!(f.capabilities && f.capabilities.canAddChildren), trashed: !!f.trashed, modifiedTime: f.modifiedTime });

/* The app's simple search syntax -> Drive's query language. Values are re-escaped, unknown terms are rejected. */
function driveQuery(q: string): string {
  const parts: string[] = []; let rest = q;
  const re = /^\s*(?:and\s+)?(title|mimeType|parentId|owner)\s*(=|contains)\s*'((?:[^'\\]|\\.)*)'\s*/;
  while (rest.trim()) {
    const m = rest.match(re); if (!m) throw bad('invalid_query');
    const [, term, op, raw] = m, v = raw.replace(/\\(.)/g, '$1'), e = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    if (term === 'title') parts.push(op === 'contains' ? `name contains '${e}'` : `name = '${e}'`);
    else if (term === 'mimeType' && op === '=') parts.push(`mimeType = '${e}'`);
    else if (term === 'parentId' && op === '=') parts.push(`'${e === 'root' ? 'root' : e}' in parents`);
    else if (term === 'owner' && op === '=') parts.push(`'${e === 'me' ? 'me' : e}' in owners`);
    else throw bad('invalid_query');
    rest = rest.slice(m[0].length);
  }
  parts.push('trashed = false');
  return parts.join(' and ');
}

async function signatureHtml(ownerId: string) {
  const { data } = await admin.from('app_docs').select('data').eq('owner_id', ownerId).eq('col', 'settings').eq('id', 'signature').maybeSingle();
  const d = data && data.data || {};
  const text = typeof d.text === 'string' ? d.text.trim() : '';
  const links: { label?: string; url: string }[] = Array.isArray(d.links) ? d.links.filter((l: any) => l && l.url) : [];
  const logoId = typeof d.logoId === 'string' ? d.logoId : '';
  const logoUrl = logoId ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/user-assets/${logoId.split('/').map(encodeURIComponent).join('/')}` : '';
  const lines = text ? `<div style="margin-top:16px;color:#444">${esc(text).replace(/\n/g, '<br>')}</div>` : '';
  const linkHtml = links.length ? `<div style="margin-top:4px;color:#444">${links.map(l => `<a href="${esc(l.url)}" style="color:#15c">${esc(l.label || l.url)}</a>`).join(' · ')}</div>` : '';
  const logoHtml = logoUrl ? `<div style="margin-top:16px"><img src="${esc(logoUrl)}" alt="" style="max-height:48px;max-width:200px"></div>` : '';
  return logoHtml + lines + linkHtml;
}

const TOOLS: Record<string, (u: User, i: Input) => Promise<unknown>> = {
  // ---------------------------------------------------------------- Gmail (gmail.send only)
  'Gmail:send_message': async (u, i) => {
    const to = emails(i.to, 10), cc = emails(i.cc, 10);
    if (!to.length) throw bad('invalid_recipients');
    const subject = str(i.subject ?? '', 300, 'subject'); if (/[\r\n]/.test(subject)) throw bad('invalid_subject');
    const body = str(i.body ?? '', 100_000, 'body');
    const atts = (Array.isArray(i.attachments) ? i.attachments : []).slice(0, 5).map((a: any) => ({ filename: str(a.filename || 'file', 150, 'filename'), mimeType: str(a.mimeType || 'application/octet-stream', 100, 'mime'), dataBase64: str(a.content, 28_000_000, 'attachment') }));
    if (atts.reduce((n, a) => n + a.dataBase64.length, 0) > 28_000_000) throw new HttpError(413, 'attachments_too_large');
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('owner_id', u.id).eq('action', 'gmail.send').gte('created_at', since);
    if ((count ?? 0) >= DAILY_SEND_LIMIT) throw new HttpError(429, 'daily_limit');
    const token = await accessToken(u.id, [SCOPE.send]);
    const html = textToHtml(body) + (i.includeSignature === false ? '' : await signatureHtml(u.id));
    const raw = b64url(buildMime({ to, cc, subject, html, attachments: atts }));
    const sent = await gfetch(token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) }) as { id: string; threadId: string; labelIds?: string[] };
    await audit(u.id, 'gmail.send', { recipients: to.length + cc.length, attachments: atts.length });
    return { id: sent.id, threadId: sent.threadId, labelIds: sent.labelIds || [] };
  },
  // ---------------------------------------------------------------- Drive (drive.file only)
  'Google Drive:create_file': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.drive]);
    const name = str(i.title, 250, 'title'), mimeType = optStr(i.contentMimeType, 120, 'mime') || 'application/octet-stream';
    const meta: Record<string, unknown> = { name, mimeType }; if (i.parentId) meta.parents = [fileId(i.parentId)];
    if (!i.base64Content) {
      if (mimeType !== FOLDER) throw bad('missing_content');
      return fileOut(await gfetch(token, `${DRIVE}/files?fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) }));
    }
    const b64 = str(i.base64Content, 34_000_000, 'content');
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (bin.length > 25 * 1024 * 1024) throw new HttpError(413, 'file_too_large');
    const boundary = 'ss' + crypto.randomUUID().replace(/-/g, '');
    const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const payload = new Uint8Array(head.length + bin.length + tail.length); payload.set(head); payload.set(bin, head.length); payload.set(tail, head.length + bin.length);
    const f = await gfetch(token, `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload });
    await audit(u.id, 'drive.upload', { bytes: bin.length });
    return fileOut(f);
  },
  'Google Drive:search_files': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.drive]);
    const q = driveQuery(str(i.query ?? '', 1000, 'query')), size = Math.min(Math.max(Number(i.pageSize) || 20, 1), 50);
    const r = await gfetch(token, `${DRIVE}/files?q=${encodeURIComponent(q)}&pageSize=${size}&fields=files(${FIELDS})&orderBy=modifiedTime desc`);
    const files = (r.files || []).map(fileOut);
    return files.length ? { files } : {};
  },
  'Google Drive:get_file_metadata': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.drive]);
    return fileOut(await gfetch(token, `${DRIVE}/files/${fileId(i.fileId)}?fields=${FIELDS}`));
  },
  'Google Drive:share_file': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.drive]);
    const email = emails([i.emailAddress], 1)[0]; if (!email) throw bad('invalid_recipients');
    const role = ['reader', 'commenter', 'writer'].includes(String(i.role)) ? String(i.role) : 'reader';
    await gfetch(token, `${DRIVE}/files/${fileId(i.fileId)}/permissions?sendNotificationEmail=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'user', role, emailAddress: email }) });
    await audit(u.id, 'drive.share', { role });
    return {};
  },
  'Google Drive:trash_file': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.drive]);
    await gfetch(token, `${DRIVE}/files/${fileId(i.fileId)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    return {};
  },
  /* Google Picker needs a token in the browser: this one can only do drive.file, lives about an hour and is never stored. */
  'Google Drive:picker_token': async u => ({ token: await accessToken(u.id, [SCOPE.drive]) }),
  // ---------------------------------------------------------------- Calendar
  'Google Calendar:list_calendars': async u => {
    const token = await accessToken(u.id, [SCOPE.calList]);
    const r = await gfetch(token, `${CAL}/users/me/calendarList?maxResults=250&fields=items(id,summary,summaryOverride,primary,accessRole)`);
    return { calendars: (r.items || []).map((c: any) => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: !!c.primary, accessRole: c.accessRole })) };
  },
  'Google Calendar:list_events': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.calEvents]);
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: String(Math.min(Number(i.pageSize) || 250, 250)), fields: 'nextPageToken,items(id,status,summary,start,end,transparency,eventType,htmlLink,location)' });
    if (i.startTime) q.set('timeMin', new Date(str(i.startTime, 40, 'time')).toISOString());
    if (i.endTime) q.set('timeMax', new Date(str(i.endTime, 40, 'time')).toISOString());
    if (i.pageToken) q.set('pageToken', str(i.pageToken, 500, 'page'));
    const r = await gfetch(token, `${CAL}/calendars/${calId(i.calendarId)}/events?${q}`);
    return { events: r.items || [], nextPageToken: r.nextPageToken };
  },
  'Google Calendar:create_event': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.calEvents]);
    const r = await gfetch(token, `${CAL}/calendars/${calId(i.calendarId)}/events?sendUpdates=none&fields=id,htmlLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody(i)) });
    return { id: r.id, htmlLink: r.htmlLink };
  },
  'Google Calendar:update_event': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.calEvents]);
    const r = await gfetch(token, `${CAL}/calendars/${calId(i.calendarId)}/events/${encodeURIComponent(str(i.eventId, 1024, 'event'))}?sendUpdates=none&fields=id,htmlLink`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody(i)) });
    return { id: r.id, htmlLink: r.htmlLink };
  },
  'Google Calendar:delete_event': async (u, i) => {
    const token = await accessToken(u.id, [SCOPE.calEvents]);
    try { await gfetch(token, `${CAL}/calendars/${calId(i.calendarId)}/events/${encodeURIComponent(str(i.eventId, 1024, 'event'))}?sendUpdates=none`, { method: 'DELETE' }); }
    catch (e) { if (!(e instanceof HttpError && e.code === 'not_found')) throw e; }
    return {};
  },
};
function eventBody(i: Input) {
  const tz = optStr(i.timeZone, 60, 'tz') || 'UTC';
  return {
    summary: str(i.summary ?? '', 300, 'summary'), location: optStr(i.location, 500, 'location') || '', description: optStr(i.description, 4000, 'description') || '',
    start: { dateTime: str(i.startTime, 40, 'time'), timeZone: tz }, end: { dateTime: str(i.endTime, 40, 'time'), timeZone: tz },
  };
}

handler(async req => {
  const user = await userFrom(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw bad();
  if (body.op === 'status') {
    const c = await connection(user.id), s: string[] = c ? c.scopes : [];
    return json({ connected: !!c, email: c ? c.email : '', tiers: { mail: s.includes(SCOPE.send), drive: s.includes(SCOPE.drive), calendar: s.includes(SCOPE.calEvents) } });
  }
  const fn = TOOLS[`${body.server}:${body.tool}`];
  if (!fn) throw new HttpError(400, 'unknown_tool');
  return json(await fn(user, (body.input && typeof body.input === 'object') ? body.input : {}));
});

// deploy marker

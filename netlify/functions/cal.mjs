// Set & Settled: private calendar feed at setnsettled.com/cal/<code>.ics
// Apple Calendar, Outlook and other calendar apps subscribe to it and refresh on their own.
// Only date, set times, show name, venue, address, ticket link and status. Never fees, contacts or notes.
const SB = 'https://mxcejgfxvxpvuhwenoou.supabase.co';
// the public "anon" key (the same one the website already ships); the long random code in the link is what keeps a feed private
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VqZ2Z4dnhwdnVod2Vub291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzODI5NzYsImV4cCI6MjEwNzk1ODk3Nn0.uFG0Wcpjfqgl7_TWITcBVZ2m7q48V2Ij4z_TrYZud14';

export const config = { path: '/cal/:file' };

const mins = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
// the UTC moment for a wall-clock time in the artist's time zone
function zoned(date, minutes, tz) {
  const [y, mo, d] = date.split('-').map(Number), guess = Date.UTC(y, mo - 1, d, 0, minutes);
  const off = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
  let t = guess - off(guess); t = guess - off(t); return new Date(t);
}
const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (date, plus = 0) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + plus); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const txt = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// calendar files wrap long lines at 75 bytes
function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', n = 0, limit = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > limit) { out.push(cur); cur = ' '; n = 1; limit = 75; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n');
}
const t12 = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };

function ics(d, origin) {
  const tz = d.tz || 'America/Los_Angeles', name = d.name ? `${d.name} · shows` : 'My shows', now = utc(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Set & Settled//Shows//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${txt(name)}`, `X-WR-TIMEZONE:${txt(tz)}`, 'X-WR-CALDESC:Your shows from Set & Settled. Updates on its own.',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of Array.isArray(d.events) ? d.events : []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) continue;
    const where = [e.venue, e.address || e.city].filter(Boolean).join(', '), title = e.title || (e.venue ? `Show at ${e.venue}` : 'Show');
    const hold = e.status === 'pitched';
    L.push('BEGIN:VEVENT', `UID:${txt(e.id)}@setnsettled.com`, `DTSTAMP:${now}`);
    let s = mins(e.start), en = mins(e.end), timeLine = '';
    if (s != null) {
      if (s < 360) s += 1440; // a 12 am set on the 5th is the night of the 5th, early on the 6th
      if (en == null) en = s + 120; else { while (en <= s) en += 1440; }
      L.push(`DTSTART:${utc(zoned(e.date, s, tz))}`, `DTEND:${utc(zoned(e.date, en, tz))}`);
      timeLine = `Set: ${t12(s)}${e.end ? ' – ' + t12(en) : ''}`;
    } else L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(e.date, 1)}`);
    if (e.updated && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(e.updated)) L.push(`LAST-MODIFIED:${utc(new Date(e.updated.slice(0, 19) + 'Z'))}`);
    L.push(`SUMMARY:${txt((hold ? 'Hold: ' : '') + title)}`);
    if (where) L.push(`LOCATION:${txt(where)}`);
    const desc = [timeLine, e.tickets ? `Tickets: ${e.tickets}` : '', hold ? 'On hold, not confirmed yet.' : '', `Open in Set & Settled: ${origin}/`].filter(Boolean).join('\n');
    L.push(`DESCRIPTION:${txt(desc)}`, `STATUS:${hold ? 'TENTATIVE' : 'CONFIRMED'}`, `TRANSP:${hold ? 'TRANSPARENT' : 'OPAQUE'}`);
    if (e.tickets && /^https?:\/\//.test(e.tickets)) L.push(`URL:${e.tickets}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export default async (req, context) => {
  const u = new URL(req.url), token = String((context.params || {}).file || '').replace(/\.ics$/i, '').toLowerCase();
  const nope = () => new Response('This calendar link is off or has been reset. Get the current link in Set & Settled: Settings → Google → Apple Calendar.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (!/^[a-f0-9]{40,64}$/.test(token)) return nope();
  let d = null;
  try { const r = await fetch(`${SB}/rest/v1/rpc/cal_feed_public`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_token: token }) }); if (r.ok) d = await r.json(); } catch (_) {}
  if (!d) return nope();
  return new Response(ics(d, u.origin), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="shows.ics"', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
};
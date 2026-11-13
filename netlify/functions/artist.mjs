// Set & Settled: public artist pages at setnsettled.com/<name> (and the share picture at /<name>/photo.jpg).
// Built on the server so Google and link previews can read it. Reads only what the artist made public.
const SB = 'https://mxcejgfxvxpvuhwenoou.supabase.co';
// the public "anon" key (the same one the website already ships); it can only read what the database allows
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VqZ2Z4dnhwdnVod2Vub291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzODI5NzYsImV4cCI6MjEwNzk1ODk3Nn0.uFG0Wcpjfqgl7_TWITcBVZ2m7q48V2Ij4z_TrYZud14';

export const config = { path: ['/:slug', '/:slug/photo.jpg'], preferStatic: true };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; } };
const color = (v, d) => /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|linear-gradient\([#\w\s,.%()-]+\))$/i.test(String(v || '').trim()) ? String(v).trim() : d;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dt = d => new Date(d + 'T12:00:00Z');
const t12 = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return ''; const h = +m[1], ap = h >= 12 && h < 24 ? 'pm' : 'am', hh = h % 12 || 12; return `${hh}${m[2] === '00' ? '' : ':' + m[2]} ${ap}`; };

async function load(slug) {
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/artist_page_public`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_slug: slug }) });
    if (!r.ok) return null; return await r.json();
  } catch (_) { return null; }
}

function notFound(slug) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found · Set &amp; Settled</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0E100C;color:#EFE7D3;text-align:center;padding:24px}a{color:#D4B26E}</style></head>
<body><main><h1>Nothing here yet</h1><p>There's no public page at this address.</p><p><a href="/">Go to Set &amp; Settled</a></p></main></body></html>`, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}

function page(d, origin) {
  const T = d.theme || {}, bg = color(T.bg, '#0E100C'), ink = color(T.ink, '#EFE7D3'), muted = color(T.muted, 'rgba(239,231,211,.68)'), line = color(T.line, 'rgba(239,231,211,.14)'), panel = color(T.panel, 'rgba(239,231,211,.04)'), solid = color(T.solid, '#D4B26E'), metal = color(T.metal, solid), glow = color(T.glow, '#26301E');
  const url = `${origin}/${d.slug}`, name = d.name || d.slug, shows = Array.isArray(d.shows) ? d.shows : [], links = (Array.isArray(d.links) ? d.links : []).map(l => ({ label: String(l.label || '').slice(0, 60), url: safeUrl(l.url) })).filter(l => l.url && l.label).slice(0, 24);
  const desc = (d.tagline || (d.bio || '').split(/\n/)[0] || `${name}: upcoming shows and booking`).slice(0, 158);
  const book = d.booking ? `${origin}/?book=${encodeURIComponent(d.slug)}` : '';
  const img = d.photo ? `${origin}/${d.slug}/photo.jpg` : '';
  const music = ['dj', 'singer', 'rapper', 'band', 'instrumentalist', 'producer', ''].includes(d.kind || '');
  const ld = shows.map(s => ({
    '@context': 'https://schema.org', '@type': music ? 'MusicEvent' : 'Event', name: s.title || `${name} at ${s.venue || s.city || 'a show'}`,
    startDate: s.time ? `${s.date}T${s.time}` : s.date, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: s.venue || s.city || 'TBA', address: { '@type': 'PostalAddress', ...(s.address ? { streetAddress: s.address } : {}), ...(s.city ? { addressLocality: s.city } : {}) } },
    performer: { '@type': music ? 'MusicGroup' : 'Person', name }, ...(img ? { image: [img] } : {}),
    ...(s.tickets ? { offers: { '@type': 'Offer', url: s.tickets, availability: 'https://schema.org/InStock' } } : {}), url
  }));
  ld.push({ '@context': 'https://schema.org', '@type': music ? 'MusicGroup' : 'Person', name, url, ...(img ? { image: img } : {}), ...(links.length ? { sameAs: links.map(l => l.url) } : {}) });
  const showHtml = shows.length ? shows.map(s => { const D = dt(s.date); return `<li class="show"><div class="when"><span class="m">${MON[D.getUTCMonth()]}</span><span class="d">${D.getUTCDate()}</span><span class="w">${DAY[D.getUTCDay()]}</span></div>
      <div class="what"><b>${esc(s.title || s.venue || 'Show')}</b><span>${esc([s.title ? s.venue : '', s.city].filter(Boolean).join(' · '))}${s.time ? ` · ${esc(t12(s.time))}` : ''}</span></div>
      ${s.tickets ? `<a class="btn small" href="${esc(safeUrl(s.tickets))}" rel="noopener" target="_blank">Tickets</a>` : ''}</li>`; }).join('') : `<li class="empty">No public dates right now.${book ? ' Want to book a date? Send a request below.' : ''}</li>`;
  const bio = String(d.bio || '').trim().split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}${shows.length ? ' · Upcoming shows' : ''}${book ? ' & booking' : ''}</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(name)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="${esc(bg)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Italiana&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:${bg};color:${ink};font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(60% 50% at 50% 0%,${glow},transparent 70%);pointer-events:none;z-index:0}
main{position:relative;z-index:1;max-width:680px;margin:0 auto;padding:48px 16px 40px}
.hero{text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
.pic{width:148px;height:148px;border-radius:50%;object-fit:cover;border:2px solid ${solid};box-shadow:0 18px 50px -20px rgba(0,0,0,.6)}
h1{font:400 clamp(40px,10vw,64px)/1.05 Italiana,'Bodoni 72',Didot,Georgia,serif;margin:8px 0 0;letter-spacing:.01em}
.tag{margin:0;color:${muted};font-size:17px}.city{margin:0;color:${muted};font-size:14px;letter-spacing:.12em;text-transform:uppercase}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:999px;border:1px solid ${line};color:${ink};text-decoration:none;font-weight:600;background:${panel}}
.btn.primary{background:${metal};color:#141711;border:0}.btn.small{min-height:36px;padding:0 16px;font-size:14px}
.btn:focus-visible{outline:2px solid ${solid};outline-offset:3px}
.cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:14px}
section{margin-top:40px}h2{font:600 13px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${muted};margin:0 0 14px}
ul{list-style:none;margin:0;padding:0}
.show{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid ${line};border-radius:18px;background:${panel};margin-bottom:10px}
.when{flex:none;width:58px;text-align:center;display:flex;flex-direction:column;line-height:1.1}.when .m{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${solid};font-weight:600}.when .d{font-size:26px;font-weight:600}.when .w{font-size:12px;color:${muted}}
.what{flex:1;min-width:0;display:flex;flex-direction:column}.what b{font-weight:600}.what span{color:${muted};font-size:14px}
.empty{color:${muted};padding:14px;border:1px dashed ${line};border-radius:18px}
.links{display:flex;flex-direction:column;gap:10px}.links .btn{width:100%}
.bio p{margin:0 0 12px;color:${ink}}
footer{margin-top:48px;text-align:center;font-size:13px;color:${muted}}footer a{color:${muted}}
@media (max-width:420px){main{padding-top:32px}.show{flex-wrap:wrap}.show .btn{width:100%}}
</style></head><body><main>
<header class="hero">${img ? `<img class="pic" src="${esc(d.photo)}" alt="${esc(name)}" width="148" height="148">` : ''}
<h1>${esc(name)}</h1>${d.tagline ? `<p class="tag">${esc(d.tagline)}</p>` : ''}${d.city ? `<p class="city">${esc(d.city)}</p>` : ''}
<div class="cta">${book ? `<a class="btn primary" href="${esc(book)}">Book me</a>` : ''}${shows.length ? '<a class="btn" href="#shows">Upcoming shows</a>' : ''}</div></header>
<section id="shows" aria-labelledby="h-shows"><h2 id="h-shows">Upcoming</h2><ul>${showHtml}</ul></section>
${links.length ? `<section aria-labelledby="h-links"><h2 id="h-links">Listen & follow</h2><div class="links">${links.map(l => `<a class="btn" href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)}</a>`).join('')}</div></section>` : ''}
${bio ? `<section class="bio" aria-labelledby="h-bio"><h2 id="h-bio">About</h2>${bio}</section>` : ''}
${book ? `<section aria-labelledby="h-book"><h2 id="h-book">Booking</h2><p style="margin:0 0 14px;color:${muted}">See open dates and send a request in a minute.</p><a class="btn primary" href="${esc(book)}">Check dates and book</a></section>` : ''}
<footer>Made with <a href="${esc(origin)}/">Set &amp; Settled</a></footer>
</main></body></html>`;
}

export default async (req, context) => {
  const u = new URL(req.url), slug = String((context.params || {}).slug || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return notFound(slug);
  const d = await load(slug); if (!d || !d.slug) return notFound(slug);
  if (u.pathname.endsWith('/photo.jpg')) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d.photo || ''); if (!m) return new Response('', { status: 404 });
    return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=3600' } });
  }
  return new Response(page(d, u.origin), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
};
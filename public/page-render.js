// Set & Settled: how an artist's public page looks. One file, used two ways, so they always match:
//  - the live page at setnsettled.com/<name> (netlify/functions/artist.mjs imports it)
//  - the designer window in the app (My page \u2192 Design), which draws a live preview with it
// It only builds HTML from the values given and checks every design choice. It runs nothing on the page itself.
(function () {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; } };
const color = (v, d) => /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|linear-gradient\([#\w\s,.%()-]+\))$/i.test(String(v || '').trim()) ? String(v).trim() : d;
const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : d;
const pick = (v, list, d) => list.includes(v) ? v : d;
const ASSET = /^https:\/\/mxcejgfxvxpvuhwenoou\.supabase\.co\/storage\/v1\/object\/public\/user-assets\/[A-Za-z0-9/_.-]+$/;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dt = d => new Date(d + 'T12:00:00Z');
const nextDay = ds => { const D = dt(ds); D.setUTCDate(D.getUTCDate() + 1); return D.toISOString().slice(0, 10); }; // a 12 am set on the 5th really starts on the 6th
const t12 = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return ''; const h = +m[1], ap = h >= 12 && h < 24 ? 'pm' : 'am', hh = h % 12 || 12; return `${hh}${m[2] === '00' ? '' : ':' + m[2]} ${ap}`; };

// the icons an artist can put next to a section title (same list as the app)
const ICONS = {
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
const svg = (k, s = 18) => ICONS[k] ? `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>` : '';
// name fonts: [Google family, weight, extra css]
const FONTS = {
  italiana: ['Italiana', 400, ''], playfair: ['Playfair Display', 600, ''], bebas: ['Bebas Neue', 400, 'letter-spacing:.03em'], unbounded: ['Unbounded', 600, 'letter-spacing:-.01em'],
  grotesk: ['Space Grotesk', 600, 'letter-spacing:-.02em'], marker: ['Permanent Marker', 400, ''], cormorant: ['Cormorant Garamond', 500, 'font-style:italic'], syne: ['Syne', 700, 'letter-spacing:-.01em']
};
const DEF_ORDER = ['news', 'shows', 'photos', 'watch', 'links', 'bio', 'book'];
const DEF_TITLE = { news: 'News', shows: 'Upcoming', photos: 'Photos', watch: 'Watch & listen', links: 'Listen & follow', bio: 'About', book: 'Booking' };
const DEF_ICON = { news: 'bolt', shows: 'ticket', photos: 'camera', watch: 'play', links: 'link', bio: 'sparkle', book: 'calendar' };
// saved order first; sections added later slot in after their usual neighbour
// "-08:00": the artist's time zone offset at that moment, so Google reads show times exactly
function tzOffset(date, hm, tz) {
  try {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number), guess = Date.UTC(y, mo - 1, d, h, mi);
    const at = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
    const off = Math.round(at(guess - at(guess)) / 60000), sg = off < 0 ? '-' : '+', a = Math.abs(off);
    return `${sg}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  } catch (_) { return ''; }
}
const isoAt = (date, hm, tz) => { const dd = hm < '06:00' ? nextDay(date) : date; return `${dd}T${hm}:00${tzOffset(dd, hm, tz)}`; };
function mergeOrder(saved) {
  const o = [...new Set((Array.isArray(saved) ? saved : []).filter(k => DEF_ORDER.includes(k)))];
  DEF_ORDER.forEach((k, i) => { if (o.includes(k)) return; const prev = DEF_ORDER.slice(0, i).reverse().find(x => o.includes(x)); o.splice(prev ? o.indexOf(prev) + 1 : 0, 0, k); });
  return o;
}
// music and video links that can play right on the page
function embed(u, solid) {
  const r = embed0(u, solid); if (!r) return null;
  const NM = [['youtube', 'YouTube video'], ['vimeo', 'Vimeo video'], ['spotify', 'Spotify'], ['soundcloud', 'SoundCloud'], ['mixcloud', 'Mixcloud mix']];
  r.name = (NM.find(([k]) => r.src.includes(k)) || [0, 'Player'])[1]; return r;
}
function embed0(u, solid) {
  let x; try { x = new URL(String(u)); } catch (_) { return null; } if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
  const h = x.hostname.replace(/^(www\.|m\.)/, ''), p = x.pathname;
  let id;
  if (h === 'youtu.be' && (id = /^\/([\w-]{11})/.exec(p))) return { src: `https://www.youtube-nocookie.com/embed/${id[1]}`, kind: 'video' };
  if (h === 'youtube.com' || h === 'music.youtube.com') {
    const v = x.searchParams.get('v'); if (/^[\w-]{11}$/.test(v || '')) return { src: `https://www.youtube-nocookie.com/embed/${v}`, kind: 'video' };
    if ((id = /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(p))) return { src: `https://www.youtube-nocookie.com/embed/${id[1]}`, kind: 'video' };
    return null;
  }
  if (h === 'vimeo.com' && (id = /^\/(\d{5,12})/.exec(p))) return { src: `https://player.vimeo.com/video/${id[1]}`, kind: 'video' };
  if (h === 'open.spotify.com' && (id = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})/.exec(p))) return { src: `https://open.spotify.com/embed/${id[1]}/${id[2]}`, kind: 'audio', h: ['track', 'episode'].includes(id[1]) ? 152 : 352 };
  if (h === 'soundcloud.com' && /^\/[\w-]+\/[\w-]+/.test(p)) return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent('https://soundcloud.com' + p)}&color=${encodeURIComponent(hex(solid, '#D4B26E'))}&visual=false&show_comments=false`, kind: 'audio', h: /\/sets\//.test(p) ? 300 : 166 };
  if (h === 'mixcloud.com' && /^\/[\w-]+\/[\w-]+\/?$/.test(p)) return { src: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(p.endsWith('/') ? p : p + '/')}`, kind: 'audio', h: 120 };
  return null;
}

function page(d, origin, opts) {
  const preview = !!(opts && opts.preview);
  const T = d.theme || {}, bg = color(T.bg, '#0E100C'), ink = color(T.ink, '#EFE7D3'), muted = color(T.muted, 'rgba(239,231,211,.68)'), line = color(T.line, 'rgba(239,231,211,.14)'), panel = color(T.panel, 'rgba(239,231,211,.04)'), solid = color(T.solid, '#D4B26E'), metal = color(T.metal, solid), glow = color(T.glow, '#26301E');
  const L0 = d.look && typeof d.look === 'object' ? d.look : {};
  const look = {
    layout: pick(L0.layout, ['center', 'side', 'cover'], 'center'), size: pick(L0.size, ['s', 'm', 'l', 'xl'], 'm'), shape: pick(L0.shape, ['circle', 'arch', 'square', 'portrait'], 'circle'),
    font: pick(L0.font, Object.keys(FONTS), 'italiana'), name: pick(L0.name, ['s', 'm', 'l'], 'm'), bg: pick(L0.bg, ['glow', 'aurora', 'grain', 'photo', 'plain'], 'glow'),
    cards: pick(L0.cards, ['soft', 'outline', 'glass', 'bold'], 'soft'), heads: pick(L0.heads, ['caps', 'big'], 'caps'), icons: L0.icons !== false, gallery: pick(L0.gallery, ['grid', 'strip', 'mosaic'], 'grid'),
    align: pick(L0.align, ['center', 'left'], 'center')
  };
  const titles = d.titles && typeof d.titles === 'object' ? d.titles : {}, icons = d.icons && typeof d.icons === 'object' ? d.icons : {};
  const titleOf = k => String(titles[k] || '').trim().slice(0, 40) || DEF_TITLE[k];
  const iconOf = k => icons[k] === 'none' ? '' : (ICONS[icons[k]] ? icons[k] : DEF_ICON[k]);
  const url = `${origin}/${d.slug}`, name = d.name || d.slug, shows = Array.isArray(d.shows) ? d.shows : [], links = (Array.isArray(d.links) ? d.links : []).map(l => ({ label: String(l.label || '').slice(0, 60), url: safeUrl(l.url) })).filter(l => l.url && l.label).slice(0, 24);
  const gallery = (Array.isArray(d.gallery) ? d.gallery : []).map(g => String((g && g.url) || g || '')).filter(u => ASSET.test(u)).slice(0, 12);
  const players = (Array.isArray(d.embeds) ? d.embeds : []).map(e => ({ e: embed(e && e.url, solid), label: String((e && e.label) || '').slice(0, 60) })).filter(x => x.e).slice(0, 6);
  const desc = (d.tagline || (d.bio || '').split(/\n/)[0] || `${name}: upcoming shows and booking`).slice(0, 158);
  const book = d.booking ? `${origin}/?book=${encodeURIComponent(d.slug)}` : '';
  const remote = /^https:\/\//.test(d.photo || ''), img = d.photo ? (remote ? d.photo : `${origin}/${d.slug}/photo.jpg`) : '', picSrc = remote ? d.photo : (d.photo || '');
  const music = ['dj', 'singer', 'rapper', 'band', 'instrumentalist', 'producer', ''].includes(d.kind || '');
  const off = new Set(Array.isArray(d.off) ? d.off : []), order = mergeOrder(d.order), showsOn = !off.has('shows');
  const tz = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(d.tz || '') ? d.tz : 'America/Los_Angeles';
  const today = /^\d{4}-\d{2}-\d{2}$/.test(d.today || '') ? d.today : new Date().toISOString().slice(0, 10);
  // news posts: up to 6, newest first as the artist ordered them; a post with an end date disappears after that day
  const news = (Array.isArray(d.news) ? d.news : []).filter(n => n && typeof n === 'object').map(n => ({
    title: String(n.title || '').trim().slice(0, 80), text: String(n.text || '').trim().slice(0, 600), url: safeUrl(n.url), label: String(n.label || '').trim().slice(0, 30),
    img: n.img && ASSET.test(String(n.img.url || '')) ? String(n.img.url) : '', until: /^\d{4}-\d{2}-\d{2}$/.test(n.until || '') ? n.until : ''
  })).filter(n => (n.title || n.text) && (!n.until || n.until >= today)).slice(0, 6);
  const ld = (showsOn ? shows : []).map(s => ({
    '@context': 'https://schema.org', '@type': music ? 'MusicEvent' : 'Event', name: s.title || `${name} at ${s.venue || s.city || 'a show'}`,
    startDate: s.time ? isoAt(s.date, s.time, tz) : s.date,
    ...(s.time && /^\d{2}:\d{2}$/.test(s.end || '') ? { endDate: (() => { let dd = s.time < '06:00' ? nextDay(s.date) : s.date; if (s.end <= s.time) dd = nextDay(dd); return `${dd}T${s.end}:00${tzOffset(dd, s.end, tz)}`; })() } : {}),
    description: `${name}${s.venue ? ' at ' + s.venue : ''}${s.city ? ', ' + s.city : ''}${s.time ? '. Set at ' + t12(s.time) : ''}.`,
    organizer: s.promoter ? { '@type': 'Organization', name: s.promoter } : s.venue ? { '@type': 'Organization', name: s.venue } : { '@type': music ? 'MusicGroup' : 'Person', name, url },
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: s.venue || s.city || 'TBA', address: { '@type': 'PostalAddress', ...(s.address ? { streetAddress: s.address } : {}), ...(s.city ? { addressLocality: s.city } : {}) } },
    performer: { '@type': music ? 'MusicGroup' : 'Person', name }, ...(img ? { image: [img] } : {}),
    ...(s.tickets ? { offers: { '@type': 'Offer', url: s.tickets, availability: 'https://schema.org/InStock' } } : {}), url
  }));
  ld.push({ '@context': 'https://schema.org', '@type': music ? 'MusicGroup' : 'Person', name, url, ...(img ? { image: img } : {}), ...(links.length ? { sameAs: links.map(l => l.url) } : {}) });
  // directions: tap the venue and the visitor's maps app opens with the route (Google Maps link works on iPhone, Android and desktop)
  const mapLink = (s, label) => { const dest = [s.venue, s.address || s.city].filter(Boolean).join(', '); if (!label) return ''; if (!dest || !(s.address || s.venue)) return esc(label);
    return `<a class="map" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(dest)}" target="_blank" rel="noopener" aria-label="Directions to ${esc(s.venue || dest)}"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>${esc(label)}</a>`; };
  const showHtml = shows.length ? shows.map(s => { const D = dt(s.date); return `<li class="show card"><div class="when"><span class="m">${MON[D.getUTCMonth()]}</span><span class="d">${D.getUTCDate()}</span><span class="w">${DAY[D.getUTCDay()]}</span></div>
      <div class="what"><b>${esc(s.title || s.venue || 'Show')}</b><span>${mapLink(s, [s.title ? s.venue : '', s.city].filter(Boolean).join(' \u00b7 '))}${s.time ? ` \u00b7 ${esc(t12(s.time))}` : ''}</span></div>
      ${s.tickets ? `<a class="btn small" href="${esc(safeUrl(s.tickets))}" rel="noopener" target="_blank">Tickets</a>` : ''}</li>`; }).join('') : `<li class="empty card">No public dates right now.${book ? ' Want to book a date? Send a request below.' : ''}</li>`;
  const bio = String(d.bio || '').trim().split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const head = k => { const ic = look.icons ? iconOf(k) : ''; return `<h2 id="h-${k}">${ic ? `<span class="ic">${svg(ic, look.heads === 'big' ? 20 : 16)}</span>` : ''}<span>${esc(titleOf(k))}</span></h2>`; };
  const SEC = {
    news: () => news.length ? `<section aria-labelledby="h-news">${head('news')}<div class="news">${news.map(n => `<article class="post card">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy" decoding="async">` : ''}<div class="pbody">${n.title ? `<h3>${esc(n.title)}</h3>` : ''}${n.text ? `<p>${esc(n.text).replace(/\n/g, '<br>')}</p>` : ''}${n.url ? `<a class="btn small" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label || 'Learn more')}</a>` : ''}</div></article>`).join('')}</div></section>` : '',
    shows: () => `<section id="shows" aria-labelledby="h-shows">${head('shows')}<ul>${showHtml}</ul></section>`,
    photos: () => gallery.length ? `<section aria-labelledby="h-photos">${head('photos')}<div class="gal ${look.gallery}${gallery.length === 1 ? ' one' : ''}">${gallery.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="${esc(name)}, photo ${i + 1}" loading="lazy" decoding="async"></a>`).join('')}</div></section>` : '',
    // in the designer, players show as stand-ins (the app can't load other sites' players); on the live page they play
    watch: () => players.length ? `<section aria-labelledby="h-watch">${head('watch')}<div class="players">${players.map(x => `<div class="player ${x.e.kind} card"${x.e.h ? ` style="height:${x.e.h}px"` : ''}>${preview ? `<div class="stand">${svg('play', 28)}<span>${esc(x.label || x.e.name)}</span><small>Plays here on your live page</small></div>` : `<iframe src="${esc(x.e.src)}" title="${esc(x.label || x.e.name)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`}</div>`).join('')}</div></section>` : '',
    links: () => links.length ? `<section aria-labelledby="h-links">${head('links')}<div class="links">${links.map(l => `<a class="lk card" href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)}</a>`).join('')}</div></section>` : '',
    bio: () => bio ? `<section class="bio" aria-labelledby="h-bio">${head('bio')}${bio}</section>` : '',
    book: () => book ? `<section aria-labelledby="h-book">${head('book')}<div class="bookbox card"><p>See open dates and send a request in a minute.</p><a class="btn primary" href="${esc(book)}">Check dates and book</a></div></section>` : ''
  };
  const sections = order.filter(k => !off.has(k)).map(k => SEC[k]()).filter(Boolean).join('\n');
  // picture
  const W = { s: 112, m: 160, l: 224, xl: 300 }[look.size], CH = { s: 240, m: 340, l: 440, xl: 560 }[look.size];
  const tall = look.shape === 'arch' || look.shape === 'portrait', PH = tall ? Math.round(W * 1.3) : W;
  const rad = look.shape === 'circle' ? '50%' : look.shape === 'arch' ? `${W / 2}px ${W / 2}px 20px 20px` : '22px';
  const F = FONTS[look.font], NS = { s: 'clamp(32px,8vw,48px)', m: 'clamp(40px,10vw,66px)', l: 'clamp(48px,13vw,96px)' }[look.name];
  const cover = look.layout === 'cover' && img;
  const left = look.align === 'left' || look.layout === 'side';
  const cardCss = {
    soft: `background:${panel};border:1px solid ${line}`,
    outline: `background:transparent;border:1px solid color-mix(in srgb,${solid} 45%,transparent)`,
    glass: `background:color-mix(in srgb,${ink} 7%,transparent);border:1px solid ${line};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 40px -24px rgba(0,0,0,.55)`,
    bold: `background:color-mix(in srgb,${solid} 15%,${bg});border:1px solid color-mix(in srgb,${solid} 30%,transparent)`
  }[look.cards];
  const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E")`;
  const bgCss = {
    glow: `body::before{content:"";position:fixed;inset:0;background:radial-gradient(60% 50% at 50% 0%,${glow},transparent 70%);pointer-events:none;z-index:0}`,
    aurora: `body::before{content:"";position:fixed;inset:-20%;background:radial-gradient(40% 35% at 20% 15%,color-mix(in srgb,${solid} 30%,transparent),transparent 70%),radial-gradient(45% 40% at 85% 30%,${glow},transparent 70%),radial-gradient(50% 40% at 50% 100%,color-mix(in srgb,${solid} 16%,transparent),transparent 70%);pointer-events:none;z-index:0;animation:drift 24s ease-in-out infinite alternate}@keyframes drift{to{transform:translate3d(4%,3%,0) rotate(6deg)}}@media (prefers-reduced-motion:reduce){body::before{animation:none}}`,
    grain: `body::before{content:"";position:fixed;inset:0;background:radial-gradient(60% 50% at 50% 0%,${glow},transparent 70%);pointer-events:none;z-index:0}body::after{content:"";position:fixed;inset:0;background:${grain};opacity:.13;mix-blend-mode:overlay;pointer-events:none;z-index:0}`,
    photo: remote ? `body::before{content:"";position:fixed;inset:-40px;background:url("${picSrc}") center/cover no-repeat;filter:blur(38px) saturate(1.2);opacity:.42;pointer-events:none;z-index:0}body::after{content:"";position:fixed;inset:0;background:linear-gradient(180deg,color-mix(in srgb,${bg} 35%,transparent),${bg} 85%);pointer-events:none;z-index:0}` : '',
    plain: ''
  }[look.bg];
  const fontUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=${encodeURIComponent(F[0]).replace(/%20/g, '+')}:${F[2].includes('italic') ? 'ital,wght@1,' : 'wght@'}${F[1]}&display=swap`;
  const pic = img && !cover ? `<img class="pic" src="${esc(picSrc)}" alt="${esc(name)}" width="${W}" height="${PH}">` : '';
  const heroText = `<div class="htext"><h1>${esc(name)}</h1>${d.tagline ? `<p class="tag">${esc(d.tagline)}</p>` : ''}${d.city ? `<p class="city">${svg('pin', 13)}${esc(d.city)}</p>` : ''}
<div class="cta">${book ? `<a class="btn primary" href="${esc(book)}">Book me</a>` : ''}</div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}${shows.length ? ' \u00b7 Upcoming shows' : ''}${book ? ' & booking' : ''}</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(name)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="${esc(bg)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${esc(fontUrl)}" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:${bg};color:${ink};font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-x:hidden}
${bgCss}
main{position:relative;z-index:1;max-width:${look.layout === 'side' ? 760 : 680}px;margin:0 auto;padding:${cover ? '0' : '48px'} 16px 40px}
.card{${cardCss};border-radius:18px}
.cover{position:relative;z-index:1;height:min(${CH}px,68vh);overflow:hidden}
.cover img{width:100%;height:100%;object-fit:cover;display:block;-webkit-mask-image:linear-gradient(180deg,#000 45%,transparent 98%);mask-image:linear-gradient(180deg,#000 45%,transparent 98%)}
.hero{display:flex;flex-direction:column;align-items:${left ? 'flex-start' : 'center'};text-align:${left ? 'left' : 'center'};gap:14px${cover ? ';margin-top:-72px;position:relative' : ''}}
.pic{width:min(${W}px,78vw);height:auto;aspect-ratio:${W}/${PH};border-radius:${rad};object-fit:cover;border:2px solid ${solid};box-shadow:0 22px 60px -22px rgba(0,0,0,.65);flex:none}
.htext{display:flex;flex-direction:column;align-items:${left ? 'flex-start' : 'center'};gap:8px;min-width:0}
h1{font-family:'${F[0]}','Bodoni 72',Didot,Georgia,serif;font-weight:${F[1]};${F[2]};font-size:${NS};line-height:1.02;margin:4px 0 0;overflow-wrap:anywhere}
.tag{margin:0;color:${muted};font-size:17px}.city{margin:0;color:${muted};font-size:13px;letter-spacing:.14em;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px}.city svg{color:${solid}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:999px;border:1px solid ${line};color:${ink};text-decoration:none;font-weight:600;background:${panel}}
.btn.primary{background:${metal};color:#141711;border:0}.btn.small{min-height:36px;padding:0 16px;font-size:14px}
a:focus-visible{outline:2px solid ${solid};outline-offset:3px}
.cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:${left ? 'flex-start' : 'center'};margin-top:10px}
section{margin-top:${look.heads === 'big' ? 52 : 40}px}
h2{display:flex;align-items:center;gap:10px;margin:0 0 16px;${look.heads === 'big'
    ? `font-family:'${F[0]}',Georgia,serif;font-weight:${F[1]};${F[2]};font-size:clamp(26px,6vw,34px);line-height:1.1;color:${ink}`
    : `font:600 13px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${muted}`}}
h2 .ic{display:inline-grid;place-items:center;flex:none;${look.heads === 'big' ? `width:40px;height:40px;border-radius:12px;background:${metal};color:#141711` : `color:${solid}`}}
ul{list-style:none;margin:0;padding:0}
.show{display:flex;align-items:center;gap:14px;padding:14px;margin-bottom:10px}
.when{flex:none;width:58px;text-align:center;display:flex;flex-direction:column;line-height:1.1}.when .m{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${solid};font-weight:600}.when .d{font-size:26px;font-weight:600}.when .w{font-size:12px;color:${muted}}
.what{flex:1;min-width:0;display:flex;flex-direction:column}.what b{font-weight:600}.what span{color:${muted};font-size:14px}.what a.map{color:inherit;text-decoration:underline;text-decoration-color:${line};text-underline-offset:3px}.what a.map:hover,.what a.map:focus-visible{color:${ink};text-decoration-color:currentColor}.what a.map svg{margin-right:4px;vertical-align:-1px;color:${solid}}
.empty{color:${muted};padding:14px;border-style:dashed}
.links{display:flex;flex-direction:column;gap:10px}
.lk{display:flex;align-items:center;justify-content:center;text-align:center;min-height:54px;padding:0 18px;color:${ink};text-decoration:none;font-weight:600;transition:transform .15s,border-color .15s}.lk:hover{transform:translateY(-1px);border-color:${solid}}
.gal{display:grid;gap:8px;grid-template-columns:repeat(2,1fr)}.gal a{display:block;border-radius:14px;overflow:hidden;aspect-ratio:1}.gal img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}.gal a:hover img{transform:scale(1.04)}
.gal.one{grid-template-columns:1fr}.gal.one a{aspect-ratio:4/3}
.gal.mosaic a:first-child{grid-column:span 2;aspect-ratio:16/10}
.gal.strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;margin:0 -16px;padding-left:16px;padding-right:16px;scrollbar-width:thin}.gal.strip a{flex:0 0 72%;aspect-ratio:4/5;scroll-snap-align:center}
.players{display:flex;flex-direction:column;gap:12px}.stand{height:100%;min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${muted};text-align:center;padding:12px}.stand svg{color:${solid}}.stand span{color:${ink};font-weight:600}.stand small{font-size:12px}.player{overflow:hidden;padding:0}.player.video{aspect-ratio:16/9}.player iframe{width:100%;height:100%;border:0;display:block}
.bio p{margin:0 0 12px}
.news{display:flex;flex-direction:column;gap:12px}.post{overflow:hidden;padding:0}.post img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}.post .pbody{padding:16px 18px}.post h3{margin:0 0 6px;font-size:18px;line-height:1.3}.post p{margin:0 0 12px;color:${muted}}.post p:last-child{margin-bottom:0}
.bookbox{padding:18px}.bookbox p{margin:0 0 14px;color:${muted}}
${preview ? 'a{pointer-events:none}' : ''}
footer{margin-top:56px;text-align:center;font-size:13px;color:${muted}}footer a{color:${muted}}
@media (min-width:640px){.gal.strip{margin:0;padding-left:0;padding-right:0}.gal{grid-template-columns:repeat(3,1fr)}.gal.mosaic a:first-child{grid-column:span 2;grid-row:span 2;aspect-ratio:1}.gal.strip a{flex-basis:42%}}
${look.layout === 'side' ? `@media (min-width:720px){.hero{flex-direction:row;align-items:center;gap:32px}}` : ''}
@media (max-width:420px){main{padding-top:${cover ? 0 : 32}px}.show{flex-wrap:wrap}.show .btn{width:100%}}
</style></head><body>
${cover ? `<div class="cover"><img src="${esc(picSrc)}" alt="${esc(name)}"></div>` : ''}<main>
<header class="hero">${pic}${heroText}</header>
${sections}
<footer>Made with <a href="${esc(origin)}/">Set &amp; Settled</a></footer>
</main></body></html>`;
}


globalThis.SSPage = { page, embed, ICONS, FONTS, DEF_ORDER, DEF_TITLE, DEF_ICON, mergeOrder };
})();
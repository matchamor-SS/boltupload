// Set & Settled: public artist pages at setnsettled.com/<name> (and the share picture at /<name>/photo.jpg).
// Built on the server so Google and link previews can read it. Reads only what the artist made public.
// Each artist designs their own page in the app (My page → Design): layout, picture, fonts, colors, background, boxes,
// section titles and icons, photos, and players for their music and videos. Everything they choose is checked here.
const SB = 'https://mxcejgfxvxpvuhwenoou.supabase.co';
// the public "anon" key (the same one the website already ships); it can only read what the database allows
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y2VqZ2Z4dnhwdnVod2Vub291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzODI5NzYsImV4cCI6MjEwNzk1ODk3Nn0.uFG0Wcpjfqgl7_TWITcBVZ2m7q48V2Ij4z_TrYZud14';

export const config = { path: ['/:slug', '/:slug/photo.jpg'], preferStatic: true };

import '../../public/page-render.js';
const { page } = globalThis.SSPage;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// this page runs no scripts; it may show pictures, Google Fonts and the music and video players above
const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://w.soundcloud.com https://open.spotify.com https://www.mixcloud.com; base-uri 'none'; form-action 'none'";

export default async (req, context) => {
  const u = new URL(req.url), slug = String((context.params || {}).slug || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return notFound(slug);
  const d = await load(slug);
  // an old name of this artist: send people on to their page's current address
  if (d && typeof d.moved === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(d.moved) && d.moved !== slug)
    return new Response(null, { status: 302, headers: { location: `${u.origin}/${d.moved}${u.pathname.endsWith('/photo.jpg') ? '/photo.jpg' : ''}`, 'cache-control': 'public, max-age=300' } });
  if (!d || !d.slug) return notFound(slug);
  if (u.pathname.endsWith('/photo.jpg')) {
    if (/^https:\/\//.test(d.photo || '')) return Response.redirect(d.photo, 302);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d.photo || ''); if (!m) return new Response('', { status: 404 });
    return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=3600' } });
  }
  // "Preview" in the app adds ?v=… so the artist always sees their latest design
  return new Response(page(d, u.origin), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': u.searchParams.has('v') ? 'no-store' : 'public, max-age=60', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
};
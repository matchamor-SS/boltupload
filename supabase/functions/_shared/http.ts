export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
const trim = (s?: string) => (s ?? '').replace(/\/+$/, '');
const configured = () => [trim(Deno.env.get('APP_ALLOWED_ORIGIN')), trim(Deno.env.get('APP_URL'))].filter(Boolean);
// Bolt's live preview and local dev run on their own addresses; auth is a bearer token, so allowing them adds no cookie risk.
const PREVIEW = /^(https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(webcontainer-api\.io|webcontainer\.io|bolt\.new)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;
/** The site addresses allowed to call these functions: the published site (APP_ALLOWED_ORIGIN / APP_URL) plus Bolt previews. */
export function isAllowedOrigin(origin: string | null): origin is string {
  return !!origin && (configured().includes(trim(origin)) || PREVIEW.test(origin));
}
const allowOrigin = (req: Request) => {
  const o = req.headers.get('Origin');
  if (isAllowedOrigin(o) || (o && configured().includes('*'))) return o!;
  return configured()[0] || '*';
};
export const corsHeaders = (req?: Request) => ({
  'Access-Control-Allow-Origin': req ? allowOrigin(req) : (configured()[0] || '*'), 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Vary': 'Origin',
});
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** Wraps a handler: CORS on every response, uniform errors (never leaks Google response bodies or stack traces). */
export const handler = (fn: (req: Request) => Promise<Response>) => Deno.serve(async req => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let res: Response;
  try { res = await fn(req); }
  catch (e) { if (e instanceof HttpError) res = json({ error: e.code }, e.status); else { console.error('fn error', (e as Error).message); res = json({ error: 'server_error' }, 500); } }
  const h = new Headers(res.headers); for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
});

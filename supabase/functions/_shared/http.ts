export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
const trim = (s?: string) => (s ?? '').replace(/\/+$/, '');
const configured = () => [trim(Deno.env.get('APP_ALLOWED_ORIGIN')), trim(Deno.env.get('APP_URL'))].filter(Boolean);
const PREVIEW = /^(https:\/\/([a-z0-9-]+\.)+(webcontainer-api\.io|webcontainer\.io|bolt\.new|bolt\.host|bolt\.run|stackblitz\.io|netlify\.app)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;
/** Site addresses Google may send people back to after consent: the published site plus Bolt previews. */
export function isAllowedOrigin(origin: string | null): origin is string {
  return !!origin && (configured().includes(trim(origin)) || PREVIEW.test(origin));
}
// Every call is authorized by the person's bearer token (no cookies), so any site may call these functions.
export const corsHeaders = (req?: Request) => ({
  'Access-Control-Allow-Origin': req?.headers.get('Origin') || '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
/** Set APP_ALLOWED_ORIGIN to your site (e.g. https://setandsettled.com). '*' is only for first-time setup. */
const origin = () => Deno.env.get('APP_ALLOWED_ORIGIN') ?? '*';
export const corsHeaders = () => ({
  'Access-Control-Allow-Origin': origin(), 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Vary': 'Origin',
});
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
/** Wraps a handler: CORS preflight, uniform errors (never leaks Google response bodies or stack traces). */
export const handler = (fn: (req: Request) => Promise<Response>) => Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try { return await fn(req); }
  catch (e) { if (e instanceof HttpError) return json({ error: e.code }, e.status); console.error('fn error', (e as Error).message); return json({ error: 'server_error' }, 500); }
});

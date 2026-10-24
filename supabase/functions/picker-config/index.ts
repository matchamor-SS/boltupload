import { corsHeaders, json, handler } from '../_shared/http.ts';

handler(async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const apiKey = Deno.env.get('VITE_GOOGLE_API_KEY');
  const appId = Deno.env.get('VITE_GOOGLE_APP_ID');
  if (!apiKey || !appId) return json({ error: 'picker_not_configured' }, 503);
  return json({ apiKey, appId });
});

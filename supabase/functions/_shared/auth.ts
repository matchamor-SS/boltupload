import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HttpError } from './http.ts';
/** Service-role client. Server only. Every query MUST be scoped by the verified owner id. */
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
export async function userFrom(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'unauthorized');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'unauthorized');
  return data.user;
}
export const audit = (ownerId: string, action: string, meta: Record<string, unknown> = {}) =>
  admin.from('audit_log').insert({ owner_id: ownerId, action, meta });

/* Email templates live in their own table (public.email_templates, owner-only RLS).
 * The first time someone's templates load and they have none, they get the 10 starter templates. */
import type { EmailTemplate, StageKey } from './emailTemplates.ts';
import STARTER from './templates.starter.json';
import { sb } from './supabase.js';

type Data = Omit<EmailTemplate, 'id'>;
const SEEDED = { col: 'settings', id: 'templates' };

export function toRow(data: Partial<Data>) {
  const row: Partial<Data> = {};
  if (data.name !== undefined) row.name = String(data.name || '').slice(0, 200) || 'Untitled template';
  if (data.stage !== undefined) row.stage = String(data.stage || '').slice(0, 40) as StageKey | '';
  if (data.audience !== undefined) row.audience = data.audience === 'media' ? 'media' : 'venue';
  if (data.subject !== undefined) row.subject = String(data.subject || '').slice(0, 300);
  if (data.body !== undefined) row.body = String(data.body || '').slice(0, 20000);
  return row;
}
export const fromRow = ({ name, stage, audience, subject, body }: EmailTemplate): Data => ({ name, stage, audience, subject, body });

async function seedIfNew(uid: string) {
  const { data: mark, error } = await sb.from('app_docs').select('id').match({ owner_id: uid, ...SEEDED }).maybeSingle();
  if (error || mark) return;
  const rows = (STARTER as EmailTemplate[]).map(t => ({ owner_id: uid, id: t.id, ...toRow(t) }));
  const { error: e2 } = await sb.from('email_templates').upsert(rows, { onConflict: 'owner_id,id', ignoreDuplicates: true });
  if (e2) return;
  await sb.from('app_docs').upsert({ owner_id: uid, ...SEEDED, data: { starterSeeded: true } }, { onConflict: 'owner_id,col,id' });
}

export async function loadTemplates(uid: string) {
  const sel = () => sb.from('email_templates').select('id,name,stage,audience,subject,body');
  let { data, error } = await sel();
  if (!error && data && !data.length) { await seedIfNew(uid); ({ data, error } = await sel()); }
  return { data: data as EmailTemplate[] | null, error };
}

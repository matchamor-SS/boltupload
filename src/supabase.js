import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
/** Demo mode: sample data in memory, nothing saved or sent. Also used when Supabase isn't configured yet. */
export const MOCK = import.meta.env.VITE_SS_MOCK === '1';
export const CONFIGURED = !!(SUPABASE_URL && ANON);

export const sb = CONFIGURED && !MOCK
  ? createClient(SUPABASE_URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;

/** Public URL of an uploaded picture (profile photo, older Kit files). Paths are `<user id>/<random uuid>.<ext>`. */
export const blobUrl = id => {
  if (!id) return '';
  if (/^(https?:|data:|blob:)/.test(id)) return id;
  if (MOCK || !CONFIGURED) return (window.__ssMockBlobs && window.__ssMockBlobs[id]) || '';
  return `${SUPABASE_URL}/storage/v1/object/public/user-assets/${id.split('/').map(encodeURIComponent).join('/')}`;
};

export const err = (code, message) => Object.assign(new Error(message || code), { code });

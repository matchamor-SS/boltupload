/* Installs `window.claude.use(name)`, the small runtime API the app code calls, backed by this site's own services:
 *   db        -> Supabase table app_docs (RLS: owner only)              see db.js
 *   mcp       -> Google through the `google` Edge Function              see google.js
 *   assets    -> Supabase Storage bucket user-assets (profile photo, older Kit pictures)
 *   downloads -> a normal browser download
 * Anything else resolves to null, exactly like an unavailable capability. */
import { sb, blobUrl, err } from './supabase.js';
import { makeDb } from './db.js';
import { mcp, pickFolder, ensureGoogle } from './google.js';
import * as templates from './emailTemplates.ts';

const MAX_UPLOAD = 10 * 1024 * 1024;
const OK_TYPES = /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|quicktime|webm)|application\/pdf)$/i;

function makeAssets(uid) {
  return Object.freeze({
    async upload(blob) {
      const type = blob.type || 'application/octet-stream';
      if (!OK_TYPES.test(type)) throw err('invalid_argument', 'Only pictures, short videos and PDFs can be uploaded.');
      if (blob.size > MAX_UPLOAD) throw err('too_large', 'That file is over 10 MB.');
      const ext = (type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase();
      const id = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('user-assets').upload(id, blob, { contentType: type, upsert: false, cacheControl: '31536000' });
      if (error) throw err('unavailable', error.message);
      return { id, url: blobUrl(id), contentType: type, sizeBytes: blob.size };
    },
    async delete(id) {
      if (!String(id).startsWith(uid + '/')) return;
      await sb.storage.from('user-assets').remove([id]);
    },
    async list() {
      const { data } = await sb.storage.from('user-assets').list(uid, { limit: 1000 });
      return { assets: (data || []).map(f => ({ id: `${uid}/${f.name}`, url: blobUrl(`${uid}/${f.name}`), sizeBytes: f.metadata && f.metadata.size })), usage: {} };
    },
  });
}

export const downloads = Object.freeze({
  async save({ filename, data, contentType }) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: contentType || (/\.pdf$/i.test(filename) ? 'application/pdf' : /\.csv$/i.test(filename) ? 'text/csv' : /\.html?$/i.test(filename) ? 'text/html' : 'application/octet-stream') });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = String(filename || 'download').replace(/[\\/:*?"<>|]/g, '-'); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { saved: true };
  },
});

export function installRuntime(user, override) {
  const caps = override || { db: makeDb(user.id), mcp, assets: makeAssets(user.id), downloads };
  window.claude = Object.freeze({ use: async name => caps[name] || null });
  window.__blob = blobUrl;
  window.SS = Object.freeze({ pickFolder: override && override.pickFolder ? override.pickFolder : pickFolder, ensureGoogle: override ? async () => true : ensureGoogle, templates: Object.freeze({ ...templates }), user: { id: user.id, email: user.email } });
}

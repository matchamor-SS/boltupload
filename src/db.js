/* The app was written against a small Firestore-style API:
 *   db.collection(c).onSnapshot(cb, onErr) / .add(data) / .doc(id).set|update|delete|get|onSnapshot
 *   db.doc("settings/profile").onSnapshot|set|update|get
 * This file provides exactly that, backed by one Supabase table (public.app_docs) with
 * row-level security: every row belongs to the signed-in user and nobody else can read or write it.
 * update() deep-merges nested objects on the server (public.app_docs_merge), same as the original runtime.
 * Before anything is stored, the database also scrubs bank and card numbers (trigger app_docs_scrub). */
import { sb, err } from './supabase.js';
import { loadTemplates, toRow, fromRow } from './templateStore.ts';

// Collections that live in their own table instead of app_docs.
const TPL = 'templates';

const cache = new Map();          // col -> Map(id -> data)
const colListeners = new Map();   // col -> Set(cb)
const docListeners = new Map();   // "col/id" -> Set(cb)
const loading = new Map();        // col -> Promise
let uid = null, channel = null;

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const pgErr = e => err(e && (e.code === '42501' || /permission|row-level/i.test(e.message || '')) ? 'permission_denied' : e && e.code === 'P0002' ? 'not_found' : 'unavailable', e && e.message);

function snapOf(col) {
  const m = cache.get(col) || new Map();
  const docs = [...m].map(([id, d]) => ({ id, exists: true, data: () => clone(d) }));
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
}
function docSnap(col, id) { const d = (cache.get(col) || new Map()).get(id); return { id, exists: d !== undefined, data: () => clone(d) }; }
function emit(col) {
  const s = snapOf(col);
  (colListeners.get(col) || []).forEach(cb => { try { cb(s); } catch (e) { console.error(e); } });
  for (const [key, set] of docListeners) {
    const i = key.indexOf('/'); if (key.slice(0, i) !== col) continue;
    const ds = docSnap(col, key.slice(i + 1));
    set.forEach(cb => { try { cb(ds); } catch (e) { console.error(e); } });
  }
}
function load(col) {
  if (!loading.has(col)) loading.set(col, (async () => {
    if (col === TPL) {
      const { data, error } = await loadTemplates(uid);
      if (error) { loading.delete(col); throw pgErr(error); }
      cache.set(col, new Map(data.map(r => [r.id, fromRow(r)])));
      return;
    }
    const { data, error } = await sb.from('app_docs').select('id,data').eq('col', col);
    if (error) { loading.delete(col); throw pgErr(error); }
    cache.set(col, new Map(data.map(r => [r.id, r.data])));
  })());
  return loading.get(col);
}
/** Live updates from other tabs/devices. Local writes update the cache immediately and don't wait for this. */
function realtime() {
  if (channel || !uid) return;
  channel = sb.channel('app_docs_' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_docs', filter: `owner_id=eq.${uid}` }, p => {
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      if (!row || !row.col || !cache.has(row.col)) return;
      if (p.eventType === 'DELETE') cache.get(row.col).delete(row.id); else cache.get(row.col).set(row.id, row.data);
      emit(row.col);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'email_templates', filter: `owner_id=eq.${uid}` }, p => {
      if (!cache.has(TPL)) return;
      if (p.eventType === 'DELETE') { if (p.old && p.old.id) cache.get(TPL).delete(p.old.id); } else cache.get(TPL).set(p.new.id, fromRow(p.new));
      emit(TPL);
    })
    .subscribe();
}
function put(col, id, data) { if (!cache.has(col)) cache.set(col, new Map()); if (data === undefined) cache.get(col).delete(id); else cache.get(col).set(id, data); emit(col); }

async function setDoc(col, id, data) {
  if (col === TPL) {
    const { data: row, error } = await sb.from('email_templates').upsert({ owner_id: uid, id, ...toRow({ name: '', stage: '', audience: 'venue', subject: '', body: '', ...data }) }, { onConflict: 'owner_id,id' }).select('id,name,stage,audience,subject,body').single();
    if (error) throw pgErr(error);
    return put(col, id, fromRow(row));
  }
  const { data: row, error } = await sb.from('app_docs').upsert({ owner_id: uid, col, id, data: clone(data) ?? {} }, { onConflict: 'owner_id,col,id' }).select('data').single();
  if (error) throw pgErr(error);
  put(col, id, row.data);
}
async function updateDoc(col, id, patch) {
  if (col === TPL) {
    const { data: row, error } = await sb.from('email_templates').update(toRow(patch || {})).match({ owner_id: uid, id }).select('id,name,stage,audience,subject,body').maybeSingle();
    if (error) throw pgErr(error);
    if (!row) throw err('not_found');
    return put(col, id, fromRow(row));
  }
  const { data, error } = await sb.rpc('app_docs_merge', { p_col: col, p_id: id, p_patch: clone(patch) ?? {} });
  if (error) throw pgErr(error);
  put(col, id, data);
}
async function deleteDoc(col, id) {
  const { error } = col === TPL
    ? await sb.from('email_templates').delete().match({ owner_id: uid, id })
    : await sb.from('app_docs').delete().match({ owner_id: uid, col, id });
  if (error) throw pgErr(error);
  put(col, id, undefined);
}

function docRef(col, id) {
  return {
    id,
    async get() { await load(col); return docSnap(col, id); },
    set: data => setDoc(col, id, data),
    update: patch => updateDoc(col, id, patch),
    delete: () => deleteDoc(col, id),
    onSnapshot(cb, onErr) {
      const key = col + '/' + id; let set = docListeners.get(key); if (!set) docListeners.set(key, set = new Set()); set.add(cb);
      load(col).then(() => cb(docSnap(col, id))).catch(e => onErr && onErr(e)); realtime();
      return () => set.delete(cb);
    },
  };
}
function colRef(col) {
  return {
    doc: id => docRef(col, id ?? newId()),
    async add(data) { const id = newId(); await setDoc(col, id, data); return { id }; },
    async get() { await load(col); return snapOf(col); },
    onSnapshot(cb, onErr) {
      let set = colListeners.get(col); if (!set) colListeners.set(col, set = new Set()); set.add(cb);
      load(col).then(() => cb(snapOf(col))).catch(e => onErr && onErr(e)); realtime();
      return () => set.delete(cb);
    },
  };
}
export function makeDb(userId) {
  uid = userId;
  const db = { collection: colRef, doc: path => { const [c, ...rest] = String(path).split('/'); return docRef(c, rest.join('/')); } };
  return Object.freeze(db);
}
/** Everything this user has stored, for "Download my data". */
export async function exportAll() {
  const { data, error } = await sb.from('app_docs').select('col,id,data,updated_at').order('col');
  if (error) throw pgErr(error);
  const { data: tpls, error: e2 } = await sb.from('email_templates').select('id,name,stage,audience,subject,body,updated_at').order('name');
  if (e2) throw pgErr(e2);
  return [...data, ...tpls.map(({ updated_at, ...t }) => ({ col: TPL, id: t.id, data: fromRow(t), updated_at }))];
}

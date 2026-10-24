/* Demo mode (VITE_SS_MOCK=1): the full app with in-memory storage and a pretend Google.
 * Nothing is saved after you close the tab and nothing is sent anywhere. Used for previews and automated tests. */
import STARTER from './templates.starter.json';

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; };

export function makeMock() {
  const store = { templates: Object.fromEntries(STARTER.map(({ id, ...t }) => [id, t])) }, L = [], D = [];
  const fire = c => {
    const docs = Object.entries(store[c] || {}).map(([id, d]) => ({ id, exists: true, data: () => clone(d) }));
    L.filter(l => l.c === c).forEach(l => l.f({ docs, size: docs.length, empty: !docs.length }));
    D.filter(l => l.c === c).forEach(l => { const d = (store[c] || {})[l.id]; l.f({ id: l.id, exists: d !== undefined, data: () => clone(d) }); });
  };
  const docRef = (c, id) => ({
    id,
    async get() { const d = (store[c] || {})[id]; return { id, exists: d !== undefined, data: () => clone(d) }; },
    async set(d) { (store[c] = store[c] || {})[id] = clone(d); fire(c); },
    async update(d) { if (!(store[c] || {})[id]) throw Object.assign(new Error('not_found'), { code: 'not_found' }); merge(store[c][id], clone(d)); fire(c); },
    async delete() { if (store[c]) delete store[c][id]; fire(c); },
    onSnapshot(f) { const l = { c, id, f }; D.push(l); setTimeout(() => fire(c), 0); return () => D.splice(D.indexOf(l), 1); },
  });
  const db = {
    collection: c => ({
      doc: id => docRef(c, id || Math.random().toString(36).slice(2)),
      async add(d) { const id = 'n' + Math.random().toString(36).slice(2); (store[c] = store[c] || {})[id] = clone(d); fire(c); return { id }; },
      onSnapshot(f) { const l = { c, f }; L.push(l); setTimeout(() => fire(c), 0); return () => L.splice(L.indexOf(l), 1); },
    }),
    doc: p => { const [c, ...r] = p.split('/'); return docRef(c, r.join('/')); },
  };

  const files = {}, calls = []; let n = 0;
  const unq = x => x.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const trash = id => { if (!files[id]) return; files[id].trashed = true; Object.values(files).filter(f => f.parentId === id).forEach(f => trash(f.id)); };
  const mcp = {
    async callTool(server, tool, input = {}) {
      calls.push({ server, tool, input });
      if (tool === 'send_message') return { payload: { id: 'demo' + calls.length, threadId: 'demo' + calls.length, labelIds: ['SENT'] } };
      if (tool === 'create_file') { n++; const f = { id: 'demo-file-' + n, title: input.title, parentId: input.parentId || 'root', mimeType: input.contentMimeType, canAddChildren: true, viewUrl: 'https://drive.google.com/', owner: 'demo@example.com' }; files[f.id] = f; return { payload: { ...f } }; }
      if (tool === 'search_files') {
        const q = input.query || '', te = q.match(/title = '((?:[^'\\]|\\.)*)'/), tc = q.match(/title contains '((?:[^'\\]|\\.)*)'/), pa = q.match(/parentId = '([^']*)'/);
        const out = Object.values(files).filter(f => !f.trashed && (!te || f.title === unq(te[1])) && (!tc || f.title.includes(unq(tc[1]))) && (!pa || f.parentId === pa[1]));
        return { payload: out.length ? { files: out.map(f => ({ ...f })) } : {} };
      }
      if (tool === 'get_file_metadata') { const f = files[input.fileId]; if (!f) throw Object.assign(new Error('not_found'), { code: 'tool_error' }); return { payload: { ...f } }; }
      if (tool === 'trash_file') { trash(input.fileId); return { payload: {} }; }
      if (tool === 'list_calendars') return { payload: { calendars: [{ id: 'primary', summary: 'Demo calendar', primary: true }] } };
      if (tool === 'list_events') return { payload: { events: [] } };
      if (tool === 'create_event' || tool === 'update_event') return { payload: { id: 'demo-ev-' + calls.length, htmlLink: 'https://calendar.google.com/' } };
      return { payload: {} };
    },
    invalidate: async () => {}, watchTool: () => () => {}, describeTool: async () => null,
  };
  const blobs = window.__ssMockBlobs = {};
  const assets = {
    async upload(blob) { const id = 'demo/' + Math.random().toString(36).slice(2); blobs[id] = URL.createObjectURL(blob); return { id, url: blobs[id], contentType: blob.type, sizeBytes: blob.size }; },
    async delete(id) { delete blobs[id]; }, async list() { return { assets: [], usage: {} }; },
  };
  const pickFolder = async () => { n++; const f = { id: 'demo-file-' + n, title: 'My existing folder', parentId: 'root', canAddChildren: true, viewUrl: 'https://drive.google.com/', owner: 'demo@example.com' }; files[f.id] = f; return { ...f }; };
  window.__ssDemo = { store, files, calls, trash };
  return { db, mcp, assets, pickFolder };
}

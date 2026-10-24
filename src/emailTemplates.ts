/* Email templates: data model, fill-ins and behavior, exactly as the Set & Settled / Match.a.mor HQ app does it.
 * Framework-free TypeScript: drop it into src/lib/ (React, Vue, Svelte or plain JS all work).
 * Sending is NOT in here. Sending goes through the server (Gmail `gmail.send` only) after a review screen. */

// ---------------------------------------------------------------- data model
export type StageKey = 'lead' | 'pitched' | 'confirmed' | 'played' | 'paid' | 'lost';
export interface EmailTemplate {
  id: string;
  name: string;              // e.g. "Lead · First outreach"
  stage: StageKey | '';      // "Suggest for stage". '' = any stage
  audience: 'venue' | 'media'; // who it's normally addressed to (media templates default to the booking's media person)
  subject: string;           // may contain {{fill_ins}}
  body: string;              // plain text, may contain {{fill_ins}}; line breaks are kept
}
export const STAGES: [StageKey, string][] = [
  ['lead', 'Lead'], ['pitched', 'Pitched'], ['confirmed', 'Confirmed'], ['played', 'Played'], ['paid', 'Paid'], ['lost', 'Lost'],
];

/** What fill() needs. Map these from your own tables. */
export interface Contact { id: string; type: 'venue' | 'promoter' | 'media' | 'other'; name?: string; org?: string; email?: string; address?: string;
  pkind?: 'person' | 'collective'; mainContactId?: string; bookingContactId?: string }
export interface Booking { id: string; title?: string; status: StageKey; date?: string /* YYYY-MM-DD */; setTime?: string; city?: string; address?: string;
  fee?: number; ticketUrl?: string; driveUrl?: string /* media upload folder */; venueId?: string; promoterId?: string; mediaId?: string; contactPersonId?: string }
export interface Profile { myName?: string; djName?: string; website?: string; epk?: string; instagram?: string; phone?: string; email?: string }
export interface Kit { bioShort?: string; bioLong?: string; genres?: string; rider?: string; hospitality?: string; promoFolderUrl?: string }
export interface Ctx {
  contacts: Contact[];
  profile: Profile;
  kit: Kit;
  links: { label: string; url: string }[];          // Kit → Links, already in display order
  promoFiles: { label: string; shareUrl: string }[]; // Kit → promo files that have a share link
  openDates: string[];                               // YYYY-MM-DD, from the Availability screen
  payHandles: Partial<Record<'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'other', string>>; // Settings → How you get paid
}

// ---------------------------------------------------------------- the fill-in picker (groups, labels, keys)
export const FILLINS: [string, [string, string][]][] = [
  ['Contact & show', [['contact_first', "Contact's first name"], ['venue', 'Venue name'], ['promoter', 'Promoter name'], ['media_name', "Media person's name"], ['show', 'Show name']]],
  ['Date & place', [['date', 'Show date'], ['set_time', 'Set time'], ['city', 'City'], ['address', 'Address'], ['availability', 'My open dates (from Availability)']]],
  ['Money & links', [['fee', 'Fee'], ['ticket_link', 'Ticket link'], ['media_folder', 'Media upload folder']]],
  ['About you', [['pay_handles', 'Payment usernames'], ['my_name', 'Your name'], ['dj_name', 'DJ name'], ['website', 'Website'], ['epk', 'EPK link'], ['instagram', 'Instagram'], ['phone', 'Phone']]],
  ['From your Kit', [['bio_short', 'Short bio'], ['bio_long', 'Long bio'], ['links', 'All your links'], ['files', 'Promo file share links'], ['promo_folder', 'Promo content folder'], ['rider', 'Tech rider'], ['hospitality', 'Hospitality rider'], ['press_kit', 'Full press kit']]],
];

// ---------------------------------------------------------------- formatting helpers (same output as the app)
const parseD = (ds: string) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
/** "Sat, Oct 31, 2026" */
export const fmtD = (ds?: string) => (ds ? parseD(ds).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');
/** "$1,250" (whole dollars, same as the app) */
export const money = (n?: number) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
/** Venues and collectives show the organization name; people show their own name. */
export const cName = (c?: Contact) => (!c ? '' : c.type === 'venue' || (c.type === 'promoter' && c.pkind === 'collective') ? c.org || c.name || '' : c.name || c.org || '');
const byId = (ctx: Ctx, id?: string) => (id ? ctx.contacts.find(c => c.id === id) : undefined);
const bAddr = (ctx: Ctx, b?: Booking | null) => (b && (b.address || (byId(ctx, b.venueId) || {}).address)) || '';
/** "• Friday, November 6" one per line, or "(no open dates right now)" */
const availText = (ctx: Ctx) => ctx.openDates.length ? ctx.openDates.map(ds => '• ' + parseD(ds).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })).join('\n') : '(no open dates right now)';
const linksText = (ctx: Ctx) => ctx.links.map(l => `${l.label}: ${l.url}`).join('\n');
const filesText = (ctx: Ctx) => ctx.promoFiles.map(f => `${f.label}: ${f.shareUrl}`).join('\n');
const HANDLES: [keyof Ctx['payHandles'], string][] = [['venmo', 'Venmo'], ['cashapp', 'Cash App'], ['paypal', 'PayPal'], ['zelle', 'Zelle']];
const handlesText = (ctx: Ctx) => [...HANDLES.filter(([k]) => ctx.payHandles[k]).map(([k, l]) => `${l}: ${ctx.payHandles[k]}`), ctx.payHandles.other || ''].filter(Boolean).join('\n');
const pressKitText = (ctx: Ctx) => {
  const p = ctx.profile, k = ctx.kit;
  return [p.djName || '', k.bioShort || '', k.genres ? 'Sound: ' + k.genres : '', linksText(ctx), k.promoFolderUrl ? 'Logos, photos & videos: ' + k.promoFolderUrl : '', filesText(ctx),
    k.rider ? 'Tech rider:\n' + k.rider : '', k.hospitality ? 'Hospitality rider:\n' + k.hospitality : '',
    ['Booking: ' + (p.myName || ''), p.email, p.phone].filter(Boolean).join(' · ')].filter(x => x && x.trim()).join('\n\n');
};

// ---------------------------------------------------------------- fill(): swaps {{fill_ins}} for real details
/** Unknown fill-ins are left as typed (so a typo stays visible). Empty values become "" — except contact_first, which falls back to "there" ("Hi there,"). */
export function fill(str: string, ctx: Ctx, b?: Booking | null, to?: Contact | null): string {
  const v = b ? byId(ctx, b.venueId) : undefined, pr = b ? byId(ctx, b.promoterId) : undefined, md = b ? byId(ctx, b.mediaId) : undefined;
  const p = ctx.profile, K = ctx.kit;
  const map: Record<string, string> = {
    availability: availText(ctx), bio_short: K.bioShort || '', bio_long: K.bioLong || '', rider: K.rider || '', hospitality: K.hospitality || '',
    promo_folder: K.promoFolderUrl || '', links: linksText(ctx), files: filesText(ctx), press_kit: pressKitText(ctx),
    promoter: (pr && (pr.name || pr.org)) || '', media_name: (md && md.name) || '',
    contact_first: ((to && to.name) || '').split(' ')[0] || 'there',
    venue: (v && (v.org || v.name)) || '', date: b && b.date ? fmtD(b.date) : '', city: (b && b.city) || '', address: bAddr(ctx, b),
    fee: b && b.fee ? money(b.fee) : '', set_time: (b && b.setTime) || '', show: (b && b.title) || '', ticket_link: (b && b.ticketUrl) || '', media_folder: (b && b.driveUrl) || '',
    pay_handles: handlesText(ctx), my_name: p.myName || '', dj_name: p.djName || '', website: p.website || '', epk: p.epk || '', instagram: p.instagram || '', phone: p.phone || '',
  };
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

// ---------------------------------------------------------------- who it goes to by default
/** Media templates → the booking's media person. Otherwise: the person you're talking to → the promoter
 *  (a collective without its own email → its main contact) → the venue's booking contact → the venue. */
export function defaultRecipient(t: EmailTemplate, ctx: Ctx, b?: Booking | null): string {
  if (!b) return '';
  if (t.audience === 'media') return b.mediaId || '';
  if (b.contactPersonId && byId(ctx, b.contactPersonId)) return b.contactPersonId;
  const p = byId(ctx, b.promoterId);
  if (p) return p.type === 'promoter' && p.pkind === 'collective' && !p.email && p.mainContactId ? p.mainContactId : p.id;
  return (byId(ctx, b.venueId) || ({} as Contact)).bookingContactId || b.venueId || '';
}
/** Recipient dropdown: People grouped by type, the likely type first (Media for a media template). Contacts with no email get " (no email)". */
export function recipientGroups(ctx: Ctx, first?: Contact['type']) {
  const TYPES: [Contact['type'], string][] = [['venue', 'Venues & festivals'], ['promoter', 'Promoters & collectives'], ['media', 'Media'], ['other', 'Other people']];
  return [...TYPES].sort((a, b) => Number(b[0] === first) - Number(a[0] === first))
    .map(([type, label]) => ({ label, options: ctx.contacts.filter(c => (c.type || 'other') === type).sort((a, b) => cName(a).localeCompare(cName(b))).map(c => ({ value: c.id, label: cName(c) + (c.email ? '' : ' (no email)') })) }))
    .filter(g => g.options.length);
}

// ---------------------------------------------------------------- ordering, suggestion and grouping
const stageIdx = (k: string) => { const i = STAGES.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
/** Templates for the booking's current stage first, then by stage order, then A–Z. */
export const sortedTemplates = (all: EmailTemplate[], cur?: StageKey) => [...all].sort((a, b) =>
  (Number(!!cur && b.stage === cur) - Number(!!cur && a.stage === cur)) || (stageIdx(a.stage) - stageIdx(b.stage)) || (a.name || '').localeCompare(b.name || ''));
/** The template pre-selected on a booking: the first one tagged with the booking's stage (shown with a ★). */
export const suggestedTemplate = (all: EmailTemplate[], b: Booking) => all.find(t => t.stage && t.stage === b.status);
/** Booking "Send an email" dropdown: "Blank email", then one group per stage, then "Any stage". */
export function templateDropdown(all: EmailTemplate[], b: Booking) {
  const sug = suggestedTemplate(all, b);
  const opt = (t: EmailTemplate) => ({ value: t.id, label: (t.stage === b.status ? '★ ' : '') + t.name, selected: !!sug && t.id === sug.id });
  const groups = STAGES.map(([k, l]) => ({ label: l, options: all.filter(t => t.stage === k).sort((a, c) => a.name.localeCompare(c.name)).map(opt) })).filter(g => g.options.length);
  const any = all.filter(t => !t.stage || !STAGES.some(([k]) => k === t.stage)).map(opt);
  return { blank: { value: '__blank', label: 'Blank email', selected: !sug }, groups, any: any.length ? { label: 'Any stage', options: any } : null };
}
/** Comms → Templates filter chips: All · each stage that has templates · Any stage (with counts). */
export function filterChips(all: EmailTemplate[]) {
  const tagged = (t: EmailTemplate) => !!t.stage && STAGES.some(([k]) => k === t.stage);
  return [['all', 'All', all.length], ...STAGES.filter(([k]) => all.some(t => t.stage === k)).map(([k, l]) => [k, l, all.filter(t => t.stage === k).length]), ['any', 'Any stage', all.filter(t => !tagged(t)).length]] as [string, string, number][];
}
/** List for a chip. A stage chip shows that stage's templates, then "Also works at any stage" + the untagged ones. */
export function filteredTemplates(all: EmailTemplate[], chip: string) {
  const tagged = (t: EmailTemplate) => !!t.stage && STAGES.some(([k]) => k === t.stage);
  const s = sortedTemplates(all);
  if (chip === 'all') return { main: s, alsoAny: [] as EmailTemplate[] };
  if (chip === 'any') return { main: s.filter(t => !tagged(t)), alsoAny: [] };
  return { main: s.filter(t => t.stage === chip), alsoAny: s.filter(t => !tagged(t)) };
}

// ---------------------------------------------------------------- editor helpers
/** Insert "{{key}}" at the cursor of whichever box (subject or body) was last focused, keep the cursor after it. */
export function insertFillIn(el: HTMLInputElement | HTMLTextAreaElement, key: string) {
  const tok = '{{' + key + '}}', a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
  el.value = el.value.slice(0, a) + tok + el.value.slice(z);
  el.focus(); el.setSelectionRange(a + tok.length, a + tok.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
/** "Open in Gmail" fallback link (no Google permission needed; the user sends from Gmail). */
export const gmailComposeUrl = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
/** "Copy text" button content. */
export const copyText = (to: string, subject: string, body: string) => `${to ? 'To: ' + to + '\n' : ''}Subject: ${subject}\n\n${body}`;

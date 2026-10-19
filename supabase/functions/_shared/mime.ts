// Builds an RFC 5322 message for users.messages.send. Header values are checked for CR/LF injection.
export interface Attachment { filename: string; mimeType: string; dataBase64: string }
const bytes = (s: string) => new TextEncoder().encode(s);
const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const wrap = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
export const b64url = (s: string) => toB64(bytes(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const safe = (v: string) => { if (/[\r\n]/.test(v)) throw new Error('header_injection'); return v; };
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const textToHtml = (t: string) => t.split(/\n{2,}/).map(p => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
/** The user's own signature HTML: strip active content before it goes into a message. */
export const cleanSignature = (h: string) => h.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '');
export function buildMime(o: { to: string[]; cc?: string[]; subject: string; html: string; attachments?: Attachment[] }): string {
  const b = `ss_${crypto.randomUUID().replace(/-/g, '')}`;
  const h = [`To: ${o.to.map(safe).join(', ')}`, ...(o.cc?.length ? [`Cc: ${o.cc.map(safe).join(', ')}`] : []),
    `Subject: =?UTF-8?B?${toB64(bytes(safe(o.subject)))}?=`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${b}"`];
  const parts = [`--${b}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(toB64(bytes(o.html)))}`];
  for (const a of o.attachments ?? []) {
    parts.push(`--${b}\r\nContent-Type: ${safe(a.mimeType)}; name="${safe(a.filename).replace(/"/g, '')}"\r\nContent-Disposition: attachment; filename="${a.filename.replace(/["\r\n]/g, '')}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(a.dataBase64)}`);
  }
  return `${h.join('\r\n')}\r\n\r\n${parts.join('\r\n')}\r\n--${b}--`;
}

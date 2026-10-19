// AES-256-GCM for Google refresh tokens. Key: TOKEN_ENCRYPTION_KEY (base64, 32 bytes) held only as a function secret.
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const key = () => crypto.subtle.importKey('raw', unb64(Deno.env.get('TOKEN_ENCRYPTION_KEY')!), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain)));
  return { ct: b64(ct), iv: b64(iv) };
}
export async function decrypt(ct: string, iv: string) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct)));
}

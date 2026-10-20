// Fails the build if anything would pull the app into Google's restricted tier or leak a secret to the browser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d, out = []) => { for (const f of readdirSync(d)) { if (['node_modules', 'dist', '.git'].includes(f)) continue; const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk('.').filter(f => /\.(js|mjs|ts|html|sql|toml)$/.test(f) && !f.endsWith('check-security.mjs') && !f.includes('vendor/'));
const banned = [
  [/gmail\.(compose|modify|readonly|metadata|insert|settings)/, 'restricted Gmail scope'],
  [/mail\.google\.com\/["'`]/, 'full Gmail scope'],
  [/auth\/drive(["'` ]|\.readonly|\.metadata)/, 'broad Drive scope (use drive.file)'],
  [/users\/me\/(drafts|threads)|messages\?|messages\/[^s]/, 'Gmail read/draft endpoint'],
  [/service_role|SERVICE_ROLE/, 'service role key outside Edge Functions'],
  [/GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY/, 'server secret outside Edge Functions'],
  [/ya29\.[\w-]{10,}/, 'Google access token literal'],
];
let bad = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8'), server = /(^|[\/])supabase[\/]/.test(f);
  for (const [re, why] of banned) {
    if (server && /service role|server secret/.test(why)) continue;
    if (re.test(s)) { console.error(`BLOCKED (${why}) in ${f}`); bad++; }
  }
}
if (bad) process.exit(1);
console.log(`security check passed: ${files.length} files scanned`);

"""Builds the Bolt project's derived files from the exact app file the user tested.
   in : /home/claude/restore/ss.html  (Set & Settled, latest)   + restore/legal.json
   out: index.html, public/app/app.js, public/vendor/jspdf.umd.min.js, privacy-policy/index.html, terms-of-service/index.html
The app code is copied as-is except for the small, listed swaps below (claude.ai wording, picture URLs, Google Picker)."""
import json, re, sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'prototype-set-and-settled.html')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(HERE)
APP = 'Set & Settled'
s = open(SRC, encoding='utf8').read()

# ---------------------------------------------------------------- split the single file
i = s.index('<script>'); j = s.index('</script>', i)
js = s[i + 8:j]
k = s.index('<script>', j); jspdf = s[k + 8:s.rindex('</script>')]
pre = s[:i]
style_a, style_b = pre.index('<style>'), pre.index('</style>') + len('</style>')
head_links = pre[:style_a]
style = pre[style_a:style_b]
markup = pre[style_b:].strip()
fonts = re.findall(r'<link[^>]+>', head_links)


def rep(src, old, new, count=1):
    n = src.count(old)
    assert n == count, f'expected {count} of {old[:90]!r}, found {n}'
    return src.replace(old, new)


# ---------------------------------------------------------------- app code swaps (everything else is untouched)
# 1. pictures: "/_blob/<id>" was the claude.ai asset URL; now Supabase Storage
js = rep(js, 'fetch("/_blob/"+f.assetId)', 'fetch(__blob(f.assetId))')
js = rep(js, '<img src="/_blob/${esc(f.assetId)}"', '<img src="${esc(__blob(f.assetId))}"', 2)
js = rep(js, '<img src="/_blob/${esc(p.avatarId)}"', '<img src="${esc(__blob(p.avatarId))}"')
# 2. wording that pointed at claude.ai
js = js.replace('claude.ai Settings → Connectors', 'Settings → Google account')
js = rep(js, 'Open the app in Claude to see your outside events.', 'Connect Google Calendar in Settings → Google account to see your outside events.')
js = js.replace("Can't save here — open from your Claude account", "Can't save right now. Check your connection and try again.")
js = rep(js, 'Google Drive is connected to Claude as', 'Google Drive is connected as')
js = rep(js, '''1. Open Settings → Google account.
2. Connect Google Drive and sign in as ${esc(want)}. If your work Drive is still connected too, Claude asks which one this page should use: pick ${esc(want)}.''',
         '''1. Open Settings → Google account and tap Disconnect.
2. Connect Google Drive again and sign in as ${esc(want)}.''')
js = js.replace("isn't available in this view", "isn't connected yet")
js = js.replace("aren't available in this view", "aren't available right now")
markup = rep(markup, "Couldn't reach your saved data. Open this page from your Claude account to load and save your bookings.",
             "Couldn't reach your saved data. Check your connection and reload the page.")
# 3. "Use a folder I already have": Google Picker (drive.file only sees folders the app made or the user picks)
a = js.index('function rootSearch(k,after,onCancel){'); b = js.index('/* ---------- filing', a)
js = js[:a] + r'''function rootSearch(k,after,onCancel){const R=ROOTS[k];sheet(`<h3>Choose your ${R.name} folder</h3><p class="note" style="margin:0">Pick the folder in your Google Drive to use. ${k==="biz"?"Each event gets Contracts and Invoices folders":"Each event gets Media and Flyers folders"} inside it, sorted by year. The app only gets access to the folder you pick.</p>
  <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" data-gpick>Choose from Google Drive…</button><button class="btn" data-gmake>Make a new “${esc(R.name)}” folder</button></div>
  <div class="actions"><button class="btn" data-close>Cancel</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=()=>{close();if(onCancel)onCancel()};
    root.querySelector("[data-gpick]").onclick=async()=>{const f=await SS.pickFolder(`Choose your ${R.name} folder`);if(f)saveRoot(k,f,after)};
    root.querySelector("[data-gmake]").onclick=async e=>{const btn=e.currentTarget;const mcp=await driveReady();if(!mcp)return;btn.disabled=true;btn.textContent="Creating…";
      try{const r=await mcp.callTool(GD,"create_file",{title:R.name,contentMimeType:FOLDER});const f=fileOf(r.payload);if(f&&f.id)saveRoot(k,f,after)}catch(err){driveErr(err);if(btn.isConnected){btn.disabled=false;btn.textContent=`Make a new “${R.name}” folder`}}}})}
''' + js[b:]
a = js.index('q("[data-pfpick]").onclick=async()=>{'); b = js.index('inp.oninput=()=>{clearTimeout(t);t=setTimeout(run,350)};run()}', a) + len('inp.oninput=()=>{clearTimeout(t);t=setTimeout(run,350)};run()}')
js = js[:a] + 'q("[data-pfpick]").onclick=async()=>{const f=await SS.pickFolder("Choose your promo content folder");if(f)savePromo({url:folderUrl(f),id:f.id,name:f.title})}' + js[b:]
for bad in ['/_blob/', 'claude.ai', 'Claude account', 'in Claude']:
    assert bad not in js, 'left in app code: ' + bad
js = '/* Set & Settled app code. Same code as the tested prototype; see README "What was changed from the prototype". */\n' + js

# ---------------------------------------------------------------- index.html
index = f'''<!doctype html>
<html lang="en" class="ss-locked">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{APP.replace('&', '&amp;')}</title>
<meta name="description" content="Bookings, availability, email, invoices and money for DJs and performers who book themselves.">
<meta name="theme-color" content="#55782B">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
{chr(10).join(fonts)}
{style}
</head>
<body>
<div id="ss-auth" hidden></div>
{markup}
<script type="module" src="/src/main.js"></script>
</body>
</html>
'''
open(f'{OUT}/index.html', 'w', encoding='utf8').write(index)
open(f'{OUT}/public/app/app.js', 'w', encoding='utf8').write(js)
open(f'{OUT}/public/vendor/jspdf.umd.min.js', 'w', encoding='utf8').write(jspdf.strip() + '\n')

# ---------------------------------------------------------------- public legal pages (no login, crawlable)
L = json.load(open(os.path.join(HERE, 'legal.json')))
def legal_page(title, body, path):
    body = body.replace('{{APP_NAME}}', APP.replace('&', '&amp;'))
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · {APP.replace('&', '&amp;')}</title>
<meta name="description" content="{title} for {APP.replace('&', '&amp;')}.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/src/legal.css">
</head>
<body>
<header class="lg-top"><a class="lg-brand" href="/">{APP.replace('&', '&amp;')}</a><nav><a href="/privacy-policy/">Privacy</a><a href="/terms-of-service/">Terms</a><a href="/">Sign in</a></nav></header>
<main class="lg">
<h1>{title}</h1>
<p class="lg-meta">Effective {{{{EFFECTIVE_DATE}}}} · Last updated {{{{EFFECTIVE_DATE}}}}</p>
{body}
</main>
<footer class="lg-foot">© {{{{COMPANY}}}} · <a href="/privacy-policy/">Privacy Policy</a> · <a href="/terms-of-service/">Terms of Service</a></footer>
</body>
</html>
'''
open(f'{OUT}/privacy-policy/index.html', 'w', encoding='utf8').write(legal_page('Privacy Policy', L['privacy'], 'privacy-policy'))
open(f'{OUT}/terms-of-service/index.html', 'w', encoding='utf8').write(legal_page('Terms of Service', L['terms'], 'terms-of-service'))
print('generated: index.html', len(index), '| app.js', len(js), '| jspdf', len(jspdf))

/* Sign-in screen. This is also the public home page Google's OAuth review looks at: it says what the app is
 * and links to the Privacy Policy and Terms. Email + password, or Google sign-in (basic profile only).
 * If the person turned on two-step verification, a 6-digit code is required after the password. */
import { sb } from './supabase.js';

const APP = 'Set & Settled';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = () => document.getElementById('ss-auth');

function frame(inner) {
  root().innerHTML = `<main class="ss-auth-wrap">
    <section class="ss-auth-intro">
      <div class="eyebrow">For performers who book themselves</div>
      <h1>${APP}</h1>
      <p class="ss-lead">From first pitch to final payout, all in one place.</p>
      <ul class="ss-points">
        <li>Bookings, stages and checklists with due dates</li>
        <li>Availability that checks your Google Calendar</li>
        <li>Email templates you review and send from your own Gmail</li>
        <li>Invoices as PDFs, filed in your Google Drive</li>
        <li>Income, expenses and a tax-year summary</li>
      </ul>
    </section>
    <section class="card ss-auth-card">${inner}</section>
  </main>
  <footer class="legalfoot"><a href="/privacy-policy/">Privacy Policy</a><span aria-hidden="true">·</span><a href="/terms-of-service/">Terms of Service</a></footer>`;
}
const msg = (t, bad) => { const m = root().querySelector('#ss-msg'); if (m) { m.textContent = t; m.className = 'note' + (bad ? ' ss-bad' : ''); } };
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };

function signInForm(resolve, mode = 'in') {
  const up = mode === 'up';
  frame(`<h3>${up ? 'Create your account' : 'Sign in'}</h3>
    <form id="ss-form" class="ss-form" novalidate>
      <div class="f"><label for="ss-email">Email</label><input id="ss-email" type="email" autocomplete="email" required></div>
      <div class="f"><label for="ss-pw">Password</label><input id="ss-pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="10" required>${up ? '<span class="note">At least 10 characters.</span>' : ''}</div>
      ${up ? `<label class="ss-agree"><input type="checkbox" id="ss-agree"> I agree to the <a href="/terms-of-service/" target="_blank" rel="noopener">Terms</a> and <a href="/privacy-policy/" target="_blank" rel="noopener">Privacy Policy</a></label>` : ''}
      <button class="btn primary" id="ss-go" type="submit">${up ? 'Create account' : 'Sign in'}</button>
      <p class="note" id="ss-msg" role="status"></p>
    </form>
    <div class="ss-or"><span>or</span></div>
    <button class="btn" id="ss-google" type="button">Continue with Google</button>
    <p class="note ss-switch">${up ? 'Already have an account? <button class="linkbtn" id="ss-sw">Sign in</button>' : 'New here? <button class="linkbtn" id="ss-sw">Create an account</button> · <button class="linkbtn" id="ss-forgot">Forgot password?</button>'}</p>`);
  const q = s => root().querySelector(s);
  q('#ss-sw').onclick = () => signInForm(resolve, up ? 'in' : 'up');
  const fg = q('#ss-forgot'); if (fg) fg.onclick = () => forgotForm(resolve);
  q('#ss-google').onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', scopes: 'openid email profile' } });
    if (error) msg("Couldn't open Google sign-in. Try again.", true);
  };
  q('#ss-form').onsubmit = async e => {
    e.preventDefault(); const email = q('#ss-email').value.trim(), password = q('#ss-pw').value, btn = q('#ss-go');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg('Enter a valid email address.', true);
    if (up && password.length < 10) return msg('Use at least 10 characters for your password.', true);
    if (up && !q('#ss-agree').checked) return msg('Please agree to the Terms and Privacy Policy.', true);
    busy(btn, true, up ? 'Creating…' : 'Signing in…');
    if (up) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/' } });
      busy(btn, false, 'Create account');
      // One neutral answer either way, so this form can't be used to find out which emails have accounts.
      if (error) return msg("Couldn't create the account. If you already have one, sign in or use \u201cForgot password?\u201d.", true);
      if (data.session) return afterSignIn(resolve);
      return msg('Check your email and tap the link to confirm your account.');
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    busy(btn, false, 'Sign in');
    if (error) return msg(/confirm/i.test(error.message) ? 'Confirm your email first. Check your inbox for the link.' : 'That email and password don\'t match.', true);
    afterSignIn(resolve);
  };
}

function forgotForm(resolve) {
  frame(`<h3>Reset your password</h3><form id="ss-form" class="ss-form"><div class="f"><label for="ss-email">Email</label><input id="ss-email" type="email" autocomplete="email" required></div>
    <button class="btn primary" id="ss-go" type="submit">Send reset link</button><p class="note" id="ss-msg" role="status"></p></form>
    <p class="note ss-switch"><button class="linkbtn" id="ss-sw">Back to sign in</button></p>`);
  const q = s => root().querySelector(s);
  q('#ss-sw').onclick = () => signInForm(resolve);
  q('#ss-form').onsubmit = async e => {
    e.preventDefault(); const email = q('#ss-email').value.trim();
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    msg('If that email has an account, a reset link is on its way.');
  };
}

function newPasswordForm(resolve) {
  frame(`<h3>Set a new password</h3><form id="ss-form" class="ss-form"><div class="f"><label for="ss-pw">New password</label><input id="ss-pw" type="password" autocomplete="new-password" minlength="10" required><span class="note">At least 10 characters.</span></div>
    <button class="btn primary" id="ss-go" type="submit">Save password</button><p class="note" id="ss-msg" role="status"></p></form>`);
  const q = s => root().querySelector(s);
  q('#ss-form').onsubmit = async e => {
    e.preventDefault(); const pw = q('#ss-pw').value; if (pw.length < 10) return msg('Use at least 10 characters.', true);
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return msg("Couldn't save it. Try again.", true);
    afterSignIn(resolve);
  };
}

/* Two-step verification: required on every sign-in once the person has turned it on in Settings. */
async function afterSignIn(resolve) {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return mfaForm(resolve);
  const { data } = await sb.auth.getSession();
  resolve(data.session);
}
async function mfaForm(resolve) {
  const { data: f } = await sb.auth.mfa.listFactors();
  const factor = (f && f.totp || []).find(x => x.status === 'verified');
  if (!factor) { const { data } = await sb.auth.getSession(); return resolve(data.session); }
  frame(`<h3>Two-step verification</h3><form id="ss-form" class="ss-form"><div class="f"><label for="ss-code">6-digit code from your authenticator app</label><input id="ss-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
    <button class="btn primary" id="ss-go" type="submit">Verify</button><p class="note" id="ss-msg" role="status"></p></form>
    <p class="note ss-switch"><button class="linkbtn" id="ss-out">Use a different account</button></p>`);
  const q = s => root().querySelector(s);
  q('#ss-out').onclick = async () => { await sb.auth.signOut(); signInForm(resolve); };
  q('#ss-form').onsubmit = async e => {
    e.preventDefault(); const code = q('#ss-code').value.replace(/\D/g, '');
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return msg("That code didn't work. Try the newest one.", true);
    const { data } = await sb.auth.getSession(); resolve(data.session);
  };
  setTimeout(() => q('#ss-code').focus(), 30);
}

/** Resolves with a signed-in session (asking for sign-in, a new password or a 2-step code as needed). */
export function requireSession() {
  return new Promise(async resolve => {
    let done = false;
    let recovering = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
    const finish = async () => {
      if (done) return; done = true;
      const { data } = await sb.auth.getSession();
      if (!data.session) { root().hidden = false; return signInForm(resolve); }
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { root().hidden = false; return mfaForm(resolve); }
      resolve(data.session);
    };
    sb.auth.onAuthStateChange(ev => {
      if (ev === 'PASSWORD_RECOVERY') { recovering = true; root().hidden = false; newPasswordForm(resolve); return; }
      if (ev === 'SIGNED_IN') finish();
    });
    const { data } = await sb.auth.getSession();
    if (recovering) { root().hidden = false; return newPasswordForm(resolve); }
    if (data.session) { done = true; const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { root().hidden = false; return mfaForm(resolve); }
      return resolve(data.session); }
    // Returning from Google OAuth: a code is in the URL and the session is being
    // established asynchronously. Wait for the SIGNED_IN event instead of showing login.
    if (new URLSearchParams(location.search).get('code')) return;
    root().hidden = false; signInForm(resolve);
  });
}

export function setupNeeded() {
  frame(`<h3>Almost ready</h3><p style="margin:0">This site isn't connected to its database yet.</p>
    <p class="note">In Bolt, click <b>Connect to Supabase</b> (or add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>), then reload. To look around with sample data, set <code>VITE_SS_MOCK=1</code>.</p>`);
  root().hidden = false;
}
export { esc };

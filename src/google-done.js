const q = new URLSearchParams(location.search);
const status = q.get('google') || 'error';

// Same-tab fallback (popup was blocked): go straight back into the app, which shows the result.
if (sessionStorage.getItem('ss-google-return')) {
  sessionStorage.removeItem('ss-google-return');
  location.replace('/' + location.search);
} else {
  const MSG = {
    ok: ['Google connected', 'You can close this window and carry on in Set & Settled.'],
    denied: ['Google access was not granted', 'Close this window and try again whenever you are ready.'],
    expired: ['That Google sign-in expired', 'Close this window and try again.'],
    in_use: ['Google account already in use', 'That Google account is linked to another Set & Settled user.'],
    error: ["Couldn't connect Google", 'Close this window and try again.'],
  };
  const [title, msg] = MSG[status] || MSG.error;
  document.getElementById('gd-title').textContent = title;
  document.getElementById('gd-msg').textContent = msg;
  document.getElementById('gd-back').hidden = false;
  if (status === 'ok') setTimeout(() => window.close(), 1200);
}

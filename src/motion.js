/* Kinetic motion for Set & Settled: FLIP tab indicator, page transitions,
   ripples, hover effects, scroll-driven header shrink, palette view transitions,
   toast checkmarks, haptics, and the reduce-motion toggle.
   Uses MutationObserver + Web Animations API — does NOT patch app.js functions. */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const userReduced = () => localStorage.getItem('ss-motion') === 'reduce';
const noMotion = () => reduced() || userReduced();
const EASE = 'cubic-bezier(.22,1,.36,1)';
const SPRING = 'cubic-bezier(.34,1.45,.64,1)';

/* === 1. FLIP active-tab pill that glides between tabs === */
let prevTabRect = null;
function glidePill(newBtn) {
  if (!newBtn) return;
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  const pill = document.createElement('div');
  pill.id = 'ss-flip-pill';
  pill.style.cssText = `position:absolute;pointer-events:none;border-radius:14px;background:var(--accent);
    opacity:.18;z-index:0;will-change:transform;transition:none;`;
  const rect = newBtn.getBoundingClientRect();
  const tabsRect = tabs.getBoundingClientRect();
  pill.style.left = rect.left - tabsRect.left + 'px';
  pill.style.top = rect.top - tabsRect.top + 'px';
  pill.style.width = rect.width + 'px';
  pill.style.height = rect.height + 'px';
  const old = document.getElementById('ss-flip-pill');
  if (old) old.remove();
  tabs.style.position = tabs.style.position || 'relative';
  tabs.appendChild(pill);

  if (prevTabRect && !noMotion()) {
    const dx = prevTabRect.left - rect.left;
    const dy = prevTabRect.top - rect.top;
    pill.style.transform = `translate(${dx}px, ${dy}px)`;
    pill.style.opacity = '0';
    requestAnimationFrame(() => {
      pill.style.transition = `transform .42s ${EASE}, opacity .3s ease`;
      pill.style.transform = 'translate(0,0)';
      pill.style.opacity = '.18';
    });
  }
  prevTabRect = rect;
}

/* Watch aria-current changes on #tabs buttons to trigger glide */
const tabObserver = new MutationObserver(() => {
  const active = document.querySelector('#tabs button[aria-current="true"]');
  if (active) glidePill(active);
});
function watchTabs() {
  document.querySelectorAll('#tabs button').forEach(b =>
    tabObserver.observe(b, { attributes: true, attributeFilter: ['aria-current'] })
  );
}

/* === 2. Page transitions: directional slide + staggered reveal === */
let prevTabIndex = 0;
const TAB_NAMES = ['home', 'bookings', 'calendar', 'tasks', 'contacts', 'money', 'comms', 'kit'];

function pageTransition(section) {
  if (!section || noMotion()) return;
  const idx = TAB_NAMES.indexOf(section.dataset.view);
  const dir = idx >= prevTabIndex ? 1 : -1;
  prevTabIndex = idx >= 0 ? idx : prevTabIndex;

  // Simple fade for the section
  section.animate(
    [{ opacity: 0, transform: `translateX(${dir * 12}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 280, easing: EASE, fill: 'none' }
  );

  // Content stagger: cards and rows (gentle)
  const items = section.querySelectorAll('.card, .row, .mailrow, .stat-tile, .day');
  const count = Math.min(items.length, 8);
  items.forEach((el, i) => {
    if (i >= count) return;
    el.animate(
      [{ opacity: 0, transform: `translateY(${dir * 6}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 240, delay: 60 + i * 25, easing: EASE, fill: 'none' }
    );
  });
}

/* Watch for the "enter" class that app.js adds to sections */
const enterObserver = new MutationObserver(muts => {
  muts.forEach(m => {
    if (m.attributeName === 'class' && m.target.classList.contains('enter')) {
      pageTransition(m.target);
    }
  });
});
function watchSections() {
  document.querySelectorAll('section[data-view]').forEach(s =>
    enterObserver.observe(s, { attributes: true, attributeFilter: ['class'] })
  );
}

/* === 3. Ripple on press (buttons, rows, chips, tabs) === */
function addRipple(e) {
  if (noMotion()) return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
  const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
  const ripple = document.createElement('span');
  ripple.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;width:${size}px;height:${size}px;
    left:${x}px;top:${y}px;background:var(--accent);opacity:.25;transform:scale(0);z-index:10;`;
  const prevPos = getComputedStyle(el).position;
  if (prevPos === 'static') el.style.position = 'relative';
  const prevOverflow = getComputedStyle(el).overflow;
  if (prevOverflow === 'visible') el.style.overflow = 'hidden';
  el.appendChild(ripple);
  ripple.animate(
    [{ transform: 'scale(0)', opacity: 0.25 }, { transform: 'scale(1)', opacity: 0 }],
    { duration: 550, easing: EASE, fill: 'forwards' }
  );
  setTimeout(() => {
    ripple.remove();
    if (prevPos === 'static') el.style.position = prevPos;
    if (prevOverflow === 'visible') el.style.overflow = prevOverflow;
  }, 560);
}

function attachRipples() {
  const sel = '.btn, .chip, .row, .mailrow, .tabs button, .seg button, .pal button, .day, .stat-tile, .pick-btn, .iconbtn';
  document.querySelectorAll(sel).forEach(el => {
    if (el.dataset.ssRipple) return;
    el.dataset.ssRipple = '1';
    el.addEventListener('pointerdown', addRipple);
  });
}

/* === 4. Press feedback: scale 0.97 === */
function attachPress() {
  const sel = '.btn, .chip, .seg button, .tabs button, .pal button, .row, .mailrow, .iconbtn, .pick-btn, .day';
  document.querySelectorAll(sel).forEach(el => {
    if (el.dataset.ssPress) return;
    el.dataset.ssPress = '1';
    el.addEventListener('pointerdown', () => {
      if (noMotion()) return;
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }],
        { duration: 120, easing: 'ease-out' }
      );
    });
  });
}

/* === 5. Haptic feedback on primary actions === */
function haptic() {
  if (noMotion()) return;
  try { navigator.vibrate(8); } catch (_) {}
}
function attachHaptics() {
  document.querySelectorAll('.btn.primary, .tabs button, .chip[aria-pressed]').forEach(el => {
    if (el.dataset.ssHaptic) return;
    el.dataset.ssHaptic = '1';
    el.addEventListener('pointerdown', haptic);
  });
}

/* === 6. Scroll-driven header shrink === */
let lastScrollY = 0;
function onScroll() {
  const top = document.querySelector('.top');
  if (!top) return;
  const y = window.scrollY;
  const shrinking = y > 20;
  if (shrinking && !top.classList.contains('ss-shrunk')) {
    top.classList.add('ss-shrunk');
    top.style.paddingBlock = '8px';
  } else if (!shrinking && top.classList.contains('ss-shrunk')) {
    top.classList.remove('ss-shrunk');
    top.style.paddingBlock = '';
  }
  lastScrollY = y;
}

/* === 7. Palette switch: circular view transition === */
function paletteTransition(clickedEl) {
  if (noMotion() || !document.startViewTransition) {
    // Fallback: 300ms crossfade
    document.documentElement.animate(
      [{ opacity: 0.8 }, { opacity: 1 }],
      { duration: 300, easing: 'ease' }
    );
    return;
  }
  const rect = clickedEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const maxR = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(() => {});
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${maxR}px at ${x}px ${y}px)`
      ]
    },
    { duration: 500, easing: EASE, pseudoElement: '::view-transition-new(root)' }
  );
}

/* Hook into palette swatch clicks */
function watchPaletteClicks() {
  document.addEventListener('click', e => {
    const pal = e.target.closest('.pal button[data-palette]');
    if (pal) paletteTransition(pal);
  });
}

/* === 8. Toast checkmark animation === */
function watchToasts() {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const obs = new MutationObserver(() => {
    if (toast.hidden) return;
    const text = toast.textContent || '';
    if (/saved|sent|added|copied/i.test(text)) {
      const check = document.createElement('span');
      check.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 L6.5 12 L13 4.5" /></svg>';
      check.style.cssText = 'display:inline-flex;margin-right:2px';
      toast.insertBefore(check, toast.firstChild);
      const path = check.querySelector('path');
      if (path) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: 400, easing: EASE, fill: 'forwards' }
        );
      }
    }
  });
  obs.observe(toast, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
}

/* === 9. Auto-scroll active tab into view (horizontal tab bar on phones) === */
function scrollActiveTabIntoView() {
  const active = document.querySelector('.tabs button[aria-current="true"]');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: noMotion() ? 'auto' : 'smooth' });
}

/* === 10. Back bar slide-down === */
function watchBackBar() {
  const bar = document.getElementById('backBar');
  if (!bar) return;
  const obs = new MutationObserver(() => {
    if (!bar.hidden && !noMotion()) {
      bar.animate(
        [{ transform: 'translateY(-12px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 300, easing: EASE, fill: 'forwards' }
      );
    }
  });
  obs.observe(bar, { attributes: true, attributeFilter: ['hidden'] });
}

/* === 11. Sheet open/close animations === */
function watchSheets() {
  const root = document.getElementById('sheetRoot');
  if (!root) return;
  const obs = new MutationObserver(() => {
    const bg = root.querySelector('.sheet-bg');
    if (bg && !bg.dataset.ssAnim) {
      bg.dataset.ssAnim = '1';
      if (!noMotion()) {
        bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease', fill: 'forwards' });
        const sheet = bg.querySelector('.sheet');
        if (sheet) {
          const isMobile = innerWidth < 768;
          sheet.animate(
            isMobile
              ? [{ transform: 'translateY(100%)', opacity: 0.5 }, { transform: 'translateY(0)', opacity: 1 }]
              : [{ transform: 'scale(0.96)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
            { duration: 420, easing: SPRING, fill: 'forwards' }
          );
        }
      }
    }
  });
  obs.observe(root, { childList: true, subtree: true });
}

/* === 12. Reduce-motion toggle in Settings === */
export function setupReduceMotionToggle() {
  const palCard = document.querySelector('section[data-view="settings"] .card .pal');
  if (!palCard || document.getElementById('ss-motion-toggle')) return;
  const card = palCard.closest('.card');
  const toggle = document.createElement('div');
  toggle.id = 'ss-motion-toggle';
  toggle.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid var(--line)';
  const isOn = userReduced();
  toggle.innerHTML = `
    <div class="head" style="margin-bottom:8px"><h3 style="font-size:16px">Reduce motion</h3>
    <label style="display:inline-flex;align-items:center;cursor:pointer;gap:8px">
      <input type="checkbox" id="ss-motion-chk" ${isOn ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
      <span class="note">Less movement</span>
    </label></div>
    <p class="note" style="margin:0">Turns off slides, spins, ripples and parallax. Saves to this browser.</p>`;
  card.appendChild(toggle);
  const chk = document.getElementById('ss-motion-chk');
  if (chk) chk.onchange = () => {
    document.documentElement.dataset.reduceMotion = chk.checked ? 'true' : 'false';
    localStorage.setItem('ss-motion', chk.checked ? 'reduce' : 'full');
  };
}

/* === Init: called after app.js has rendered === */
export function initMotion() {
  // Restore saved reduce-motion preference
  if (userReduced()) document.documentElement.dataset.reduceMotion = 'true';

  watchTabs();
  watchSections();
  watchPaletteClicks();
  watchToasts();
  watchBackBar();
  watchSheets();

  // Attach interactions periodically (app.js renders dynamically)
  attachRipples();
  attachPress();
  attachHaptics();

  // Initial glide pill
  const active = document.querySelector('#tabs button[aria-current="true"]');
  if (active) glidePill(active);

  // Scroll listener (passive, rAF-throttled)
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(() => { onScroll(); ticking = false; }); ticking = true; }
  }, { passive: true });

  // Re-attach when new content is added, but throttled to avoid freeze
  let domTimer = null;
  const domObs = new MutationObserver(() => {
    if (domTimer) return;
    domTimer = setTimeout(() => {
      attachRipples(); attachPress(); attachHaptics();
      domTimer = null;
    }, 300);
  });
  domObs.observe(document.body, { childList: true, subtree: true });

  // Active tab auto-scroll
  scrollActiveTabIntoView();
}

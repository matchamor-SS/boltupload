/* Custom duotone SVG icons for the 8 tabs + settings button.
   Each icon: solid body in 22% accent, solid details in currentColor,
   one small accent-2 highlight. 28px, decorative (aria-hidden).
   These replace the inner <svg> of each tab button in index.html. */

const BODY = 'color-mix(in srgb, var(--accent) 22%, transparent)';
const HL = 'var(--accent-2)';

function svg(paths, size = 28) {
  return `<svg viewBox="0 0 28 28" width="${size}" height="${size}" fill="none" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
  // Home: vinyl record with a label — spins once on select
  home: svg(`
    <circle cx="14" cy="14" r="12" fill="${BODY}"/>
    <circle cx="14" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>
    <circle cx="14" cy="14" r="4.5" fill="${HL}"/>
    <circle cx="14" cy="14" r="1.4" fill="currentColor"/>
  `),

  // Bookings: ticket stub with perforated edge — stub tears slightly
  bookings: svg(`
    <path d="M3 9 L3 19 Q3 20 4 20 L24 20 Q25 20 25 19 L25 9 Q25 8 24 8 L4 8 Q3 8 3 9 Z" fill="${BODY}"/>
    <path d="M12 8 L12 20" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>
    <rect x="14.5" y="11" width="8" height="1.8" rx=".9" fill="currentColor" opacity=".7"/>
    <rect x="14.5" y="14.5" width="5" height="1.5" rx=".7" fill="currentColor" opacity=".5"/>
    <circle cx="7" cy="14" r="1.5" fill="${HL}"/>
  `),

  // Calendar: calendar page with a star date — page flips
  calendar: svg(`
    <rect x="4" y="6" width="20" height="18" rx="3" fill="${BODY}"/>
    <rect x="4" y="6" width="20" height="5" rx="3" fill="currentColor" opacity=".15"/>
    <path d="M9 4 L9 8 M19 4 L19 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M14 14.5 l1.2 2.4 2.6 .4 -1.9 1.8 .4 2.6 -2.3 -1.2 -2.3 1.2 .4 -2.6 -1.9 -1.8 2.6 -.4 z" fill="${HL}"/>
  `),

  // Tasks: clipboard with a check — check draws in
  tasks: svg(`
    <rect x="6" y="5" width="16" height="20" rx="3" fill="${BODY}"/>
    <rect x="10" y="3" width="8" height="4" rx="2" fill="currentColor" opacity=".6"/>
    <path d="M10 14.5 l2.5 2.5 5 -5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="10" y="20" width="8" height="1.8" rx=".9" fill="${HL}" opacity=".6"/>
  `),

  // People: two figures, one wearing headphones — headphones bounce
  contacts: svg(`
    <circle cx="9" cy="9" r="4" fill="${BODY}"/>
    <circle cx="18" cy="9" r="4" fill="${BODY}"/>
    <path d="M2 23 Q2 16 9 16 Q16 16 16 23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 23 Q16 17 18 16.5 Q22 16 24 23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/>
    <rect x="15.5" y="7" width="5" height="4" rx="2" fill="${HL}"/>
    <path d="M15.5 9 Q18 5 20.5 9" fill="none" stroke="${HL}" stroke-width="1.2"/>
  `),

  // Financials: stack of coins beside a rising bar — coins stack up
  money: svg(`
    <ellipse cx="9" cy="20" rx="5" ry="2" fill="${BODY}"/>
    <ellipse cx="9" cy="16" rx="5" ry="2" fill="${BODY}"/>
    <ellipse cx="9" cy="12" rx="5" ry="2" fill="${BODY}"/>
    <path d="M4 20 L4 12" stroke="currentColor" stroke-width="1.2" opacity=".4"/>
    <path d="M16 22 L16 16 L19 16 L19 13 L22 13 L22 9 L25 9 L25 22 Z" fill="currentColor" opacity=".18"/>
    <path d="M16 22 L16 16 M19 22 L19 13 M22 22 L22 9 M25 22 L25 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="21.5" y="7" width="4" height="3" rx="1" fill="${HL}"/>
  `),

  // Comms: envelope with a sound wave — flap opens
  comms: svg(`
    <rect x="3" y="7" width="22" height="14" rx="3" fill="${BODY}"/>
    <path d="M3.5 8 L14 16 L24.5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 10.5 Q11 9 12 10.5 Q13 12 14 10.5 Q15 9 16 10.5" fill="none" stroke="${HL}" stroke-width="1.3" stroke-linecap="round"/>
  `),

  // Kit: record crate / flight case — lid lifts
  kit: svg(`
    <rect x="4" y="8" width="20" height="16" rx="2" fill="${BODY}"/>
    <path d="M8 8 Q8 4 14 4 Q20 4 20 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4 13 L24 13" stroke="currentColor" stroke-width="1.2" opacity=".4"/>
    <rect x="10" y="15" width="3" height="6" rx=".5" fill="currentColor" opacity=".3"/>
    <rect x="15" y="15" width="3" height="6" rx=".5" fill="currentColor" opacity=".3"/>
    <rect x="12.5" y="10" width="3" height="1.5" rx=".7" fill="${HL}"/>
  `),

  // Settings: classic gear — clean, in style
  settings: svg(`
    <circle cx="14" cy="14" r="3.5" fill="${BODY}"/>
    <circle cx="14" cy="14" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M14 4 L14 7 M14 21 L14 24 M4 14 L7 14 M21 14 L24 14 M7 7 L9 9 M19 19 L21 21 M21 7 L19 9 M9 19 L7 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="14" cy="4" r="1.2" fill="${HL}"/>
  `),
};

/* Replace the inner SVG of each tab button (matched by data-tab) and the settings icon. */
export function installIcons() {
  const tabs = document.querySelectorAll('#tabs button[data-tab]');
  tabs.forEach(btn => {
    const key = btn.dataset.tab;
    const icon = ICONS[key];
    if (!icon) return;
    const label = btn.lastChild;
    btn.innerHTML = icon;
    btn.appendChild(label);
  });
  const setBtn = document.getElementById('setBtn');
  if (setBtn) {
    const label = setBtn.lastChild;
    setBtn.innerHTML = ICONS.settings;
    if (label) setBtn.appendChild(label);
  }
}

/* Return the SVG string for a named icon (used by motion.js for dynamic injection if needed). */
export function iconHTML(name) {
  return ICONS[name] || '';
}

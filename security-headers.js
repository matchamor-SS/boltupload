// One source of truth for the site's security headers (used by `vite preview`; mirrored in netlify.toml and vercel.json).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://*.gstatic.com https://*.google.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://nominatim.openstreetmap.org https://router.project-osrm.org",
  "frame-src https://docs.google.com https://drive.google.com https://accounts.google.com https://content.googleapis.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests",
].join('; ');
export const HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

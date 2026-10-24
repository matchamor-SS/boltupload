import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { HEADERS } from './security-headers.js';
// Three pages: the app (/), and the two public legal pages Google's OAuth review needs (no login required).
// SS_CSP_TEST_ORIGIN is only for local testing against a non-https backend.
const T = process.env.SS_CSP_TEST_ORIGIN;
const previewHeaders = T ? { ...HEADERS, 'Content-Security-Policy': HEADERS['Content-Security-Policy'].replace("connect-src 'self'", `connect-src 'self' ${T}`).replace('; upgrade-insecure-requests', '') } : HEADERS;

export default defineConfig({
  preview: { headers: previewHeaders },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy-policy/index.html'),
        terms: resolve(__dirname, 'terms-of-service/index.html'),
        googleDone: resolve(__dirname, 'google-done/index.html'),
      },
    },
  },
});

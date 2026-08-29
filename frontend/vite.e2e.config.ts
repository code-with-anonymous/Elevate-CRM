// ─────────────────────────────────────────────────────────────────────────────
// frontend/vite.e2e.config.ts — dev-server config used ONLY by the Playwright run.
//
// This is a NEW test-support file, not an edit to the application's own
// vite.config.ts — it imports that config and overrides two server settings. It
// lives in frontend/ rather than in e2e/ for a dull but hard reason: Vite
// resolves a config file's imports relative to the config file, and the vite
// package is only installed in frontend/node_modules.
//
// What is overridden, and why:
//
//   port / strictPort — the E2E stack runs on 5174 so it never collides with a
//     dev server someone already has open on 5173. strictPort makes a collision
//     an immediate failure rather than a silent hop to the next free port, which
//     would leave every test pointing at the wrong origin.
//
//   open — the app config sets `open: true`, which launches a real browser
//     window on every suite start. BROWSER=none is also set when spawning, as a
//     belt-and-braces measure.
//
// There is deliberately NO /api proxy here. Serving the API from the app's own
// origin is refused by apiBaseUrl.ts as a fatal misconfiguration — and rightly
// so, since on Vercel that means the static host is answering /api with
// index.html. The API therefore lives on its own port, behind
// e2e/rate-limit-proxy.cjs; see that file for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5174);

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      port: WEB_PORT,
      strictPort: true,
      open: false,
    },
  })
);

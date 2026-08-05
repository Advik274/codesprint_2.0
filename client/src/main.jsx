import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyCachedTheme } from './hooks/useThemeColors';

// Apply saved theme before first paint — avoids a flash of the wrong theme.
document.documentElement.setAttribute('data-theme', localStorage.getItem('dominance_theme') || 'dark');
// Same for the admin-configured event palette: paint the last known
// colors immediately instead of flashing the stock ones until the
// socket delivers the real config a moment later.
applyCachedTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service worker ────────────────────────────────────────────────
// BUG FIX: the SW used to be registered in development too, where it
// cached Vite's dev modules and then served them back stale — so source
// edits genuinely did not reach the browser no matter how hard you
// reloaded ("I changed it and nothing happened"). It is now production-
// only, and a dev load actively tears down any SW/caches left behind by
// an earlier build so the environment un-sticks itself.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // If a NEW service worker takes over a page that was already
    // controlled, the HTML in memory belongs to the previous build —
    // reload once so the fresh bundle is actually the one running.
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is best-effort */ });
    });
  } else {
    // Dev: tear down anything a previous production build left behind.
    // The worker that's still controlling THIS page keeps intercepting
    // (and re-caching) until the next navigation, so once we've cleaned
    // up we reload a single time to land on a genuinely uncontrolled
    // page running the real dev modules. `had` guards the reload, so
    // the clean case never loops.
    navigator.serviceWorker.getRegistrations()
      .then(async (regs) => {
        const had = regs.length > 0 || !!navigator.serviceWorker.controller;
        await Promise.all(regs.map((r) => r.unregister()));
        if (window.caches?.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if (had) window.location.reload();
      })
      .catch(() => {});
  }
}

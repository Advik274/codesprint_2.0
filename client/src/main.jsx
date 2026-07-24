import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Apply saved theme before first paint — avoids a flash of the wrong theme.
document.documentElement.setAttribute('data-theme', localStorage.getItem('dominance_theme') || 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is best-effort */ });
  });
}

// ── Custom event theme engine ─────────────────────────────────────
// The whole UI derives from a handful of CSS variables (see
// styles/index.css) — every tint/gradient/badge is a color-mix() over
// them. So a custom theme is just: validate the admin's picked colors,
// set the variables on <html>, and compute the derived tokens the CSS
// can't (readable text-on-color, background shade ramp, light-theme
// darkening for contrast). Applied identically on every screen — the
// theme lives in event_config and syncs like everything else.

const TOKENS = ['accent', 'danger', 'warning', 'info', 'purple'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

// Variables this engine may set — cleared on reset so the CSS defaults win
const MANAGED = [
  '--accent', '--accent2', '--danger', '--warning', '--info', '--purple',
  '--on-accent', '--on-danger', '--on-warning', '--on-info',
  '--bg', '--bg2', '--bg3', '--border', '--border2',
];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// WCAG-ish relative luminance, 0 (black) → 1 (white)
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Mix a hex color towards another by t (0..1)
function mix(hex, towards, t) {
  const a = hexToRgb(hex), b = hexToRgb(towards);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}
// Dark text on light colors, light text on dark colors
function onColor(hex) {
  return luminance(hex) > 0.4 ? '#16110b' : '#fff8ee';
}
// Light theme sits on cream backgrounds — a bright picked color would
// wash out, so pull it towards black until it reads.
function forLightTheme(hex) {
  let c = hex, guard = 0;
  while (luminance(c) > 0.28 && guard++ < 12) c = mix(c, '#000000', 0.14);
  return c;
}

export function applyCustomTheme(theme) {
  const root = document.documentElement;
  if (!theme || typeof theme !== 'object') {
    MANAGED.forEach(v => root.style.removeProperty(v));
    return;
  }
  const isLight = root.getAttribute('data-theme') === 'light';

  TOKENS.forEach(token => {
    const raw = theme[token];
    if (!raw || !HEX_RE.test(raw)) { root.style.removeProperty(`--${token}`); return; }
    const c = isLight ? forLightTheme(raw) : raw;
    root.style.setProperty(`--${token}`, c);
    if (token !== 'purple') root.style.setProperty(`--on-${token}`, onColor(c));
    if (token === 'accent') root.style.setProperty('--accent2', mix(c, '#000000', 0.12));
  });

  // Background ramp — dark theme only (the light theme keeps its marble)
  if (!isLight && theme.bg && HEX_RE.test(theme.bg)) {
    const bg = theme.bg;
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--bg2', mix(bg, '#ffffff', 0.045));
    root.style.setProperty('--bg3', mix(bg, '#ffffff', 0.10));
    root.style.setProperty('--border', mix(bg, '#ffffff', 0.16));
    root.style.setProperty('--border2', mix(bg, '#ffffff', 0.26));
  } else {
    ['--bg', '--bg2', '--bg3', '--border', '--border2'].forEach(v => root.style.removeProperty(v));
  }
}

// Re-apply whenever the light/dark toggle flips (it stamps data-theme
// on <html>), since the derivations differ per theme.
export function watchThemeToggle(theme) {
  const obs = new MutationObserver(() => applyCustomTheme(theme));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

// The stock palette — used by the Theme tab as its starting point
export const DEFAULT_THEME = {
  accent: '#e3b341', danger: '#e04340', warning: '#e8863a',
  info: '#6ea7c2', purple: '#b8709b', bg: '#16110b',
};

// ── Pre-paint cache ───────────────────────────────────────────────
// The theme lives on the server, which means a reloading page shows the
// stock palette for the ~100ms until the socket delivers state:sync —
// a visible flash of the wrong colors on every refresh. Caching the
// last-known theme locally lets us paint the right one immediately;
// the server's copy still wins the moment it arrives.
const THEME_CACHE_KEY = 'dominance_event_theme';

export function cacheTheme(theme) {
  try {
    if (theme) localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
    else localStorage.removeItem(THEME_CACHE_KEY);
  } catch { /* private mode / storage disabled — cache is best-effort */ }
}

export function applyCachedTheme() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    if (raw) applyCustomTheme(JSON.parse(raw));
  } catch { /* ignore corrupt cache */ }
}

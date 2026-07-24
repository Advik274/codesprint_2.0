import { randomBytes } from 'crypto';

// ── Credentials ────────────────────────────────────────────────────
// Read from env so the real password never ships inside the public client
// bundle. Falls back to the old default for anyone upgrading without
// setting env vars yet, but loudly warns so it doesn't stay that way.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dominance2024';
const ZONE_PASSWORD = process.env.ZONE_PASSWORD || ADMIN_PASSWORD;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD not set — using insecure default. Set it in your .env / host env vars before a real event.');
}
if (!process.env.ZONE_PASSWORD) {
  console.warn('⚠️  ZONE_PASSWORD not set — zone laptops will use the full admin password. Set a separate ZONE_PASSWORD so a lost zone laptop can\'t give away admin access.');
}

// ── Sessions ──────────────────────────────────────────────────────
// token -> { role: 'admin' | 'zone', expiresAt }
const sessions = new Map();
const SESSION_TTL_MS = 18 * 60 * 60 * 1000; // 18h — covers a full event day

function pruneSessions() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(token);
  }
}
setInterval(pruneSessions, 10 * 60 * 1000);

// ── Login lockout ─────────────────────────────────────────────────
// key (IP) -> { count, lockedUntil }
const attempts = new Map();
const MAX_ATTEMPTS = 6;
const LOCKOUT_MS = 5 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

function isLockedOut(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (a.lockedUntil && a.lockedUntil > Date.now()) return true;
  return false;
}

function recordFailure(key) {
  const now = Date.now();
  const a = attempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - a.firstAt > ATTEMPT_WINDOW_MS) { a.count = 0; a.firstAt = now; }
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) a.lockedUntil = now + LOCKOUT_MS;
  attempts.set(key, a);
}

function recordSuccess(key) {
  attempts.delete(key);
}

function lockoutRemainingMs(key) {
  const a = attempts.get(key);
  if (!a || !a.lockedUntil) return 0;
  return Math.max(0, a.lockedUntil - Date.now());
}

// ── Public API ────────────────────────────────────────────────────

// Attempt a login. Returns { ok, token, role } or { ok:false, message }
export function login(password, key) {
  if (isLockedOut(key)) {
    return { ok: false, message: `Too many attempts. Try again in ${Math.ceil(lockoutRemainingMs(key) / 1000)}s.` };
  }
  let role = null;
  if (typeof password === 'string' && password.length > 0) {
    if (password === ADMIN_PASSWORD) role = 'admin';
    else if (password === ZONE_PASSWORD) role = 'zone';
  }
  if (!role) {
    recordFailure(key);
    return { ok: false, message: 'Wrong password' };
  }
  recordSuccess(key);
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { role, expiresAt: Date.now() + SESSION_TTL_MS });
  return { ok: true, token, role };
}

export function sessionRole(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return s.role;
}

// Full admin power required
export function authAdmin(token) {
  return sessionRole(token) === 'admin';
}

// Zone-laptop power: either a dedicated zone session or full admin
export function authZone(token) {
  const role = sessionRole(token);
  return role === 'admin' || role === 'zone';
}

export function revokeSession(token) {
  sessions.delete(token);
}

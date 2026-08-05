// Fixed-window rate limiting for public endpoints.
//
// Team passcodes are 4 digits — fine as something a human types off a
// printed card, useless as a secret if an attacker can try all 9000 of
// them. The passcode lookup used to be completely unmetered, so anyone
// on the event WiFi could enumerate every team in seconds and then join
// as them. Only FAILURES are counted here: a team that types its own
// code correctly never spends budget, while a brute-forcer runs out
// almost immediately.
//
// Two layers, because "per IP" alone isn't enough when a whole campus
// sits behind one NAT address:
//   • per-IP    — stops a single device hammering the endpoint
//   • global    — a circuit breaker for the NAT case, where every
//                 attempt appears to come from the same address
const buckets = new Map(); // key -> { count, resetAt }

export function recordFailure(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { blocked: true, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

export function isBlocked(key, limit) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= Date.now()) return { blocked: false, retryAfterSec: 0 };
  if (b.count > limit) return { blocked: true, retryAfterSec: Math.ceil((b.resetAt - Date.now()) / 1000) };
  return { blocked: false, retryAfterSec: 0 };
}

export function clearKey(key) { buckets.delete(key); }

// Housekeeping so a long event doesn't accumulate dead keys. .unref() so
// it never holds the process open on its own.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

// Tuned for a lab/hotspot event: a team mistyping its code a few times
// never notices, 9000 sequential guesses die on attempt 21.
export const PASSCODE_LIMITS = {
  PER_IP: 20,
  PER_IP_WINDOW_MS: 5 * 60 * 1000,
  GLOBAL: 200,
  GLOBAL_WINDOW_MS: 60 * 1000,
};

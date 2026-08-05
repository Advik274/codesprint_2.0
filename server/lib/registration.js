// Shared team-creation rules.
//
// Teams can be created two ways — by the admin in the Setup tab, or by a
// team leader scanning the self-registration QR — and both must produce
// identical teams and enforce identical rules. Keeping the colour list,
// passcode generation and validation here means the public path can
// never drift from (or be laxer than) the admin one.

export const TEAM_COLORS = [
  '#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7',
  '#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6',
  '#e11d48','#7c3aed','#0891b2','#16a34a','#d97706',
  '#fb7185','#38bdf8','#4ade80','#fbbf24','#c084fc',
  '#22d3ee','#fb923c','#f472b6','#a3e635','#2dd4bf',
  '#ff6b6b','#4ecdc4','#45b7d1','#96ceb4','#ffeaa7',
  '#dda0dd','#98d8c8','#f7dc6f','#bb8fce','#85c1e9',
  '#82e0aa','#f8c471','#f1948a','#aab7b8','#76d7c4',
  '#ff9ff3','#feca57','#ff6348','#48dbfb','#ff9f43',
  '#54a0ff','#5f27cd','#00d2d3','#01aaa4','#341f97',
  '#2ecc71','#e74c3c','#9b59b6','#1abc9c','#f39c12',
];

export const VALID_YEARS = ['1st', '2nd', '3rd', '4th'];

export const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 40,
  MEMBER_MAX_LEN: 40,
  MAX_MEMBERS: 6,
};

// First unused colour, falling back to a generated hue once the list runs out
export function pickTeamColor(usedColors = [], teamCount = 0) {
  return TEAM_COLORS.find(c => !usedColors.includes(c))
    || `hsl(${(teamCount * 37) % 360},65%,55%)`;
}

// 4-digit code, never colliding with an existing team's.
// Random first (codes shouldn't be guessable from the previous team's),
// but random retry alone can't guarantee a hit once most of the 9000
// codes are taken — and the original loop could also hand back a
// duplicate after exhausting its attempts. Falling back to a scan makes
// it correct for any number of teams. Returns null only if all 9000
// codes are genuinely in use.
export function generatePasscode(existingPasscodes = []) {
  const taken = new Set(existingPasscodes.map(String));
  for (let i = 0; i < 200; i++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    if (!taken.has(code)) return code;
  }
  for (let n = 1000; n <= 9999; n++) {
    const code = String(n);
    if (!taken.has(code)) return code;
  }
  return null;
}

// Validates a self-registration payload against the rules above and the
// teams that already exist. Returns { ok:false, error } for the client to
// display, or { ok:true, value:{ name, year, members } } ready to store.
export function validateSelfRegistration(payload = {}, teams = [], config = {}) {
  const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { ok: false, error: 'Team name is required.' };
  if (name.length < LIMITS.NAME_MIN) return { ok: false, error: `Team name must be at least ${LIMITS.NAME_MIN} characters.` };
  if (name.length > LIMITS.NAME_MAX) return { ok: false, error: `Team name must be ${LIMITS.NAME_MAX} characters or fewer.` };

  if (teams.some(t => t.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `"${name}" is already taken — pick another team name.` };
  }

  const cap = parseInt(config.self_registration_max_teams) || 0;
  if (cap > 0 && teams.length >= cap) {
    return { ok: false, error: 'Registration is full — see a coordinator.' };
  }

  const year = VALID_YEARS.includes(payload.year) ? payload.year : '1st';

  const rawMembers = Array.isArray(payload.members) ? payload.members : [];
  const members = rawMembers
    .map(m => (typeof m === 'string' ? m.trim().replace(/\s+/g, ' ') : ''))
    .filter(Boolean)
    .map(m => m.slice(0, LIMITS.MEMBER_MAX_LEN))
    .slice(0, LIMITS.MAX_MEMBERS);

  if (members.length === 0) return { ok: false, error: 'Add at least one team member.' };

  return { ok: true, value: { name, year, members } };
}

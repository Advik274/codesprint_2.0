// Submission integrity signals for Code Strike.
//
// The round's original shape — "write it in your own editor, paste it
// here" — is trivially defeated by an AI: paste the problem into a chat,
// paste the answer back, done in twenty seconds. And because teams
// needed that external editor, Code Strike was the one round exempt from
// Protected Mode, so nothing even noticed them leaving the tab.
//
// Strict mode removes the reason for the exemption: the code is written
// in the platform, paste is blocked, and tab switches count again. This
// module turns what the browser observed while they typed into a verdict
// a judge can act on.
//
// It cannot prove cheating and does not try to. What it does is tell a
// judge WHERE to look: a 1200-character solution that arrived with 40
// keystrokes did not get typed, whatever the explanation turns out to be.

export const INTEGRITY = {
  TYPED: 'typed',           // keystroke count consistent with being written here
  PARTIAL: 'partial',       // some typing, but much of it appeared at once
  APPEARED: 'appeared',     // effectively no typing — it arrived from somewhere
  TRIVIAL: 'trivial',       // too short to judge either way
  UNVERIFIED: 'unverified', // open mode, or a client that sent no telemetry
};

// Real typing produces MORE keystrokes than final characters — every
// backspace, arrow key and retyped line adds one. A ratio near or above
// 1.0 is normal; well under 0.3 means the text did not come from a
// keyboard in this box.
export function assessSubmission(sub = {}) {
  const chars = typeof sub.code === 'string' ? sub.code.trim().length : 0;
  const keystrokes = Number.isFinite(sub.keystrokes) ? sub.keystrokes : null;
  const pasteBlocked = Number.isFinite(sub.paste_blocked) ? sub.paste_blocked : 0;

  if (keystrokes === null) {
    return { verdict: INTEGRITY.UNVERIFIED, ratio: null, chars, keystrokes: null, paste_blocked: pasteBlocked };
  }
  if (chars < 40) {
    return { verdict: INTEGRITY.TRIVIAL, ratio: null, chars, keystrokes, paste_blocked: pasteBlocked };
  }

  const ratio = Math.round((keystrokes / chars) * 100) / 100;
  let verdict;
  if (ratio >= 0.6) verdict = INTEGRITY.TYPED;
  else if (ratio >= 0.25) verdict = INTEGRITY.PARTIAL;
  else verdict = INTEGRITY.APPEARED;

  return { verdict, ratio, chars, keystrokes, paste_blocked: pasteBlocked };
}

// One-line summary for the judge panel and the CSV export.
export function describeIntegrity(assessment) {
  if (!assessment) return '';
  const { verdict, ratio, chars, keystrokes, paste_blocked } = assessment;
  const blocked = paste_blocked ? ` · ${paste_blocked} paste${paste_blocked !== 1 ? 's' : ''} blocked` : '';
  switch (verdict) {
    case INTEGRITY.TYPED:
      return `typed here (${keystrokes} keystrokes / ${chars} chars)${blocked}`;
    case INTEGRITY.PARTIAL:
      return `⚠️ partly typed — ${keystrokes} keystrokes for ${chars} chars (ratio ${ratio})${blocked}`;
    case INTEGRITY.APPEARED:
      return `🚩 not typed here — only ${keystrokes} keystrokes for ${chars} chars (ratio ${ratio})${blocked}`;
    case INTEGRITY.TRIVIAL:
      return `too short to assess (${chars} chars)${blocked}`;
    default:
      return 'no typing data (open mode)';
  }
}

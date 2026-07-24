// Debounce: delays fn execution until ms have passed since last call
export function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

// ── Answer grading ─────────────────────────────────────────────────
// Used for Phase 1 text-input questions, zone-capture challenges, and the
// quiz round. Plain exact-match after trim/lowercase was too brittle for
// free-text answers typed under time pressure — a correct SQL query with
// clauses in a different order, a multi-line answer typed with spaces
// instead of newlines, or extra whitespace around punctuation would all
// get marked wrong even though the team clearly got it right. This
// normalizes away formatting noise that has no bearing on correctness.
export function normalizeAnswer(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[‘’]/g, "'")   // smart single quotes -> straight
    .replace(/[“”]/g, '"')   // smart double quotes -> straight
    .toLowerCase()
    .replace(/\s+/g, ' ')              // collapse all whitespace (incl. newlines) to single spaces
    .replace(/\s*([|:,=<>+\-*/])\s*/g, '$1') // no space needed around these separators/operators
    .trim()
    .replace(/[.;]+$/, '');            // drop trailing period(s)/semicolon(s)
}

// A question can specify a single `answer` string, or an `answers` array of
// acceptable alternative phrasings (e.g. a SQL query with clauses in a
// different but equally valid order) — matches against all of them.
export function isAnswerCorrect(submitted, question) {
  const accepted = Array.isArray(question?.answers) && question.answers.length
    ? question.answers
    : [question?.answer];
  const normalizedSubmitted = normalizeAnswer(submitted);
  if (!normalizedSubmitted) return false;
  return accepted.some(a => normalizeAnswer(a) === normalizedSubmitted);
}

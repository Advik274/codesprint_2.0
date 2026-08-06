import { isAnswerCorrect } from './utils.js';

export function calcPhase1Score(points, timeLimitSeconds, timeTakenMs) {
  const timeTakenSeconds = timeTakenMs / 1000;
  const timeBonus = Math.max(0, Math.round(timeLimitSeconds - timeTakenSeconds));
  return points + timeBonus;
}

export function calcPhase3Score(ui, functionality, problemFit) {
  return Math.round((ui * 0.3 + functionality * 0.4 + problemFit * 0.3) * 10);
}

// ── Discipline: escalating violation penalties ───────────────────
// Protected Mode records a violation every time a team leaves the event
// tab or tries to copy/paste during a timed round. A bare counter
// deters nobody, so violations escalate — but the first two are always
// free, because a "tab switch" also fires on an incoming call, a
// notification, or the screen locking. Marks are only ever deducted
// once a team is clearly past accident territory, and the deduction is
// capped so one misbehaving phone can't wipe out a real performance.
//
//   1st        ⚠️  warning     — no score impact
//   2nd        🟨 yellow card  — no score impact, flagged for the admin
//   3rd+       🟥 penalty      — marks off, capped
export const PENALTY_DEFAULTS = { free: 2, each: 2, max: 10 };

export function calcViolationPenalty(violations, config = {}) {
  const total = violations?.total || 0;
  const free = Math.max(0, parseInt(config.penalty_free_violations ?? PENALTY_DEFAULTS.free));
  const each = Math.max(0, parseFloat(config.penalty_marks_each ?? PENALTY_DEFAULTS.each));
  const max = Math.max(0, parseFloat(config.penalty_max ?? PENALTY_DEFAULTS.max));
  const enabled = config.penalty_enabled !== false;

  const stage = total === 0 ? 'clean' : total === 1 ? 'warning' : total <= free ? 'yellow' : 'red';
  const chargeable = Math.max(0, total - free);
  const penalty = enabled ? Math.min(chargeable * each, max) : 0;
  return { stage, total, chargeable, penalty: Math.round(penalty * 10) / 10 };
}

// ── CODE ARENA: Mission 2 — Bug Hunt grading ─────────────────────
// Pure so it's unit-testable. Marks are split evenly across the
// programs in play. Auto verdict comes from the same lenient matcher
// used everywhere else; an admin override (per program, from the
// review panel) always wins over the auto verdict.
export function gradeBugHunt(answers = {}, programs = [], totalMarks = 30, overrides = {}) {
  const n = programs.length || 1;
  const perProgramMarks = Math.round((totalMarks / n) * 10) / 10;
  const auto = {};
  const per_program = {};
  let score = 0;
  programs.forEach(p => {
    auto[p.id] = isAnswerCorrect(answers[p.id], p);
    const override = overrides[p.id];
    const marks = override !== undefined && override !== null
      ? Math.max(0, Math.min(perProgramMarks, Number(override) || 0))
      : (auto[p.id] ? perProgramMarks : 0);
    per_program[p.id] = marks;
    score += marks;
  });
  return { auto, per_program, per_program_marks: perProgramMarks, score: Math.round(score * 10) / 10 };
}

// ── CODE ARENA: Mission 3 — Code Strike scoring ──────────────────
// Per problem: 70% correctness + 20% efficiency (judge-entered, 0–10
// each) + 10% submission-time bonus (computed from when the team's
// final paste landed relative to the mission timer). A fast wrong
// answer earns nothing: zero correctness zeroes the whole problem.
export function calcCodeStrikeProblemScore(problemMarks, correctness, efficiency, timeFactor) {
  const c = Math.max(0, Math.min(10, Number(correctness) || 0));
  const e = Math.max(0, Math.min(10, Number(efficiency) || 0));
  const tf = Math.max(0, Math.min(1, Number(timeFactor) || 0));
  if (c === 0) return 0;
  // Round to 2 decimals — kills float noise like 10 * (0.7+0.2+0.1) = 9.9999...
  return Math.round(problemMarks * (0.7 * c / 10 + 0.2 * e / 10 + 0.1 * tf) * 100) / 100;
}

// Total for one team across all problems, scaled so the mission is worth
// exactly `totalMarks` even if the problems' own marks sum differently.
// Unsubmitted or unjudged problems score 0.
export function calcCodeStrikeTotal(team, problems = [], startedAt = null, durationMs = null, totalMarks = 50) {
  const sumMarks = problems.reduce((a, p) => a + (p.marks || 0), 0) || 1;
  let total = 0;
  problems.forEach(p => {
    const sub = team.codestrike_submissions?.[p.id];
    const judge = team.codestrike_judge?.[p.id];
    if (!sub || !judge) return;
    let tf = 0;
    if (startedAt && durationMs && sub.submitted_at) {
      const elapsed = new Date(sub.submitted_at) - new Date(startedAt);
      tf = Math.max(0, Math.min(1, 1 - elapsed / durationMs));
    }
    total += calcCodeStrikeProblemScore(p.marks || 0, judge.correctness, judge.efficiency, tf);
  });
  return Math.round(total * (totalMarks / sumMarks) * 10) / 10;
}

export function getPhase1Board(teams) {
  return [...teams]
    .sort((a, b) => b.phase1_total_score - a.phase1_total_score)
    .map((t, i) => ({ rank: i+1, team_id: t.id, team_name: t.name, color: t.color, year: t.year, score: t.phase1_total_score, eliminated: t.is_eliminated }));
}

export function getFinalBoard(teams) {
  return [...teams]
    .filter(t => t.phase3_judge_scores)
    .sort((a, b) => b.phase3_judge_scores.total - a.phase3_judge_scores.total)
    .map((t, i) => ({ rank: i+1, team_id: t.id, team_name: t.name, color: t.color, scores: t.phase3_judge_scores }));
}

// Smart results board: uses the correct score metric depending on which phases were enabled.
// This fixes the bug where quiz-only events showed #0 ??? because getFinalBoard
// filters by phase3_judge_scores which don't exist when quiz is the last phase.
export function getResultsBoard(teams, phasesEnabled = [], config = {}) {
  const enabled = Array.isArray(phasesEnabled) ? phasesEnabled : [];

  // CODE ARENA: combined mission leaderboard — active whenever Bug Hunt
  // or Code Strike is part of the event. Each mission's marks were
  // stored on the team when that mission was graded (quiz_marks_scored /
  // bughunt_score / codestrike_score), so this is a pure sum. Ties break
  // on tie-break round wins.
  if (enabled.includes('bug_hunt') || enabled.includes('code_strike')) {
    return [...teams]
      .filter(t => !t.is_eliminated)
      .map(t => {
        const quiz = enabled.includes('quiz_round') ? (t.quiz_marks_scored || 0) : 0;
        const bughunt = enabled.includes('bug_hunt') ? (t.bughunt_score || 0) : 0;
        const codestrike = enabled.includes('code_strike') ? (t.codestrike_score || 0) : 0;
        const pen = calcViolationPenalty(t.violations, config);
        // Never let a penalty push a team below zero — a negative total
        // reads as a scoring bug on the big screen, not as a punishment.
        const total = Math.max(0, Math.round((quiz + bughunt + codestrike - pen.penalty) * 10) / 10);
        return {
          t, total,
          breakdown: {
            quiz, bughunt, codestrike,
            penalty: pen.penalty, violations: pen.total, card: pen.stage,
            tiebreak_wins: t.tiebreak_wins || 0,
          },
        };
      })
      // Ties: tie-break wins first, then the cleaner disciplinary record
      .sort((a, b) =>
        b.total - a.total
        || b.breakdown.tiebreak_wins - a.breakdown.tiebreak_wins
        || a.breakdown.violations - b.breakdown.violations)
      .map(({ t, total, breakdown }, i) => ({
        rank: i + 1,
        team_id: t.id, team_name: t.name, color: t.color,
        score: total,
        scores: breakdown,
        score_label: 'Total Marks',
      }));
  }

  // Phase 3 was played — use judge scores (original behaviour)
  if (enabled.includes('phase3')) {
    return [...teams]
      .filter(t => t.phase3_judge_scores)
      .sort((a, b) => b.phase3_judge_scores.total - a.phase3_judge_scores.total)
      .map((t, i) => ({
        rank: i + 1,
        team_id: t.id, team_name: t.name, color: t.color,
        score: t.phase3_judge_scores.total,
        scores: t.phase3_judge_scores,
        score_label: 'Judge Score',
      }));
  }

  // Quiz round was played — use quiz scores
  if (enabled.includes('quiz_round')) {
    return [...teams]
      .filter(t => !t.is_eliminated)
      .sort((a, b) => (b.quiz_score || 0) - (a.quiz_score || 0))
      .map((t, i) => ({
        rank: i + 1,
        team_id: t.id, team_name: t.name, color: t.color,
        score: t.quiz_score || 0,
        scores: null,
        score_label: 'Quiz Score',
      }));
  }

  // Phase 1 only — use phase1 total score
  if (enabled.includes('phase1')) {
    return [...teams]
      .filter(t => !t.is_eliminated)
      .sort((a, b) => (b.phase1_total_score || 0) - (a.phase1_total_score || 0))
      .map((t, i) => ({
        rank: i + 1,
        team_id: t.id, team_name: t.name, color: t.color,
        score: t.phase1_total_score || 0,
        scores: null,
        score_label: 'Gauntlet Score',
      }));
  }

  // Fallback: all non-eliminated teams, no score ordering
  return [...teams]
    .filter(t => !t.is_eliminated)
    .map((t, i) => ({
      rank: i + 1,
      team_id: t.id, team_name: t.name, color: t.color,
      score: 0, scores: null, score_label: 'Rank',
    }));
}

// Pure reveal-step computation, extracted out of the admin:reveal_next
// socket handler so the bounds-checking (previously entirely missing —
// see BUG FIX below) is directly unit-testable without a live socket.
//
// topN > 0 limits the dramatic reveal to just the top N places instead of
// the whole field; revealIndex is the last index that was revealed
// (-1 if nothing revealed yet).
export function computeReveal(teams, phasesEnabled, revealIndex, topN = 0, config = {}) {
  const board = getResultsBoard(teams, phasesEnabled, config);
  const limitedBoard = topN > 0 ? board.slice(0, topN) : board;
  const revealBoard = [...limitedBoard].reverse(); // worst → best

  const idx = (revealIndex ?? -1) + 1;

  // BUG FIX: the original inline version had no bounds check at all —
  // calling this past the last team indexed off the end of the array,
  // producing `undefined`, which the caller broadcast as a null-team
  // announcement to every screen ("??? — 0TH PLACE").
  if (idx >= revealBoard.length) {
    return {
      ok: false,
      reason: revealBoard.length === 0 ? 'No results to reveal yet.' : 'All positions already revealed — nothing more to show.',
    };
  }

  const revealed = revealBoard[idx];
  return {
    ok: true,
    idx,
    total: revealBoard.length,
    team: revealed,
    actual_rank: board.findIndex(t => t.team_id === revealed.team_id),
    is_winner: idx === revealBoard.length - 1,
    is_last: idx >= revealBoard.length - 1,
    score_label: revealed?.score_label || null,
  };
}

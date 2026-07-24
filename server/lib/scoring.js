export function calcPhase1Score(points, timeLimitSeconds, timeTakenMs) {
  const timeTakenSeconds = timeTakenMs / 1000;
  const timeBonus = Math.max(0, Math.round(timeLimitSeconds - timeTakenSeconds));
  return points + timeBonus;
}

export function calcPhase3Score(ui, functionality, problemFit) {
  return Math.round((ui * 0.3 + functionality * 0.4 + problemFit * 0.3) * 10);
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
export function getResultsBoard(teams, phasesEnabled = []) {
  const enabled = Array.isArray(phasesEnabled) ? phasesEnabled : [];

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
export function computeReveal(teams, phasesEnabled, revealIndex, topN = 0) {
  const board = getResultsBoard(teams, phasesEnabled);
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

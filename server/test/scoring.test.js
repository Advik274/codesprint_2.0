import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcPhase1Score, calcPhase3Score, getResultsBoard, computeReveal } from '../lib/scoring.js';

describe('calcPhase1Score', () => {
  test('faster correct answers score higher', () => {
    const fast = calcPhase1Score(10, 20, 2000); // 2s taken
    const slow = calcPhase1Score(10, 20, 18000); // 18s taken
    assert.ok(fast > slow);
    assert.equal(fast, 10 + 18); // base + (20 - 2)
    assert.equal(slow, 10 + 2);  // base + (20 - 18)
  });

  test('never goes below the base points even if time_taken exceeds the limit', () => {
    const score = calcPhase1Score(10, 20, 25000); // took longer than the limit somehow
    assert.equal(score, 10); // Math.max(0, ...) on the bonus, not below base
  });
});

describe('calcPhase3Score', () => {
  test('weights UI 30%, functionality 40%, problem fit 30%, out of 100', () => {
    assert.equal(calcPhase3Score(10, 10, 10), 100);
    assert.equal(calcPhase3Score(0, 0, 0), 0);
    assert.equal(calcPhase3Score(10, 0, 0), 30);
    assert.equal(calcPhase3Score(0, 10, 0), 40);
    assert.equal(calcPhase3Score(0, 0, 10), 30);
  });
});

function makeTeam(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    name: 'Team', color: '#fff', is_eliminated: false,
    phase1_total_score: 0, quiz_score: 0, zones_captured: 0, battery: 100,
    phase3_judge_scores: null,
    ...overrides,
  };
}

describe('getResultsBoard', () => {
  test('uses judge scores when phase3 was enabled', () => {
    const teams = [
      makeTeam({ id: 'a', phase3_judge_scores: { total: 90 } }),
      makeTeam({ id: 'b', phase3_judge_scores: { total: 70 } }),
    ];
    const board = getResultsBoard(teams, ['phase1', 'phase3']);
    assert.equal(board[0].team_id, 'a');
    assert.equal(board[0].score, 90);
    assert.equal(board[0].score_label, 'Judge Score');
  });

  test('falls back to quiz score when phase3 was not enabled', () => {
    const teams = [
      makeTeam({ id: 'a', quiz_score: 40 }),
      makeTeam({ id: 'b', quiz_score: 60 }),
    ];
    const board = getResultsBoard(teams, ['quiz_round']);
    assert.equal(board[0].team_id, 'b');
    assert.equal(board[0].score_label, 'Quiz Score');
  });

  test('falls back to phase1 score when only phase1 was enabled', () => {
    const teams = [
      makeTeam({ id: 'a', phase1_total_score: 15 }),
      makeTeam({ id: 'b', phase1_total_score: 45 }),
    ];
    const board = getResultsBoard(teams, ['phase1']);
    assert.equal(board[0].team_id, 'b');
    assert.equal(board[0].score_label, 'Gauntlet Score');
  });

  test('excludes eliminated teams from non-phase3 boards', () => {
    const teams = [
      makeTeam({ id: 'a', quiz_score: 100, is_eliminated: true }),
      makeTeam({ id: 'b', quiz_score: 10 }),
    ];
    const board = getResultsBoard(teams, ['quiz_round']);
    assert.equal(board.length, 1);
    assert.equal(board[0].team_id, 'b');
  });
});

describe('computeReveal', () => {
  const teams = [
    makeTeam({ id: 'winner', phase3_judge_scores: { total: 95 } }),
    makeTeam({ id: 'runnerup', phase3_judge_scores: { total: 80 } }),
    makeTeam({ id: 'third', phase3_judge_scores: { total: 60 } }),
  ];
  const phases = ['phase3'];

  test('reveals worst-to-best across successive calls', () => {
    const r1 = computeReveal(teams, phases, -1, 0);
    assert.equal(r1.ok, true);
    assert.equal(r1.team.team_id, 'third');
    assert.equal(r1.is_winner, false);

    const r2 = computeReveal(teams, phases, r1.idx, 0);
    assert.equal(r2.team.team_id, 'runnerup');

    const r3 = computeReveal(teams, phases, r2.idx, 0);
    assert.equal(r3.team.team_id, 'winner');
    assert.equal(r3.is_winner, true);
    assert.equal(r3.is_last, true);
  });

  // BUG FIX regression test: clicking past the last team used to index off
  // the end of the array and silently produce a null/undefined team.
  test('refuses to reveal past the last team instead of returning garbage', () => {
    const last = computeReveal(teams, phases, 1, 0); // idx=1 is 'winner', the final one (0-indexed, len=3)
    assert.equal(last.ok, true);
    assert.equal(last.is_last, true);

    const overshoot = computeReveal(teams, phases, last.idx, 0);
    assert.equal(overshoot.ok, false);
    assert.match(overshoot.reason, /already revealed/i);
  });

  test('with zero teams, reports "nothing to reveal" instead of crashing', () => {
    const result = computeReveal([], phases, -1, 0);
    assert.equal(result.ok, false);
    assert.match(result.reason, /no results/i);
  });

  test('a single team is immediately both first reveal and the winner', () => {
    const solo = [makeTeam({ id: 'only', phase3_judge_scores: { total: 50 } })];
    const result = computeReveal(solo, phases, -1, 0);
    assert.equal(result.ok, true);
    assert.equal(result.team.team_id, 'only');
    assert.equal(result.is_winner, true);
    assert.equal(result.is_last, true);
  });

  test('reveal_top_n limits the reveal sequence to the top N places', () => {
    const r1 = computeReveal(teams, phases, -1, 2); // top 2 only: runnerup, winner
    assert.equal(r1.team.team_id, 'runnerup');
    const r2 = computeReveal(teams, phases, r1.idx, 2);
    assert.equal(r2.team.team_id, 'winner');
    assert.equal(r2.is_last, true);
    // third place was never in the top-2 reveal sequence at all
    const overshoot = computeReveal(teams, phases, r2.idx, 2);
    assert.equal(overshoot.ok, false);
  });
});

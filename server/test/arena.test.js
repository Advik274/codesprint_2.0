// CODE ARENA mission logic: Bug Hunt grading, Code Strike scoring,
// the combined results board, and the quiz bank selector.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gradeBugHunt, calcCodeStrikeProblemScore, calcCodeStrikeTotal, getResultsBoard, computeReveal, calcViolationPenalty } from '../lib/scoring.js';
import { pickQuizQuestions, ARENA_MCQ_POOL, GAUNTLET_QUESTIONS, BUG_HUNT_PROGRAMS, CODE_STRIKE_PROBLEMS } from '../lib/questions.js';
import { assessSubmission, describeIntegrity } from '../lib/integrity.js';

const PROGRAMS = [
  { id: 'p1', answers: ['for i in range(1, n+1):'] },
  { id: 'p2', answer: 'if x < smallest:' },
  { id: 'p3', answer: 'int fact = 1;' },
  { id: 'p4', answer: 'n--;' },
  { id: 'p5', answer: 'return total / len(marks)' },
];

describe('gradeBugHunt', () => {
  test('splits total marks evenly and awards per correct fix', () => {
    const answers = { p1: 'for i in range(1, n+1):', p2: 'if x < smallest:' };
    const { auto, per_program, score, per_program_marks } = gradeBugHunt(answers, PROGRAMS, 30);
    assert.equal(per_program_marks, 6);
    assert.equal(auto.p1, true);
    assert.equal(auto.p2, true);
    assert.equal(auto.p3, false);
    assert.equal(per_program.p1, 6);
    assert.equal(per_program.p3, 0);
    assert.equal(score, 12);
  });

  test('lenient matcher tolerates spacing/case differences in the fix', () => {
    const { auto } = gradeBugHunt({ p1: 'FOR I IN RANGE(1, N + 1):' }, PROGRAMS, 30);
    assert.equal(auto.p1, true);
  });

  test('no submission at all grades to zero', () => {
    const { score } = gradeBugHunt({}, PROGRAMS, 30);
    assert.equal(score, 0);
  });

  test('a perfect run scores exactly the mission total', () => {
    const answers = {
      p1: 'for i in range(1, n+1):', p2: 'if x < smallest:',
      p3: 'int fact = 1;', p4: 'n--;', p5: 'return total / len(marks)',
    };
    const { score } = gradeBugHunt(answers, PROGRAMS, 30);
    assert.equal(score, 30);
  });

  test('admin override wins over the auto verdict, both directions', () => {
    // p3 auto-wrong but overridden to partial credit; p1 auto-correct but overridden to 0
    const answers = { p1: 'for i in range(1, n+1):', p3: 'fact = 1' };
    const { per_program, score, auto } = gradeBugHunt(answers, PROGRAMS, 30, { p3: 4, p1: 0 });
    assert.equal(auto.p3, false);
    assert.equal(per_program.p3, 4);
    assert.equal(per_program.p1, 0);
    assert.equal(score, 4);
  });

  test('override is clamped to the per-program maximum', () => {
    const { per_program } = gradeBugHunt({}, PROGRAMS, 30, { p1: 999 });
    assert.equal(per_program.p1, 6);
  });

  test('built-in program bank sample answers grade correctly against themselves', () => {
    // Every accepted answer in the shipped bank must pass its own matcher
    BUG_HUNT_PROGRAMS.forEach(p => {
      const accepted = p.answers || [p.answer];
      accepted.forEach(a => {
        const { auto } = gradeBugHunt({ [p.id]: a }, [p], 6);
        assert.equal(auto[p.id], true, `bank answer rejected for ${p.id}: "${a}"`);
      });
    });
  });
});

describe('calcCodeStrikeProblemScore', () => {
  test('70/20/10 weighting at full marks', () => {
    assert.equal(calcCodeStrikeProblemScore(10, 10, 10, 1), 10);
    assert.equal(calcCodeStrikeProblemScore(10, 10, 0, 0), 7);
    assert.equal(calcCodeStrikeProblemScore(10, 0, 10, 1), 0); // zero correctness zeroes everything
  });

  test('judge inputs are clamped to 0-10 and time factor to 0-1', () => {
    assert.equal(calcCodeStrikeProblemScore(10, 99, 99, 99), 10);
    assert.equal(calcCodeStrikeProblemScore(10, -5, -5, -5), 0);
  });
});

describe('calcCodeStrikeTotal', () => {
  const problems = CODE_STRIKE_PROBLEMS; // marks 8 + 12 + 12 + 18 = 50
  const startedAt = '2026-01-01T10:00:00.000Z';
  const durationMs = 45 * 60 * 1000;

  test('unsubmitted or unjudged problems contribute nothing', () => {
    const team = { codestrike_submissions: {}, codestrike_judge: { cs_easy: { correctness: 10, efficiency: 10 } } };
    assert.equal(calcCodeStrikeTotal(team, problems, startedAt, durationMs, 50), 0);
  });

  test('perfect scores with instant submission reach the full mission marks', () => {
    const submitted_at = startedAt; // elapsed 0 → full time bonus
    const team = {
      codestrike_submissions: {
        cs_easy: { submitted_at }, cs_medium: { submitted_at }, cs_brackets: { submitted_at }, cs_extreme: { submitted_at },
      },
      codestrike_judge: {
        cs_easy: { correctness: 10, efficiency: 10 },
        cs_medium: { correctness: 10, efficiency: 10 },
        cs_brackets: { correctness: 10, efficiency: 10 },
        cs_extreme: { correctness: 10, efficiency: 10 },
      },
    };
    assert.equal(calcCodeStrikeTotal(team, problems, startedAt, durationMs, 50), 50);
  });

  test('earlier submission beats an identical later one (time bonus)', () => {
    const early = {
      codestrike_submissions: { cs_brackets: { submitted_at: '2026-01-01T10:05:00.000Z' } },
      codestrike_judge: { cs_brackets: { correctness: 8, efficiency: 8 } },
    };
    const late = {
      codestrike_submissions: { cs_brackets: { submitted_at: '2026-01-01T10:44:00.000Z' } },
      codestrike_judge: { cs_brackets: { correctness: 8, efficiency: 8 } },
    };
    const earlyScore = calcCodeStrikeTotal(early, problems, startedAt, durationMs, 50);
    const lateScore = calcCodeStrikeTotal(late, problems, startedAt, durationMs, 50);
    assert.ok(earlyScore > lateScore);
  });

  test('scales to the configured mission marks when they differ from the problems sum', () => {
    const submitted_at = startedAt;
    const team = {
      codestrike_submissions: { cs_easy: { submitted_at }, cs_medium: { submitted_at }, cs_brackets: { submitted_at }, cs_extreme: { submitted_at } },
      codestrike_judge: {
        cs_easy: { correctness: 10, efficiency: 10 },
        cs_medium: { correctness: 10, efficiency: 10 },
        cs_brackets: { correctness: 10, efficiency: 10 },
        cs_extreme: { correctness: 10, efficiency: 10 },
      },
    };
    assert.equal(calcCodeStrikeTotal(team, problems, startedAt, durationMs, 100), 100);
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

describe('getResultsBoard — CODE ARENA combined branch', () => {
  test('sums only the missions that were enabled', () => {
    const teams = [
      makeTeam({ id: 'a', quiz_marks_scored: 15, bughunt_score: 24, codestrike_score: 40 }),
      makeTeam({ id: 'b', quiz_marks_scored: 20, bughunt_score: 30, codestrike_score: 10 }),
    ];
    const board = getResultsBoard(teams, ['quiz_round', 'bug_hunt', 'code_strike']);
    assert.equal(board[0].team_id, 'a'); // 79 vs 60
    assert.equal(board[0].score, 79);
    assert.equal(board[0].score_label, 'Total Marks');
    assert.deepEqual(board[0].scores, { quiz: 15, bughunt: 24, codestrike: 40, penalty: 0, violations: 0, card: 'clean', tiebreak_wins: 0 });

    // Same teams, but quiz not part of the event → quiz marks don't count
    const noQuiz = getResultsBoard(teams, ['bug_hunt', 'code_strike']);
    assert.equal(noQuiz[0].team_id, 'a'); // 64 vs 40
    assert.equal(noQuiz[0].score, 64);
  });

  test('tie-break wins order teams with equal totals', () => {
    const teams = [
      makeTeam({ id: 'a', bughunt_score: 30, tiebreak_wins: 0 }),
      makeTeam({ id: 'b', bughunt_score: 30, tiebreak_wins: 1 }),
    ];
    const board = getResultsBoard(teams, ['bug_hunt']);
    assert.equal(board[0].team_id, 'b');
  });

  test('eliminated teams are excluded', () => {
    const teams = [
      makeTeam({ id: 'a', bughunt_score: 30 }),
      makeTeam({ id: 'b', bughunt_score: 99, is_eliminated: true }),
    ];
    const board = getResultsBoard(teams, ['bug_hunt', 'code_strike']);
    assert.equal(board.length, 1);
    assert.equal(board[0].team_id, 'a');
  });

  test('does NOT hijack events without arena missions (old behaviour intact)', () => {
    const teams = [makeTeam({ id: 'a', quiz_score: 40, phase3_judge_scores: { total: 88 } })];
    assert.equal(getResultsBoard(teams, ['phase1', 'phase3'])[0].score_label, 'Judge Score');
    assert.equal(getResultsBoard(teams, ['quiz_round'])[0].score_label, 'Quiz Score');
  });

  test('reveal flow works over the combined board', () => {
    const teams = [
      makeTeam({ id: 'a', bughunt_score: 30, codestrike_score: 40 }),
      makeTeam({ id: 'b', bughunt_score: 10, codestrike_score: 10 }),
    ];
    const enabled = ['bug_hunt', 'code_strike'];
    const first = computeReveal(teams, enabled, -1);
    assert.equal(first.ok, true);
    assert.equal(first.team.team_id, 'b'); // worst first
    const second = computeReveal(teams, enabled, first.idx);
    assert.equal(second.team.team_id, 'a');
    assert.equal(second.is_winner, true);
    const past = computeReveal(teams, enabled, second.idx);
    assert.equal(past.ok, false); // bounded, as before
  });
});

describe('pickQuizQuestions — bank selector', () => {
  test('defaults to the original DSA pool (existing behaviour unchanged)', () => {
    const qs = pickQuizQuestions(999, [], []);
    assert.equal(qs.length, GAUNTLET_QUESTIONS.length);
    assert.ok(qs.every(q => q.id.startsWith('g')));
  });

  test('arena source draws only from the multi-topic pool', () => {
    const qs = pickQuizQuestions(999, [], [], 'arena');
    assert.equal(qs.length, ARENA_MCQ_POOL.length);
    assert.ok(qs.every(q => q.id.startsWith('a')));
  });

  test('both combines the pools; custom questions always included', () => {
    const custom = [{ id: 'c1', type: 'text_input', question: 'x', answer: 'y' }];
    const qs = pickQuizQuestions(999, [], custom, 'both');
    assert.equal(qs.length, GAUNTLET_QUESTIONS.length + ARENA_MCQ_POOL.length + 1);
    assert.ok(qs.some(q => q.id === 'c1'));
  });

  test('20 questions for CODE ARENA Mission 1 come back as exactly 20', () => {
    assert.equal(pickQuizQuestions(20, [], [], 'arena').length, 20);
  });
});

describe('calcViolationPenalty — escalating discipline', () => {
  test('a clean team is clean', () => {
    const r = calcViolationPenalty(null);
    assert.equal(r.stage, 'clean');
    assert.equal(r.penalty, 0);
  });

  test('first violation is a free warning', () => {
    const r = calcViolationPenalty({ total: 1 });
    assert.equal(r.stage, 'warning');
    assert.equal(r.penalty, 0);
  });

  test('second is a yellow card, still free', () => {
    const r = calcViolationPenalty({ total: 2 });
    assert.equal(r.stage, 'yellow');
    assert.equal(r.penalty, 0);
  });

  test('third and beyond cost marks', () => {
    assert.equal(calcViolationPenalty({ total: 3 }).stage, 'red');
    assert.equal(calcViolationPenalty({ total: 3 }).penalty, 2);
    assert.equal(calcViolationPenalty({ total: 5 }).penalty, 6);
  });

  test('the deduction is capped so one bad phone cannot zero a team', () => {
    assert.equal(calcViolationPenalty({ total: 99 }).penalty, 10);
  });

  test('honours configured thresholds', () => {
    const cfg = { penalty_free_violations: 0, penalty_marks_each: 5, penalty_max: 100 };
    assert.equal(calcViolationPenalty({ total: 1 }, cfg).penalty, 5);
    assert.equal(calcViolationPenalty({ total: 3 }, cfg).penalty, 15);
  });

  test('can be switched off entirely (warnings only)', () => {
    const r = calcViolationPenalty({ total: 9 }, { penalty_enabled: false });
    assert.equal(r.stage, 'red');       // still shows the card
    assert.equal(r.penalty, 0);         // but costs nothing
  });
});

describe('getResultsBoard — penalties applied', () => {
  test('penalty is subtracted from the combined total', () => {
    const teams = [
      makeTeam({ id: 'clean', bughunt_score: 30, codestrike_score: 40 }),
      makeTeam({ id: 'naughty', bughunt_score: 30, codestrike_score: 40, violations: { total: 5 } }),
    ];
    const board = getResultsBoard(teams, ['bug_hunt', 'code_strike']);
    assert.equal(board[0].team_id, 'clean');
    assert.equal(board[0].score, 70);
    assert.equal(board[1].team_id, 'naughty');
    assert.equal(board[1].score, 64);            // 70 − 6
    assert.equal(board[1].scores.penalty, 6);
    assert.equal(board[1].scores.card, 'red');
  });

  test('a team can never be pushed below zero', () => {
    const teams = [makeTeam({ id: 'a', bughunt_score: 3, violations: { total: 20 } })];
    assert.equal(getResultsBoard(teams, ['bug_hunt'])[0].score, 0);
  });

  test('free violations do not change the score', () => {
    const teams = [makeTeam({ id: 'a', bughunt_score: 30, violations: { total: 2 } })];
    const row = getResultsBoard(teams, ['bug_hunt'])[0];
    assert.equal(row.score, 30);
    assert.equal(row.scores.card, 'yellow');
  });

  test('equal totals break on tie-break wins first, then cleaner record', () => {
    const teams = [
      makeTeam({ id: 'dirty', bughunt_score: 30, violations: { total: 2 } }),
      makeTeam({ id: 'clean', bughunt_score: 30 }),
    ];
    assert.equal(getResultsBoard(teams, ['bug_hunt'])[0].team_id, 'clean');

    const withWin = [
      makeTeam({ id: 'dirty_winner', bughunt_score: 30, violations: { total: 2 }, tiebreak_wins: 1 }),
      makeTeam({ id: 'clean', bughunt_score: 30 }),
    ];
    assert.equal(getResultsBoard(withWin, ['bug_hunt'])[0].team_id, 'dirty_winner');
  });
});

describe('assessSubmission — Code Strike typing integrity', () => {
  test('code with keystrokes in line with its length reads as typed', () => {
    const a = assessSubmission({ code: 'x'.repeat(400), keystrokes: 460 });
    assert.equal(a.verdict, 'typed');
  });

  test('a long solution with almost no keystrokes is flagged', () => {
    const a = assessSubmission({ code: 'x'.repeat(1200), keystrokes: 40 });
    assert.equal(a.verdict, 'appeared');
    assert.match(describeIntegrity(a), /not typed here/);
  });

  test('partial typing lands in between', () => {
    const a = assessSubmission({ code: 'x'.repeat(400), keystrokes: 160 });
    assert.equal(a.verdict, 'partial');
  });

  test('very short answers are not judged either way', () => {
    assert.equal(assessSubmission({ code: 'print(1)', keystrokes: 0 }).verdict, 'trivial');
  });

  test('a client that sent no telemetry is unverified, not accused', () => {
    assert.equal(assessSubmission({ code: 'x'.repeat(400) }).verdict, 'unverified');
  });

  test('blocked paste attempts are surfaced to the judge', () => {
    const a = assessSubmission({ code: 'x'.repeat(400), keystrokes: 450, paste_blocked: 3 });
    assert.equal(a.paste_blocked, 3);
    assert.match(describeIntegrity(a), /3 pastes blocked/);
  });
});

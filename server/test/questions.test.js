import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuizQuestions, getFiveZoneOptions, getRandomGauntletQuestion, GAUNTLET_QUESTIONS, ZONE_PROBLEM_POOL } from '../lib/questions.js';

describe('pickQuizQuestions', () => {
  // BUG FIX regression test: the quiz round used to be handed
  // db.used_question_ids — the SAME array Phase 1's gauntlet rounds push
  // into — so any question already asked in Phase 1 silently shrank the
  // quiz below whatever was configured ("50 questions" showing up as 48
  // after 2 gauntlet rounds). The quiz must draw from the full pool
  // regardless of what's already been used elsewhere.
  test('returns exactly N questions when N is within pool size, ignoring an unrelated used-ids list', () => {
    const someOtherPhaseUsedIds = GAUNTLET_QUESTIONS.slice(0, 5).map(q => q.id);
    const picked = pickQuizQuestions(50, [], []); // quiz's own call site always passes []
    assert.equal(picked.length, 50);
    // Sanity: passing a used-ids list DOES still reduce the pool if you
    // actually pass one in — the fix is about the CALLER no longer doing
    // that with Phase 1's list, not about this function's own filtering.
    const reduced = pickQuizQuestions(50, someOtherPhaseUsedIds, []);
    assert.equal(reduced.length, 45);
  });

  test('caps at the available pool size rather than returning fewer than requested for no reason', () => {
    const picked = pickQuizQuestions(1000, [], []);
    assert.equal(picked.length, GAUNTLET_QUESTIONS.length);
  });

  test('includes custom questions in the pool', () => {
    const custom = [{ id: 'custom-1', type: 'text_input', question: 'Custom?', answer: 'yes', points: 10 }];
    const picked = pickQuizQuestions(GAUNTLET_QUESTIONS.length + 1, [], custom);
    assert.ok(picked.some(q => q.id === 'custom-1'));
  });

  test('shuffles MCQ options but keeps the same set of options', () => {
    const mcq = GAUNTLET_QUESTIONS.find(q => q.type === 'mcq' && q.options.length > 1);
    const picked = pickQuizQuestions(GAUNTLET_QUESTIONS.length, [], []);
    const found = picked.find(q => q.id === mcq.id);
    assert.deepEqual([...found.options].sort(), [...mcq.options].sort());
  });
});

describe('getRandomGauntletQuestion', () => {
  test('never returns a question already in usedIds when alternatives exist', () => {
    const usedIds = GAUNTLET_QUESTIONS.filter(q => q.round_max >= 1).slice(0, 3).map(q => q.id);
    for (let i = 0; i < 20; i++) {
      const q = getRandomGauntletQuestion(usedIds, 1, []);
      assert.ok(!usedIds.includes(q.id));
    }
  });

  test('only returns questions valid for the given round (round_max >= round)', () => {
    const q = getRandomGauntletQuestion([], 5, []);
    assert.ok(q.round_max >= 5);
  });
});

describe('getFiveZoneOptions', () => {
  test('always returns exactly 5 options', () => {
    assert.equal(getFiveZoneOptions([]).length, 5);
  });

  test('falls back to the full pool once fewer than 5 unused problems remain', () => {
    const almostAllUsed = ZONE_PROBLEM_POOL.slice(0, ZONE_PROBLEM_POOL.length - 2).map(p => p.id);
    const options = getFiveZoneOptions(almostAllUsed);
    assert.equal(options.length, 5); // never crashes or returns fewer than 5
  });
});

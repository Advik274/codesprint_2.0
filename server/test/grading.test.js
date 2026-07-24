import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAnswerCorrect, normalizeAnswer } from '../lib/utils.js';
import { ZONE_PROBLEM_POOL, GAUNTLET_QUESTIONS } from '../lib/questions.js';

describe('normalizeAnswer / isAnswerCorrect', () => {
  test('every question in the pool matches its own canonical answer exactly', () => {
    for (const q of [...ZONE_PROBLEM_POOL, ...GAUNTLET_QUESTIONS]) {
      const canonical = q.answer ?? q.answers?.[0];
      assert.equal(isAnswerCorrect(canonical, q), true, `${q.id} should match its own answer`);
    }
  });

  test('whitespace/case formatting differences are forgiven', () => {
    const z001 = ZONE_PROBLEM_POOL.find(q => q.id === 'z001'); // 'n -= 1'
    assert.equal(isAnswerCorrect('n  -=   1', z001), true);
    assert.equal(isAnswerCorrect('n-=1', z001), true);
    assert.equal(isAnswerCorrect('N -= 1', z001), true);
  });

  test('multi-line answers accept a single-line equivalent (whitespace-collapsed)', () => {
    const z008 = ZONE_PROBLEM_POOL.find(q => q.id === 'z008');
    assert.equal(isAnswerCorrect('if word not in count: count[word] = 0 count[word] += 1', z008), true);
  });

  test('pipe/colon-delimited answers ignore spacing and trailing punctuation', () => {
    const z017 = ZONE_PROBLEM_POOL.find(q => q.id === 'z017');
    assert.equal(isAnswerCorrect('Q1:5|Q2:5100|Q3:94.1%', z017), true);
    assert.equal(isAnswerCorrect('Q1: 5 | Q2: 5100 | Q3: 94.1%.', z017), true);
  });

  test('SQL clause reordering and formatting variance is accepted via answers[]', () => {
    const z016 = ZONE_PROBLEM_POOL.find(q => q.id === 'z016');
    assert.equal(isAnswerCorrect('select name from students where score > 80 and year = 2 order by score desc', z016), true);
    assert.equal(isAnswerCorrect('SELECT   name FROM students WHERE year=2 AND score>80 ORDER BY score DESC;', z016), true);
  });

  test('tight operator spacing is accepted for postfix-style answers', () => {
    const g044 = GAUNTLET_QUESTIONS.find(q => q.id === 'g044'); // 'A B + C D - *'
    assert.equal(isAnswerCorrect('A B+C D-*', g044), true);
  });

  test('genuinely wrong answers are still rejected', () => {
    const z001 = ZONE_PROBLEM_POOL.find(q => q.id === 'z001');
    assert.equal(isAnswerCorrect('n += 1', z001), false);

    const z016 = ZONE_PROBLEM_POOL.find(q => q.id === 'z016');
    assert.equal(isAnswerCorrect('SELECT name FROM students WHERE year = 1 AND score > 80 ORDER BY score DESC', z016), false);

    const g044 = GAUNTLET_QUESTIONS.find(q => q.id === 'g044');
    assert.equal(isAnswerCorrect('A B - C D + *', g044), false);
  });

  test('MCQ options are matched case-insensitively but reject wrong options', () => {
    const g001 = GAUNTLET_QUESTIONS.find(q => q.id === 'g001'); // answer 'N-1'
    assert.equal(isAnswerCorrect('n-1', g001), true);
    assert.equal(isAnswerCorrect('N', g001), false);
  });

  test('null/undefined/empty submissions never match', () => {
    const q = GAUNTLET_QUESTIONS[0];
    assert.equal(isAnswerCorrect(undefined, q), false);
    assert.equal(isAnswerCorrect(null, q), false);
    assert.equal(isAnswerCorrect('', q), false);
    assert.equal(isAnswerCorrect('   ', q), false);
  });

  test('non-string submissions do not throw', () => {
    const q = GAUNTLET_QUESTIONS[0];
    assert.doesNotThrow(() => isAnswerCorrect(12345, q));
    assert.doesNotThrow(() => isAnswerCorrect({}, q));
    assert.doesNotThrow(() => isAnswerCorrect(['x'], q));
  });

  test('normalizeAnswer collapses whitespace and strips trailing punctuation', () => {
    assert.equal(normalizeAnswer('  Hello   World.  '), 'hello world');
    assert.equal(normalizeAnswer('a\nb\tc'), 'a b c');
  });
});

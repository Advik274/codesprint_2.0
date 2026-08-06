// The judge is an external service. If it is down, slow or missing a
// language, the event must carry on with manual judging — never block.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { judgeStatus, runTests, correctnessFromTests, supportedLanguages } from '../lib/judge.js';
import { CODE_STRIKE_PROBLEMS, buildStdin, gradeOutput } from '../lib/codestrike.js';

const problem = CODE_STRIKE_PROBLEMS[0];

describe('judge degrades safely when Piston is unreachable', () => {
  test('status reports unavailable rather than throwing', async () => {
    const s = await judgeStatus();
    assert.equal(typeof s.available, 'boolean');
    if (!s.available) assert.ok(Array.isArray(s.languages) && s.languages.length === 0);
  });

  test('runTests returns available:false instead of rejecting', async () => {
    const r = await runTests(problem, 'python', 'def countVowels(s):\n    return 0');
    assert.equal(typeof r.available, 'boolean');
    if (!r.available) assert.ok(r.error, 'an explanation is provided for the admin');
  });

  test('an unsupported language is rejected without contacting the judge', async () => {
    const r = await runTests(problem, 'rust', 'fn main(){}');
    assert.equal(r.available, true);
    assert.equal(r.ok, false);
    assert.equal(r.stage, 'language');
  });

  test('only the three supported languages are offered', () => {
    assert.deepEqual(supportedLanguages().sort(), ['cpp', 'java', 'python']);
  });
});

describe('grading maths', () => {
  test('tests passed maps onto the 0-10 correctness scale', () => {
    assert.equal(correctnessFromTests(5, 5), 10);
    assert.equal(correctnessFromTests(0, 5), 0);
    assert.equal(correctnessFromTests(3, 5), 6);
    assert.equal(correctnessFromTests(0, 0), 0);
  });

  test('output is graded line by line, tolerating stray whitespace', () => {
    const tests = [{ input: 'a', expected: '1' }, { input: 'b', expected: '2' }];
    const all = gradeOutput(tests, '1\n2\n');
    assert.equal(all.filter(r => r.passed).length, 2);
    const partial = gradeOutput(tests, '1\r\n9');
    assert.equal(partial[0].passed, true);
    assert.equal(partial[1].passed, false);
    const crashed = gradeOutput(tests, '');
    assert.equal(crashed.filter(r => r.passed).length, 0);
  });

  test('stdin batches every case behind a count', () => {
    const stdin = buildStdin([{ input: 'x' }, { input: 'y' }]);
    assert.equal(stdin, '2\nx\ny\n');
  });
});

// Verifies every Code Strike driver by actually compiling and running a
// reference solution in each language against every test case.
//
// A broken driver fails EVERY team on that problem, and you would only
// find out mid-round. Skips cleanly on machines without a given
// toolchain (CI, a laptop without javac) so it never blocks the suite.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODE_STRIKE_PROBLEMS, buildSource, buildStdin, gradeOutput } from '../lib/codestrike.js';

const has = (cmd, args = ['--version']) => {
  try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; }
};
const HAS = { python: has('python'), cpp: has('g++'), java: has('javac') };

// Correct solutions — what a strong team would submit.
const REFERENCE = {
  cs_easy: {
    python: `def countVowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')`,
    cpp: `int countVowels(string s) {\n    int n = 0;\n    for (char c : s) { char l = tolower(c); if (l=='a'||l=='e'||l=='i'||l=='o'||l=='u') n++; }\n    return n;\n}`,
    java: `    public int countVowels(String s) {\n        int n = 0;\n        for (char c : s.toLowerCase().toCharArray()) if ("aeiou".indexOf(c) >= 0) n++;\n        return n;\n    }`,
  },
  cs_medium: {
    python: `def secondLargest(nums):\n    d = sorted(set(nums), reverse=True)\n    return d[1] if len(d) > 1 else -1`,
    cpp: `int secondLargest(vector<int>& nums) {\n    vector<int> d(nums.begin(), nums.end());\n    sort(d.begin(), d.end());\n    d.erase(unique(d.begin(), d.end()), d.end());\n    if (d.size() < 2) return -1;\n    return d[d.size()-2];\n}`,
    java: `    public int secondLargest(int[] nums) {\n        java.util.TreeSet<Integer> s = new java.util.TreeSet<>();\n        for (int x : nums) s.add(x);\n        if (s.size() < 2) return -1;\n        s.pollLast();\n        return s.last();\n    }`,
  },
  cs_brackets: {
    python: `def isBalanced(s):\n    pairs = {')':'(', ']':'[', '}':'{'}\n    st = []\n    for c in s:\n        if c in '([{': st.append(c)\n        elif c in pairs:\n            if not st or st.pop() != pairs[c]: return False\n    return not st`,
    cpp: `bool isBalanced(string s) {\n    vector<char> st;\n    for (char c : s) {\n        if (c=='('||c=='['||c=='{') st.push_back(c);\n        else {\n            char want = c==')' ? '(' : c==']' ? '[' : '{';\n            if (st.empty() || st.back() != want) return false;\n            st.pop_back();\n        }\n    }\n    return st.empty();\n}`,
    java: `    public boolean isBalanced(String s) {\n        java.util.Deque<Character> st = new java.util.ArrayDeque<>();\n        for (char c : s.toCharArray()) {\n            if (c=='('||c=='['||c=='{') st.push(c);\n            else {\n                char want = c==')' ? '(' : c==']' ? '[' : '{';\n                if (st.isEmpty() || st.pop() != want) return false;\n            }\n        }\n        return st.isEmpty();\n    }`,
  },
  cs_extreme: {
    python: `def minCoins(coins, amount):\n    INF = float('inf')\n    dp = [0] + [INF] * amount\n    for a in range(1, amount + 1):\n        for c in coins:\n            if c <= a and dp[a-c] + 1 < dp[a]: dp[a] = dp[a-c] + 1\n    return -1 if dp[amount] == INF else dp[amount]`,
    cpp: `int minCoins(vector<int>& coins, int amount) {\n    vector<int> dp(amount+1, INT_MAX);\n    dp[0] = 0;\n    for (int a = 1; a <= amount; a++)\n        for (int c : coins)\n            if (c <= a && dp[a-c] != INT_MAX && dp[a-c] + 1 < dp[a]) dp[a] = dp[a-c] + 1;\n    return dp[amount] == INT_MAX ? -1 : dp[amount];\n}`,
    java: `    public int minCoins(int[] coins, int amount) {\n        int INF = Integer.MAX_VALUE;\n        int[] dp = new int[amount+1];\n        java.util.Arrays.fill(dp, INF);\n        dp[0] = 0;\n        for (int a = 1; a <= amount; a++)\n            for (int c : coins)\n                if (c <= a && dp[a-c] != INF && dp[a-c] + 1 < dp[a]) dp[a] = dp[a-c] + 1;\n        return dp[amount] == INF ? -1 : dp[amount];\n    }`,
  },
};

// A team that reached for greedy on the extreme problem — must FAIL.
const GREEDY_TRAP = `def minCoins(coins, amount):\n    coins = sorted(coins, reverse=True)\n    n = 0\n    for c in coins:\n        while amount >= c:\n            amount -= c\n            n += 1\n    return -1 if amount else n`;

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'cs-drivers-')); });

function run(language, source, stdin) {
  if (language === 'python') {
    const f = join(dir, `m${Date.now()}${Math.random().toString(36).slice(2)}.py`);
    writeFileSync(f, source);
    const r = spawnSync('python', [f], { input: stdin, encoding: 'utf8', timeout: 30000 });
    rmSync(f, { force: true });
    return r;
  }
  if (language === 'cpp') {
    const src = join(dir, `m${Date.now()}${Math.random().toString(36).slice(2)}.cpp`);
    const exe = `${src}.exe`;
    writeFileSync(src, source);
    const c = spawnSync('g++', ['-O2', '-std=c++14', src, '-o', exe], { encoding: 'utf8', timeout: 60000 });
    if (c.status !== 0) return { status: c.status, stdout: '', stderr: c.stderr };
    const r = spawnSync(exe, [], { input: stdin, encoding: 'utf8', timeout: 30000 });
    rmSync(src, { force: true }); rmSync(exe, { force: true });
    return r;
  }
  // java — the class must be Main.java
  const sub = mkdtempSync(join(dir, 'java-'));
  const src = join(sub, 'Main.java');
  writeFileSync(src, source);
  const c = spawnSync('javac', [src], { encoding: 'utf8', timeout: 90000 });
  if (c.status !== 0) return { status: c.status, stdout: '', stderr: c.stderr };
  const r = spawnSync('java', ['-cp', sub, 'Main'], { input: stdin, encoding: 'utf8', timeout: 30000 });
  rmSync(sub, { recursive: true, force: true });
  return r;
}

describe('Code Strike drivers compile and grade correctly', () => {
  for (const problem of CODE_STRIKE_PROBLEMS) {
    for (const language of ['python', 'cpp', 'java']) {
      test(`${problem.id} · ${language} · reference solution passes every test`, (t) => {
        if (!HAS[language]) return t.skip(`${language} toolchain not installed`);
        const source = buildSource(problem, language, REFERENCE[problem.id][language]);
        assert.ok(source, 'driver exists for this language');
        assert.ok(!source.includes('{{USER_CODE}}'), 'user code was substituted in');

        const res = run(language, source, buildStdin(problem.tests));
        assert.equal(res.status, 0, `program failed to run: ${res.stderr?.slice(0, 400)}`);

        const graded = gradeOutput(problem.tests, res.stdout);
        const failed = graded.filter(g => !g.passed);
        assert.equal(failed.length, 0,
          `failing cases: ${JSON.stringify(failed.map(f => ({ in: f.input, want: f.expected, got: f.got })))}`);
      });
    }
  }

  test('the greedy trap on Exact Change is actually caught by the tests', (t) => {
    if (!HAS.python) return t.skip('python not installed');
    const problem = CODE_STRIKE_PROBLEMS.find(p => p.id === 'cs_extreme');
    const res = run('python', buildSource(problem, 'python', GREEDY_TRAP), buildStdin(problem.tests));
    const graded = gradeOutput(problem.tests, res.stdout);
    const first = graded[0];
    assert.equal(first.passed, false, 'greedy must fail the coins=[1,3,4] amount=6 case');
    assert.equal(first.got, '3', 'greedy specifically returns 3 instead of 2');
  });
});

describe('problem definitions are complete', () => {
  for (const p of CODE_STRIKE_PROBLEMS) {
    test(`${p.id} has starters, drivers and tests for all three languages`, () => {
      for (const lang of ['python', 'cpp', 'java']) {
        assert.ok(p.starters?.[lang], `${p.id} missing ${lang} starter`);
        assert.ok(p.drivers?.[lang]?.includes('{{USER_CODE}}'), `${p.id} missing ${lang} driver placeholder`);
      }
      assert.ok(p.tests.length >= 4, 'at least four test cases');
      assert.ok(p.tests.some(t => t.sample), 'at least one visible sample');
      assert.ok(p.tests.some(t => !t.sample), 'at least one hidden test');
    });
  }

  test('marks still total the mission score', () => {
    assert.equal(CODE_STRIKE_PROBLEMS.reduce((a, p) => a + p.marks, 0), 50);
  });
});

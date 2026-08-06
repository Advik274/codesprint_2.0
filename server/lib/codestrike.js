// ── Mission 3 problems, LeetCode-style ────────────────────────────
//
// Teams implement ONE function; the platform supplies the driver that
// reads input, calls it and prints the result. That removes marks lost
// to fumbling stdin parsing — which for 1st/2nd years is most of the
// failures and says nothing about their algorithm — and it lets the
// whole submission be auto-graded against test cases.
//
// Each problem carries, per language:
//   starter — the stub the team sees in the editor
//   driver  — the wrapper; {{USER_CODE}} is replaced with their function
//
// Drivers handle ALL test cases in a single run: stdin starts with the
// number of cases, and one line of output is expected per case. That
// means one compile per submission instead of one per test, which
// matters for C++ and Java.
//
// Every driver here is verified by test/drivers.test.js, which compiles
// and runs a reference solution in all three languages against every
// test case. A broken driver would fail every team, so it is not
// something to find out about on the day.

const CPP_HEADERS = `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <climits>
using namespace std;
`;

export const CODE_STRIKE_PROBLEMS = [
  // ── EASY ────────────────────────────────────────────────────────
  {
    id: 'cs_easy', difficulty: 'easy', marks: 8, title: 'Vowel Census',
    fn: 'countVowels',
    statement: `Count how many vowels (a, e, i, o, u — upper or lower case) appear in a piece of text.

Implement countVowels(s) — it receives the text and must RETURN the number of vowels. Do not read input or print anything; the platform handles that.`,
    returns: 'an integer — the number of vowels in s',
    constraints: '1 <= length of s <= 1000. The text may contain spaces, digits and punctuation.',
    judge_notes: 'Sample 2 catches teams who forget upper-case letters. Any loop with a membership check is full marks — there is no clever solution expected here, it is the confidence-builder.',
    starters: {
      python: `def countVowels(s):\n    # return the number of vowels in s\n    pass\n`,
      cpp: `int countVowels(string s) {\n    // return the number of vowels in s\n}\n`,
      java: `public int countVowels(String s) {\n    // return the number of vowels in s\n}\n`,
    },
    drivers: {
      python: `import sys
{{USER_CODE}}

def _run():
    data = sys.stdin.read().split('\\n')
    t = int(data[0].strip())
    out = []
    for i in range(1, t + 1):
        out.append(str(countVowels(data[i] if i < len(data) else '')))
    sys.stdout.write('\\n'.join(out))

_run()
`,
      cpp: `${CPP_HEADERS}{{USER_CODE}}

int main() {
    string line;
    if (!getline(cin, line)) return 0;
    int t = stoi(line);
    for (int i = 0; i < t; i++) {
        if (!getline(cin, line)) line = "";
        cout << countVowels(line);
        if (i + 1 < t) cout << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.*;
import java.io.*;

public class Main {
{{USER_CODE}}

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        Main sol = new Main();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t; i++) {
            String s = br.readLine();
            if (s == null) s = "";
            sb.append(sol.countVowels(s));
            if (i + 1 < t) sb.append("\\n");
        }
        System.out.print(sb);
    }
}
`,
    },
    tests: [
      { input: 'Reboot Club', expected: '4', sample: true },
      { input: 'CODE ARENA 2026', expected: '5', sample: true },
      { input: 'xyz', expected: '0' },
      { input: 'AEIOUaeiou', expected: '10' },
      { input: 'Programming is fun', expected: '5' },
    ],
  },

  // ── MEDIUM 1 ────────────────────────────────────────────────────
  {
    id: 'cs_medium', difficulty: 'medium', marks: 12, title: 'Silver Medal',
    fn: 'secondLargest',
    statement: `Find the SECOND LARGEST DISTINCT value in a list of scores.

Implement secondLargest(nums) — it receives the list and must RETURN the second largest distinct value, or -1 if every value is the same.`,
    returns: 'an integer — the second largest distinct value, or -1',
    constraints: '2 <= nums.length <= 100000. Values fit in a 32-bit signed integer and may be negative.',
    judge_notes: 'The trap is duplicates of the maximum: [10,30,20,30,5] must give 20, not 30. Negative values catch anyone who initialised their "second best" to 0 instead of the minimum. A single pass tracking the top two is the efficient answer; sorting is fine at this size but score efficiency slightly lower.',
    starters: {
      python: `def secondLargest(nums):\n    # return the second largest distinct value, or -1\n    pass\n`,
      cpp: `int secondLargest(vector<int>& nums) {\n    // return the second largest distinct value, or -1\n}\n`,
      java: `public int secondLargest(int[] nums) {\n    // return the second largest distinct value, or -1\n}\n`,
    },
    drivers: {
      python: `import sys
{{USER_CODE}}

def _run():
    data = sys.stdin.read().split()
    idx = 0
    t = int(data[idx]); idx += 1
    out = []
    for _ in range(t):
        n = int(data[idx]); idx += 1
        nums = [int(data[idx + i]) for i in range(n)]; idx += n
        out.append(str(secondLargest(nums)))
    sys.stdout.write('\\n'.join(out))

_run()
`,
      cpp: `${CPP_HEADERS}{{USER_CODE}}

int main() {
    int t;
    if (!(cin >> t)) return 0;
    for (int i = 0; i < t; i++) {
        int n; cin >> n;
        vector<int> nums(n);
        for (int j = 0; j < n; j++) cin >> nums[j];
        cout << secondLargest(nums);
        if (i + 1 < t) cout << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.*;
import java.io.*;

public class Main {
{{USER_CODE}}

    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);
        int t = sc.nextInt();
        Main sol = new Main();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t; i++) {
            int n = sc.nextInt();
            int[] nums = new int[n];
            for (int j = 0; j < n; j++) nums[j] = sc.nextInt();
            sb.append(sol.secondLargest(nums));
            if (i + 1 < t) sb.append("\\n");
        }
        System.out.print(sb);
    }
}
`,
    },
    tests: [
      { input: '5\n10 30 20 30 5', expected: '20', sample: true },
      { input: '3\n7 7 7', expected: '-1', sample: true },
      { input: '2\n1 2', expected: '1' },
      { input: '4\n5 5 4 4', expected: '4' },
      { input: '3\n-1 -2 -3', expected: '-2' },
    ],
  },

  // ── MEDIUM 2 ────────────────────────────────────────────────────
  {
    id: 'cs_brackets', difficulty: 'medium', marks: 12, title: 'Bracket Inspector',
    fn: 'isBalanced',
    statement: `A source file contains only bracket characters: ( ) [ ] { }. Decide whether the sequence is BALANCED — every opening bracket closed by the same type, in the correct order.

Implement isBalanced(s) — it receives the bracket string and must RETURN true or false. The platform prints YES or NO for you.`,
    returns: 'true if the brackets are balanced, false otherwise',
    constraints: '1 <= length of s <= 100000. The string contains only ( ) [ ] { }',
    judge_notes: 'Two traps: interleaving ([)] must be NO, and unclosed openers ((() must be NO — a team that only counts brackets passes neither. A stack is the expected O(n) answer; repeated string replace() loops give the right answer but are O(n^2), so score efficiency lower.',
    starters: {
      python: `def isBalanced(s):\n    # return True if the brackets are balanced\n    pass\n`,
      cpp: `bool isBalanced(string s) {\n    // return true if the brackets are balanced\n}\n`,
      java: `public boolean isBalanced(String s) {\n    // return true if the brackets are balanced\n}\n`,
    },
    drivers: {
      python: `import sys
{{USER_CODE}}

def _run():
    data = sys.stdin.read().split('\\n')
    t = int(data[0].strip())
    out = []
    for i in range(1, t + 1):
        s = data[i].strip() if i < len(data) else ''
        out.append('YES' if isBalanced(s) else 'NO')
    sys.stdout.write('\\n'.join(out))

_run()
`,
      cpp: `${CPP_HEADERS}{{USER_CODE}}

int main() {
    string line;
    if (!getline(cin, line)) return 0;
    int t = stoi(line);
    for (int i = 0; i < t; i++) {
        if (!getline(cin, line)) line = "";
        while (!line.empty() && (line.back() == '\\r' || line.back() == ' ')) line.pop_back();
        cout << (isBalanced(line) ? "YES" : "NO");
        if (i + 1 < t) cout << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.*;
import java.io.*;

public class Main {
{{USER_CODE}}

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        Main sol = new Main();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t; i++) {
            String s = br.readLine();
            if (s == null) s = "";
            s = s.trim();
            sb.append(sol.isBalanced(s) ? "YES" : "NO");
            if (i + 1 < t) sb.append("\\n");
        }
        System.out.print(sb);
    }
}
`,
    },
    tests: [
      { input: '{[()()]}', expected: 'YES', sample: true },
      { input: '([)]', expected: 'NO', sample: true },
      { input: '((()', expected: 'NO', sample: true },
      { input: '()', expected: 'YES' },
      { input: ')(', expected: 'NO' },
      { input: '{[]}()', expected: 'YES' },
    ],
  },

  // ── EXTREME ─────────────────────────────────────────────────────
  {
    id: 'cs_extreme', difficulty: 'extreme', marks: 18, title: 'Exact Change',
    fn: 'minCoins',
    statement: `A vending machine must dispense an exact amount using the FEWEST possible coins. It stocks an unlimited supply of each denomination.

Implement minCoins(coins, amount) — it receives the denominations and the target, and must RETURN the smallest number of coins that add up to EXACTLY that amount, or -1 if the amount cannot be made at all.`,
    returns: 'an integer — the minimum number of coins, or -1 if impossible',
    constraints: '1 <= coins.length <= 20, 1 <= amount <= 10000, each denomination <= 10000',
    judge_notes: 'THE TRAP: greedy (always take the largest coin that fits) is WRONG, and sample 1 proves it — greedy gives 4+1+1 = 3 coins where 3+3 = 2 is optimal. Code that prints 3 for sample 1 is the greedy solution however tidy it looks. Sample 2 checks they return -1 rather than looping forever. Expected answer is DP over amounts, O(n*amount); un-memoised recursion is correct but times out on the 10000 case.',
    starters: {
      python: `def minCoins(coins, amount):\n    # return the fewest coins that make exactly `+'`amount`'+`, or -1\n    pass\n`,
      cpp: `int minCoins(vector<int>& coins, int amount) {\n    // return the fewest coins that make exactly amount, or -1\n}\n`,
      java: `public int minCoins(int[] coins, int amount) {\n    // return the fewest coins that make exactly amount, or -1\n}\n`,
    },
    drivers: {
      python: `import sys
{{USER_CODE}}

def _run():
    data = sys.stdin.read().split()
    idx = 0
    t = int(data[idx]); idx += 1
    out = []
    for _ in range(t):
        n = int(data[idx]); amount = int(data[idx + 1]); idx += 2
        coins = [int(data[idx + i]) for i in range(n)]; idx += n
        out.append(str(minCoins(coins, amount)))
    sys.stdout.write('\\n'.join(out))

_run()
`,
      cpp: `${CPP_HEADERS}{{USER_CODE}}

int main() {
    int t;
    if (!(cin >> t)) return 0;
    for (int i = 0; i < t; i++) {
        int n, amount; cin >> n >> amount;
        vector<int> coins(n);
        for (int j = 0; j < n; j++) cin >> coins[j];
        cout << minCoins(coins, amount);
        if (i + 1 < t) cout << "\\n";
    }
    return 0;
}
`,
      java: `import java.util.*;
import java.io.*;

public class Main {
{{USER_CODE}}

    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);
        int t = sc.nextInt();
        Main sol = new Main();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t; i++) {
            int n = sc.nextInt(), amount = sc.nextInt();
            int[] coins = new int[n];
            for (int j = 0; j < n; j++) coins[j] = sc.nextInt();
            sb.append(sol.minCoins(coins, amount));
            if (i + 1 < t) sb.append("\\n");
        }
        System.out.print(sb);
    }
}
`,
    },
    tests: [
      { input: '3 6\n1 3 4', expected: '2', sample: true },
      { input: '2 7\n2 4', expected: '-1', sample: true },
      { input: '1 5\n5', expected: '1' },
      { input: '3 11\n1 5 6', expected: '2' },
      { input: '3 10000\n1 5 10', expected: '1000' },
    ],
  },
];

// Assemble a runnable program: the team's function inside our driver.
export function buildSource(problem, language, userCode) {
  const driver = problem?.drivers?.[language];
  if (!driver) return null;
  return driver.replace('{{USER_CODE}}', userCode);
}

// stdin for a batch of cases: count first, then each case's input.
export function buildStdin(tests) {
  return `${tests.length}\n${tests.map(t => t.input).join('\n')}\n`;
}

// Compare a run's stdout against the expected answers, line by line.
export function gradeOutput(tests, stdout) {
  const lines = String(stdout ?? '').replace(/\r/g, '').split('\n');
  return tests.map((t, i) => {
    const got = (lines[i] ?? '').trim();
    return { input: t.input, expected: t.expected, got, passed: got === t.expected.trim(), sample: !!t.sample };
  });
}

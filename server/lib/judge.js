// ── Code execution via Piston ─────────────────────────────────────
//
// We never run submitted code ourselves. Piston (self-hosted, Docker)
// executes it in a sandbox with time and memory limits; this module is
// just an HTTP client that assembles the program, sends it, and grades
// the output.
//
// Everything here degrades safely: if Piston is unreachable, down, or
// slow, callers get { available: false } and the platform falls back to
// manual judging. A dead container must never block a live event.
import { buildSource, buildStdin, gradeOutput } from './codestrike.js';

const PISTON_URL = (process.env.PISTON_URL || 'http://localhost:2000').replace(/\/$/, '');
const RUN_TIMEOUT_MS = Number(process.env.JUDGE_RUN_TIMEOUT_MS || 6000);
const COMPILE_TIMEOUT_MS = Number(process.env.JUDGE_COMPILE_TIMEOUT_MS || 15000);
const HTTP_TIMEOUT_MS = COMPILE_TIMEOUT_MS + RUN_TIMEOUT_MS + 5000;

// Our language keys → Piston's names, and the file name each needs
// (Java insists the public class matches the file).
const LANGS = {
  python: { piston: 'python', file: 'main.py' },
  cpp: { piston: 'c++', file: 'main.cpp' },
  java: { piston: 'java', file: 'Main.java' },
};

let runtimeCache = null;      // { python: '3.12.0', ... }
let runtimeCachedAt = 0;
const RUNTIME_TTL_MS = 5 * 60 * 1000;

async function fetchJSON(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs || HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${PISTON_URL}${path}`, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`piston ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Piston wants an exact version, so resolve the newest installed one per
// language and cache it — it only changes when packages are installed.
async function resolveRuntimes(force = false) {
  if (!force && runtimeCache && Date.now() - runtimeCachedAt < RUNTIME_TTL_MS) return runtimeCache;
  const list = await fetchJSON('/api/v2/runtimes', { timeoutMs: 5000 });
  const best = {};
  for (const [key, cfg] of Object.entries(LANGS)) {
    const matches = list.filter(r => r.language === cfg.piston || (r.aliases || []).includes(cfg.piston));
    if (!matches.length) continue;
    matches.sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
    best[key] = matches[0].version;
  }
  runtimeCache = best;
  runtimeCachedAt = Date.now();
  return best;
}

// Is the judge usable right now, and which languages are installed?
export async function judgeStatus() {
  try {
    const runtimes = await resolveRuntimes(true);
    const languages = Object.keys(runtimes);
    return { available: languages.length > 0, languages, url: PISTON_URL };
  } catch (err) {
    return { available: false, languages: [], url: PISTON_URL, error: err.message };
  }
}

export function supportedLanguages() {
  return Object.keys(LANGS);
}

// Run a team's function against a problem's tests.
//   samplesOnly → only the visible cases (the "Run Samples" button)
// Returns { available, ok, stage, error, results[], passed, total }
export async function runTests(problem, language, userCode, { samplesOnly = false } = {}) {
  const cfg = LANGS[language];
  if (!cfg) return { available: true, ok: false, stage: 'language', error: `Unsupported language: ${language}` };

  const tests = (problem.tests || []).filter(t => (samplesOnly ? t.sample : true));
  if (!tests.length) return { available: true, ok: false, stage: 'tests', error: 'This problem has no test cases.' };

  const source = buildSource(problem, language, userCode);
  if (!source) return { available: true, ok: false, stage: 'language', error: `No ${language} driver for this problem.` };

  let version;
  try {
    const runtimes = await resolveRuntimes();
    version = runtimes[language];
    if (!version) return { available: false, error: `${language} is not installed on the judge.` };
  } catch (err) {
    return { available: false, error: err.message };
  }

  let res;
  try {
    res = await fetchJSON('/api/v2/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: cfg.piston,
        version,
        files: [{ name: cfg.file, content: source }],
        stdin: buildStdin(tests),
        compile_timeout: COMPILE_TIMEOUT_MS,
        run_timeout: RUN_TIMEOUT_MS,
      }),
    });
  } catch (err) {
    return { available: false, error: err.message };
  }

  // Compilation failures are the team's problem, not the judge's — show
  // them the compiler's own message, trimmed to something readable.
  if (res.compile && res.compile.code !== 0) {
    return {
      available: true, ok: false, stage: 'compile',
      error: (res.compile.stderr || res.compile.output || 'Compilation failed').slice(0, 1500),
      results: [], passed: 0, total: tests.length,
    };
  }

  const run = res.run || {};
  const results = gradeOutput(tests, run.stdout);
  const passed = results.filter(r => r.passed).length;

  // A non-zero exit with nothing correct is a crash or a timeout; if some
  // cases passed, the program died partway and partial credit still holds.
  if (run.code !== 0 && passed === 0) {
    const timedOut = run.signal === 'SIGKILL' || /timed? ?out/i.test(run.stderr || '');
    return {
      available: true, ok: false,
      stage: timedOut ? 'timeout' : 'runtime',
      error: timedOut
        ? `Timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s — check for an infinite loop, or an approach that is too slow.`
        : (run.stderr || 'Your program crashed before producing output.').slice(0, 1500),
      results, passed, total: tests.length,
    };
  }

  return { available: true, ok: true, stage: 'ran', results, passed, total: tests.length };
}

// Tests passed → the 0–10 correctness figure the scoring already uses.
export function correctnessFromTests(passed, total) {
  if (!total) return 0;
  return Math.round((passed / total) * 10 * 10) / 10;
}

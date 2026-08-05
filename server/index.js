import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { registerSocketEvents } from './sockets/events.js';
import { debounce } from './lib/utils.js';
import { login, authAdmin } from './lib/auth.js';
import { startSnapshots, listSnapshots, restoreSnapshot, snapshotNow, listArchives, readArchive } from './lib/snapshots.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuild = join(__dirname, '../client/dist');


// STABILITY FIX: last-resort safety net. Socket handlers are individually
// wrapped (see sockets/events.js), but this catches anything outside that
// path — a bug in the battery-drain interval tick, an unexpected rejection
// in an async REST route, etc. — logging instead of taking the whole event
// down for every connected team at once. Node's own advice is that the
// process may be in a bad state after an uncaughtException, but for this
// app "log and keep serving" beats "hard-crash mid-event" — a bad state
// here means one drain tick misbehaved, not corrupted shared memory.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000']
  : true;

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 20000, pingInterval: 10000,
  transports: ['websocket', 'polling'],
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 1 }, clientNoContextTakeover: true, serverNoContextTakeover: true },
  maxHttpBufferSize: 1e6,
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// ── DB ──────────────────────────────────────────────────────────
export let db = {};
const DB_PATH = './data/db.json';

export const EMPTY_DB = () => ({
  app_state: {
    current_phase: 'setup',
    phase1_round: 0, phase1_round_active: false, current_question: null, phase1_round_end: null,
    phase1_paused_mid_round: false, phase1_paused_remaining_ms: null,
    // V7: Quiz Round (Phase 1.5)
    quiz_round_active: false,
    quiz_timer_end: null,
    quiz_paused: false,
    quiz_paused_remaining_ms: null,
    quiz_questions: [],
    quiz_member_answers: {},
    // CODE ARENA: Mission 2 — Bug Hunt
    bughunt_active: false,
    bughunt_timer_end: null,
    bughunt_paused: false,
    bughunt_paused_remaining_ms: null,
    bughunt_programs: [],
    // CODE ARENA: Mission 3 — Code Strike
    codestrike_active: false,
    codestrike_timer_end: null,
    codestrike_paused: false,
    codestrike_paused_remaining_ms: null,
    codestrike_problems: [],
    codestrike_started_at: null,
    codestrike_duration_ms: null,
    // CODE ARENA: tie-breaker (null = no tie-break running)
    tiebreak: null,
    // Phase 2
    phase2_paused: false, phase2_timer_end: null, phase2_paused_remaining_ms: null,
    phase3_timer_end: null, phase3_paused: false, phase3_paused_remaining_ms: null,
    battery_drain_interval_ms: 60000, battery_drain_percent_per_tick: 2,
    phase3_problem: null, results_reveal_index: -1,
    // V2: master pause
    master_paused: false, master_paused_at: null, master_pause_reason: '',
    thankyou_shown: false,
    // Sprint 2: configurable event settings
    event_config: {
      event_name: 'CODE SPRINT 2.0',
      college_name: '',
      phases_enabled: ['phase1', 'quiz_round', 'phase2', 'phase3'],
      phase1_rounds: 5,
      // V7: Quiz Round config
      quiz_num_questions: 50,
      quiz_duration_min: 30,
      phase2_duration_min: 90,
      phase3_duration_min: 150,
      battery_drain_rate: 2,
      battery_attempt_cost: 5,
      battery_capture_gain: 20,
      // Sprint 3: speed demo config
      speed_demo_enabled: false,
      speed_demo_duration_sec: 90,
      audience_weight_percent: 10,
      // Results reveal: 0 = reveal every team, N = only the top N places
      reveal_top_n: 0,
      // CODE ARENA: which built-in bank the quiz round draws from
      // ('dsa' = original gauntlet pool, 'arena' = multi-topic pool, 'both')
      quiz_question_source: 'dsa',
      // CODE ARENA: mission weights for the combined leaderboard
      quiz_marks: 20,
      bughunt_duration_min: 30,
      bughunt_marks: 30,
      bughunt_num_programs: 5,
      codestrike_duration_min: 45,
      codestrike_marks: 50,
      // Protected Mode: during timed rounds (quiz / bug hunt / tie-break),
      // team browsers block copy/paste + right-click and every tab/app
      // switch is recorded and reported to admin as a violation.
      protected_mode: false,
      // Self-registration: when open, team leaders can scan the QR and
      // create their own team at /register. Off by default — the admin
      // opens it at the registration desk and closes it when done.
      self_registration: false,
      self_registration_max_teams: 0, // 0 = no cap
      // V7: Custom Questions
      custom_questions: [],
    },
    // Sprint 3: speed demo state
    speed_demo_current_team_id: null,
    speed_demo_timer_end: null,
    speed_demo_order: [],  // team ids in demo order
    speed_demo_done_ids: [], // team ids that have demoed
  },
  teams: [], zones: [],
  audience_votes: {},  // { team_id: vote_count }
  used_question_ids: [], used_zone_problem_ids: [],
  event_log: [],
  phase_history: [],  // V2: rollback snapshots
  help_requests: [],  // { id, team_id, team_name, phase, message, created_at, resolved }
});

function patchDB() {
  if (!db.used_zone_problem_ids) db.used_zone_problem_ids = [];
  if (!db.used_question_ids) db.used_question_ids = [];
  if (!db.phase_history) db.phase_history = [];
  const s = db.app_state;
  if (s.results_reveal_index === undefined) s.results_reveal_index = -1;
  if (s.phase1_round_end === undefined) s.phase1_round_end = null;
  if (s.phase1_paused_mid_round === undefined) s.phase1_paused_mid_round = false;
  if (s.phase1_paused_remaining_ms === undefined) s.phase1_paused_remaining_ms = null;
  if (s.thankyou_shown === undefined) s.thankyou_shown = false;
  if (s.phase2_paused === undefined) s.phase2_paused = false;
  if (s.phase3_paused === undefined) s.phase3_paused = false;
  if (s.master_paused === undefined) s.master_paused = false;
  if (s.master_pause_reason === undefined) s.master_pause_reason = '';
  // V7: quiz round state
  if (s.quiz_round_active === undefined) s.quiz_round_active = false;
  if (s.quiz_timer_end === undefined) s.quiz_timer_end = null;
  if (s.quiz_paused === undefined) s.quiz_paused = false;
  if (s.quiz_paused_remaining_ms === undefined) s.quiz_paused_remaining_ms = null;
  if (!s.quiz_questions) s.quiz_questions = [];
  if (!s.quiz_member_answers) s.quiz_member_answers = {};
  if (!s.event_config) s.event_config = {
    event_name: 'CODE SPRINT 2.0', college_name: '',
    phases_enabled: ['phase1', 'quiz_round', 'phase2', 'phase3'],
    phase1_rounds: 5, quiz_num_questions: 50, quiz_duration_min: 30,
    phase2_duration_min: 90, phase3_duration_min: 150,
    battery_drain_rate: 2, battery_attempt_cost: 5, battery_capture_gain: 20,
    speed_demo_enabled: false, speed_demo_duration_sec: 90, audience_weight_percent: 10,
    custom_questions: [],
  };
  if (s.event_config.speed_demo_enabled === undefined) s.event_config.speed_demo_enabled = false;
  if (s.event_config.speed_demo_duration_sec === undefined) s.event_config.speed_demo_duration_sec = 90;
  if (s.event_config.audience_weight_percent === undefined) s.event_config.audience_weight_percent = 10;
  if (s.event_config.reveal_top_n === undefined) s.event_config.reveal_top_n = 0;
  if (s.event_config.quiz_num_questions === undefined) s.event_config.quiz_num_questions = 50;
  if (s.event_config.quiz_duration_min === undefined) s.event_config.quiz_duration_min = 30;
  if (!s.event_config.custom_questions) s.event_config.custom_questions = [];
  // CODE ARENA: config defaults
  if (s.event_config.quiz_question_source === undefined) s.event_config.quiz_question_source = 'dsa';
  if (s.event_config.quiz_marks === undefined) s.event_config.quiz_marks = 20;
  if (s.event_config.bughunt_duration_min === undefined) s.event_config.bughunt_duration_min = 30;
  if (s.event_config.bughunt_marks === undefined) s.event_config.bughunt_marks = 30;
  if (s.event_config.bughunt_num_programs === undefined) s.event_config.bughunt_num_programs = 5;
  if (s.event_config.codestrike_duration_min === undefined) s.event_config.codestrike_duration_min = 45;
  if (s.event_config.codestrike_marks === undefined) s.event_config.codestrike_marks = 50;
  if (s.event_config.protected_mode === undefined) s.event_config.protected_mode = false;
  if (s.event_config.theme === undefined) s.event_config.theme = null;
  if (s.event_config.self_registration === undefined) s.event_config.self_registration = false;
  if (s.event_config.self_registration_max_teams === undefined) s.event_config.self_registration_max_teams = 0;
  // CODE ARENA: app_state defaults
  if (s.bughunt_active === undefined) s.bughunt_active = false;
  if (s.bughunt_timer_end === undefined) s.bughunt_timer_end = null;
  if (s.bughunt_paused === undefined) s.bughunt_paused = false;
  if (s.bughunt_paused_remaining_ms === undefined) s.bughunt_paused_remaining_ms = null;
  if (!s.bughunt_programs) s.bughunt_programs = [];
  if (s.codestrike_active === undefined) s.codestrike_active = false;
  if (s.codestrike_timer_end === undefined) s.codestrike_timer_end = null;
  if (s.codestrike_paused === undefined) s.codestrike_paused = false;
  if (s.codestrike_paused_remaining_ms === undefined) s.codestrike_paused_remaining_ms = null;
  if (!s.codestrike_problems) s.codestrike_problems = [];
  if (s.codestrike_started_at === undefined) s.codestrike_started_at = null;
  if (s.codestrike_duration_ms === undefined) s.codestrike_duration_ms = null;
  if (s.tiebreak === undefined) s.tiebreak = null;
  if (s.speed_demo_current_team_id === undefined) s.speed_demo_current_team_id = null;
  if (s.speed_demo_timer_end === undefined) s.speed_demo_timer_end = null;
  if (s.speed_demo_order === undefined) s.speed_demo_order = [];
  if (s.speed_demo_done_ids === undefined) s.speed_demo_done_ids = [];
  if (!db.audience_votes) db.audience_votes = {};
  if (!db.help_requests) db.help_requests = [];
  // V7: patch teams for quiz_score and phase3_group
  db.teams.forEach(t => {
    if (t.quiz_score === undefined) t.quiz_score = 0;
    if (!t.quiz_member_scores) t.quiz_member_scores = {};
    if (t.phase3_group === undefined) t.phase3_group = null;
    // CODE ARENA: per-team mission fields
    if (t.quiz_marks_scored === undefined) t.quiz_marks_scored = null;
    if (t.bughunt_submission === undefined) t.bughunt_submission = null;
    if (t.bughunt_results === undefined) t.bughunt_results = null;
    if (t.bughunt_score === undefined) t.bughunt_score = null;
    if (!t.codestrike_submissions) t.codestrike_submissions = {};
    if (t.codestrike_judge === undefined) t.codestrike_judge = null;
    if (t.codestrike_score === undefined) t.codestrike_score = null;
    if (t.tiebreak_wins === undefined) t.tiebreak_wins = 0;
    if (t.violations === undefined) t.violations = null;
  });
}

function loadDB() {
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  if (existsSync(DB_PATH)) {
    try {
      db = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
      patchDB();
      console.log(`✅ DB loaded | teams:${db.teams.length} zones:${db.zones.length} phase:${db.app_state.current_phase}`);
      return;
    } catch (e) { console.warn('⚠️ db.json corrupted, checking env backup...'); }
  }
  if (process.env.DB_BACKUP) {
    try {
      db = JSON.parse(process.env.DB_BACKUP);
      patchDB();
      writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      console.log(`✅ DB restored from DB_BACKUP | teams:${db.teams.length}`);
      return;
    } catch (e) { console.warn('⚠️ DB_BACKUP invalid, fresh start'); }
  }
  db = EMPTY_DB();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log('✅ Fresh DB created');
}

// ── ASYNC NON-BLOCKING SAVES ─────────────────────────────────────
// FIX: writeFileSync was blocking the Node.js event loop on every socket event,
// causing Phase 2 freezes under load. Now fully async + debounced.
const _debouncedWrite = debounce(async () => {
  try { await writeFile(DB_PATH, JSON.stringify(db), 'utf8'); }
  catch (err) { console.error('[DB] Save failed:', err.message); }
}, 2000);

// Routine saves: debounced 2s (battery drain, leaderboard, zone updates)
export function saveDB() { _debouncedWrite(); }

// Critical saves: immediate async (phase change, register team, eliminate)
export async function saveDBNow() {
  _debouncedWrite.flush();
  try { await writeFile(DB_PATH, JSON.stringify(db), 'utf8'); }
  catch (err) { console.error('[DB] Urgent save failed:', err.message); }
}

// Belt-and-suspenders: auto-save every 30s
setInterval(() => saveDB(), 30_000);

loadDB();
startSnapshots(db); // timestamped recovery point every 5 min

// ── REST ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, phase: db.app_state?.current_phase }));

// ── Auth ────────────────────────────────────────────────────────
// Password is checked here, server-side, and never embedded in the client
// bundle. Success returns a random session token used for everything else.
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const result = login(password, req.ip);
  if (!result.ok) return res.status(401).json({ error: result.message });
  res.json({ token: result.token, role: result.role });
});

// V7: Passcode-only team lookup — replaces dropdown for 340+ teams
app.get('/api/team-by-passcode/:code', (req, res) => {
  const team = db.teams.find(t => t.passcode === req.params.code);
  if (!team) return res.status(404).json({ error: 'Invalid passcode' });
  res.json({ id: team.id, name: team.name, color: team.color, year: team.year });
});

// Detailed health — admin opens this to monitor memory on Railway
app.get('/api/ping', (_, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    phase: db.app_state.current_phase,
    teams: db.teams.length,
    active_teams: db.teams.filter(t => !t.is_eliminated).length,
    zones: db.zones.length,
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(mem.heapUsed / 1024 / 1024),
    memory_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    master_paused: db.app_state.master_paused,
    phase_history_count: db.phase_history?.length || 0,
  });
});

// Sanitized — this endpoint is public, and raw app_state carries quiz/
// bug-hunt/tie-break answers while a round is live (same leak class as
// the state:sync fix in buildClientState below).
app.get('/api/state', (_, res) => res.json({ app_state: sanitizeAppState(db.app_state) }));
app.get('/api/teams', (_, res) => res.json(db.teams.map(({ id, name, color, year }) => ({ id, name, color, year }))));

app.get('/api/admin/backup', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ db_json: JSON.stringify(db), teams_count: db.teams.length, zones_count: db.zones.length, phase: db.app_state.current_phase, timestamp: new Date().toISOString() });
});

app.post('/api/admin/restore', async (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const restored = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!restored.teams || !restored.app_state) return res.status(400).json({ error: 'Invalid DB' });
    snapshotNow(db); // keep whatever was live before this overwrite, just in case
    Object.assign(db, restored);
    patchDB();
    await saveDBNow();
    io.emit('state:sync', buildClientState(db));
    res.json({ success: true, teams: db.teams.length, zones: db.zones.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Snapshots — periodic local recovery points ────────────────────
app.get('/api/admin/snapshots', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ snapshots: listSnapshots() });
});

app.post('/api/admin/snapshots/:filename/restore', async (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  try {
    snapshotNow(db); // don't lose current state either
    const restored = restoreSnapshot(req.params.filename);
    Object.assign(db, restored);
    patchDB();
    await saveDBNow();
    io.emit('state:sync', buildClientState(db));
    res.json({ success: true, teams: db.teams.length, zones: db.zones.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Past-event archives (written automatically on Factory Reset) ──
app.get('/api/admin/archives', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ archives: listArchives() });
});

app.get('/api/admin/archives/:filename', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const json = readArchive(req.params.filename);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.send(json);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// V7: Phase 3 CSV Export
app.get('/api/admin/phase3-export', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  const rows = [
    ['Team Name', 'Year', 'Group', 'Members', 'Problem', 'GitHub URL', 'Deploy URL', 'Notes', 'Judge Score', 'Submitted At']
  ];
  db.teams.forEach(t => {
    rows.push([
      t.name,
      t.year,
      t.phase3_group || '',
      (t.members || []).join('; '),
      t.phase3_problem || '',
      t.phase3_submission?.github_url || '',
      t.phase3_submission?.deploy_url || '',
      t.phase3_submission?.notes || '',
      t.phase3_judge_scores?.total ?? '',
      t.phase3_submission?.submitted_at || '',
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="phase3_submissions_${Date.now()}.csv"`);
  res.send(csv);
});

// CODE ARENA: Code Strike submissions export — one row per team per problem,
// including the pasted code, so the evaluation team can grade offline too.
app.get('/api/admin/codestrike-export', (req, res) => {
  if (!authAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  const rows = [
    ['Team Name', 'Year', 'Problem', 'Language', 'Submitted At', 'Correctness', 'Efficiency', 'Problem Marks', 'Total Score', 'Code']
  ];
  const problems = db.app_state.codestrike_problems || [];
  db.teams.forEach(t => {
    Object.entries(t.codestrike_submissions || {}).forEach(([pid, sub]) => {
      const prob = problems.find(p => p.id === pid);
      const judge = t.codestrike_judge?.[pid];
      rows.push([
        t.name, t.year,
        prob ? `${prob.title} (${prob.difficulty})` : pid,
        sub.language || '', sub.submitted_at || '',
        judge?.correctness ?? '', judge?.efficiency ?? '',
        prob?.marks ?? '',
        t.codestrike_score ?? '',
        sub.code || '',
      ]);
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="codestrike_submissions_${Date.now()}.csv"`);
  res.send(csv);
});


// Serve React build — single server deployment.
// index.html and sw.js must never be cached by the browser: index.html
// points at the hashed JS bundle, so a cached copy pins every visitor to
// the previous build (the same class of bug the service worker had).
// Hashed /assets/* files are immutable and safe to cache hard.
const noStore = (res, filePath) => {
  if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (filePath.includes(`${'assets'}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
};
app.use(express.static(clientBuild, { setHeaders: noStore }));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(join(clientBuild, 'index.html'));
  }
});

// ── Sockets ─────────────────────────────────────────────────────
registerSocketEvents(io, db, saveDB, saveDBNow);

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CODE SPRINT 2.0 V7 — port ${PORT}`);
  console.log(`   Async saves | Master Pause | Factory Reset | Phase Rollback`);
  console.log(`   /api/ping for health | /api/admin/backup for DB backup\n`);
});

// Strip grading secrets from a question/program before it leaves the server
// to a non-admin socket (answer, accepted variants, hints, judge notes).
export function sanitizeQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  const { answer, answers, hint, judge_notes, ...safe } = q;
  return safe;
}

// SECURITY FIX: state:sync used to ship db.app_state verbatim — during a
// quiz round that included quiz_questions WITH every correct answer, plus
// quiz_member_answers with every member's raw submissions, all readable
// from any team's browser (React DevTools / raw WebSocket frames). The
// same shape of leak would apply to the new Bug Hunt fixes, Code Strike
// judge notes, and the tie-break answer, so all of them are sanitized
// here in one place. Grading still uses the untouched db.app_state.
function sanitizeAppState(s) {
  const safe = { ...s };
  safe.quiz_questions = (s.quiz_questions || []).map(sanitizeQuestion);
  // Summarize member answers to { team_id: { member_name: true } } — the
  // shape quiz:submission_update already broadcasts; clients only ever
  // check truthiness / count of these keys.
  safe.quiz_member_answers = Object.fromEntries(
    Object.entries(s.quiz_member_answers || {}).map(([tid, members]) =>
      [tid, Object.fromEntries(Object.keys(members || {}).map(m => [m, true]))]
    )
  );
  safe.bughunt_programs = (s.bughunt_programs || []).map(sanitizeQuestion);
  safe.codestrike_problems = (s.codestrike_problems || []).map(sanitizeQuestion);
  safe.tiebreak = s.tiebreak ? {
    ...s.tiebreak,
    question: sanitizeQuestion(s.tiebreak.question),
  } : null;
  return safe;
}

export function buildClientState(db) {
  return {
    app_state: sanitizeAppState(db.app_state),
    phase_history_count: db.phase_history?.length || 0,
    teams: db.teams.map(({ _pending, _defenseOptions, passcode, members, ...t }) => ({
      id: t.id, name: t.name, color: t.color, year: t.year,
      battery: t.battery, is_eliminated: t.is_eliminated,
      elimination_phase: t.elimination_phase,
      zones_captured: t.zones_captured,
      phase1_total_score: t.phase1_total_score,
      phase1_scores: t.phase1_scores,
      quiz_score: t.quiz_score !== undefined ? t.quiz_score : null,
      quiz_member_scores: t.quiz_member_scores !== undefined ? t.quiz_member_scores : null,
      phase3_submission: t.phase3_submission || null,
      phase3_judge_scores: t.phase3_judge_scores,
      phase3_problem: t.phase3_problem,
      phase3_group: t.phase3_group || null,
      zone_ids_captured: t.zone_ids_captured || [],
      // CODE ARENA: mission status is public (scoreboard data); the actual
      // submitted fixes/code never leave the server except to admin pulls.
      quiz_marks_scored: t.quiz_marks_scored ?? null,
      bughunt_score: t.bughunt_score ?? null,
      bughunt_submitted_at: t.bughunt_submission?.submitted_at || null,
      bughunt_per_program: t.bughunt_results?.per_program || null,
      codestrike_score: t.codestrike_score ?? null,
      codestrike_submitted: Object.fromEntries(
        Object.entries(t.codestrike_submissions || {}).map(([pid, sub]) => [pid, sub.submitted_at])
      ),
      tiebreak_wins: t.tiebreak_wins || 0,
      violations: t.violations || null,
    })),
    zones: db.zones.map(({ _pending, _defenseOptions, ...z }) => ({
      id: z.id, name: z.name, location: z.location,
      owner_team_id: z.owner_team_id, owner_name: z.owner_name, owner_color: z.owner_color,
      captured_at: z.captured_at, has_problem: !!z.problem,
      is_attempting: !!_pending,
      attempting_team_name: _pending?.team_name || null,
    })),
    event_log: db.event_log.slice(0, 50),
    audience_votes: db.audience_votes || {},
    help_requests: (db.help_requests || []).filter(h => !h.resolved),
  };
}

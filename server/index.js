import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { registerSocketEvents } from './sockets/events.js';
import { debounce } from './lib/utils.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuild = join(__dirname, '../client/dist');


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
    phase1_round: 0, phase1_round_active: false, current_question: null,
    // V7: Quiz Round (Phase 1.5)
    quiz_round_active: false,
    quiz_timer_end: null,
    quiz_paused: false,
    quiz_paused_remaining_ms: null,
    quiz_questions: [],
    quiz_member_answers: {},
    // Phase 2
    phase2_paused: false, phase2_timer_end: null, phase2_paused_remaining_ms: null,
    phase3_timer_end: null, phase3_paused: false, phase3_paused_remaining_ms: null,
    battery_drain_interval_ms: 60000, battery_drain_percent_per_tick: 2,
    phase3_problem: null, results_reveal_index: -1,
    // V2: master pause
    master_paused: false, master_paused_at: null, master_pause_reason: '',
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
});

function patchDB() {
  if (!db.used_zone_problem_ids) db.used_zone_problem_ids = [];
  if (!db.used_question_ids) db.used_question_ids = [];
  if (!db.phase_history) db.phase_history = [];
  const s = db.app_state;
  if (s.results_reveal_index === undefined) s.results_reveal_index = -1;
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
  if (s.event_config.quiz_num_questions === undefined) s.event_config.quiz_num_questions = 50;
  if (s.event_config.quiz_duration_min === undefined) s.event_config.quiz_duration_min = 30;
  if (!s.event_config.custom_questions) s.event_config.custom_questions = [];
  if (s.speed_demo_current_team_id === undefined) s.speed_demo_current_team_id = null;
  if (s.speed_demo_timer_end === undefined) s.speed_demo_timer_end = null;
  if (s.speed_demo_order === undefined) s.speed_demo_order = [];
  if (s.speed_demo_done_ids === undefined) s.speed_demo_done_ids = [];
  if (!db.audience_votes) db.audience_votes = {};
  // V7: patch teams for quiz_score and phase3_group
  db.teams.forEach(t => {
    if (t.quiz_score === undefined) t.quiz_score = 0;
    if (!t.quiz_member_scores) t.quiz_member_scores = {};
    if (t.phase3_group === undefined) t.phase3_group = null;
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

// ── REST ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, phase: db.app_state?.current_phase }));

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

app.get('/api/state', (_, res) => res.json({ app_state: db.app_state }));
app.get('/api/teams', (_, res) => res.json(db.teams.map(({ id, name, color, year }) => ({ id, name, color, year }))));

app.get('/api/admin/backup', (req, res) => {
  if (req.headers['x-admin-token'] !== 'dominance2024') return res.status(401).json({ error: 'Unauthorized' });
  res.json({ db_json: JSON.stringify(db), teams_count: db.teams.length, zones_count: db.zones.length, phase: db.app_state.current_phase, timestamp: new Date().toISOString() });
});

app.post('/api/admin/restore', async (req, res) => {
  if (req.headers['x-admin-token'] !== 'dominance2024') return res.status(401).json({ error: 'Unauthorized' });
  try {
    const restored = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!restored.teams || !restored.app_state) return res.status(400).json({ error: 'Invalid DB' });
    Object.assign(db, restored);
    patchDB();
    await saveDBNow();
    io.emit('state:sync', buildClientState(db));
    res.json({ success: true, teams: db.teams.length, zones: db.zones.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// V7: Phase 3 CSV Export
app.get('/api/admin/phase3-export', (req, res) => {
  if (req.headers['x-admin-token'] !== 'dominance2024') return res.status(401).json({ error: 'Unauthorized' });
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


// Serve React build — single server deployment
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
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

export function buildClientState(db) {
  return {
    app_state: db.app_state,
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
  };
}

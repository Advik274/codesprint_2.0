import { v4 as uuid } from 'uuid';
import { calcPhase1Score, calcPhase3Score, getPhase1Board, getFinalBoard, getResultsBoard } from '../lib/scoring.js';
import { startBatteryDrain, stopBatteryDrain, pauseBatteryDrain, resumeBatteryDrain } from '../lib/battery.js';
import { getRandomGauntletQuestion, getFiveZoneOptions, pickQuizQuestions } from '../lib/questions.js';
import { buildClientState } from '../index.js';

const ADMIN = 'dominance2024';
const auth = (t) => t === ADMIN;
// Battery constants — read from event_config at runtime so they're configurable
const getAttemptCost = (db) => db.app_state.event_config?.battery_attempt_cost ?? 5;
const getCapturGain  = (db) => db.app_state.event_config?.battery_capture_gain ?? 20;
const getMaxRounds   = (db) => db.app_state.event_config?.phase1_rounds ?? 5;

// ── Rate limiter — per socket, per event ─────────────────────────
// Like BGMI's anti-cheat: too many events = ignored
const rateLimits = new Map(); // socketId -> { event -> lastTimestamp }
function rateLimit(socketId, event, minIntervalMs = 500) {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const last = rateLimits.get(key) || 0;
  if (now - last < minIntervalMs) return false; // blocked
  rateLimits.set(key, now);
  return true; // allowed
}
// Clean up rate limit map when socket disconnects
function clearRateLimits(socketId) {
  for (const key of rateLimits.keys()) {
    if (key.startsWith(`${socketId}:`)) rateLimits.delete(key);
  }
}

// ── Delta emitters — only send what changed ─────────────────────

// Send ONLY the zone that changed — not all zones
function emitZoneDelta(io, zone) {
  const { _pending, _defenseOptions, ...z } = zone;
  io.emit('zone:delta', {
    id: z.id, name: z.name, location: z.location,
    owner_team_id: z.owner_team_id, owner_name: z.owner_name, owner_color: z.owner_color,
    captured_at: z.captured_at,
    has_problem: !!z.problem,
    is_attempting: !!_pending,
    attempting_team_name: _pending?.team_name || null,
  });
}

// Send ONLY the team fields that changed
function emitTeamDelta(io, team, changedFields) {
  const delta = { id: team.id };
  changedFields.forEach(f => { delta[f] = team[f]; });
  io.emit('team:delta', delta);
}

// App state delta — just the fields that changed
function emitStateDelta(io, fields) {
  io.emit('state:delta', fields);
}

function log(io, db, type, message, team_id = null) {
  const entry = { timestamp: new Date().toISOString(), type, message, team_id };
  db.event_log.unshift(entry);
  if (db.event_log.length > 200) db.event_log.length = 200;
  // Broadcast just the new log entry, not the whole log
  io.emit('log:entry', entry);
}

export function registerSocketEvents(io, db, saveDB, saveDBNow) {
  // Fallback if saveDBNow not passed (backwards compat)
  if (!saveDBNow) saveDBNow = saveDB;

  io.on('connection', (socket) => {
    // On connect: send full state once (necessary for initial load)
    socket.emit('state:sync', buildClientState(db));

    // ── ADMIN: Passcode sync (admin page requests on load) ────────
    // Passcodes are stripped from state:sync (public broadcast), so admin
    // explicitly requests them. This survives page refresh.
    socket.on('admin:request_passcodes', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      socket.emit('admin:passcodes', db.teams.map(t => ({ id: t.id, passcode: t.passcode })));
    });
    socket.on('team:join', ({ team_id, passcode }) => {
      if (!rateLimit(socket.id, 'team:join', 2000)) return;
      const team = db.teams.find(t => t.id === team_id);
      if (!team || team.passcode !== String(passcode)) {
        socket.emit('error', { message: 'Invalid team or passcode' }); return;
      }
      socket.join(`team_${team_id}`);
      // Send only this team's private data (including passcode) to them specifically
      socket.emit('team:joined', {
        team: {
          id: team.id, name: team.name, color: team.color, year: team.year,
          passcode: team.passcode, battery: team.battery,
          is_eliminated: team.is_eliminated, zones_captured: team.zones_captured,
          phase1_total_score: team.phase1_total_score,
          phase3_problem: team.phase3_problem,
          zone_ids_captured: team.zone_ids_captured || [],
        }
      });
    });

    // ── ZONE OPERATOR JOIN ─────────────────────────────────────────
    socket.on('zone:operator_join', ({ zone_id, admin_token }) => {
      if (!auth(admin_token)) { socket.emit('error', { message: 'Invalid token' }); return; }
      socket.join(`zone_${zone_id}`);
      const zone = db.zones.find(z => z.id === zone_id);
      socket.emit('zone:operator_ready', { zone });
    });

    // ── PHASE 1: Submit Answer ────────────────────────────────────
    socket.on('phase1:submit_answer', ({ team_id, question_id, answer, time_taken_ms }) => {
      // Rate limit: one answer per 1s (prevents double-submit spam)
      if (!rateLimit(socket.id, 'phase1:submit', 1000)) return;
      if (db.app_state.current_phase !== 'phase1' || !db.app_state.phase1_round_active) return;

      const team = db.teams.find(t => t.id === team_id);
      const q = db.app_state.current_question;
      if (!team || !q || team.is_eliminated || q.id !== question_id) return;
      if (team.phase1_scores.find(s => s.round === db.app_state.phase1_round)) return;

      const correct = answer.trim().toLowerCase() === q.answer.trim().toLowerCase();
      const score = correct ? calcPhase1Score(q.points, q.time_limit_seconds, time_taken_ms) : 0;
      team.phase1_scores.push({ round: db.app_state.phase1_round, score, correct, time_taken_ms });
      team.phase1_total_score += score;
      saveDB();

      // Only emit to this socket (their result) and leaderboard update
      socket.emit('phase1:answer_result', { correct, score, total: team.phase1_total_score });
      // Leaderboard is small — send to all
      io.emit('leaderboard:phase1', getPhase1Board(db.teams));
    });

    // ── PHASE 2: Team arrives at zone ─────────────────────────────
    socket.on('zone:team_arrive', ({ zone_id, team_passcode, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!rateLimit(socket.id, `zone_arrive_${zone_id}`, 3000)) return;

      // ── PAUSE GUARDS ─────────────────────────────────────────────
      if (db.app_state.master_paused) {
        socket.emit('zone:error', { message: `⏸ Event is paused: ${db.app_state.master_pause_reason || 'Hold on'}` }); return;
      }
      if (db.app_state.current_phase !== 'phase2') {
        socket.emit('zone:error', { message: 'Zone captures only active in Phase 2' }); return;
      }
      if (db.app_state.phase2_paused) {
        socket.emit('zone:error', { message: '⏸ Phase 2 is paused — wait for resume' }); return;
      }

      const zone = db.zones.find(z => z.id === zone_id);
      const team = db.teams.find(t => t.passcode === String(team_passcode));

      if (!zone) { socket.emit('zone:error', { message: 'Zone not found' }); return; }
      if (!team) { socket.emit('zone:error', { message: `No team with passcode "${team_passcode}"` }); return; }
      if (team.is_eliminated) { socket.emit('zone:error', { message: `${team.name} is eliminated` }); return; }
      if (zone._pending) { socket.emit('zone:error', { message: `Zone busy — ${zone._pending.team_name} is attempting. Wait.` }); return; }
      if (zone.owner_team_id === team.id) { socket.emit('zone:error', { message: `${team.name} already owns this zone` }); return; }
      if (team.battery < getAttemptCost(db)) { socket.emit('zone:error', { message: `Need ${getAttemptCost(db)}% battery. You have ${team.battery}%` }); return; }

      // Deduct battery
      team.battery = Math.max(0, team.battery - getAttemptCost(db));
      // Delta: only battery changed for this team
      emitTeamDelta(io, team, ['battery']);

      if (zone.owner_team_id && zone.problem) {
        // Captured zone with defense — show challenge directly
        zone._pending = { team_id: team.id, team_name: team.name, team_color: team.color, problem: zone.problem, attempts_left: 3, hint_shown: false };
        saveDB();
        log(io, db, 'zone_attempt', `${team.name} attempting ${zone.name} (−${getAttemptCost(db)}%)`, team.id);

        // Delta: only this zone's attempting status changed
        emitZoneDelta(io, zone);

        const { answer: _hidden, ...safeProblem } = zone.problem;
        socket.emit('zone:challenge_ready', {
          zone_id, zone_name: zone.name,
          team_name: team.name, team_color: team.color,
          battery_remaining: team.battery,
          problem: safeProblem, mode: 'attempt',
          attempts_left: 3, hint: null,
        });

      } else if (!zone.owner_team_id) {
        // Neutral zone — generate 5 options
        if (!db.used_zone_problem_ids) db.used_zone_problem_ids = [];
        const options = getFiveZoneOptions(db.used_zone_problem_ids);
        zone._pending = { team_id: team.id, team_name: team.name, team_color: team.color, problem: null, options, attempts_left: 3, hint_shown: false };
        saveDB();
        log(io, db, 'zone_attempt', `${team.name} attempting neutral ${zone.name} (−${getAttemptCost(db)}%)`, team.id);

        emitZoneDelta(io, zone);
        socket.emit('zone:pick_problem', {
          zone_id, zone_name: zone.name,
          team_name: team.name, team_color: team.color,
          battery_remaining: team.battery,
          options: options.map(o => ({ id: o.id, label: o.label, type: o.type })),
        });

      } else {
        // Captured but no defense set — refund battery
        team.battery = Math.min(100, team.battery + getAttemptCost(db));
        emitTeamDelta(io, team, ['battery']);
        saveDB();
        socket.emit('zone:error', { message: 'Defending team has not set a challenge yet. Try later.' });
      }
    });

    // ── ZONE: Operator selects problem (neutral zone) ─────────────
    socket.on('zone:select_problem', ({ zone_id, problem_id, admin_token }) => {
      if (!auth(admin_token)) return;
      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone?._pending?.options) { socket.emit('zone:error', { message: 'No pending selection' }); return; }

      const chosen = zone._pending.options.find(o => o.id === problem_id);
      if (!chosen) { socket.emit('zone:error', { message: 'Problem not found' }); return; }

      zone._pending.problem = chosen;
      saveDB();

      const { answer: _a, ...safeProblem } = chosen;
      socket.emit('zone:challenge_ready', {
        zone_id, zone_name: zone.name,
        team_name: zone._pending.team_name, team_color: zone._pending.team_color,
        battery_remaining: db.teams.find(t => t.id === zone._pending.team_id)?.battery,
        problem: safeProblem, mode: 'attempt',
        attempts_left: zone._pending.attempts_left ?? 3, hint: null,
      });
    });

    // ── ZONE: Team submits answer ─────────────────────────────────
    socket.on('zone:submit_answer', ({ zone_id, answer, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!rateLimit(socket.id, `zone_submit_${zone_id}`, 1500)) return;
      // Pause guard
      if (db.app_state.master_paused) { socket.emit('zone:error', { message: '⏸ Event is paused' }); return; }
      if (db.app_state.phase2_paused) { socket.emit('zone:error', { message: '⏸ Phase 2 is paused' }); return; }

      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone?._pending?.problem) { socket.emit('zone:error', { message: 'No active challenge' }); return; }

      const pending = zone._pending;
      const team = db.teams.find(t => t.id === pending.team_id);
      const correct = answer.trim().toLowerCase() === pending.problem.answer.trim().toLowerCase();

      if (correct) {
        // ── SUCCESS ────────────────────────────────────────────────
        zone._pending = null;
        emitZoneDelta(io, zone);

        const prevOwner = db.teams.find(t => t.id === zone.owner_team_id);
        if (prevOwner) {
          prevOwner.zones_captured = Math.max(0, (prevOwner.zones_captured || 0) - 1);
          prevOwner.zone_ids_captured = (prevOwner.zone_ids_captured || []).filter(z => z !== zone_id);
          emitTeamDelta(io, prevOwner, ['zones_captured', 'zone_ids_captured']);
        }
        if (team) {
          team.battery = Math.min(100, team.battery + getCapturGain(db));
          team.zones_captured = (team.zones_captured || 0) + 1;
          if (!team.zone_ids_captured) team.zone_ids_captured = [];
          team.zone_ids_captured.push(zone_id);
          emitTeamDelta(io, team, ['battery', 'zones_captured', 'zone_ids_captured']);
        }
        if (!db.used_zone_problem_ids.includes(pending.problem.id)) {
          db.used_zone_problem_ids.push(pending.problem.id);
        }
        zone.owner_team_id = team?.id || null;
        zone.owner_name = team?.name || null;
        zone.owner_color = team?.color || null;
        zone.captured_at = new Date().toISOString();
        zone.problem = null;
        emitZoneDelta(io, zone);
        const msg = `🏴 ${team?.name} captured ${zone.name}! +${getCapturGain(db)}% → ${team?.battery}%`;
        log(io, db, 'zone_captured', msg, team?.id);
        saveDB();
        socket.emit('zone:capture_result', { success: true, zone_id, zone_name: zone.name, battery: team?.battery, message: msg });
        io.emit('toast:broadcast', { message: msg, type: 'success' });
        io.emit('leaderboard:phase2', buildPhase2Board(db.teams));
        if (team) {
          io.to(`team_${team.id}`).emit('toast:broadcast', { message: `✅ ${zone.name} captured! Set your defense trap now.`, type: 'success' });
          io.to(`team_${team.id}`).emit('zone:set_problem_prompt', { zone_id, zone_name: zone.name });
        }

      } else {
        // ── WRONG ANSWER ───────────────────────────────────────────
        pending.attempts_left = (pending.attempts_left ?? 3) - 1;

        if (pending.attempts_left <= 0) {
          // Out of attempts — fail and refund battery
          zone._pending = null;
          emitZoneDelta(io, zone);
          if (team) {
            // No battery refund on full failure — they burned the attempt cost
          }
          saveDB();
          socket.emit('zone:capture_result', {
            success: false, zone_id, attempts_left: 0,
            correct_answer: pending.problem.answer,
            message: `❌ Out of attempts! Answer was: "${pending.problem.answer}"`,
          });
          io.emit('toast:broadcast', { message: `${team?.name} used all attempts on ${zone.name}`, type: 'warning' });
          log(io, db, 'zone_fail', `${team?.name} failed ${zone.name} (0 attempts left)`, team?.id);

        } else {
          // Still has attempts — send hint after first wrong
          const showHint = !pending.hint_shown;
          if (showHint) pending.hint_shown = true;
          saveDB();

          // Build hint from problem
          let hint = null;
          if (showHint && pending.problem.hint) {
            hint = pending.problem.hint;
          } else if (showHint) {
            // Derive a generic hint: first letter + length
            const ans = pending.problem.answer;
            hint = `Starts with "${ans[0].toUpperCase()}", ${ans.length} character${ans.length !== 1 ? 's' : ''}`;
          }

          socket.emit('zone:wrong_answer', {
            zone_id,
            attempts_left: pending.attempts_left,
            hint: showHint ? hint : null,
            message: `❌ Wrong! ${pending.attempts_left} attempt${pending.attempts_left !== 1 ? 's' : ''} left.`,
          });
          log(io, db, 'zone_attempt', `${team?.name} wrong on ${zone.name} (${pending.attempts_left} left)`, team?.id);
        }
      }
    });

    // ── ZONE: Cancel attempt (refund) ─────────────────────────────
    socket.on('zone:cancel_attempt', ({ zone_id, admin_token }) => {
      if (!auth(admin_token)) return;
      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone) return;
      if (zone._pending) {
        const team = db.teams.find(t => t.id === zone._pending.team_id);
        if (team) {
          team.battery = Math.min(100, team.battery + getAttemptCost(db));
          emitTeamDelta(io, team, ['battery']);
        }
        zone._pending = null;
        emitZoneDelta(io, zone);
        saveDB();
      }
      socket.emit('zone:operator_ready', { zone });
    });

    // ── DEFENDING TEAM: Request defense options ───────────────────
    socket.on('zone:set_defense_problem', async ({ zone_id, team_id }) => {
      if (!rateLimit(socket.id, `defense_${zone_id}`, 2000)) return;
      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone || zone.owner_team_id !== team_id) {
        socket.emit('zone:error', { message: 'Only the zone owner can set defense' }); return;
      }
      if (!db.used_zone_problem_ids) db.used_zone_problem_ids = [];
      const options = getFiveZoneOptions(db.used_zone_problem_ids);
      zone._defenseOptions = options;
      saveDB();
      socket.emit('zone:defense_options', {
        zone_id, zone_name: zone.name,
        options: options.map(o => ({ id: o.id, label: o.label, type: o.type })),
      });
    });

    // ── DEFENDING TEAM: Confirm defense problem ───────────────────
    socket.on('zone:confirm_defense', async ({ zone_id, team_id, problem_id }) => {
      if (!rateLimit(socket.id, `defense_confirm_${zone_id}`, 2000)) return;
      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone || zone.owner_team_id !== team_id) return;

      const options = zone._defenseOptions || [];
      const problem = options.find(o => o.id === problem_id);
      if (!problem) { socket.emit('zone:error', { message: 'Problem not found — try again' }); return; }

      zone.problem = problem;
      zone._defenseOptions = null;
      saveDB();

      // Delta: zone now has a problem
      emitZoneDelta(io, zone);

      socket.emit('zone:defense_set', { zone_id, zone_name: zone.name, problem_label: problem.label });
      io.emit('toast:broadcast', { message: `🔒 ${zone.name} defended by ${zone.owner_name}!`, type: 'info' });
    });

    // ── PHASE 3: Submit project ───────────────────────────────────
    socket.on('phase3:submit_project', async ({ team_id, deploy_url, github_url, notes }) => {
      if (!rateLimit(socket.id, 'phase3_submit', 3000)) return;
      const team = db.teams.find(t => t.id === team_id);
      if (!team || db.app_state.current_phase !== 'phase3') return;
      team.phase3_submission = { deploy_url: deploy_url || '', github_url: github_url || '', notes: notes || '', submitted_at: new Date().toISOString() };
      saveDB();
      socket.emit('phase3:submission_confirmed', { team_id });
      // Delta: just this team's submission status
      emitTeamDelta(io, team, ['phase3_submission']);
      io.emit('toast:broadcast', { message: `📦 ${team.name} submitted!`, type: 'success' });
    });

    // ═══════════════════════════════════════════════════════════════
    // ADMIN EVENTS
    // ═══════════════════════════════════════════════════════════════

    socket.on('admin:register_team', async ({ name, year, members, admin_token }) => {
      if (!auth(admin_token) || !name?.trim()) return;
      // Guard: reject duplicate team names (case-insensitive)
      const duplicate = db.teams.find(t => t.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (duplicate) {
        socket.emit('admin:error', { message: `Team "${name.trim()}" already exists!` });
        return;
      }
      const colors = [
        '#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7',
        '#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6',
        '#e11d48','#7c3aed','#0891b2','#16a34a','#d97706',
        '#fb7185','#38bdf8','#4ade80','#fbbf24','#c084fc',
        '#22d3ee','#fb923c','#f472b6','#a3e635','#2dd4bf',
        '#ff6b6b','#4ecdc4','#45b7d1','#96ceb4','#ffeaa7',
        '#dda0dd','#98d8c8','#f7dc6f','#bb8fce','#85c1e9',
        '#82e0aa','#f8c471','#f1948a','#aab7b8','#76d7c4',
        '#ff9ff3','#feca57','#ff6348','#48dbfb','#ff9f43',
        '#54a0ff','#5f27cd','#00d2d3','#01aaa4','#341f97',
        '#2ecc71','#e74c3c','#9b59b6','#1abc9c','#f39c12',
      ];
      const usedColors = db.teams.map(t => t.color);
      const color = colors.find(c => !usedColors.includes(c)) || `hsl(${(db.teams.length * 37) % 360},65%,55%)`;
      let passcode;
      do {
        passcode = Math.floor(1000 + Math.random() * 9000).toString();
          } while (db.teams.some(t => t.passcode === passcode));
      const team = {
        id: uuid(), name: name.trim(), year: year || '2nd',
        members: members || [], passcode, color,
        battery: 100, is_eliminated: false, elimination_phase: null,
        zones_captured: 0, zone_ids_captured: [],
        phase1_scores: [], phase1_total_score: 0,
        phase3_submission: null, phase3_judge_scores: null, phase3_problem: null,
      };
      db.teams.push(team);
      await saveDBNow(); // Critical: team registration must persist immediately
      // FIX V7.1: emit only the new team to all clients (not full state:sync which
      // is 300KB+ and grows with each registration — catastrophic at 100 teams).
      // Clients handle 'team:new' by appending to their teams array.
      const { passcode: _hidden, members: _m, phase1_scores: _p, ...publicTeam } = team;
      io.emit('team:new', publicTeam);
      // Send full team data (incl. passcode) only to the registering admin socket
      socket.emit('admin:team_registered', { team });
      // Also broadcast updated passcode list to all admin sockets
      socket.emit('admin:passcodes', db.teams.map(t => ({ id: t.id, passcode: t.passcode })));
    });

    socket.on('admin:delete_team', ({ team_id, admin_token }) => {
      if (!auth(admin_token)) return;
      db.teams = db.teams.filter(t => t.id !== team_id);
      saveDB();
      // FIX V7.1: delta instead of full sync
      io.emit('team:removed', { team_id });
      // Update passcode list for admin
      socket.emit('admin:passcodes', db.teams.map(t => ({ id: t.id, passcode: t.passcode })));
    });

    socket.on('admin:create_zone', ({ name, location, admin_token }) => {
      if (!auth(admin_token) || !name?.trim()) return;
      const zone = { id: `zone_${uuid().slice(0, 6)}`, name: name.trim(), location: location?.trim() || '', owner_team_id: null, owner_name: null, owner_color: null, captured_at: null, problem: null, _pending: null };
      db.zones.push(zone);
      saveDB();
      // FIX V7.1: delta instead of full sync
      const { _pending, _defenseOptions, ...publicZone } = zone;
      io.emit('zone:new', { ...publicZone, has_problem: false, is_attempting: false, attempting_team_name: null });
      socket.emit('admin:zone_created', { zone });
    });

    socket.on('admin:delete_zone', ({ zone_id, admin_token }) => {
      if (!auth(admin_token)) return;
      db.zones = db.zones.filter(z => z.id !== zone_id);
      saveDB();
      // FIX V7.1: delta instead of full sync
      io.emit('zone:removed', { zone_id });
    });

    socket.on('admin:start_phase', async ({ phase, admin_token }) => {
      if (!auth(admin_token)) return;

      // V2: Snapshot current state before transitioning (enables rollback)
      if (!db.phase_history) db.phase_history = [];
      db.phase_history.push({
        timestamp: new Date().toISOString(),
        from_phase: db.app_state.current_phase,
        snapshot: {
          app_state: JSON.parse(JSON.stringify(db.app_state)),
          teams_state: db.teams.map(t => ({
            id: t.id, is_eliminated: t.is_eliminated, elimination_phase: t.elimination_phase,
            phase1_total_score: t.phase1_total_score, phase1_scores: [...(t.phase1_scores || [])],
            battery: t.battery, zones_captured: t.zones_captured,
            zone_ids_captured: [...(t.zone_ids_captured || [])],
          })),
          zones_state: db.zones.map(z => ({
            id: z.id, owner_team_id: z.owner_team_id, owner_name: z.owner_name,
            owner_color: z.owner_color, problem: z.problem ? { ...z.problem } : null,
          })),
        },
      });
      if (db.phase_history.length > 5) db.phase_history.shift(); // Keep last 5 only
      db.app_state.current_phase = phase;
      if (phase === 'phase1') {
        db.app_state.phase1_round = 0;
        db.app_state.phase1_round_active = false;
        db.app_state.current_question = null;
        if (!db.used_question_ids) db.used_question_ids = [];
      }
      if (phase === 'quiz_round') {
        stopBatteryDrain();
        // Reset quiz state — admin must explicitly start quiz via admin:start_quiz_round
        db.app_state.quiz_round_active = false;
        db.app_state.quiz_timer_end = null;
        db.app_state.quiz_paused = false;
        db.app_state.quiz_paused_remaining_ms = null;
        db.app_state.quiz_questions = [];
        db.app_state.quiz_member_answers = {};
      }
      if (phase === 'phase2') {
        db.app_state.phase2_timer_end = new Date(Date.now() + (db.app_state.event_config?.phase2_duration_min ?? 90) * 60 * 1000).toISOString();
        db.app_state.phase2_paused = false;
        db.app_state.battery_drain_percent_per_tick = db.app_state.event_config?.battery_drain_rate ?? 2;
startBatteryDrain(db, io, saveDB);
      }
      if (phase === 'phase3') {
        stopBatteryDrain();
        db.app_state.phase3_timer_end = new Date(Date.now() + (db.app_state.event_config?.phase3_duration_min ?? 150) * 60 * 1000).toISOString();
        db.app_state.phase3_paused = false;
      }
      if (phase === 'speed_demo') {
        stopBatteryDrain();
        // Build demo order from non-eliminated teams, randomised
        const demoTeams = db.teams.filter(t => !t.is_eliminated).map(t => t.id);
        // Shuffle
        for (let i = demoTeams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [demoTeams[i], demoTeams[j]] = [demoTeams[j], demoTeams[i]];
        }
        db.app_state.speed_demo_order = demoTeams;
        db.app_state.speed_demo_done_ids = [];
        db.app_state.speed_demo_current_team_id = null;
        db.app_state.speed_demo_timer_end = null;
        db.audience_votes = {};
        // Initialise vote counts to 0
        demoTeams.forEach(id => { db.audience_votes[id] = 0; });
      }
      if (phase === 'results') {
        stopBatteryDrain();
        db.app_state.results_reveal_index = -1;
        // Sprint 3: blend audience votes into final scores (if speed_demo was run)
        const weight = db.app_state.event_config?.audience_weight_percent ?? 0;
        if (weight > 0 && Object.keys(db.audience_votes || {}).length > 0) {
          const votes = db.audience_votes;
          const maxVotes = Math.max(...Object.values(votes), 1);
          db.teams.forEach(t => {
            if (!t.phase3_judge_scores) return;
            const normalised = (votes[t.id] || 0) / maxVotes; // 0–1
            const bonus = Math.round(normalised * weight);
            t.phase3_judge_scores.audience_bonus = bonus;
            t.phase3_judge_scores.total = Math.min(100,
              (t.phase3_judge_scores.ui || 0) +
              (t.phase3_judge_scores.functionality || 0) +
              (t.phase3_judge_scores.problem_fit || 0) +
              bonus
            );
          });
          log(io, db, 'scoring', `Audience votes blended (${weight}% weight)`);
        }
      }
      log(io, db, 'phase_change', `Phase → ${phase}`);
      await saveDBNow(); // Critical: phase changes must persist immediately
      io.emit('phase:changed', { new_phase: phase });
      io.emit('state:sync', buildClientState(db));
      // Emit updated phase_history_count
      io.emit('state:delta', { phase_history_count: db.phase_history.length });
    });

    socket.on('admin:next_round', ({ admin_token }) => {
      if (!auth(admin_token) || db.app_state.current_phase !== 'phase1' || db.app_state.phase1_round >= getMaxRounds(db)) return;
      if (!db.used_question_ids) db.used_question_ids = [];
      const round = db.app_state.phase1_round + 1;
      const q = getRandomGauntletQuestion(db.used_question_ids, round, db.app_state.event_config?.custom_questions || []);
      if (!q) { socket.emit('error', { message: 'No questions left' }); return; }
      db.used_question_ids.push(q.id);
      db.app_state.phase1_round = round;
      db.app_state.phase1_round_active = true;
      db.app_state.current_question = q; // full question with answer stored in DB
      saveDB();
      const { answer: _hidden, ...safeQ } = q;
      io.emit('phase1:round_started', { round_number: round, question: safeQ, time_limit_seconds: q.time_limit_seconds });
      emitStateDelta(io, { phase1_round: round, phase1_round_active: true, current_question: q }); // full q with answer
      socket.emit('admin:state_delta', { current_question: q }); // full question with answer — only to admin socket
      io.emit('toast:broadcast', { message: `⚡ Round ${round} — ${q.time_limit_seconds}s!`, type: 'info' });
    });

    socket.on('admin:end_round', ({ eliminate_count, admin_token }) => {
      if (!auth(admin_token) || !db.app_state.phase1_round_active) return;
      db.app_state.phase1_round_active = false;
      const round = db.app_state.phase1_round;
      const q = db.app_state.current_question;
      const active = db.teams.filter(t => !t.is_eliminated).sort((a, b) => b.phase1_total_score - a.phase1_total_score);
      const count = Math.min(Math.max(0, parseInt(eliminate_count) || 0), active.length - 1);
      const toElim = active.slice(active.length - count);
      const eliminatedIds = [];
      toElim.forEach(t => {
        t.is_eliminated = true; t.elimination_phase = 'phase1';
        eliminatedIds.push(t.id);
        log(io, db, 'elimination', `💀 ${t.name} eliminated Round ${round}`, t.id);
        io.emit('team:eliminated', { team_id: t.id, team_name: t.name });
        emitTeamDelta(io, t, ['is_eliminated', 'elimination_phase']);
      });
      // V7.1: push updated scores to all clients
      db.teams.filter(t => !t.is_eliminated).forEach(t => {
        emitTeamDelta(io, t, ['phase1_total_score', 'phase1_scores']);
      });
      saveDB();
      emitStateDelta(io, { phase1_round_active: false });
      io.emit('phase1:round_ended', { round_number: round, correct_answer: q?.answer, eliminated_count: count, eliminated_ids: eliminatedIds });
      io.emit('leaderboard:phase1', getPhase1Board(db.teams));
      io.emit('toast:broadcast', { message: `Round ${round} ended. ${count} eliminated.`, type: 'warning' });
    });

    socket.on('admin:eliminate_team', ({ team_id, admin_token }) => {
      if (!auth(admin_token)) return;
      const t = db.teams.find(t => t.id === team_id);
      if (!t) return;
      t.is_eliminated = true; t.elimination_phase = db.app_state.current_phase;
      log(io, db, 'elimination', `💀 ${t.name} manually eliminated`, team_id);
      saveDB();
      io.emit('team:eliminated', { team_id, team_name: t.name });
      emitTeamDelta(io, t, ['is_eliminated', 'elimination_phase']);
    });

    socket.on('admin:restore_team', ({ team_id, admin_token }) => {
      if (!auth(admin_token)) return;
      const t = db.teams.find(t => t.id === team_id);
      if (!t) return;
      t.is_eliminated = false; t.elimination_phase = null;
      saveDB();
      emitTeamDelta(io, t, ['is_eliminated', 'elimination_phase']);
    });

    socket.on('admin:override_battery', ({ team_id, battery, admin_token }) => {
      if (!auth(admin_token)) return;
      const t = db.teams.find(t => t.id === team_id);
      if (!t) return;
      t.battery = Math.max(0, Math.min(100, Number(battery)));
      saveDB();
      emitTeamDelta(io, t, ['battery']);
    });

    socket.on('admin:reset_zone', ({ zone_id, admin_token }) => {
      if (!auth(admin_token)) return;
      const zone = db.zones.find(z => z.id === zone_id);
      if (!zone) return;
      if (zone.owner_team_id) {
        const owner = db.teams.find(t => t.id === zone.owner_team_id);
        if (owner) {
          owner.zones_captured = Math.max(0, (owner.zones_captured || 1) - 1);
          owner.zone_ids_captured = (owner.zone_ids_captured || []).filter(z => z !== zone_id);
          emitTeamDelta(io, owner, ['zones_captured', 'zone_ids_captured']);
        }
      }
      Object.assign(zone, { owner_team_id: null, owner_name: null, owner_color: null, captured_at: null, problem: null, _pending: null, _defenseOptions: null });
      saveDB();
      emitZoneDelta(io, zone);
    });

    socket.on('admin:refill_all_batteries', ({ amount, admin_token }) => {
      if (!auth(admin_token)) return;
      const add = Math.min(100, Math.max(1, parseInt(amount) || 20));
      const updates = [];
      db.teams.filter(t => !t.is_eliminated).forEach(t => {
        t.battery = Math.min(100, t.battery + add);
        updates.push({ team_id: t.id, battery: t.battery });
      });
      saveDB();
      // One batched emit
      io.emit('batteries:batch', updates);
      io.emit('toast:broadcast', { message: `🔋 All batteries +${add}%`, type: 'success' });
    });

    socket.on('admin:pause_phase2', ({ admin_token }) => {
      if (!auth(admin_token) || db.app_state.current_phase !== 'phase2' || db.app_state.phase2_paused) return;
      pauseBatteryDrain(db, io);
      saveDB();
      emitStateDelta(io, { phase2_paused: true, phase2_timer_end: db.app_state.phase2_timer_end, phase2_paused_remaining_ms: db.app_state.phase2_paused_remaining_ms });
    });

    socket.on('admin:resume_phase2', ({ admin_token }) => {
      if (!auth(admin_token) || db.app_state.current_phase !== 'phase2' || !db.app_state.phase2_paused) return;
      resumeBatteryDrain(db, io, saveDB);
      saveDB();
      emitStateDelta(io, { phase2_paused: false, phase2_timer_end: db.app_state.phase2_timer_end });
    });

    socket.on('admin:pause_phase3', ({ admin_token }) => {
      if (!auth(admin_token) || db.app_state.current_phase !== 'phase3') return;
      if (db.app_state.phase3_timer_end) {
        db.app_state.phase3_paused_remaining_ms = Math.max(0, new Date(db.app_state.phase3_timer_end) - Date.now());
        db.app_state.phase3_timer_end = null;
      }
      db.app_state.phase3_paused = true;
      saveDB();
      emitStateDelta(io, { phase3_paused: true, phase3_timer_end: null });
      io.emit('toast:broadcast', { message: '⏸️ Phase 3 timer paused', type: 'warning' });
    });

    socket.on('admin:resume_phase3', ({ admin_token }) => {
      if (!auth(admin_token) || db.app_state.current_phase !== 'phase3') return;
      if (db.app_state.phase3_paused_remaining_ms) {
        db.app_state.phase3_timer_end = new Date(Date.now() + db.app_state.phase3_paused_remaining_ms).toISOString();
        db.app_state.phase3_paused_remaining_ms = null;
      }
      db.app_state.phase3_paused = false;
      saveDB();
      emitStateDelta(io, { phase3_paused: false, phase3_timer_end: db.app_state.phase3_timer_end });
      io.emit('toast:broadcast', { message: '▶️ Phase 3 timer resumed', type: 'success' });
    });

    socket.on('admin:assign_problem', ({ team_id, problem, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!problem?.trim()) { socket.emit('admin:error', { message: 'Problem text is empty' }); return; }

      if (team_id === 'all') {
        db.teams.filter(t => !t.is_eliminated).forEach(t => { t.phase3_problem = problem; });
        db.app_state.phase3_problem = problem;
        io.emit('phase3:problem_revealed', { problem, team_id: 'all' });
        emitStateDelta(io, { phase3_problem: problem });
        const count = db.teams.filter(t => !t.is_eliminated).length;
        // ACK back to admin
        socket.emit('admin:problem_assigned', { target: 'all', count, problem });
        log(io, db, 'phase_change', `Phase 3 problem assigned to all ${count} teams`);
      } else {
        const t = db.teams.find(t => t.id === team_id);
        if (!t) { socket.emit('admin:error', { message: 'Team not found' }); return; }
        t.phase3_problem = problem;
        io.to(`team_${team_id}`).emit('phase3:problem_revealed', { problem, team_id });
        emitTeamDelta(io, t, ['phase3_problem']);
        // ACK back to admin
        socket.emit('admin:problem_assigned', { target: team_id, team_name: t.name, problem });
        log(io, db, 'phase_change', `Phase 3 problem assigned to ${t.name}`);
      }
      saveDB();
    });

    socket.on('admin:set_phase3_scores', ({ team_id, scores, admin_token }) => {
      if (!auth(admin_token)) return;
      const t = db.teams.find(t => t.id === team_id);
      if (!t) return;
      t.phase3_judge_scores = { ...scores, total: calcPhase3Score(scores.ui, scores.functionality, scores.problem_fit) };
      saveDB();
      emitTeamDelta(io, t, ['phase3_judge_scores']);
      io.emit('leaderboard:final', getFinalBoard(db.teams));
    });

    socket.on('admin:reveal_next', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      const idx = (db.app_state.results_reveal_index ?? -1) + 1;
      db.app_state.results_reveal_index = idx;
      // Use getResultsBoard so the correct score field is used regardless of which
      // phases were enabled (fixes quiz-only / phase1-only events showing #0 ???)
      const phasesEnabled = db.app_state.event_config?.phases_enabled || [];
      const board = getResultsBoard(db.teams, phasesEnabled);
      const revealBoard = [...board].reverse(); // worst → best
      const revealed = revealBoard[idx];
      saveDB();
      io.emit('results:announce', {
        index: idx, total: revealBoard.length,
        team: revealed || null,
        actual_rank: revealed ? board.findIndex(t => t.team_id === revealed.team_id) : -1,
        is_winner: revealed ? board.findIndex(t => t.team_id === revealed.team_id) === 0 : false,
        is_last: idx >= revealBoard.length - 1,
        score_label: revealed?.score_label || null,
      });
    });

    socket.on('admin:reset_reveal', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      db.app_state.results_reveal_index = -1;
      saveDB();
      io.emit('results:announce', { index: -1, team: null });
    });

    socket.on('admin:broadcast', ({ message, type, admin_token }) => {
      if (!auth(admin_token)) return;
      io.emit('toast:broadcast', { message, type: type || 'info' });
    });

    // ── V2: MASTER PAUSE (emergency freeze everything) ─────────────
    socket.on('admin:master_pause', ({ reason, admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.master_paused) return; // Already paused

      db.app_state.master_paused = true;
      db.app_state.master_paused_at = new Date().toISOString();
      db.app_state.master_pause_reason = reason || 'Technical issue';

      // Freeze all running phase timers
      pauseBatteryDrain(db, io); // Also freezes phase2_timer_end
      if (db.app_state.phase3_timer_end) {
        db.app_state.phase3_paused_remaining_ms = Math.max(0, new Date(db.app_state.phase3_timer_end) - Date.now());
        db.app_state.phase3_timer_end = null;
        db.app_state.phase3_paused = true;
      }
      if (db.app_state.phase1_round_active) {
        db.app_state.phase1_round_active = false;
        db.app_state.phase1_paused_mid_round = true;
      }

      saveDB();
      io.emit('state:delta', {
        master_paused: true,
        master_pause_reason: db.app_state.master_pause_reason,
        phase2_paused: db.app_state.phase2_paused,
        phase2_timer_end: db.app_state.phase2_timer_end,
        phase3_paused: db.app_state.phase3_paused,
        phase3_timer_end: db.app_state.phase3_timer_end,
        phase1_round_active: false,
      });
      io.emit('toast:broadcast', { message: `⏸ EVENT PAUSED: ${db.app_state.master_pause_reason}`, type: 'warning' });
      log(io, db, 'phase_change', `⏸ MASTER PAUSE: ${db.app_state.master_pause_reason}`);
    });

    socket.on('admin:master_resume', async ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (!db.app_state.master_paused) return;

      db.app_state.master_paused = false;
      db.app_state.master_paused_at = null;

      const phase = db.app_state.current_phase;
      // Restore phase 2 timer + battery drain
      if (phase === 'phase2' && db.app_state.phase2_paused_remaining_ms) {
        db.app_state.phase2_timer_end = new Date(Date.now() + db.app_state.phase2_paused_remaining_ms).toISOString();
        db.app_state.phase2_paused_remaining_ms = null;
        db.app_state.phase2_paused = false;
        resumeBatteryDrain(db, io, saveDB);
      }
      // Restore phase 3 timer
      if (phase === 'phase3' && db.app_state.phase3_paused_remaining_ms) {
        db.app_state.phase3_timer_end = new Date(Date.now() + db.app_state.phase3_paused_remaining_ms).toISOString();
        db.app_state.phase3_paused_remaining_ms = null;
        db.app_state.phase3_paused = false;
      }

      saveDB();
      io.emit('state:delta', {
        master_paused: false,
        phase2_paused: db.app_state.phase2_paused,
        phase2_timer_end: db.app_state.phase2_timer_end,
        phase3_paused: db.app_state.phase3_paused,
        phase3_timer_end: db.app_state.phase3_timer_end,
      });
      io.emit('toast:broadcast', { message: '▶️ EVENT RESUMED — continue!', type: 'success' });
      log(io, db, 'phase_change', '▶️ MASTER RESUME');
    });

    // ── V2: FACTORY RESET ──────────────────────────────────────────
    socket.on('admin:factory_reset', async ({ confirm_phrase, admin_token }) => {
      if (!auth(admin_token)) return;
      if (confirm_phrase !== 'RESET') {
        socket.emit('admin:error', { message: 'Type exactly "RESET" to confirm factory reset.' }); return;
      }

      stopBatteryDrain();

      // Wipe everything, preserve event_config
      const savedConfig = db.app_state.event_config;
      const fresh = {
        app_state: {
          current_phase: 'setup',
          phase1_round: 0, phase1_round_active: false, current_question: null,
          phase2_paused: false, phase2_timer_end: null, phase2_paused_remaining_ms: null,
          phase3_timer_end: null, phase3_paused: false, phase3_paused_remaining_ms: null,
          battery_drain_interval_ms: 60000, battery_drain_percent_per_tick: 2,
          phase3_problem: null, results_reveal_index: -1,
          master_paused: false, master_paused_at: null, master_pause_reason: '',
          // Sprint 3: reset speed demo state
          speed_demo_current_team_id: null, speed_demo_timer_end: null,
          speed_demo_order: [], speed_demo_done_ids: [],
          event_config: savedConfig, // Preserved across reset
        },
        teams: [], zones: [],
        used_question_ids: [], used_zone_problem_ids: [],
        event_log: [], phase_history: [],
        audience_votes: {}, // Sprint 3: clear votes on reset
      };
      Object.assign(db, fresh);

      await saveDBNow();
      io.emit('state:sync', buildClientState(db));
      socket.emit('admin:reset_complete', { message: '✅ Factory reset complete. Ready for a new event.' });
      log(io, db, 'phase_change', '🔄 FACTORY RESET — clean slate');
    });

    // ── V2: PHASE ROLLBACK ─────────────────────────────────────────
    socket.on('admin:rollback_phase', async ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (!db.phase_history || db.phase_history.length === 0) {
        socket.emit('admin:error', { message: 'Nothing to roll back to — no phase history.' }); return;
      }

      stopBatteryDrain();

      const prev = db.phase_history.pop();
      const snap = prev.snapshot;

      // Restore app_state
      Object.assign(db.app_state, snap.app_state);

      // Restore per-team critical fields
      snap.teams_state.forEach(ts => {
        const team = db.teams.find(t => t.id === ts.id);
        if (team) Object.assign(team, ts);
      });

      // Restore zone ownership
      snap.zones_state.forEach(zs => {
        const zone = db.zones.find(z => z.id === zs.id);
        if (zone) {
          zone.owner_team_id = zs.owner_team_id;
          zone.owner_name = zs.owner_name;
          zone.owner_color = zs.owner_color;
          zone.problem = zs.problem;
          zone._pending = null;
        }
      });

      await saveDBNow();
      io.emit('state:sync', buildClientState(db));
      io.emit('state:delta', { phase_history_count: db.phase_history.length });
      socket.emit('admin:rollback_complete', { restored_phase: prev.from_phase });
      io.emit('toast:broadcast', { message: `⏪ Rolled back to ${prev.from_phase}`, type: 'warning' });
      log(io, db, 'phase_change', `⏪ ROLLBACK to ${prev.from_phase}`);
    });

    // ── Thank You page trigger ─────────────────────────────────────
    socket.on('admin:goto_thankyou', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      io.emit('event:thankyou');
      log(io, db, 'phase_change', '🎉 Thank You page shown to all clients');
    });

    // ── Sprint 2: Save event config ────────────────────────────────
    socket.on('admin:save_config', async ({ config, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!config || typeof config !== 'object') { socket.emit('admin:error', { message: 'Invalid config' }); return; }
      db.app_state.event_config = {
        event_name: String(config.event_name || 'CODE SPRINT 2.0').trim(),
        college_name: String(config.college_name || '').trim(),
        phases_enabled: Array.isArray(config.phases_enabled) ? config.phases_enabled : ['phase1', 'phase2', 'phase3'],
        phase1_rounds: Math.max(1, Math.min(10, parseInt(config.phase1_rounds) || 5)),
        phase2_duration_min: Math.max(15, Math.min(240, parseInt(config.phase2_duration_min) || 90)),
        phase3_duration_min: Math.max(30, Math.min(360, parseInt(config.phase3_duration_min) || 150)),
        battery_drain_rate: Math.max(0.5, Math.min(10, parseFloat(config.battery_drain_rate) || 2)),
        battery_attempt_cost: Math.max(0, Math.min(30, parseInt(config.battery_attempt_cost) || 5)),
        battery_capture_gain: Math.max(0, Math.min(50, parseInt(config.battery_capture_gain) || 20)),
        // Sprint 3: speed demo config
        speed_demo_enabled: !!config.speed_demo_enabled,
        speed_demo_duration_sec: Math.max(30, Math.min(300, parseInt(config.speed_demo_duration_sec) || 90)),
        audience_weight_percent: Math.max(0, Math.min(30, parseInt(config.audience_weight_percent) || 10)),
      };
      await saveDBNow();
      io.emit('state:delta', { event_config: db.app_state.event_config });
      socket.emit('admin:config_saved', { config: db.app_state.event_config });
      log(io, db, 'phase_change', `Config saved: ${db.app_state.event_config.event_name}`);
    });

    // ── Sprint 2: Adjust running timer ±minutes ───────────────────
    socket.on('admin:adjust_timer', ({ phase, delta_min, admin_token }) => {
      if (!auth(admin_token)) return;
      const deltaMs = (parseInt(delta_min) || 0) * 60 * 1000;
      if (phase === 'phase2' && db.app_state.phase2_timer_end) {
        db.app_state.phase2_timer_end = new Date(new Date(db.app_state.phase2_timer_end).getTime() + deltaMs).toISOString();
        saveDB();
        emitStateDelta(io, { phase2_timer_end: db.app_state.phase2_timer_end });
        io.emit('toast:broadcast', { message: `${delta_min > 0 ? '+' : ''}${delta_min} min added to Phase 2 timer`, type: 'info' });
      } else if (phase === 'phase3' && db.app_state.phase3_timer_end) {
        db.app_state.phase3_timer_end = new Date(new Date(db.app_state.phase3_timer_end).getTime() + deltaMs).toISOString();
        saveDB();
        emitStateDelta(io, { phase3_timer_end: db.app_state.phase3_timer_end });
        io.emit('toast:broadcast', { message: `${delta_min > 0 ? '+' : ''}${delta_min} min added to Phase 3 timer`, type: 'info' });
      }
    });

    // ── Sprint 3: Audience voting (spectator page, no auth) ───────
    // Rate-limited to 1 vote per socket per entire speed_demo phase
    socket.on('audience:vote', ({ team_id }) => {
      if (db.app_state.current_phase !== 'speed_demo') return;
      if (!rateLimit(socket.id, 'audience:vote', 999_999_999)) return; // one vote ever per socket
      if (!db.audience_votes) db.audience_votes = {};
      if (!db.teams.find(t => t.id === team_id && !t.is_eliminated)) return;
      db.audience_votes[team_id] = (db.audience_votes[team_id] || 0) + 1;
      saveDB();
      io.emit('audience:votes', db.audience_votes);
    });

    // ── Sprint 3: Start a team's demo slot ───────────────────────
    socket.on('admin:start_team_demo', ({ team_id, admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.current_phase !== 'speed_demo') return;
      const team = db.teams.find(t => t.id === team_id);
      if (!team) return;
      const durationSec = db.app_state.event_config?.speed_demo_duration_sec ?? 90;
      db.app_state.speed_demo_current_team_id = team_id;
      db.app_state.speed_demo_timer_end = new Date(Date.now() + durationSec * 1000).toISOString();
      saveDB();
      emitStateDelta(io, {
        speed_demo_current_team_id: team_id,
        speed_demo_timer_end: db.app_state.speed_demo_timer_end,
        speed_demo_done_ids: db.app_state.speed_demo_done_ids,
      });
      log(io, db, 'speed_demo', `${team.name} started demo — ${durationSec}s`);
    });

    // ── Sprint 3: End current demo, advance to next ──────────────
    socket.on('admin:next_demo_team', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.current_phase !== 'speed_demo') return;
      const current = db.app_state.speed_demo_current_team_id;
      if (current && !db.app_state.speed_demo_done_ids.includes(current)) {
        db.app_state.speed_demo_done_ids.push(current);
      }
      db.app_state.speed_demo_current_team_id = null;
      db.app_state.speed_demo_timer_end = null;
      saveDB();
      emitStateDelta(io, {
        speed_demo_current_team_id: null,
        speed_demo_timer_end: null,
        speed_demo_done_ids: db.app_state.speed_demo_done_ids,
      });
    });

    socket.on('disconnect', () => {
      clearRateLimits(socket.id);
    });

    // ── V7: Quiz Round (Phase 1.5) ────────────────────────────────
    socket.on('admin:start_quiz_round', async ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.current_phase !== 'quiz_round') return;
      const cfg = db.app_state.event_config;
      const n = cfg.quiz_num_questions || 50;
      const durationMin = cfg.quiz_duration_min || 30;
      const customQ = cfg.custom_questions || [];
      const questions = pickQuizQuestions(n, db.used_question_ids, customQ);
      db.app_state.quiz_questions = questions;
      db.app_state.quiz_member_answers = {};
      db.app_state.quiz_round_active = true;
      db.app_state.quiz_paused = false;
      db.app_state.quiz_paused_remaining_ms = null;
      db.app_state.quiz_timer_end = new Date(Date.now() + durationMin * 60 * 1000).toISOString();
      await saveDBNow();
      // Send questions + timer to all clients
      io.emit('quiz:started', {
        questions,
        timer_end: db.app_state.quiz_timer_end,
        duration_min: durationMin,
      });
      emitStateDelta(io, {
        quiz_round_active: true,
        quiz_timer_end: db.app_state.quiz_timer_end,
        quiz_paused: false,
        quiz_paused_remaining_ms: null,
        quiz_questions: questions,
      });
      log(io, db, 'quiz', `Quiz round started — ${questions.length} questions, ${durationMin} min`);
    });

    socket.on('admin:end_quiz_round', async ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.current_phase !== 'quiz_round') return;
      db.app_state.quiz_round_active = false;
      const questions = db.app_state.quiz_questions || [];
      const memberAnswers = db.app_state.quiz_member_answers || {};
      const teamScores = {};
      // Score each team: average across members who submitted
      db.teams.filter(t => !t.is_eliminated).forEach(team => {
        const teamMemberAnswers = memberAnswers[team.id] || {};
        const memberNames = Object.keys(teamMemberAnswers);
        const memberScoreMap = {};
        memberNames.forEach(member => {
          const answers = teamMemberAnswers[member] || {};
          let score = 0;
          questions.forEach(q => {
            if (answers[q.id] !== undefined) {
              const correct = String(q.answer).trim().toLowerCase();
              const given = String(answers[q.id]).trim().toLowerCase();
              if (correct === given) score += (q.points || 10);
            }
          });
          memberScoreMap[member] = score;
        });
        const scores = Object.values(memberScoreMap);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        team.quiz_score = avgScore;
        team.quiz_member_scores = memberScoreMap;
        teamScores[team.id] = avgScore;
      });
      await saveDBNow();
      // BUG FIX 3: emit team deltas so client team objects update with quiz_score immediately
      db.teams.filter(t => !t.is_eliminated).forEach(t => {
        emitTeamDelta(io, t, ['quiz_score', 'quiz_member_scores']);
      });
      io.emit('quiz:ended', { team_scores: teamScores });
      emitStateDelta(io, { quiz_round_active: false });
      log(io, db, 'quiz', 'Quiz round ended — scores calculated');
    });

    socket.on('admin:pause_quiz_round', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (!db.app_state.quiz_round_active || db.app_state.quiz_paused) return;
      const remaining = new Date(db.app_state.quiz_timer_end).getTime() - Date.now();
      db.app_state.quiz_paused = true;
      db.app_state.quiz_paused_remaining_ms = remaining;
      db.app_state.quiz_timer_end = null;
      saveDB();
      emitStateDelta(io, { quiz_paused: true, quiz_paused_remaining_ms: remaining, quiz_timer_end: null });
      log(io, db, 'quiz', 'Quiz round paused');
    });

    socket.on('admin:resume_quiz_round', ({ admin_token }) => {
      if (!auth(admin_token)) return;
      if (!db.app_state.quiz_paused) return;
      const remaining = db.app_state.quiz_paused_remaining_ms || 0;
      db.app_state.quiz_timer_end = new Date(Date.now() + remaining).toISOString();
      db.app_state.quiz_paused = false;
      db.app_state.quiz_paused_remaining_ms = null;
      saveDB();
      emitStateDelta(io, { quiz_paused: false, quiz_paused_remaining_ms: null, quiz_timer_end: db.app_state.quiz_timer_end });
      log(io, db, 'quiz', 'Quiz round resumed');
    });

    // Adjust quiz timer (admin ± minutes)
    socket.on('admin:adjust_quiz_timer', ({ delta_min, admin_token }) => {
      if (!auth(admin_token)) return;
      const deltaMs = (parseInt(delta_min) || 0) * 60 * 1000;
      if (db.app_state.quiz_paused && db.app_state.quiz_paused_remaining_ms !== null) {
        db.app_state.quiz_paused_remaining_ms = Math.max(0, db.app_state.quiz_paused_remaining_ms + deltaMs);
        emitStateDelta(io, { quiz_paused_remaining_ms: db.app_state.quiz_paused_remaining_ms });
      } else if (db.app_state.quiz_timer_end) {
        db.app_state.quiz_timer_end = new Date(new Date(db.app_state.quiz_timer_end).getTime() + deltaMs).toISOString();
        emitStateDelta(io, { quiz_timer_end: db.app_state.quiz_timer_end });
      }
      saveDB();
      io.emit('toast:broadcast', { message: `${delta_min > 0 ? '+' : ''}${delta_min} min added to quiz timer`, type: 'info' });
    });

    // Team submits quiz answers (per member)
    socket.on('quiz:submit_answers', ({ team_id, member_name, answers }) => {
      if (!rateLimit(socket.id, 'quiz:submit_answers', 3000)) return;
      if (!db.app_state.quiz_round_active) return;
      const team = db.teams.find(t => t.id === team_id);
      if (!team) return;
      // FIX V7.1: reject blank member names — prevents "" key polluting quiz_member_answers
      const cleanName = typeof member_name === 'string' ? member_name.trim() : '';
      if (!cleanName) {
        socket.emit('quiz:answers_received', { member_name: '', count: 0, error: 'Member name is required' });
        return;
      }
      if (!db.app_state.quiz_member_answers[team_id]) db.app_state.quiz_member_answers[team_id] = {};

      // BUGFIX: Prevent re-submission — once a member has submitted, lock it server-side
      if (db.app_state.quiz_member_answers[team_id][cleanName]) {
        socket.emit('quiz:answers_received', {
          member_name,
          count: Object.keys(db.app_state.quiz_member_answers[team_id][cleanName]).length,
          already_submitted: true,
        });
        return;
      }

      db.app_state.quiz_member_answers[team_id][cleanName] = answers;
      saveDB();

      // BUGFIX: Broadcast full quiz_member_answers map so admin sees real-time updates
      // Send member names as keys (not full answers) to keep payload small
      const submissionSummary = {};
      Object.entries(db.app_state.quiz_member_answers).forEach(([tid, members]) => {
        // Keep same shape as db: { teamId: { memberName: true } } so admin tracker works
        submissionSummary[tid] = Object.fromEntries(Object.keys(members).map(m => [m, true]));
      });
      io.emit('quiz:submission_update', { submissions: submissionSummary });
      // Also emit as state:delta so AppContext STATE_DELTA reducer merges it correctly
      io.emit('state:delta', { quiz_member_answers: submissionSummary });

      socket.emit('quiz:answers_received', { member_name: cleanName, count: Object.keys(answers).length });
      log(io, db, 'quiz', `📝 ${team.name} — ${cleanName} submitted (${Object.keys(answers).length} answers)`);
    });

    // FEATURE: Admin eliminates bottom N teams after quiz scores are calculated
    socket.on('admin:quiz_eliminate', ({ eliminate_count, admin_token }) => {
      if (!auth(admin_token)) return;
      if (db.app_state.current_phase !== 'quiz_round') return;

      const active = db.teams.filter(t => !t.is_eliminated);
      const count = Math.min(Math.max(0, parseInt(eliminate_count) || 0), active.length - 1);
      if (count === 0) return;

      // Sort by quiz score ascending — lowest scores eliminated first
      const sorted = [...active].sort((a, b) => (a.quiz_score || 0) - (b.quiz_score || 0));
      const eliminatedIds = [];
      for (let i = 0; i < count; i++) {
        const t = sorted[i];
        t.is_eliminated = true;
        t.elimination_phase = 'quiz_round';
        eliminatedIds.push(t.id);
        log(io, db, 'elimination', `💀 ${t.name} eliminated after quiz round (score: ${t.quiz_score || 0})`, t.id);
        io.emit('team:eliminated', { team_id: t.id, team_name: t.name });
        emitTeamDelta(io, t, ['is_eliminated', 'elimination_phase']);
      }
      saveDB();
      io.emit('quiz:eliminated', { eliminated_ids: eliminatedIds, count });
      io.emit('toast:broadcast', { message: `Quiz round: ${count} team(s) eliminated.`, type: 'warning' });
    });

    // ── V7: Custom Questions ──────────────────────────────────────
    socket.on('admin:add_custom_question', ({ question, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!question || !question.question) return;
      const q = {
        id: uuid(),
        type: question.type || 'mcq',
        question: question.question,
        options: question.options || [],
        answer: question.answer || '',
        points: question.points || 10,
        time_limit_seconds: question.time_limit_seconds || 20,
        difficulty: question.difficulty || 'easy',
        round_max: question.round_max || 5,
        source: 'admin',
      };
      if (!db.app_state.event_config.custom_questions) db.app_state.event_config.custom_questions = [];
      db.app_state.event_config.custom_questions.push(q);
      saveDB();
      socket.emit('admin:custom_question_added', { question: q });
      emitStateDelta(io, { event_config: db.app_state.event_config });
      log(io, db, 'config', `Custom question added: "${q.question.slice(0, 40)}..."`);
    });

    socket.on('admin:delete_custom_question', ({ q_id, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!db.app_state.event_config.custom_questions) return;
      db.app_state.event_config.custom_questions = db.app_state.event_config.custom_questions.filter(q => q.id !== q_id);
      saveDB();
      emitStateDelta(io, { event_config: db.app_state.event_config });
      log(io, db, 'config', `Custom question deleted (id: ${q_id})`);
    });

    // ── V7: Phase 3 Group Assignment ──────────────────────────────
    socket.on('admin:assign_problem_group', ({ team_ids, problem, group_label, admin_token }) => {
      if (!auth(admin_token)) return;
      if (!Array.isArray(team_ids) || !problem) return;
      let count = 0;
      team_ids.forEach(tid => {
        const team = db.teams.find(t => t.id === tid);
        if (!team) return;
        team.phase3_problem = problem;
        team.phase3_group = group_label || null;
        io.to(`team_${tid}`).emit('phase3:problem_revealed', { problem, team_id: tid });
        count++;
      });
      saveDB();
      socket.emit('admin:problem_assigned', { target: 'group', group_label, count });
      log(io, db, 'phase3', `Phase 3 problem assigned to ${group_label || 'group'} (${count} teams)`);
    });
  });
}

// Internal helper (not exported — used locally)
function buildPhase2Board(teams) {
  return [...teams]
    .filter(t => !t.is_eliminated)
    .sort((a, b) => b.zones_captured - a.zones_captured || b.battery - a.battery)
    .map((t, i) => ({ rank: i + 1, team_id: t.id, team_name: t.name, color: t.color, zones: t.zones_captured, battery: t.battery }));
}

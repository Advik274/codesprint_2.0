let batteryInterval = null;

// Pure(ish) — mutates db.teams/db.event_log but has no io/timer dependency,
// so it's directly unit-testable without spinning up a real interval.
// Returns null if nothing changed this tick (caller skips all emits/save).
export function processBatteryTick(db) {
  if (db.app_state.current_phase !== 'phase2') return null;
  if (db.app_state.phase2_paused) return null;
  if (db.app_state.master_paused) return null; // V2: respect master pause

  const drainRate = db.app_state.battery_drain_percent_per_tick ?? 2;
  const updates = [];
  const warnings = [];
  const eliminations = [];

  db.teams.forEach(team => {
    if (team.is_eliminated) return; // fully done with this team

    // BUG FIX: a team can reach 0% battery via a zone-attempt cost
    // (deducted instantly in events.js) rather than this drain tick.
    // The old guard here (`is_eliminated || battery <= 0`) skipped those
    // teams too, which meant the elimination check below never ran for
    // them — they'd sit at 0% battery, marked active, forever (or until
    // an admin noticed and eliminated them by hand). Catch that here
    // instead of silently skipping.
    if (team.battery <= 0) {
      team.is_eliminated = true;
      team.elimination_phase = 'phase2';
      eliminations.push({ team_id: team.id, team_name: team.name });
      db.event_log.unshift({ timestamp: new Date().toISOString(), type: 'elimination', message: `💀 ${team.name} eliminated — battery dead`, team_id: team.id });
      return;
    }

    const prev = team.battery;
    team.battery = Math.max(0, parseFloat((team.battery - drainRate).toFixed(1)));

    updates.push({ team_id: team.id, battery: team.battery });

    // Only warn on threshold crossing (not every tick at same value)
    if ((prev > 20 && team.battery <= 20) || (prev > 10 && team.battery <= 10)) {
      warnings.push({ team_id: team.id, team_name: team.name, battery: team.battery });
    }

    if (team.battery <= 0 && !team.is_eliminated) {
      team.is_eliminated = true;
      team.elimination_phase = 'phase2';
      eliminations.push({ team_id: team.id, team_name: team.name });
      db.event_log.unshift({ timestamp: new Date().toISOString(), type: 'elimination', message: `💀 ${team.name} eliminated — battery dead`, team_id: team.id });
    }
  });

  // BUG FIX: a team caught already sitting at 0% (see above) is pushed to
  // `eliminations` but never to `updates` — this check used to look at
  // updates.length alone, so that case returned null and the caller
  // skipped emitting team:eliminated entirely, even though the team WAS
  // correctly marked eliminated in the data a moment ago. The DB state
  // was right; the notification to every screen just silently never went
  // out. Found by writing a test for the original fix, not by hand.
  if (updates.length === 0 && eliminations.length === 0) return null; // truly nothing happened
  return { updates, warnings, eliminations };
}

export function startBatteryDrain(db, io, saveDB) {
  if (batteryInterval) clearInterval(batteryInterval);

  batteryInterval = setInterval(() => {
    const result = processBatteryTick(db);
    if (!result) return;
    const { updates, warnings, eliminations } = result;

    // ONE batched emit for all battery updates
    io.emit('batteries:batch', updates);

    warnings.forEach(w => {
      io.to(`team_${w.team_id}`).emit('toast:broadcast', { message: `⚠️ Battery at ${w.battery}%! Capture a zone NOW!`, type: 'warning' });
      io.emit('toast:broadcast', { message: `⚠️ ${w.team_name}: ${w.battery}% battery`, type: 'warning' });
    });

    eliminations.forEach(e => {
      io.emit('team:eliminated', { team_id: e.team_id, team_name: e.team_name });
      io.emit('toast:broadcast', { message: `💀 ${e.team_name} eliminated — battery depleted`, type: 'danger' });
    });

    saveDB(); // Debounced — non-blocking
    io.emit('leaderboard:phase2', buildPhase2Board(db.teams));
  }, db.app_state.battery_drain_interval_ms);

  console.log(`🔋 Battery drain started | ${db.app_state.battery_drain_percent_per_tick}%/min`);
}

export function stopBatteryDrain() {
  if (batteryInterval) { clearInterval(batteryInterval); batteryInterval = null; console.log('🔋 Battery drain stopped'); }
}

export function pauseBatteryDrain(db, io) {
  if (batteryInterval) { clearInterval(batteryInterval); batteryInterval = null; }
  db.app_state.phase2_paused = true;
  if (db.app_state.phase2_timer_end) {
    db.app_state.phase2_paused_remaining_ms = Math.max(0, new Date(db.app_state.phase2_timer_end) - Date.now());
    db.app_state.phase2_timer_end = null;
  }
  io.emit('phase2:paused', {});
  console.log('⏸ Phase 2 paused');
}

export function resumeBatteryDrain(db, io, saveDB) {
  db.app_state.phase2_paused = false;
  if (db.app_state.phase2_paused_remaining_ms) {
    db.app_state.phase2_timer_end = new Date(Date.now() + db.app_state.phase2_paused_remaining_ms).toISOString();
    db.app_state.phase2_paused_remaining_ms = null;
  }
  startBatteryDrain(db, io, saveDB);
  io.emit('phase2:resumed', { phase2_timer_end: db.app_state.phase2_timer_end });
  console.log('▶️ Phase 2 resumed');
}

export function buildPhase2Board(teams) {
  return [...teams].filter(t => !t.is_eliminated)
    .sort((a, b) => b.zones_captured - a.zones_captured || b.battery - a.battery)
    .map((t, i) => ({ rank: i+1, team_id: t.id, team_name: t.name, color: t.color, zones: t.zones_captured, battery: t.battery }));
}

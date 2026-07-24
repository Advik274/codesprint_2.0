import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processBatteryTick, buildPhase2Board } from '../lib/battery.js';

function makeDb(teams, overrides = {}) {
  return {
    app_state: {
      current_phase: 'phase2',
      phase2_paused: false,
      master_paused: false,
      battery_drain_percent_per_tick: 2,
      ...overrides,
    },
    teams,
    event_log: [],
  };
}

function makeTeam(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    name: 'Team', color: '#fff',
    battery: 100, is_eliminated: false, elimination_phase: null,
    zones_captured: 0,
    ...overrides,
  };
}

describe('processBatteryTick', () => {
  test('drains active teams by the configured rate', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 50 })]);
    const result = processBatteryTick(db);
    assert.equal(db.teams[0].battery, 48);
    assert.equal(result.updates.length, 1);
    assert.equal(result.updates[0].battery, 48);
  });

  test('returns null (no-op) outside phase2, while paused, or while master-paused', () => {
    assert.equal(processBatteryTick(makeDb([makeTeam()], { current_phase: 'phase1' })), null);
    assert.equal(processBatteryTick(makeDb([makeTeam()], { phase2_paused: true })), null);
    assert.equal(processBatteryTick(makeDb([makeTeam()], { master_paused: true })), null);
  });

  test('skips already-eliminated teams entirely', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 50, is_eliminated: true })]);
    const result = processBatteryTick(db);
    assert.equal(result, null); // nothing to update
    assert.equal(db.teams[0].battery, 50); // untouched
  });

  test('eliminates a team once battery reaches 0 via normal drain', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 1 })]); // drains by 2 -> clamped to 0
    const result = processBatteryTick(db);
    assert.equal(db.teams[0].battery, 0);
    assert.equal(db.teams[0].is_eliminated, true);
    assert.equal(db.teams[0].elimination_phase, 'phase2');
    assert.equal(result.eliminations.length, 1);
    assert.equal(result.eliminations[0].team_id, 'a');
  });

  // BUG FIX regression test: a team that reaches 0% via a zone-attempt cost
  // (deducted elsewhere, not by this tick) used to be silently skipped by
  // the old guard clause forever, never getting marked eliminated.
  test('eliminates a team already sitting at 0% battery from a non-drain source', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 0, is_eliminated: false })]);
    const result = processBatteryTick(db);
    assert.equal(db.teams[0].is_eliminated, true, 'team stuck at 0% must be caught and eliminated');
    assert.equal(result.eliminations.length, 1);
  });

  test('fires a warning exactly once when crossing the 20% and 10% thresholds', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 21 })]);
    const r1 = processBatteryTick(db); // 21 -> 19, crosses 20%
    assert.equal(r1.warnings.length, 1);
    const r2 = processBatteryTick(db); // 19 -> 17, no new crossing
    assert.equal(r2.warnings.length, 0);
  });

  test('never drains below 0', () => {
    const db = makeDb([makeTeam({ id: 'a', battery: 0.5 })]);
    processBatteryTick(db);
    assert.equal(db.teams[0].battery, 0);
  });

  test('a full tick with nothing eligible to update returns null', () => {
    const db = makeDb([]); // no teams at all
    assert.equal(processBatteryTick(db), null);
  });
});

describe('buildPhase2Board', () => {
  test('ranks by zones captured, then battery, excludes eliminated teams', () => {
    const teams = [
      makeTeam({ id: 'a', zones_captured: 1, battery: 50 }),
      makeTeam({ id: 'b', zones_captured: 2, battery: 10 }),
      makeTeam({ id: 'c', zones_captured: 2, battery: 90 }),
      makeTeam({ id: 'd', zones_captured: 5, battery: 100, is_eliminated: true }),
    ];
    const board = buildPhase2Board(teams);
    assert.deepEqual(board.map(t => t.team_id), ['c', 'b', 'a']);
  });
});

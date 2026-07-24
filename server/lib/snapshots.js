import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const SNAP_DIR = './data/snapshots';
const ARCHIVE_DIR = './data/archive';
const MAX_SNAPSHOTS = 20;

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ── Periodic snapshots ────────────────────────────────────────────
// A local safety net against a corrupted write or a fat-fingered admin
// action — separate from the manual Backup tab (which is for surviving a
// full redeploy on hosts with ephemeral disks). Skips empty/idle state so
// we don't fill the disk with junk before an event has actually started.
let snapshotInterval = null;

export function snapshotNow(db, opts = {}) {
  ensureDir(SNAP_DIR);
  const skipIfEmpty = opts.skipIfEmpty ?? false;
  if (skipIfEmpty && (!db.teams || db.teams.length === 0)) return null;
  const filename = `snapshot-${safeStamp()}.json`;
  writeFileSync(join(SNAP_DIR, filename), JSON.stringify(db));
  pruneSnapshots();
  return filename;
}

function pruneSnapshots() {
  ensureDir(SNAP_DIR);
  const files = readdirSync(SNAP_DIR).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - MAX_SNAPSHOTS;
  for (let i = 0; i < excess; i++) {
    try { unlinkSync(join(SNAP_DIR, files[i])); } catch { /* ignore */ }
  }
}

export function startSnapshots(db, intervalMs = 5 * 60 * 1000) {
  ensureDir(SNAP_DIR);
  if (snapshotInterval) clearInterval(snapshotInterval);
  snapshotInterval = setInterval(() => snapshotNow(db, { skipIfEmpty: true }), intervalMs);
}

export function listSnapshots() {
  ensureDir(SNAP_DIR);
  return readdirSync(SNAP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const st = statSync(join(SNAP_DIR, f));
      return { filename: f, taken_at: st.mtime.toISOString(), size_kb: Math.round(st.size / 1024) };
    })
    .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
}

export function restoreSnapshot(filename) {
  const safe = String(filename).replace(/[^a-zA-Z0-9_.-]/g, '');
  const path = join(SNAP_DIR, safe);
  if (!existsSync(path)) throw new Error('Snapshot not found');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ── Event archive ─────────────────────────────────────────────────
// Called just before a factory reset so a completed event's full results
// aren't lost when the DB is wiped for the next run.
export function archiveEvent(db, reason = 'factory_reset') {
  ensureDir(ARCHIVE_DIR);
  const eventName = (db.app_state?.event_config?.event_name || 'event').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'event';
  const filename = `${eventName.replace(/\s+/g, '_')}-${safeStamp()}.json`;

  const teams = db.teams || [];
  const topTeams = [...teams]
    .sort((a, b) => (b.phase3_judge_scores?.total ?? b.quiz_score ?? b.phase1_total_score ?? 0)
                   - (a.phase3_judge_scores?.total ?? a.quiz_score ?? a.phase1_total_score ?? 0))
    .slice(0, 3)
    .map(t => ({ name: t.name, score: t.phase3_judge_scores?.total ?? t.quiz_score ?? t.phase1_total_score ?? 0 }));

  const archive = {
    meta: {
      event_name: db.app_state?.event_config?.event_name || 'CODE SPRINT',
      archived_at: new Date().toISOString(),
      reason,
      teams_count: teams.length,
      zones_count: (db.zones || []).length,
      phase_reached: db.app_state?.current_phase || 'unknown',
      top_teams: topTeams,
    },
    db,
  };
  writeFileSync(join(ARCHIVE_DIR, filename), JSON.stringify(archive));
  return { filename, meta: archive.meta };
}

export function listArchives() {
  ensureDir(ARCHIVE_DIR);
  return readdirSync(ARCHIVE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const parsed = JSON.parse(readFileSync(join(ARCHIVE_DIR, f), 'utf-8'));
        return { filename: f, ...parsed.meta };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.archived_at || '').localeCompare(a.archived_at || ''));
}

export function readArchive(filename) {
  const safe = String(filename).replace(/[^a-zA-Z0-9_.-]/g, '');
  const path = join(ARCHIVE_DIR, safe);
  if (!existsSync(path)) throw new Error('Archive not found');
  return readFileSync(path, 'utf-8');
}

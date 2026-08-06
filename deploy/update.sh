#!/usr/bin/env bash
# Ship a change to the running VM.
#
#   cd ~/dominance && ./deploy/update.sh
#
# Pulls the latest code, rebuilds the client, restarts the service and
# verifies it came back up. Your live event data (db.json, snapshots,
# archives) is gitignored and never touched — but a backup is taken
# first anyway, because the one time it matters is the one time you
# skipped it.
#
#   ./deploy/update.sh                 → deploy origin/master
#   ./deploy/update.sh some-branch     → deploy a specific branch
#   ./deploy/update.sh --rollback      → go back to the previous commit
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${SERVICE:-dominance}"
BRANCH="${1:-master}"
cd "$APP_DIR"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
ok()  { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
die() { printf '\033[0;31m  ✗ %s\033[0m\n' "$*"; exit 1; }

PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-80}"

# ── Safety net ────────────────────────────────────────────────────
say "Backing up live event data"
BACKUP_DIR="$HOME/dominance-backups"
mkdir -p "$BACKUP_DIR"
if [ -f server/data/db.json ]; then
  STAMP="$(date -u +%Y%m%d-%H%M%S)"
  cp server/data/db.json "$BACKUP_DIR/db-$STAMP.json"
  ok "saved $BACKUP_DIR/db-$STAMP.json"
  # keep the 20 most recent
  ls -1t "$BACKUP_DIR"/db-*.json 2>/dev/null | tail -n +21 | xargs -r rm --
else
  ok "no db.json yet — nothing to back up"
fi

PREV_COMMIT="$(git rev-parse --short HEAD)"

# ── Fetch ─────────────────────────────────────────────────────────
if [ "$BRANCH" = "--rollback" ]; then
  say "Rolling back one commit from $PREV_COMMIT"
  git reset --hard HEAD~1 --quiet
else
  say "Pulling $BRANCH"
  git fetch --all --quiet
  git reset --hard "origin/$BRANCH" --quiet
fi
NEW_COMMIT="$(git rev-parse --short HEAD)"
if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  ok "already at $NEW_COMMIT — nothing new to deploy"
else
  ok "$PREV_COMMIT → $NEW_COMMIT"
  git --no-pager log --oneline "$PREV_COMMIT..$NEW_COMMIT" 2>/dev/null | sed 's/^/    /' || true
fi

# ── Build ─────────────────────────────────────────────────────────
say "Installing dependencies"
(cd server && npm install --omit=dev --no-audit --no-fund --silent)
(cd client && npm install --no-audit --no-fund --silent)
ok "dependencies up to date"

say "Building the client"
(cd client && npm run build --silent)
ok "client/dist rebuilt"

# ── Restart ───────────────────────────────────────────────────────
say "Restarting $SERVICE"
sudo systemctl restart "$SERVICE"
sleep 3

for i in 1 2 3 4 5; do
  if curl -fsS --max-time 4 "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    ok "healthy on port $PORT"
    PHASE="$(curl -fsS --max-time 4 "http://localhost:${PORT}/health" | sed 's/.*"phase":"\([^"]*\)".*/\1/')"
    TEAMS="$(curl -fsS --max-time 4 "http://localhost:${PORT}/api/ping" | sed 's/.*"teams":\([0-9]*\).*/\1/')"
    printf '\n\033[0;32m  Deployed %s · phase=%s · teams=%s\033[0m\n\n' "$NEW_COMMIT" "$PHASE" "$TEAMS"
    exit 0
  fi
  sleep 2
done

printf '\n'
sudo journalctl -u "$SERVICE" -n 40 --no-pager
die "service did not come back up — recover with:  ./deploy/update.sh --rollback"

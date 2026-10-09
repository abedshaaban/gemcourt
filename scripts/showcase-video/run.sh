#!/usr/bin/env bash
# Full showcase-video pipeline: start a throwaway dev server, record every clip, cut the video, stop the server.
#
#   ./run.sh [--port N] [--no-edit] [any record.mjs flag: --only, --mask-lan, --keep-frames, --headed]
#
# Env: SHOWCASE_PORT (3417), SHOWCASE_WORK_DIR (.work), SHOWCASE_OUT_DIR (out), SHOWCASE_FFMPEG, SHOWCASE_BROWSER.
# Never uses port 3000 (the live game / `pnpm play`), and never builds dist/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PORT="${SHOWCASE_PORT:-3417}"
EDIT=1
PASS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    --no-edit) EDIT=0; shift ;;
    *) PASS+=("$1"); shift ;;
  esac
done
export SHOWCASE_PORT="$PORT"

die() { echo "[showcase] $*" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] || die "invalid port: $PORT"
[[ "$PORT" != 3000 ]] || die "refusing port 3000: that is the live game / preview server. Use another port (default 3417)."
command -v pnpm >/dev/null || die "pnpm not found (needed to start the dev server)"
command -v "${SHOWCASE_FFMPEG:-ffmpeg}" >/dev/null || die "ffmpeg not found (brew install ffmpeg, or set SHOWCASE_FFMPEG)"
command -v python3 >/dev/null || die "python3 not found"
[[ -d "$HERE/node_modules/playwright" ]] || die "dependencies missing: run \`npm install\` (or \`pnpm install --ignore-workspace\`) in $HERE"
[[ -d "$REPO/node_modules" ]] || die "repo dependencies missing: run \`pnpm install\` in $REPO"
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  die "port $PORT is already in use. Stop whatever is on it, or pass --port <free port>."
fi

WORK="$(cd "$HERE" && mkdir -p "${SHOWCASE_WORK_DIR:-.work}" && cd "${SHOWCASE_WORK_DIR:-.work}" && pwd)"
LOG="$WORK/dev-server.log"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[showcase] stopping dev server (pid $SERVER_PID)"
    # the server runs in its own process group (set -m): take down pnpm, vite and any children together
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "[showcase] starting dev server on port $PORT (log: $LOG)"
set -m
(cd "$REPO" && exec pnpm dev --port "$PORT" --strictPort) >"$LOG" 2>&1 &
SERVER_PID=$!
set +m

for i in $(seq 1 120); do
  if curl -fs -o /dev/null "http://localhost:$PORT/"; then break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || { tail -n 30 "$LOG" >&2; die "dev server exited during start-up"; }
  [[ $i -lt 120 ]] || { tail -n 30 "$LOG" >&2; die "dev server did not answer within 60s"; }
  sleep 0.5
done
echo "[showcase] dev server ready at http://localhost:$PORT"

node "$HERE/record.mjs" --port "$PORT" ${PASS[@]+"${PASS[@]}"}

cleanup
SERVER_PID=""
if [[ $EDIT == 1 ]]; then python3 "$HERE/edit.py"; fi
echo "[showcase] done"

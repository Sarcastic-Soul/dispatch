#!/usr/bin/env bash
# Run on-device spike conditions one after another in the already-running Chrome Beta.
# Usage: ./run_chain.sh <results.jsonl> <wait-for-file-with-final|-> <query> [<query> ...]
set -u
cd "$(dirname "$0")"
OUT=$1; WAIT=$2; shift 2
if [ "$WAIT" != "-" ]; then
  until grep -q '"final"' "$WAIT" 2>/dev/null; do sleep 20; done
  sleep 5
fi
for Q in "$@"; do
  before=$(grep -c '"final"' "$OUT" 2>/dev/null); before=${before:-0}
  python3 -I server.py "$OUT" 8766 7200 > /dev/null 2>&1 &
  sleep 1
  TMPDIR=$HOME/.cache/chrome-tmp google-chrome-beta "http://127.0.0.1:8766/?$Q" > /dev/null 2>&1
  while :; do now=$(grep -c '"final"' "$OUT" 2>/dev/null); [ "${now:-0}" -gt "$before" ] && break; sleep 15; done
  wait
  echo "done: $Q"
done

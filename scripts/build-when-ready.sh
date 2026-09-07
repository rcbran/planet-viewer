#!/bin/bash
# wait for fetch-nasa.sh to finish, then build 8k (fast) and 16k textures
D="$HOME/git/blue-marble"; LOG="$D/nasa-src/build.log"; exec >>"$LOG" 2>&1
echo "=== waiting for downloads $(date) ==="
while [ ! -f "$D/nasa-src/.complete" ]; do sleep 10; done
grep -c "^ok\|^have" "$D/nasa-src/fetch.log" | xargs echo "files ready:"
grep -q "^FAIL" "$D/nasa-src/fetch.log" && { echo "download failures present, aborting"; exit 1; }
cd "$D" && echo "=== build 8k $(date) ===" && node scripts/build-textures.mjs 8k && echo "=== build 16k $(date) ===" && node scripts/build-textures.mjs 16k && echo "=== all done $(date) ===" && touch "$D/nasa-src/.built"

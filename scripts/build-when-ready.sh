#!/bin/bash
# wait for all NASA sources to exist (no .part files), then build 8k (fast) and 16k textures
D="$HOME/git/blue-marble"; SRC="$D/nasa-src"; LOG="$SRC/build.log"; exec >>"$LOG" 2>&1
echo "=== build job start $(date) ==="
need="bluemarble_200407_A1 bluemarble_200407_B1 bluemarble_200407_C1 bluemarble_200407_D1 bluemarble_200407_A2 bluemarble_200407_B2 bluemarble_200407_C2 bluemarble_200407_D2 blackmarble_2016_A1 blackmarble_2016_B1 blackmarble_2016_C1 blackmarble_2016_D1 blackmarble_2016_A2 blackmarble_2016_B2 blackmarble_2016_C2 blackmarble_2016_D2"
for i in $(seq 1 360); do
  ok=1; for n in $need; do [ -s "$SRC/$n.jpg" ] || ok=0; done
  [ -s "$SRC/gebco_elev_21600.png" ] && [ -s "$SRC/gebco_bath_21600.png" ] || ok=0
  ls "$SRC"/*.part >/dev/null 2>&1 && ok=0
  [ $ok = 1 ] && break; sleep 10
done
[ $ok = 1 ] || { echo "sources incomplete after waiting, aborting"; exit 1; }
cd "$D" && echo "=== build 8k $(date) ===" && node scripts/build-textures.mjs 8k && echo "=== build 16k $(date) ===" && node scripts/build-textures.mjs 16k && echo "=== all done $(date) ===" && touch "$SRC/.built"

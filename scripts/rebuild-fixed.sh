#!/bin/bash
# wait for the initial 16k build and the gray tiles, then regenerate night/normal/specular for 8k+16k
D="$HOME/git/blue-marble"; SRC="$D/nasa-src"; exec >>"$SRC/build.log" 2>&1
echo "=== rebuild-fixed waiting $(date) ==="
for i in $(seq 1 720); do
  ok=1; [ -f "$SRC/.built" ] || ok=0
  for t in A1 B1 C1 D1 A2 B2 C2 D2; do [ -s "$SRC/blackmarble_2016_gray_$t.jpg" ] || ok=0; done
  ls "$SRC"/*.part >/dev/null 2>&1 && ok=0
  [ $ok = 1 ] && break; sleep 10
done
[ $ok = 1 ] || { echo "rebuild: prerequisites missing after wait"; exit 1; }
cd "$D"; rm -f public/textures/8k/{night,normal,specular}.jpg public/textures/16k/{night,normal,specular}.jpg
echo "=== rebuild 8k $(date) ===" && node scripts/build-textures.mjs 8k && echo "=== rebuild 16k $(date) ===" && node scripts/build-textures.mjs 16k && echo "=== rebuild done $(date) ===" && touch "$SRC/.rebuilt"

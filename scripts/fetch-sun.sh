#!/usr/bin/env bash
# NASA SDO latest full-disk frames + one SVS full-sphere frame (public domain) -> nasa-src/sun/
set -euo pipefail
cd "$(dirname "$0")/.." && mkdir -p nasa-src/sun && cd nasa-src/sun
B=https://sdo.gsfc.nasa.gov/assets/img/latest
get() { [ -s "$2" ] || curl -sSL --retry 3 -A Mozilla/5.0 -o "$2" "$1"; printf "%-34s %s\n" "$2" "$(du -h "$2" | cut -f1)"; }
get "$B/latest_4096_HMIIF.jpg" sdo-hmiif-latest-4096.jpg
get "$B/latest_4096_0304.jpg"  sdo-aia304-latest-4096.jpg
get "$B/latest_4096_0171.jpg"  sdo-aia171-latest-4096.jpg
# a second, older disk for the far hemisphere (any date with visible spots works; override with SUN_DATE=YYYY/MM/DD YYYYMMDD)
D="${SUN_DATE:-2024/10/03 20241003}"; set -- $D
for t in 000000 120000 060000 180000; do curl -sSfL -A Mozilla/5.0 -o sdo-hmiif-$2-4096.jpg "https://sdo.gsfc.nasa.gov/assets/img/browse/$1/$2_${t}_4096_HMIIF.jpg" && break || true; done
[ -s sdo-hmiif-$2-4096.jpg ] || cp sdo-hmiif-latest-4096.jpg sdo-hmiif-$2-4096.jpg
get "https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003851/frames/4096x2048_2x1_30p/solarSphere304A.0201.tif" svs3851-304-cyl-0201.tif

# --- dated frames for the far side: the hemisphere facing away today faced Earth ~7/14/20 days ago ---
# (27.27-day synodic rotation; one frame per quarter turn so every longitude comes from near a disk centre)
BR=https://sdo.gsfc.nasa.gov/assets/img/browse
pickf() { curl -s -m 60 -A Mozilla/5.0 "$BR/$1/" | grep -oE "[0-9]{8}_1[12][0-9]{4}_4096_$2\.jpg" | sort | head -1; }
today=$(date -u +%s)
echo '[' > dates.json; first=1
add() { # age(days) date(YYYY/MM/DD)
  local age=$1 d=$2 h a3 a1; h=$(pickf $d HMIIF); a3=$(pickf $d 0304); a1=$(pickf $d 0171)
  for f in $h $a3 $a1; do [ -n "$f" ] && get "$BR/$d/$f" "$f"; done
  [ $first = 1 ] || echo ',' >> dates.json; first=0
  printf '  { "age": %s, "hmiif": "%s", "aia304": "%s", "aia171": "%s" }' "$age" "$h" "$a3" "$a1" >> dates.json
}
echo '  { "age": 0, "hmiif": "sdo-hmiif-latest-4096.jpg", "aia304": "sdo-aia304-latest-4096.jpg", "aia171": "sdo-aia171-latest-4096.jpg" }' >> dates.json; first=0
for q in 1 2 3; do secs=$(( today - q * 589000 )); d=$(date -u -d @$secs +%Y/%m/%d 2>/dev/null || date -u -r $secs +%Y/%m/%d); age=$(awk "BEGIN{printf \"%.2f\", $q*589000/86400}"); add $age $d; done
echo '' >> dates.json; echo ']' >> dates.json
echo "manifest:"; cat dates.json

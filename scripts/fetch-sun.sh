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

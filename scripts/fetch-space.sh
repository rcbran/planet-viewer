#!/usr/bin/env bash
# Fetch + build the deep-space assets used by src/space.ts (public/textures/space/).
# Source: NASA SVS "Deep Star Maps 2020", https://svs.gsfc.nasa.gov/4851 (public domain; credit
# NASA/GSFC Scientific Visualization Studio, Gaia DR2: ESA/Gaia/DPAC). OpenEXR half-float, linear,
# celestial J2000 plate carree centred on RA 0h with RA increasing to the left.
#   starmap_2020_16k.exr  full map (stars + diffuse Milky Way)  -> sky_{px,nx,py,ny,pz,nz}.jpg cube faces
#   hiptyc_2020_8k.exr    Hipparcos/Tycho foreground only        -> stars.bin (40k brightest, for point sprites)
# Requires curl, ffmpeg (EXR decoder) and node with the repo's sharp devDependency.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/nasa-src/space"; OUT="$ROOT/public/textures/space"
mkdir -p "$SRC" "$OUT"
B=https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851
get() { if [ -s "$SRC/$1" ]; then echo "have $1"; else echo "fetch $1"; curl -sSL -A Mozilla/5.0 --retry 3 -o "$SRC/$1.part" "$B/$1" && mv "$SRC/$1.part" "$SRC/$1"; fi; }
get starmap_2020_16k.exr
get hiptyc_2020_8k.exr
[ -s "$SRC/starmap_16k.f32" ] || ffmpeg -hide_banner -loglevel error -y -i "$SRC/starmap_2020_16k.exr" -f rawvideo -pix_fmt gbrpf32le "$SRC/starmap_16k.f32"
[ -s "$SRC/hiptyc_8k.f32" ] || ffmpeg -hide_banner -loglevel error -y -i "$SRC/hiptyc_2020_8k.exr" -f rawvideo -pix_fmt gbrpf32le "$SRC/hiptyc_8k.f32"
cd "$ROOT"
[ -s "$OUT/stars.bin" ] || node scripts/build-space.mjs stars --keep=40000
[ -s "$OUT/sky_nz.jpg" ] || node scripts/build-space.mjs cube --sky=starmap --size=4096 --gain=8 --fmt=jpg --q=94
ls -la "$OUT"

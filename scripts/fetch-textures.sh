#!/usr/bin/env bash
# Bootstrap textures: Solar System Scope 8K set (CC BY 4.0, https://www.solarsystemscope.com/textures/).
# Production textures come from NASA via scripts/build-textures.* (public domain).
set -euo pipefail
cd "$(dirname "$0")/../public/textures/8k"
B=https://www.solarsystemscope.com/textures/download
for f in 8k_earth_daymap.jpg 8k_earth_nightmap.jpg 8k_earth_clouds.jpg 8k_earth_normal_map.tif 8k_earth_specular_map.tif 8k_stars_milky_way.jpg; do
  [ -s "$f" ] || curl -sSL -A "Mozilla/5.0" -o "$f" "$B/$f"
done
for f in 8k_earth_normal_map 8k_earth_specular_map; do
  [ -s "$f.jpg" ] || ffmpeg -loglevel error -y -i "$f.tif" -pix_fmt rgb24 -q:v 2 "$f.jpg"
done
ls -la

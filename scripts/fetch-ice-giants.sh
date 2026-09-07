#!/usr/bin/env bash
# Uranus and Neptune: Solar System Scope only publishes 2K maps for these (CC BY 4.0) and no higher-resolution
# global map of either planet exists (Voyager 2 is the only close-up source). Fetch the 2K files and upscale to 4K
# so mip levels stay smooth on a full-screen globe; fine detail comes from the shader's streak noise.
set -euo pipefail
cd "$(dirname "$0")/../public/textures/planets"
B=https://www.solarsystemscope.com/textures/download
for p in uranus neptune; do
  [ -s "2k_$p.jpg" ] || curl -sSL -A "Mozilla/5.0" -o "2k_$p.jpg" "$B/2k_$p.jpg"
  [ -s "4k_$p.jpg" ] || node -e "require('sharp')('2k_$p.jpg').resize(4096, 2048, { kernel: 'lanczos3' }).sharpen({ sigma: 0.8 }).jpeg({ quality: 90 }).toFile('4k_$p.jpg').then(() => console.log('4k_$p.jpg'))"
done

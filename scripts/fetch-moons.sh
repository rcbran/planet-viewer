#!/usr/bin/env bash
# USGS Astrogeology global mosaics (public domain) -> public/textures/planets/moons/*.jpg
# Large S3 objects; use resume (-C -) and retry. Run in a foreground shell.
set -u
cd "$(dirname "$0")/.." && mkdir -p nasa-src/moons
B=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic
declare -A SRC=(
  [io]=Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif
  [europa]=Europa_Voyager_GalileoSSI_global_mosaic_500m.tif
  [ganymede]=Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif
  [callisto]=Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif
  [titan]=Titan_ISS_P19658_Mosaic_Global_4km.tif
  [enceladus]=Enceladus_Cassini_mosaic_global_110m.tif
  [rhea]=Rhea_Cassini_Voyager_mosaic_global_417m.tif
)
for n in "${!SRC[@]}"; do
  f="nasa-src/moons/$n.tif"
  for attempt in 1 2 3 4 5 6; do curl -sSL --retry 3 --retry-all-errors -C - -o "$f" "$B/${SRC[$n]}" && break; sleep 5; done
  printf "%-10s %s\n" "$n" "$(du -h "$f" | cut -f1)"
done
node scripts/convert-moons.mjs "${!SRC[@]}"

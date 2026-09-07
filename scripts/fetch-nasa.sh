#!/bin/bash
# Fetch NASA source imagery (public domain) for the production texture build.
# Blue Marble NG July 2004 topo+bathy, 86400x43200 as 8 tiles of 21600x21600
# Black Marble 2016, 54000x27000 as 8 tiles of 13500x13500 (+ 3km whole-earth)
# GEBCO 2008 elevation + bathymetry, 21600x10800
set -u
D="$HOME/git/planet-viewer/nasa-src"; mkdir -p "$D"; cd "$D"
LOG="$D/fetch.log"; exec >>"$LOG" 2>&1
echo "=== start $(date) ==="
B=https://eoimages.gsfc.nasa.gov/images/imagerecords
get() { local out="$1" url="$2"; if [ -s "$out" ]; then echo "have $out"; return; fi; curl -sSL -A Mozilla/5.0 --retry 3 -o "$out.part" "$url" && mv "$out.part" "$out" && echo "ok   $out $(du -h "$out" | cut -f1)" || echo "FAIL $out"; }
for t in A1 B1 C1 D1 A2 B2 C2 D2; do get "bluemarble_200407_$t.jpg" "$B/73000/73751/world.topo.bathy.200407.3x21600x21600.$t.jpg"; done
for t in A1 B1 C1 D1 A2 B2 C2 D2; do get "blackmarble_2016_$t.jpg" "$B/144000/144898/BlackMarble_2016_$t.jpg"; done
get blackmarble_2016_3km.jpg "$B/144000/144898/BlackMarble_2016_3km.jpg"
get gebco_elev_21600.png "$B/73000/73934/gebco_08_rev_elev_21600x10800.png"
get gebco_bath_21600.png "$B/73000/73963/gebco_08_rev_bath_21600x10800.png"
echo "=== done $(date) ==="; touch "$D/.complete"

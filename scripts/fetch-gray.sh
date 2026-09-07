#!/bin/bash
D="$HOME/git/planet-viewer/nasa-src"; cd "$D"; exec >>"$D/fetch.log" 2>&1
echo "=== gray tiles start $(date) ==="
B=https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144897
for t in A1 B1 C1 D1 A2 B2 C2 D2; do
  out="blackmarble_2016_gray_$t.jpg"; [ -s "$out" ] && { echo "have $out"; continue; }
  curl -sSL -A Mozilla/5.0 --retry 4 -o "$out.part" "$B/BlackMarble_2016_${t}_gray.jpg" && mv "$out.part" "$out" && echo "ok   $out $(du -h "$out" | cut -f1)" || echo "FAIL $out"
done
echo "=== gray tiles done $(date) ==="

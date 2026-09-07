#!/bin/bash
cd "$USERPROFILE/git/planet-viewer" || exit 1
exec npx vite --host 0.0.0.0 --port 5173 >> "$USERPROFILE/git/planet-viewer/.vite-dev.log" 2>&1 </dev/null

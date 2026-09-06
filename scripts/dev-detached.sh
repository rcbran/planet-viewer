#!/bin/bash
cd "$USERPROFILE/git/blue-marble" || exit 1
exec npx vite --host 0.0.0.0 --port 5173 >> "$USERPROFILE/git/blue-marble/.vite-dev.log" 2>&1 </dev/null

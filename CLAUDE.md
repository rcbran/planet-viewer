# Planet Viewer

git: agent-driven

Vite + TypeScript + Three.js with custom GLSL. `src/planets.ts` is the list of bodies; `src/main.ts` renders whichever one is selected; `src/space.ts` is the star background. Textures are generated, not committed: `npm run assets` runs the fetch/build scripts in `scripts/`.

On the Windows dev box start the dev server with `scripts/dev-detached.sh` (through `detach`) so ssh sessions can close. Screenshots for review are taken headlessly with Playwright and GPU flags; see the project notes.

# blue-marble

git: agent-driven

Photoreal rotating Earth landing page. The globe fills ~2/3 of the viewport, lit from the left with a physically plausible terminator; the night side shows city lights and coastline outlines only (SpaceX docking-sim look). A Tweakpane panel on the right exposes rotation speed, sun angle, cloud mode/density/drift, weather, atmosphere, exposure, and quality.

Stack: Vite + TypeScript + Three.js (custom ShaderMaterials) + Tweakpane. No React.
Runs on gengar (RTX 4080). Dev server: `npm run dev -- --host` then open http://gengar:5173 from the tailnet.

Textures: public/textures/<res>/ . Bootstrap set is Solar System Scope 8K (CC BY 4.0). Production set is built from NASA Blue Marble NG + Black Marble (public domain) by scripts/build-textures.*; never commit >20 MB binaries, use Git LFS or generate.

Git: this repo is fully agent-driven. Commit early and often with clear messages, push to origin main, open PRs for large features when useful. Do not ask RC to perform git actions.

# Blue Marble

A photoreal, real-time Earth for the browser. Lit from the left with a physically plausible terminator; the night side shows city lights and moonlit coastlines. A control panel exposes rotation, sun position, clouds and weather, atmosphere, ocean, and quality.

**Stack:** Vite · TypeScript · Three.js (custom GLSL) · Tweakpane. No framework.

## Run

```sh
npm install
bash scripts/fetch-textures.sh        # bootstrap 8K textures (Solar System Scope, CC BY 4.0)
npm run dev -- --host                 # http://localhost:5173
```

URL params for automation: `?clouds=satellite|live`, `?set=NASA%208K|NASA%2016K`. `window.bm` exposes params and actions.

## Production textures (NASA, public domain)

```sh
bash scripts/fetch-nasa.sh && bash scripts/fetch-gray.sh   # ~1 GB of source tiles
node scripts/build-textures.mjs 8k
node scripts/build-textures.mjs 16k
```

Builds `public/textures/{8k,16k}/{day,night,normal,specular}.jpg` from:

- **Blue Marble Next Generation**, July 2004, topography + bathymetry, 86400×43200 as 8 tiles (day map)
- **Black Marble 2016**, grayscale, 500 m, 8 tiles (city lights; colorized in-shader)
- **GEBCO 2008** elevation (normal map) and bathymetry (water mask)

Sources are the largest equirectangular products NASA publishes; each tile is downsampled independently so the full-resolution mosaic never has to exist in memory.

## Cloud modes

- **Satellite (static):** NASA-derived 8K cloud map.
- **Procedural:** domain-warped fBm on the sphere with latitude bands; coverage, density, softness, scale, drift, and weather presets (Clear / Scattered / Overcast / Storm) all live.
- **Live:** stitched from NASA GIBS VIIRS true-color tiles for the latest complete day (50 tiles, no API key), reduced to a cloud-coverage mask in the browser.

## Storms

`scripts/make-storm-atlas.mjs` turns NASA Worldview snapshots of real cyclones (Irma 2017, Florence 2018, Dorian 2019, Mawar 2023; VIIRS true color) into cloud-mask decals. The cloud shader projects up to four of them onto the sphere, spins them (counter-clockwise north of the equator), darkens their cores, and fires sparse lightning inside them. The Storm preset enables all four; sizes are deliberately 2–3x real.

## Rendering notes

- Terminator: `smoothstep` on N·L with a warm twilight band; night side = Black Marble radiance + faint moonlight with oceans a shade brighter than land so coastlines read.
- Atmosphere: back-face shell with exponential density by the view ray's altitude above the limb, sun-colored with an orange twilight rim.
- Ocean: Blinn-Phong sun glint masked by water, Fresnel-weighted.
- Cloud relief: density is evaluated a second time a small step toward the sun along the surface; the slope lights the sun-facing side of every cloud mass.
- Drag to rotate with inertia; auto-spin resumes on release.
- Selective bloom (threshold ~0.85) lifts city lights and glint; ACES tone mapping via OutputPass.

## Credits

NASA Earth Observatory (Blue Marble, Black Marble, GEBCO products) — public domain. Solar System Scope textures — CC BY 4.0. NASA GIBS imagery services.

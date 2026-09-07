# Blue Marble

A photoreal, real-time solar system for the browser: Mercury, Venus, Earth, Mars, Jupiter, and Saturn with prev/next navigation, plus their major moons as clickable mini globes that open a full view. Earth is the showcase. Lit from the left with a physically plausible terminator; the night side shows city lights and moonlit coastlines. A control panel exposes rotation, sun position, clouds and weather, atmosphere, ocean, and quality.

**Stack:** Vite · TypeScript · Three.js (custom GLSL) · Tweakpane. No framework.

## Bodies

`src/planets.ts` is the registry. Each body declares its textures, spin, tilt, exposure, an optional atmosphere (colors, intensity, scale height, shell radius), a cloud model (`earth` = translucent satellite clouds with weather; `venus` = opaque deck that can be hidden), optional rings, gas-giant band flow, and a moon list. One shader family renders all of them; the panel shows only controls that apply to the current body.

- **Mercury** — SSS 8K, airless.
- **Venus** — Magellan-derived surface under an opaque cloud deck with slow retrograde super-rotation; toggle the deck off to see the surface.
- **Earth** — see below.
- **Mars** — thin ochre atmosphere with a blue-shifted twilight.
- **Jupiter, Saturn** — zonal band flow animates the cloud tops; Saturn's rings are a radially mapped strip with the planet's shadow across them and the rings' shadow across the globe.
- **Moons** — USGS Astrogeology global mosaics (public domain) reduced to 4K: Moon (SSS), Io, Europa, Ganymede, Callisto, Titan, Enceladus, Rhea. Click a mini to focus it; Escape or the back button returns.

`?body=<id>` deep-links a body. Arrow keys step between planets.

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
- **Dynamic (default):** the satellite map is the structure; weather reshapes it. Coverage shifts the density curve (0.55 reproduces the map exactly), softness lets noise erode edges, overcast adds broad sheets that still carry satellite texture, and a slow domain warp keeps it evolving. Presets: Clear / Scattered / Overcast / Storm.
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

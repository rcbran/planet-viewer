# Planet Viewer

A 3D experiment: the Sun and the first six planets, rendered live in the browser from real NASA and USGS imagery. Click and drag to spin a planet, use the arrows to move between bodies, and use the panel on the right to change the lighting, clouds, weather, and atmosphere. It runs at 60 fps on a modern GPU.

Everything you see is built from public-domain science data rather than artwork. Earth uses NASA's Blue Marble and Black Marble imagery at up to 16K, with real cloud cover that can be replaced by yesterday's actual weather from NASA's satellites. The Sun is this morning's Solar Dynamics Observatory frame wrapped onto a sphere, with its real sunspots and prominences. The other planets and Saturn's rings come from NASA and USGS global maps, and the star field behind them is NASA's Deep Star Maps with the brightest stars placed from the Gaia catalog. Small scripts fetch each source and turn it into web-sized textures; the rendering is custom shaders on top of Three.js.

## Run it

```sh
npm install
npm run assets     # downloads and builds every texture (~3 GB of source imagery, several minutes)
npm run dev
```

Open http://localhost:5173. `?body=mars` opens a specific body.

## Credits

NASA Earth Observatory, NASA GIBS, NASA SDO, NASA SVS, and USGS Astrogeology for the imagery (public domain). Solar System Scope for the bootstrap planet textures (CC BY 4.0). Gaia DR2 (ESA/Gaia/DPAC) for star positions. Code is MIT licensed.

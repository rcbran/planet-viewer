// Finds sunspots in the equirectangular photosphere map and writes public/textures/sun/spots.json
// as [{ lat, lon, strength }] for the loop system (src/sunloops.ts).
// Usage: node scripts/find-sunspots.mjs [input.jpg] [output.json]
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] ?? resolve(root, "public/textures/sun/photosphere.jpg");
const output = process.argv[3] ?? resolve(root, "public/textures/sun/spots.json");

const W = 1024, H = 512;
const { data } = await sharp(input, { limitInputPixels: false })
  .resize(W, H, { fit: "fill", kernel: "lanczos3" })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Reference brightness: median of the mid-latitude band (avoids polar projection artefacts).
const band = [];
for (let y = Math.floor(H * 0.15); y < Math.floor(H * 0.85); y += 3)
  for (let x = 0; x < W; x += 3) band.push(data[y * W + x]);
band.sort((a, b) => a - b);
const median = band[band.length >> 1];
const thr = median * 0.66; // umbra + most of the penumbra
const N = W * H;
const mask = new Uint8Array(N);
for (let i = 0; i < N; i++) mask[i] = data[i] < thr ? 1 : 0;

// Connected components (8-neighbour) with longitude wrap.
const label = new Int32Array(N).fill(-1);
const blobs = [];
const stack = new Int32Array(N);
for (let start = 0; start < N; start++) {
  if (!mask[start] || label[start] >= 0) continue;
  const id = blobs.length;
  let sp = 0; stack[sp++] = start; label[start] = id;
  let area = 0, sx = 0, sy = 0, sw = 0, dark = 0;
  const x0 = start % W;
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % W, y = (i - x) / W;
    const w = (thr - data[i]) / thr + 0.05; // darker pixels weigh more in the centroid
    area++; sw += w; sy += y * w; dark += (median - data[i]) / median;
    // unwrap x relative to the seed so blobs straddling the seam get a sane centroid
    let dx = x - x0; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
    sx += (x0 + dx) * w;
    for (let oy = -1; oy <= 1; oy++) {
      const ny = y + oy; if (ny < 0 || ny >= H) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const nx = (x + ox + W) % W;
        const j = ny * W + nx;
        if (mask[j] && label[j] < 0) { label[j] = id; stack[sp++] = j; }
      }
    }
  }
  const cx = ((sx / sw) % W + W) % W, cy = sy / sw;
  blobs.push({ cx, cy, area, dark: dark / area });
}

const toDeg = (b) => ({ lon: (b.cx / W) * 360 - 180, lat: 90 - (b.cy / H) * 180 });
const MIN_AREA = 5; // px at 1024x512 (~0.35 deg^2 at the equator)
let cands = blobs
  .filter((b) => b.area >= MIN_AREA)
  .map((b) => ({ ...toDeg(b), area: b.area, dark: b.dark }))
  .filter((b) => Math.abs(b.lat) <= 70);

// Merge spots that belong to the same active region (within ~4 deg great-circle distance).
function gc(a, b) {
  const r = Math.PI / 180;
  const s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(s)) / r;
}
cands.sort((a, b) => b.area - a.area);
const merged = [];
for (const c of cands) {
  const host = merged.find((m) => gc(m, c) < 4);
  if (host) {
    const t = host.area + c.area;
    // weighted mean of positions (short arcs, planar approximation is fine)
    let dlon = c.lon - host.lon; if (dlon > 180) dlon -= 360; else if (dlon < -180) dlon += 360;
    host.lon += dlon * (c.area / t); host.lat += (c.lat - host.lat) * (c.area / t);
    host.area = t; host.dark = Math.max(host.dark, c.dark);
  } else merged.push({ ...c });
}
// area on the sphere: compensate for equirect stretching so high-latitude blobs are not inflated
for (const m of merged) m.sph = m.area * Math.cos((m.lat * Math.PI) / 180);
const maxA = Math.max(...merged.map((m) => m.sph), 1);
const spots = merged
  .map((m) => ({
    lat: +m.lat.toFixed(2),
    lon: +(((m.lon + 180) % 360 + 360) % 360 - 180).toFixed(2),
    strength: +Math.min(1, Math.pow(m.sph / maxA, 0.5) * (0.7 + 0.3 * Math.min(1, m.dark * 2))).toFixed(3),
  }))
  .sort((a, b) => b.strength - a.strength);

writeFileSync(output, JSON.stringify(spots, null, 1) + "\n");
console.log(`median ${median}, threshold ${thr.toFixed(1)}, raw blobs ${blobs.length}, candidates ${cands.length}, spots ${spots.length}`);
for (const s of spots) console.log(`  lat ${s.lat.toString().padStart(7)}  lon ${s.lon.toString().padStart(8)}  strength ${s.strength}`);
console.log(`wrote ${output}`);

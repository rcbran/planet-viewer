// Build the space assets from the NASA SVS "Deep Star Maps 2020" EXRs (public domain).
//   node scripts/build-space.mjs stars   -> public/textures/space/stars.bin   (from hiptyc_2020_8k.exr)
//   node scripts/build-space.mjs cube    -> public/textures/space/sky_{px,nx,py,ny,pz,nz}.<fmt> (from <sky>_2020_16k.exr)
// Options: --sky=starmap|milkyway  --size=4096  --gain=8  --fmt=jpg|png|webp  --keep=40000
// Inputs are raw planar float32 (gbrpf32le) dumps produced by ffmpeg in scripts/fetch-space.sh.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "nasa-src", "space");
const OUT = path.join(ROOT, "public", "textures", "space");
fs.mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const cmd = process.argv[2];

// Read an ffmpeg gbrpf32le dump as three Float32 planes (returned in r,g,b order).
function readPlanes(file, W, H) {
  const N = W * H, fd = fs.openSync(file, "r"), planes = [];
  for (let p = 0; p < 3; p++) {
    const ab = new ArrayBuffer(N * 4), u8 = new Uint8Array(ab);
    let off = 0;
    while (off < N * 4) off += fs.readSync(fd, u8, off, Math.min(1 << 30, N * 4 - off), p * N * 4 + off);
    planes.push(new Float32Array(ab));
  }
  fs.closeSync(fd);
  const [g, b, r] = planes;
  return { r, g, b };
}

// SVS celestial maps: plate carree, centred on RA 0h, RA increasing to the LEFT, Dec +90 at the top.
// "Sky space" used by src/space.ts: x = cos(dec)cos(ra), y = sin(dec) (celestial north), z = -cos(dec)sin(ra).
function skyDir(ra, dec) { const c = Math.cos(dec); return [c * Math.cos(ra), Math.sin(dec), -c * Math.sin(ra)]; }

// ---------------------------------------------------------------- stars
function buildStars() {
  const W = 8192, H = 4096, N = W * H;
  const { r, g, b } = readPlanes(path.join(SRC, "hiptyc_8k.f32"), W, H);
  const thr = Number(args.thr ?? 0.012), keep = Number(args.keep ?? 40000);
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = 0.2126 * r[i] + 0.7152 * g[i] + 0.0722 * b[i];
  const label = new Uint8Array(N); // 0 = unvisited
  const stack = new Int32Array(1 << 22);
  const comps = []; // [flux, ra, dec, cr, cg, cb]
  const cosRow = new Float32Array(H);
  for (let y = 0; y < H; y++) cosRow[y] = Math.cos(((y + 0.5) / H - 0.5) * Math.PI);
  for (let seed = 0; seed < N; seed++) {
    if (label[seed] || lum[seed] < thr) continue;
    let sp = 0; stack[sp++] = seed; label[seed] = 1;
    const sx = seed % W;
    let flux = 0, sxw = 0, syw = 0, cr = 0, cg = 0, cb = 0, n = 0;
    while (sp > 0) {
      const i = stack[--sp], x = i % W, y = (i - x) / W;
      const w = lum[i] * cosRow[y];
      flux += w;
      let dx = x - sx; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; // seam-safe centroid
      sxw += w * dx; syw += w * y; n++;
      if (lum[i] < 0.9) { cr += r[i]; cg += g[i]; cb += b[i]; } // unsaturated wings carry the colour
      const nb = [i - 1, i + 1, i - W, i + W];
      for (const j of nb) {
        if (j < 0 || j >= N || label[j] || lum[j] < thr) continue;
        if (Math.abs((j % W) - x) > 1 && j !== i - W && j !== i + W) continue; // no wrap across rows
        label[j] = 1; if (sp < stack.length) stack[sp++] = j;
      }
    }
    const cx = sx + sxw / flux + 0.5, cy = syw / flux + 0.5;
    const ra = ((0.5 - cx / W) * 2 * Math.PI + 4 * Math.PI) % (2 * Math.PI);
    const dec = (0.5 - cy / H) * Math.PI;
    const m = Math.max(cr, cg, cb, 1e-6);
    comps.push([flux, ra, dec, cr / m, cg / m, cb / m, n]);
  }
  comps.sort((a, b) => b[0] - a[0]);
  const top = comps.slice(0, keep);
  console.log(`components: ${comps.length}, keeping ${top.length}`);
  // The SVS renderer saturates at 1.0, so integrated flux under-ranks the very brightest stars. Pin the 21
  // brightest to their catalogue V magnitudes (matched by position); the rest get a rank-based magnitude,
  // N(<m) ~= 15 * 10^((m-1)/2), which fits the real bright-star counts within ~10% from m=0..8 and joins
  // the table continuously (rank 22 -> 1.33, Regulus is 1.36).
  const BRIGHT = [ // [ra deg, dec deg, V]
    [101.287, -16.716, -1.46], [95.988, -52.696, -0.74], [219.902, -60.834, -0.27], [213.915, 19.182, -0.05],
    [279.235, 38.784, 0.03], [79.172, 45.998, 0.08], [78.634, -8.202, 0.13], [114.826, 5.225, 0.34],
    [24.429, -57.237, 0.46], [88.793, 7.407, 0.50], [210.956, -60.373, 0.61], [297.696, 8.868, 0.76],
    [186.650, -63.099, 0.76], [68.980, 16.509, 0.86], [247.352, -26.432, 0.96], [201.298, -11.161, 0.97],
    [116.329, 28.026, 1.14], [344.413, -29.622, 1.16], [310.358, 45.280, 1.25], [191.930, -59.689, 1.25],
    [152.093, 11.967, 1.36],
  ];
  const pinned = new Map();
  for (const [raD, decD, V] of BRIGHT) {
    let best = -1, bd = 0.3 * Math.PI / 180;
    for (let k = 0; k < 200; k++) {
      const c = top[k], dra = Math.abs(((c[1] - raD * Math.PI / 180 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * Math.cos(c[2]);
      const d = Math.hypot(dra, c[2] - decD * Math.PI / 180);
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) pinned.set(best, V); else console.warn("bright star not matched", raD, decD, V);
  }
  const out = new Float32Array(top.length * 7);
  top.forEach((c, k) => {
    const mag = pinned.has(k) ? pinned.get(k) : Math.max(1.33, 1 + 2 * Math.log10((k + 1) / 15));
    const d = skyDir(c[1], c[2]);
    out.set([d[0], d[1], d[2], mag, c[3], c[4], c[5]], k * 7);
  });
  fs.writeFileSync(path.join(OUT, "stars.bin"), Buffer.from(out.buffer));
  console.log("wrote stars.bin", out.byteLength, "bytes");
  const deg = (v) => (v * 180 / Math.PI).toFixed(2);
  top.slice(0, 12).forEach((c, k) => console.log(k + 1, `ra ${deg(c[1])} dec ${deg(c[2])} flux ${c[0].toFixed(1)} px ${c[6]} rgb ${c.slice(3, 6).map((v) => v.toFixed(2)).join(",")}`));
}

// ---------------------------------------------------------------- cube faces
function buildCube() {
  const W = 16384, H = 8192;
  const sky = args.sky ?? "starmap";
  const size = Number(args.size ?? 4096), gain = Number(args.gain ?? 8), fmt = args.fmt ?? "jpg";
  const { r, g, b } = readPlanes(path.join(SRC, `${sky}_16k.f32`), W, H);
  // sRGB encode LUT on [0,1] -> 0..255
  const LUT = new Uint8Array(4097);
  for (let i = 0; i <= 4096; i++) { const l = i / 4096; const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; LUT[i] = Math.round(s * 255); }
  const enc = (v) => LUT[Math.min(4096, Math.round((1 - Math.exp(-v * gain)) * 4096))];
  const faces = ["px", "nx", "py", "ny", "pz", "nz"];
  // WebGL cube-map convention (flipY=false): image row 0 = t=0.
  const dirOf = (f, sc, tc) => {
    switch (f) {
      case 0: return [1, -tc, -sc];
      case 1: return [-1, -tc, sc];
      case 2: return [sc, 1, tc];
      case 3: return [sc, -1, -tc];
      case 4: return [sc, -tc, 1];
      default: return [-sc, -tc, -1];
    }
  };
  const ss = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  const dTheta = (Math.PI / 2) / size;
  const acc = new Float32Array(3);
  for (let f = 0; f < 6; f++) {
    const t0 = Date.now();
    const buf = new Uint8Array(size * size * 3);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        acc[0] = acc[1] = acc[2] = 0; let wsum = 0;
        for (const [ox, oy] of ss) {
          const sc = ((i + 0.5 + ox) / size) * 2 - 1, tc = ((j + 0.5 + oy) / size) * 2 - 1;
          const d = dirOf(f, sc, tc);
          const len = Math.hypot(d[0], d[1], d[2]);
          const x = d[0] / len, y = d[1] / len, z = d[2] / len;
          const dec = Math.asin(y), ra = Math.atan2(-z, x);
          const cosd = Math.max(Math.cos(dec), 1e-4);
          // extra horizontal taps where the equirect is oversampled (towards the poles)
          const nh = Math.min(12, Math.max(1, Math.round(dTheta * (W / (2 * Math.PI)) / cosd)));
          const v = (0.5 - dec / Math.PI) * H - 0.5;
          const y0 = Math.max(0, Math.min(H - 2, Math.floor(v))), fy = Math.max(0, Math.min(1, v - y0));
          for (let k = 0; k < nh; k++) {
            const du = nh > 1 ? ((k + 0.5) / nh - 0.5) * dTheta / cosd : 0;
            let u = (0.5 - (ra + du) / (2 * Math.PI)) * W - 0.5;
            u = ((u % W) + W) % W;
            const x0 = Math.floor(u), fx = u - x0, x1 = (x0 + 1) % W;
            const i00 = y0 * W + x0, i01 = y0 * W + x1, i10 = i00 + W, i11 = i01 + W;
            const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
            acc[0] += r[i00] * w00 + r[i01] * w01 + r[i10] * w10 + r[i11] * w11;
            acc[1] += g[i00] * w00 + g[i01] * w01 + g[i10] * w10 + g[i11] * w11;
            acc[2] += b[i00] * w00 + b[i01] * w01 + b[i10] * w10 + b[i11] * w11;
            wsum += 1;
          }
        }
        const o = (j * size + i) * 3;
        buf[o] = enc(acc[0] / wsum); buf[o + 1] = enc(acc[1] / wsum); buf[o + 2] = enc(acc[2] / wsum);
      }
    }
    const img = sharp(Buffer.from(buf.buffer), { raw: { width: size, height: size, channels: 3 } });
    const file = path.join(OUT, `sky_${faces[f]}.${fmt}`);
    const p = fmt === "png" ? img.png({ compressionLevel: 8 }).toFile(file)
      : fmt === "webp" ? img.webp({ quality: Number(args.q ?? 92), effort: 4, smartSubsample: true }).toFile(file)
      : img.jpeg({ quality: Number(args.q ?? 94), chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(file);
    p.then((info) => console.log(`${faces[f]}: ${(info.size / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s`));
  }
}

if (cmd === "stars") buildStars();
else if (cmd === "cube") buildCube();
else { console.error("usage: build-space.mjs stars|cube [--sky=starmap|milkyway] [--size=4096] [--gain=8] [--fmt=jpg|png|webp]"); process.exit(1); }

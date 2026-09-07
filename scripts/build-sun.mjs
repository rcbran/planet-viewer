// Build Sun textures from NASA SDO / SVS imagery (public domain) in nasa-src/sun/.
//  photosphere.jpg   4096x2048 equirect: HMI continuum (limb-darkening removed) disk reprojected onto the
//                    front hemisphere, a second date's disk mirrored onto the back, blended at the seams
//  chromosphere.jpg  4096x2048 equirect: SVS 3851 AIA 304 full-sphere frame
//  limb304.png       2048x256 polar unwrap of the AIA 304 limb (angle x radius, r = 1.0..1.3 R) -> prominences
//  limb171.png       2048x256 polar unwrap of the AIA 171 limb (r = 1.0..1.4 R) -> corona loops
import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
sharp.cache(false);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "nasa-src/sun"), OUT = resolve(ROOT, "public/textures/sun");
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC);
const pick = (re) => { const f = files.filter((n) => re.test(n)).sort(); if (!f.length) throw new Error("missing " + re); return resolve(SRC, f[f.length - 1]); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function loadDisk(file, fixed) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  // disk geometry: the limb is where brightness along a spoke drops below 35% of the inner-disk median.
  // Coronal/chromospheric glow beyond the limb is far dimmer than the disk, so this ignores it.
  const lum = (x, y) => { const o = ((y | 0) * W + (x | 0)) * 3; return (data[o] + data[o + 1] + data[o + 2]) / 3; };
  const cx0 = W / 2, cy0 = H / 2;
  const inner = []; for (let r = 0; r < 600; r += 20) for (let a = 0; a < 8; a++) inner.push(lum(cx0 + r * Math.cos(a * 0.785), cy0 + r * Math.sin(a * 0.785)));
  inner.sort((a, b) => a - b); const med = inner[inner.length >> 1]; const cut = med * 0.35;
  const spokes = 32, radii = [];
  for (let a = 0; a < spokes; a++) {
    const ang = (a / spokes) * 2 * Math.PI; let r = 300;
    while (r < Math.min(W, H) / 2 - 2 && lum(cx0 + r * Math.cos(ang), cy0 + r * Math.sin(ang)) > cut) r++;
    radii.push({ ang, r });
  }
  // centre = mean of opposite spoke pairs, R = mean radius
  let sx = 0, sy = 0; for (const { ang, r } of radii) { sx += r * Math.cos(ang); sy += r * Math.sin(ang); }
  let cxr = cx0 + sx / spokes, cyr = cy0 + sy / spokes;
  let R = radii.reduce((acc, q) => acc + q.r, 0) / spokes;
  // AIA frames: the chromosphere/corona confuse any brightness-based limb finder; use the plate scale
  // (0.6 arcsec/px, R_sun ~ 960 arcsec => ~1600 px) with the disk centred in the 4096 frame.
  if (fixed) { cxr = W / 2; cyr = H / 2; R = fixed; }   // 0/undefined = brightness-based detection (fine for HMI)
  log(`  ${file.split(/[\\/]/).pop()}: ${W}x${H} disk centre (${cxr.toFixed(0)},${cyr.toFixed(0)}) R=${R.toFixed(0)}`);
  const sample = (px, py, out) => { // bilinear
    const x = Math.max(0, Math.min(W - 2, px)), y = Math.max(0, Math.min(H - 2, py));
    const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
    for (let c = 0; c < 3; c++) {
      const a = data[(iy * W + ix) * 3 + c], b = data[(iy * W + ix + 1) * 3 + c], cc = data[((iy + 1) * W + ix) * 3 + c], d = data[((iy + 1) * W + ix + 1) * 3 + c];
      out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
    }
  };
  return { W, H, cx: cxr, cy: cyr, R, sample };
}


// Reproject several full-disk images onto one equirectangular map. Each disk covers the longitude
// band that faced Earth when it was taken (centre longitude = its age in days * 360/27.27, west-
// ward), weighted by a raised cosine so bands cross-fade. Sampling near each disk's centre keeps
// limb foreshortening out of the map; with 4 disks a quarter rotation apart there is no mirroring.
async function multiDisk(disks, W, H, channels) {   // disks: [{ file, fixedR, ageDays }]
  const D = [];
  for (const d of disks) D.push({ disk: await loadDisk(d.file, d.fixedR), lon0: -(d.ageDays / 27.27) * 2 * Math.PI });
  const out = Buffer.alloc(W * H * 3); const tmp = [0, 0, 0];
  const FADE = 0.55;   // rad: half-width of the blend region around the +-90 deg edges
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - y / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * 2 * Math.PI - Math.PI / 2;   // three: u=0.25 faces the camera
      let acc = [0, 0, 0], wsum = 0;
      for (const { disk, lon0 } of D) {
        let rel = lon - lon0; rel = Math.atan2(Math.sin(rel), Math.cos(rel));   // -pi..pi
        const pz = cl * Math.cos(rel); if (pz <= 0.02) continue;
        // weight: 1 near the disk centre, raised-cosine to 0 by |rel| = pi/2 + FADE
        const a = Math.abs(rel), lim = Math.PI / 2 + FADE;
        if (a >= lim) continue;
        const w = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, a / lim)) * 1.0;
        const px = cl * Math.sin(rel);
        disk.sample(disk.cx + disk.R * 0.985 * px, disk.cy - disk.R * 0.985 * sl, tmp);
        acc[0] += tmp[0] * w; acc[1] += tmp[1] * w; acc[2] += tmp[2] * w; wsum += w;
      }
      const o = (y * W + x) * 3;
      if (wsum > 0) { out[o] = acc[0] / wsum; out[o + 1] = acc[1] / wsum; out[o + 2] = acc[2] / wsum; }
    }
  }
  return out;
}
function manifest() { // written by scripts/fetch-sun.sh: [{ "age": 0, "hmiif": "...", "aia304": "...", "aia171": "..." }, ...]
  const f = resolve(SRC, "dates.json");
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8"));
}

async function photosphere() {
  const man = manifest();
  if (man) {
    const out = await multiDisk(man.map((m) => ({ file: resolve(SRC, m.hmiif), fixedR: 0, ageDays: m.age })), 4096, 2048, 3);
    await sharp(out, { raw: { width: 4096, height: 2048, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(resolve(OUT, "photosphere.jpg"));
    log("  photosphere.jpg (multi-disk)"); return;
  }
  const A = await loadDisk(pick(/hmiif.*20241003.*\.jpg$/i)), B = await loadDisk(pick(/hmiif.*latest.*\.jpg$/i));
  const W = 4096, H = 2048, out = Buffer.alloc(W * H * 3); const pa = [0, 0, 0], pb = [0, 0, 0];
  const edge = 0.985; // stay inside the limb to avoid the black ring
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - y / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      // three's SphereGeometry puts u=0.25 on +z (toward the camera); centre the front disk there
      const lon = (x / W) * 2 * Math.PI - Math.PI / 2;  // 0 at u=0.25
      const px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon); // z>0 faces disk A
      // front: orthographic onto disk A ; back: mirrored onto disk B
      const wA = Math.max(0, Math.min(1, (pz + 0.18) / 0.36));  // blend band around the terminator (lon = +-90)
      const ax = A.cx + A.R * edge * px, ay = A.cy - A.R * edge * py;
      const bx = B.cx + B.R * edge * (-px), by = B.cy - B.R * edge * py;
      A.sample(ax, ay, pa); B.sample(bx, by, pb);
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = pa[c] * wA + pb[c] * (1 - wA);
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(resolve(OUT, "photosphere.jpg"));
  log("  photosphere.jpg");
}

// ultraviolet surface: R = AIA 304 luminance, G = AIA 171 luminance (front hemisphere from the disk,
// back hemisphere mirrored), so the shader can grade 304 as the red base and 171 as the gold regions
async function uvSurface() {
  const man = manifest();
  if (man) {
    const W = 4096, H = 2048;
    const r = await multiDisk(man.map((m) => ({ file: resolve(SRC, m.aia304), fixedR: 1600, ageDays: m.age })), W, H, 3);
    const g = await multiDisk(man.map((m) => ({ file: resolve(SRC, m.aia171), fixedR: 1600, ageDays: m.age })), W, H, 3);
    const out = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) { const o = i * 3; out[o] = r[o] * 0.45 + r[o + 1] * 0.4 + r[o + 2] * 0.15; out[o + 1] = g[o] * 0.4 + g[o + 1] * 0.4 + g[o + 2] * 0.2; out[o + 2] = 0; }
    await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(resolve(OUT, "uvsurface.jpg"));
    log("  uvsurface.jpg (multi-disk)"); return;
  }
  const A = await loadDisk(pick(/aia304.*\.jpg$/i), 1600), B = await loadDisk(pick(/aia171.*\.jpg$/i), 1600);
  const W = 4096, H = 2048, out = Buffer.alloc(W * H * 3);
  const pa = [0, 0, 0], pa2 = [0, 0, 0], pb = [0, 0, 0], pb2 = [0, 0, 0];
  const edge = 0.985;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - y / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * 2 * Math.PI - Math.PI / 2;
      const px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
      // front: direct projection; back: the same disk mirrored; cross-fade across the terminator band
      const wA = Math.max(0, Math.min(1, (pz + 0.18) / 0.36));
      A.sample(A.cx + A.R * edge * px, A.cy - A.R * edge * py, pa);   A.sample(A.cx - A.R * edge * px, A.cy - A.R * edge * py, pa2);
      B.sample(B.cx + B.R * edge * px, B.cy - B.R * edge * py, pb);   B.sample(B.cx - B.R * edge * px, B.cy - B.R * edge * py, pb2);
      const lum = (c) => c[0] * 0.45 + c[1] * 0.4 + c[2] * 0.15;
      const l304 = lum(pa) * wA + lum(pa2) * (1 - wA), l171 = lum(pb) * wA + lum(pb2) * (1 - wA);
      const o = (y * W + x) * 3;
      out[o] = l304; out[o + 1] = l171; out[o + 2] = 0;
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(resolve(OUT, "uvsurface.jpg"));
  log("  uvsurface.jpg");
}

async function limbStrip(file, outName, rMax, gain) {
  const D = await loadDisk(file, 1600);
  const W = 2048, H = 256, out = Buffer.alloc(W * H * 4); const p = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    const r = 1.0 + (y / (H - 1)) * (rMax - 1.0);
    for (let x = 0; x < W; x++) {
      const a = (x / W) * 2 * Math.PI;
      const sx = D.cx + D.R * r * Math.cos(a), sy = D.cy - D.R * r * Math.sin(a);
      D.sample(sx, sy, p);
      const o = (y * W + x) * 4;
      // SDO stamps captions in the top/bottom 150 px bands and outside the frame is clamped: zero those
      const valid = sx >= 4 && sx <= D.W - 5 && sy >= 150 && sy <= D.H - 150 ? 1 : 0;
      const l = valid * (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11) / 255;
      out[o] = Math.min(255, p[0] * gain); out[o + 1] = Math.min(255, p[1] * gain); out[o + 2] = Math.min(255, p[2] * gain);
      out[o + 3] = Math.min(255, Math.pow(Math.max(0, l - 0.03) / 0.5, 0.8) * 255);
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(resolve(OUT, outName));
  log(`  ${outName}`);
}

async function chromosphere() {
  const f = pick(/svs3851.*\.(tif|tiff|jpg)$/i);
  await sharp(f, { limitInputPixels: false }).resize(4096, 2048).jpeg({ quality: 90 }).toFile(resolve(OUT, "chromosphere.jpg"));
  log("  chromosphere.jpg from " + f.split(/[\\/]/).pop());
}

log("sun assets:", files.join(", "));
if (!existsSync(resolve(OUT, "photosphere.jpg"))) await photosphere();
if (!existsSync(resolve(OUT, "chromosphere.jpg"))) await chromosphere();
if (!existsSync(resolve(OUT, "uvsurface.jpg"))) await uvSurface();
if (!existsSync(resolve(OUT, "limb304.png"))) await limbStrip(pick(/aia304.*\.jpg$/i), "limb304.png", 1.27, 1.6);
if (!existsSync(resolve(OUT, "limb171.png"))) await limbStrip(pick(/aia171.*\.jpg$/i), "limb171.png", 1.27, 1.4);
log("done");

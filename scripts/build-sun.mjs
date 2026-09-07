// Build Sun textures from NASA SDO / SVS imagery (public domain) in nasa-src/sun/.
//  photosphere.jpg   4096x2048 equirect: HMI continuum (limb-darkening removed) disk reprojected onto the
//                    front hemisphere, a second date's disk mirrored onto the back, blended at the seams
//  chromosphere.jpg  4096x2048 equirect: SVS 3851 AIA 304 full-sphere frame
//  limb304.png       2048x256 polar unwrap of the AIA 304 limb (angle x radius, r = 1.0..1.3 R) -> prominences
//  limb171.png       2048x256 polar unwrap of the AIA 171 limb (r = 1.0..1.4 R) -> corona loops
import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync } from "node:fs";
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
  if (fixed) { cxr = W / 2; cyr = H / 2; R = fixed; }
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

async function photosphere() {
  const A = await loadDisk(pick(/hmiif.*20241003.*\.jpg$/i)), B = await loadDisk(pick(/hmiif.*latest.*\.jpg$/i));
  const W = 4096, H = 2048, out = Buffer.alloc(W * H * 3); const pa = [0, 0, 0], pb = [0, 0, 0];
  const edge = 0.985; // stay inside the limb to avoid the black ring
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - y / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * 2 * Math.PI - Math.PI;   // -pi..pi, 0 = centre of front disk
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
if (!existsSync(resolve(OUT, "limb304.png"))) await limbStrip(pick(/aia304.*\.jpg$/i), "limb304.png", 1.27, 1.6);
if (!existsSync(resolve(OUT, "limb171.png"))) await limbStrip(pick(/aia171.*\.jpg$/i), "limb171.png", 1.27, 1.4);
log("done");

// DEM GeoTIFF (int16, uncompressed, strips or tiles) -> tangent-space normal map 8192x4096
// sharp/libvips collapses signed-16 to 8-bit sRGB in its pipeline, so decode + resample are done here in Float32.
import sharp from "sharp";
import { openSync, readSync, closeSync, statSync } from "node:fs";

const [,, body, srcPath] = process.argv;
const W = 8192, H = 4096;
const ROOT = "C:/Users/dev/git/planet-viewer";
const OUT = `${ROOT}/public/textures/planets/8k_${body}_normal.jpg`;
const PREVIEW = `${ROOT}/shots/preview/normal-${body}.jpg`;
const TARGET_NZ = Number(process.env.TARGET_NZ ?? 0.2), PCT = 0.995, COS_CLAMP = 0.15;
const big = { limitInputPixels: false };
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------- minimal classic-TIFF reader ----------
const fd = openSync(srcPath, "r");
const rd = (pos, len) => { const b = Buffer.alloc(len); let got = 0; while (got < len) { const n = readSync(fd, b, got, len - got, pos + got); if (!n) throw new Error("short read"); got += n; } return b; };
const hdr = rd(0, 8);
if (hdr.toString("latin1", 0, 2) !== "II" || hdr.readUInt16LE(2) !== 42) throw new Error("expected little-endian classic TIFF");
const ifdOff = hdr.readUInt32LE(4);
const nTags = rd(ifdOff, 2).readUInt16LE(0);
const ifd = rd(ifdOff + 2, nTags * 12);
const TSZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
const tags = {};
for (let i = 0; i < nTags; i++) {
  const e = ifd.subarray(i * 12, i * 12 + 12);
  const tag = e.readUInt16LE(0), type = e.readUInt16LE(2), count = e.readUInt32LE(4);
  const bytes = TSZ[type] * count;
  const data = bytes <= 4 ? e.subarray(8, 8 + bytes) : rd(e.readUInt32LE(8), bytes);
  let val;
  if (type === 2) val = data.toString("latin1").replace(/\0+$/, "");
  else if (type === 3) val = Array.from({ length: count }, (_, k) => data.readUInt16LE(k * 2));
  else if (type === 4) val = Array.from({ length: count }, (_, k) => data.readUInt32LE(k * 4));
  else if (type === 12) val = Array.from({ length: count }, (_, k) => data.readDoubleLE(k * 8));
  else val = data;
  tags[tag] = val;
}
const SW = tags[256][0], SH = tags[257][0], bps = tags[258][0], comp = tags[259]?.[0] ?? 1, sfmt = tags[339]?.[0] ?? 1;
const gdalNodata = tags[42113] !== undefined ? Number(tags[42113]) : null;
log(`${body}: source ${SW}x${SH} bps=${bps} sampleFormat=${sfmt === 2 ? "int" : sfmt === 3 ? "float" : "uint"} compression=${comp} tiled=${!!tags[322]} GDAL_NODATA=${gdalNodata}`);
if (comp !== 1 || bps !== 16 || sfmt !== 2) throw new Error("reader supports uncompressed signed 16-bit only");

const full = new Int16Array(SW * SH);
if (tags[322]) { // tiled
  const tw = tags[322][0], th = tags[323][0], offs = tags[324], cnts = tags[325];
  const tilesAcross = Math.ceil(SW / tw);
  for (let t = 0; t < offs.length; t++) {
    const buf = rd(offs[t], cnts[t]);
    const tile = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    const tx = (t % tilesAcross) * tw, ty = Math.floor(t / tilesAcross) * th;
    const cw = Math.min(tw, SW - tx), ch = Math.min(th, SH - ty);
    for (let r = 0; r < ch; r++) full.set(tile.subarray(r * tw, r * tw + cw), (ty + r) * SW + tx);
  }
} else { // strips
  const rps = tags[278]?.[0] ?? SH, offs = tags[273], cnts = tags[279];
  for (let s = 0; s < offs.length; s++) {
    const buf = rd(offs[s], cnts[s]);
    full.set(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2), s * rps * SW);
  }
}
closeSync(fd);
log("decoded full-res int16");

// ---------- no-data ----------
let min = 32767, max = -32768, sum = 0;
for (let i = 0; i < full.length; i++) { const v = full[i]; if (v < min) min = v; if (v > max) max = v; sum += v; }
const NODATA = gdalNodata ?? -32768;
let nodataCount = 0;
for (let i = 0; i < full.length; i++) if (full[i] === NODATA) nodataCount++;
log(`range ${min}..${max} mean=${(sum / full.length).toFixed(1)}; nodata(${NODATA}) count=${nodataCount} (${(100 * nodataCount / full.length).toFixed(4)}%)`);
if (nodataCount) {
  const mean = Math.round((sum - NODATA * nodataCount) / (full.length - nodataCount));
  for (let y = 0; y < SH; y++) {
    const row = y * SW;
    for (let x = 0; x < SW; x++) {
      if (full[row + x] !== NODATA) continue;
      let v = mean;
      for (let d = 1; d < SW / 2; d++) {
        const l = full[row + ((x - d + SW) % SW)], r = full[row + ((x + d) % SW)];
        if (l !== NODATA) { v = l; break; }
        if (r !== NODATA) { v = r; break; }
      }
      full[row + x] = v;
    }
  }
  log(`filled no-data with nearest valid neighbour along row (fallback mean ${mean})`);
}

// ---------- separable lanczos3 downsample (wrap x, clamp y) ----------
const lanczos = (x) => { if (x === 0) return 1; if (Math.abs(x) >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); };
function weights(srcN, dstN, wrap) {
  const scale = srcN / dstN, support = 3 * scale;
  const idx = [], wts = [];
  for (let o = 0; o < dstN; o++) {
    const c = (o + 0.5) * scale - 0.5;
    const lo = Math.floor(c - support), hi = Math.ceil(c + support);
    const ii = [], ww = []; let s = 0;
    for (let i = lo; i <= hi; i++) {
      const w = lanczos((i - c) / scale); if (w === 0) continue;
      ii.push(wrap ? ((i % srcN) + srcN) % srcN : Math.min(Math.max(i, 0), srcN - 1)); ww.push(w); s += w;
    }
    idx.push(Int32Array.from(ii)); wts.push(Float32Array.from(ww.map((w) => w / s)));
  }
  return { idx, wts };
}
log(`resampling -> ${W}x${H} lanczos3 (float)`);
const wx = weights(SW, W, true), wy = weights(SH, H, false);
const mid = new Float32Array(SH * W);
for (let y = 0; y < SH; y++) {
  const srow = y * SW, drow = y * W;
  for (let x = 0; x < W; x++) {
    const ii = wx.idx[x], ww = wx.wts[x]; let acc = 0;
    for (let k = 0; k < ii.length; k++) acc += full[srow + ii[k]] * ww[k];
    mid[drow + x] = acc;
  }
}
const h = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  const ii = wy.idx[y], ww = wy.wts[y], drow = y * W;
  for (let k = 0; k < ii.length; k++) {
    const srow = ii[k] * W, w = ww[k];
    for (let x = 0; x < W; x++) h[drow + x] += mid[srow + x] * w;
  }
}
log("resampled");

// ---------- gradients: central diff, wrap x / clamp y, x scaled by 1/cos(lat) for physical slope ----------
const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  const lat = (0.5 - (y + 0.5) / H) * Math.PI;
  const cosl = Math.max(Math.cos(lat), COS_CLAMP);
  const yu = Math.max(y - 1, 0) * W, yd = Math.min(y + 1, H - 1) * W, row = y * W;
  for (let x = 0; x < W; x++) {
    gx[row + x] = (h[row + ((x + 1) % W)] - h[row + ((x - 1 + W) % W)]) / (2 * cosl);
    gy[row + x] = (h[yd + x] - h[yu + x]) / 2;
  }
}
const sample = new Float32Array(Math.ceil(W * H / 16));
for (let i = 0, j = 0; i < W * H; i += 16) sample[j++] = Math.hypot(gx[i], gy[i]);
sample.sort();
const gP = sample[Math.floor(PCT * (sample.length - 1))], gMax = sample[sample.length - 1];
const strength = Math.sqrt(1 / (TARGET_NZ * TARGET_NZ) - 1) / gP; // |g| = gP  ->  nz = TARGET_NZ
log(`|grad| p${PCT * 100}=${gP.toFixed(2)} m/px (max ${gMax.toFixed(1)}); strength=${strength.toFixed(5)} (1/(${(1 / strength).toFixed(2)} m/px))`);

// ---------- pack ----------
const out = Buffer.alloc(W * H * 3);
for (let i = 0, o = 0; i < W * H; i++, o += 3) {
  const nx = -gx[i] * strength, ny = -gy[i] * strength;
  const l = Math.sqrt(nx * nx + ny * ny + 1);
  out[o] = (nx / l * 0.5 + 0.5) * 255;
  out[o + 1] = (ny / l * 0.5 + 0.5) * 255;
  out[o + 2] = (1 / l * 0.5 + 0.5) * 255;
}
await sharp(out, { raw: { width: W, height: H, channels: 3 }, ...big }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(OUT);
await sharp(OUT, big).resize(1024, 512, { kernel: "lanczos3" }).jpeg({ quality: 90 }).toFile(PREVIEW);
const st = await sharp(OUT, big).stats();
log(`wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB); preview ${PREVIEW}`);
log("stats:", st.channels.map((c, i) => `${"RGB"[i]} mean=${c.mean.toFixed(1)} sd=${c.stdev.toFixed(1)} min=${c.min} max=${c.max}`).join(" | "));

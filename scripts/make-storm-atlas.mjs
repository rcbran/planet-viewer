// hurricane satellite snapshots -> cloud masks with radial vignette -> 2x2 atlas
import sharp from "sharp";
const SRC = "nasa-src/storms", OUT = "public/textures/storms";
const names = ["irma_v", "florence_v", "dorian_v", "mawar_v"];
const N = 1024;
const vignette = Buffer.alloc(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2); const r = Math.hypot(dx, dy);
  vignette[y * N + x] = Math.round(255 * Math.max(0, Math.min(1, (1 - r) / 0.35)));
}
const parts = [];
for (let i = 0; i < names.length; i++) {
  const { data } = await sharp(`${SRC}/${names[i]}.jpg`).resize(N, N).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(N * N);
  for (let k = 0, j = 0; k < data.length; k += 3, j++) {
    const r = data[k] / 255, g = data[k + 1] / 255, b = data[k + 2] / 255;
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    // keep the band structure: soft ramp, no hard saturation
    const t = Math.max(0, Math.min(1, (mn - 0.22) / 0.72));
    let c = (t * t * (3 - 2 * t)) * (1 - Math.min(1, sat * 2.5));
    c = Math.pow(c, 0.9);
    out[j] = Math.round(c * 255 * (vignette[j] / 255));
  }
  const rgb = Buffer.alloc(N * N * 3);
  for (let j = 0, k = 0; j < out.length; j++, k += 3) rgb[k] = rgb[k + 1] = rgb[k + 2] = out[j];
  parts.push({ input: rgb, raw: { width: N, height: N, channels: 3 }, left: (i % 2) * N, top: Math.floor(i / 2) * N });
  await sharp(out, { raw: { width: N, height: N, channels: 1 } }).jpeg({ quality: 88 }).toFile(`${OUT}/${names[i]}.jpg`);
}
await sharp({ create: { width: 2 * N, height: 2 * N, channels: 3, background: "#000" } }).composite(parts).png({ compressionLevel: 9 }).toFile(`${OUT}/atlas.png`);
console.log("atlas.png written:", names.join(", "));

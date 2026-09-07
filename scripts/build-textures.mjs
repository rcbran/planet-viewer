// Build production Earth textures from NASA sources (see scripts/fetch-nasa.sh).
// Outputs public/textures/{8k,16k}/{day,night,normal,specular}.jpg
// Strategy: downsample each source tile independently, then mosaic, so we never hold the
// 86400x43200 image in memory.
import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

sharp.cache(false);
sharp.concurrency(8);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "nasa-src");
const OUT = resolve(ROOT, "public/textures");
const TILES = ["A1", "B1", "C1", "D1", "A2", "B2", "C2", "D2"]; // 4 across, 2 down
const SIZES = { "8k": 8192, "16k": 16384 };
const JPEG = { quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" };
const big = { limitInputPixels: false };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function mosaic(prefix, width, height, outPath, opts = {}) {
  const tw = width / 4, th = height / 2;
  const parts = [];
  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i];
    const file = resolve(SRC, `${prefix}_${t}.jpg`);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    log(`  resize ${prefix}_${t} -> ${tw}x${th}`);
    let img = sharp(file, big).resize(tw, th, { kernel: "lanczos3" });
    if (opts.grayscale) img = img.grayscale();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    let buf = data;
    if (info.channels === 1) { // grayscale source: expand to RGB for the 3-channel canvas
      buf = Buffer.alloc(tw * th * 3);
      for (let k = 0, j = 0; k < data.length; k++, j += 3) buf[j] = buf[j + 1] = buf[j + 2] = data[k];
    } else if (info.channels === 4) {
      buf = Buffer.alloc(tw * th * 3);
      for (let k = 0, j = 0; k < data.length; k += 4, j += 3) { buf[j] = data[k]; buf[j + 1] = data[k + 1]; buf[j + 2] = data[k + 2]; }
    }
    parts.push({ input: buf, raw: { width: tw, height: th, channels: 3 }, left: (i % 4) * tw, top: Math.floor(i / 4) * th });
  }
  log(`  composite ${outPath}`);
  await sharp({ create: { width, height, channels: 3, background: "#000" } })
    .composite(parts).jpeg(JPEG).toFile(outPath);
}

// tangent-space normal map from a 16-bit-ish grayscale heightmap (PNG 8-bit here)
async function normalFromHeight(heightPng, width, height, outPath, strength) {
  log(`  height -> ${width}x${height}`);
  const h = await sharp(heightPng, big).resize(width, height, { kernel: "lanczos3" }).grayscale().raw().toBuffer();
  const out = Buffer.alloc(width * height * 3);
  const px = (x, y) => h[((y + height) % height) * width + ((x + width) % width)];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (px(x + 1, y) - px(x - 1, y)) / 255;
      const dy = (px(x, y + 1) - px(x, y - 1)) / 255;
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const o = (y * width + x) * 3;
      out[o] = ((nx / l) * 0.5 + 0.5) * 255;
      out[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      out[o + 2] = ((nz / l) * 0.5 + 0.5) * 255;
    }
  }
  await sharp(out, { raw: { width, height, channels: 3 } }).jpeg(JPEG).toFile(outPath);
}

// water mask from GEBCO bathymetry PNG: land is pure white (255), ocean is depth-shaded (< 250)
async function specularFromBathy(bathPng, width, height, outPath) {
  log(`  bathy -> specular ${width}x${height}`);
  await sharp(bathPng, big).resize(width, height, { kernel: "lanczos3" }).grayscale()
    .threshold(250).negate().blur(0.8).jpeg({ quality: 85 }).toFile(outPath);
}

const only = process.argv.slice(2);
for (const [name, W] of Object.entries(SIZES)) {
  if (only.length && !only.includes(name)) continue;
  const H = W / 2, dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  log(`=== ${name} (${W}x${H}) ===`);
  if (!existsSync(resolve(dir, "day.jpg"))) await mosaic("bluemarble_200407", W, H, resolve(dir, "day.jpg"));
  // grayscale Black Marble: pure light radiance on black, no blue land/ocean cast (colorized in-shader)
  if (!existsSync(resolve(dir, "night.jpg"))) await mosaic("blackmarble_2016_gray", W, H, resolve(dir, "night.jpg"), { grayscale: true });
  // GEBCO elevation is 8-bit (0 = sea level, 217 ~ Himalaya); per-pixel deltas are tiny at 8K, so drive hard
  if (!existsSync(resolve(dir, "normal.jpg"))) await normalFromHeight(resolve(SRC, "gebco_elev_21600.png"), W, H, resolve(dir, "normal.jpg"), name === "16k" ? 26 : 16);
  if (!existsSync(resolve(dir, "specular.jpg"))) await specularFromBathy(resolve(SRC, "gebco_bath_21600.png"), W, H, resolve(dir, "specular.jpg"));
}
log("done");

import * as THREE from "three";
// Stitch NASA GIBS daily true-color imagery (VIIRS SNPP, EPSG:4326, "2km" matrix, level 2 = 8x4
// tiles of 512px = 4096x2048) into an equirectangular cloud-coverage texture.
// Free, no API key. https://nasa-gibs.github.io/gibs-api-docs/
const LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
const LEVEL = 2, COLS = 8, ROWS = 4, TILE = 512;

export function isoDaysAgo(n: number) {
  const d = new Date(Date.now() - n * 864e5);
  return d.toISOString().slice(0, 10);
}

export async function loadLiveClouds(date: string, onProgress?: (done: number, total: number) => void): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let done = 0; const total = COLS * ROWS;
  const jobs: Promise<void>[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${LAYER}/default/${date}/2km/${LEVEL}/${r}/${c}.jpg`;
    jobs.push(new Promise<void>((res) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => { ctx.drawImage(img, c * TILE, r * TILE); done++; onProgress?.(done, total); res(); };
      img.onerror = () => { done++; onProgress?.(done, total); res(); };
      img.src = url;
    }));
  }
  await Promise.all(jobs);
  // true color -> cloudiness: bright and desaturated pixels
  const im = ctx.getImageData(0, 0, canvas.width, canvas.height); const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    let cloud = Math.max(0, (mn - 0.32) / 0.55) * (1 - Math.min(1, sat * 2.2));
    cloud = Math.min(1, cloud * 1.35);
    const v = Math.round(cloud * 255);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  return tex;
}

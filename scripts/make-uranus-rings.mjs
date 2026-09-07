// Radial alpha strip for the rings of Uranus (same format as the Saturn strip: x = inner..outer radius).
// Real widths are a few km on a 25,559 km planet, so they are exaggerated to stay visible on screen;
// the rings are charcoal-dark (albedo ~0.02) so they are drawn as faint grey lines, epsilon the widest.
import sharp from "sharp";
const W = 8192, H = 16, inner = 1.64, outer = 2.02;
const rings = [ // [radius in planet radii, width px, alpha]
  [1.637, 40, 0.08], [1.652, 40, 0.08], [1.666, 40, 0.09], [1.750, 60, 0.13], [1.786, 70, 0.14],
  [1.834, 40, 0.07], [1.863, 60, 0.12], [1.900, 60, 0.13], [1.957, 30, 0.05], [2.006, 150, 0.28],
];
const px = new Uint8Array(W * H * 4);
for (let x = 0; x < W; x++) {
  const r = inner + (x / (W - 1)) * (outer - inner);
  let a = 0;
  for (const [rr, w, al] of rings) { const d = Math.abs(r - rr) / ((w / W) * (outer - inner)); if (d < 1) a = Math.max(a, al * (1 - d * d)); }
  for (let y = 0; y < H; y++) { const o = (y * W + x) * 4; px[o] = 150; px[o + 1] = 158; px[o + 2] = 168; px[o + 3] = Math.round(a * 255); }
}
await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toFile(new URL("../public/textures/planets/uranus_ring_alpha.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
console.log("uranus_ring_alpha.png");

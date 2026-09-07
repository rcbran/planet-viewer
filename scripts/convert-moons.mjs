import sharp from "sharp";
import fs from "fs";
import { execSync } from "child_process";

const names = process.argv.slice(2).length ? process.argv.slice(2)
  : ["io","europa","ganymede","callisto","titan","enceladus","rhea"];
const SRC = "nasa-src/moons", OUT = "public/textures/planets/moons", PREV = "shots/preview";
const W = 4096, H = 2048;

for (const name of names) {
  const src = `${SRC}/${name}.tif`, out = `${OUT}/${name}.jpg`, prev = `${PREV}/moon-${name}.jpg`;
  const rep = { name };
  try {
    const meta = await sharp(src, { limitInputPixels: false }).metadata();
    rep.src = `${meta.width}x${meta.height} ${meta.channels}ch ${meta.depth}${meta.isPalette?" palette":""}`;
    const w = Math.min(W, meta.width), h = Math.round(w / 2);
    if (Math.abs(meta.width / meta.height - 2) > 0.01) rep.aspect = `non-2:1 source (${(meta.width/meta.height).toFixed(3)}), fit:fill`;
    let img = sharp(src, { limitInputPixels: false }).resize(w, h, { fit: "fill", kernel: "lanczos3" });
    // decide normalisation from stats of a downsampled copy (fast)
    const st = await sharp(src, { limitInputPixels: false }).resize(1024, 512, { fit: "fill" }).toColourspace("b-w").raw().toBuffer().then(b => {
      let s=0, mn=255, mx=0; for (const v of b){ s+=v; if(v<mn)mn=v; if(v>mx)mx=v; } return { mean: s/b.length, mn, mx };
    });
    const is16 = meta.depth !== "uchar";
    const steps = [];
    if (is16 || st.mean < 40 || st.mx < 200) { img = img.normalise({ lower: 0.5, upper: 99.5 }); steps.push(`normalise (pre-mean ${st.mean.toFixed(1)}, range ${st.mn}-${st.mx})`); }
    if (meta.channels < 3) steps.push("gray->rgb");
    await img.removeAlpha().toColourspace("srgb").jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toFile(out);
    rep.steps = steps.join(", ") || "resize only";
  } catch (e) {
    rep.sharpError = String(e.message).slice(0, 200);
    try {
      execSync(`ffmpeg -y -loglevel error -i "${src}" -vf "scale=${W}:${H},format=rgb24" -q:v 2 "${out}"`, { stdio: "inherit" });
      rep.steps = "ffmpeg fallback";
    } catch (e2) { rep.ffmpegError = String(e2.message).slice(0, 200); }
  }
  if (fs.existsSync(out)) {
    const m = await sharp(out).metadata();
    const s = await sharp(out).stats();
    rep.out = `${m.width}x${m.height} ${m.channels}ch ${Math.round(fs.statSync(out).size/1024)} KB`;
    rep.mean = s.channels.map(c => c.mean.toFixed(1)).join("/");
    // fraction of near-black pixels as coverage estimate
    const buf = await sharp(out).resize(512,256).toColourspace("b-w").raw().toBuffer();
    let dark=0; for (const v of buf) if (v < 8) dark++;
    rep.darkPct = (100*dark/buf.length).toFixed(1);
    await sharp(out).resize(512, 256).jpeg({ quality: 85 }).toFile(prev);
  }
  console.log(JSON.stringify(rep));
}

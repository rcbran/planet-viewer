import * as THREE from "three";
import { Pane } from "tweakpane";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import earthVert from "./shaders/earth.vert.glsl?raw";
import earthFrag from "./shaders/earth.frag.glsl?raw";
import cloudsVert from "./shaders/clouds.vert.glsl?raw";
import cloudsFrag from "./shaders/clouds.frag.glsl?raw";
import atmoVert from "./shaders/atmosphere.vert.glsl?raw";
import atmoFrag from "./shaders/atmosphere.frag.glsl?raw";
import { loadLiveClouds, isoDaysAgo } from "./gibs";

const SETS = {
  "Bootstrap 8K": { dir: "/textures/8k/", day: "8k_earth_daymap.jpg", night: "8k_earth_nightmap.jpg", normal: "8k_earth_normal_map.jpg", specular: "8k_earth_specular_map.jpg" },
  "NASA 8K": { dir: "/textures/8k/", day: "day.jpg", night: "night.jpg", normal: "normal.jpg", specular: "specular.jpg" },
  "NASA 16K": { dir: "/textures/16k/", day: "day.jpg", night: "night.jpg", normal: "normal.jpg", specular: "specular.jpg" },
} as const;
type SetName = keyof typeof SETS;
const TEX = "/textures/8k/";

const params = {
  rotationSpeed: 1.5, // deg/s
  axialTilt: 23.4,
  exposure: 1.1,
  sunAzimuth: 165,
  sunElevation: 8,
  twilightWidth: 0.12,
  twilightTint: 0.6,
  nightIntensity: 2.6,
  nightAmbient: 0.018,
  cloudMode: 0 as 0 | 1 | 2,   // satellite by default; presets switch to dynamic
  liveDate: isoDaysAgo(2), // GIBS daily composites are complete ~1 day after the date
  textureSet: "NASA 16K" as SetName,
  cloudDensity: 1.0,
  cloudCoverage: 0.55,
  cloudSoftness: 0.0,
  cloudScale: 2.2,
  cloudDriftSpeed: 0.0003,
  cloudShadow: 0.6,
  stormCount: 0,
  stormSize: 0.22,
  stormSpin: 0.035,
  stormDarkness: 0.7,
  lightning: 0.0,
  dragInertia: 0.94,
  cloudRelief: 0.35,
  atmosphereIntensity: 0.7,
  atmosphereFalloff: 0.22,
  bloomStrength: 0.55,
  bloomThreshold: 0.85,
  bloomRadius: 0.45,
  oceanSpecular: 1.0,
  oceanShininess: 320,
  normalScale: 0.9,
  oceanBoost: 0.0,
  oceanTint: { r: 1.0, g: 1.0, b: 1.0 },
  nightWarmth: 0.6,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(params.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 4.9);

// loaders
const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
function tex(name: string, srgb = false, dir = TEX) {
  const t = loader.load(dir + name);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function texAt(dir: string, name: string, srgb = false) { return tex(name, srgb, dir); }
const dayMap = tex("8k_earth_daymap.jpg", true);
const nightMap = tex("8k_earth_nightmap.jpg", true);
const normalMap = tex("8k_earth_normal_map.jpg");
const specularMap = tex("8k_earth_specular_map.jpg");
async function applyTextureSet(name: SetName) {
  const set = SETS[name];
  if (name !== "Bootstrap 8K") {
    const ok = await fetch(set.dir + set.day, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
    if (!ok) { const next: SetName = name === "NASA 16K" ? "NASA 8K" : "Bootstrap 8K"; console.warn(`[blue-marble] ${name} textures not built; falling back to ${next}`); params.textureSet = next; return applyTextureSet(next); }
  }
  const nasa = name.startsWith("NASA");
  params.oceanBoost = nasa ? 1.6 : 0.0;
  params.oceanTint = nasa ? { r: 0.75, g: 0.95, b: 1.25 } : { r: 1, g: 1, b: 1 };
  params.normalScale = nasa ? 1.4 : 0.9;
  pane.refresh();
  const u = earthMat.uniforms;
  u.dayMap.value = texAt(set.dir, set.day, true);
  u.nightMap.value = texAt(set.dir, set.night, true);
  u.normalMap.value = texAt(set.dir, set.normal);
  u.specularMap.value = texAt(set.dir, set.specular);
}
const cloudMap = tex("8k_earth_clouds.jpg");
const starMap = tex("8k_stars_milky_way.jpg", true);
const stormAtlas = tex("atlas.png", false, "/textures/storms/");
stormAtlas.wrapS = stormAtlas.wrapT = THREE.ClampToEdgeWrapping;
// typical cyclone basins: Atlantic, Gulf/Caribbean, West Pacific, South Indian
// spread ~90° apart so a couple are always on the sunlit side: Atlantic, East Pacific, West Pacific, South Indian
const STORM_LL: [number, number][] = [[24, -62], [16, -128], [18, 135], [-16, 72]];
function llToVec(lat: number, lon: number) { const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon); return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); }
const stormPos = STORM_LL.map(([a, b]) => llToVec(a, b));
function setStorm(i: number, lat: number, lon: number) { stormPos[i].copy(llToVec(lat, lon)); }

const sunDir = new THREE.Vector3();
function updateSun() {
  const az = THREE.MathUtils.degToRad(params.sunAzimuth);
  const el = THREE.MathUtils.degToRad(params.sunElevation);
  sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}
updateSun();

// world: tilt group -> spin group -> meshes
const tilt = new THREE.Group();
const spin = new THREE.Group();
tilt.add(spin);
tilt.position.x = -0.42; // leave the right third for the panel
scene.add(tilt);

const earthGeo = new THREE.SphereGeometry(1, 256, 256);
const earthMat = new THREE.ShaderMaterial({
  vertexShader: earthVert,
  fragmentShader: earthFrag,
  uniforms: {
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    normalMap: { value: normalMap },
    specularMap: { value: specularMap },
    cloudMap: { value: cloudMap },
    sunDir: { value: sunDir },
    nightIntensity: { value: params.nightIntensity },
    nightAmbient: { value: params.nightAmbient },
    twilightWidth: { value: params.twilightWidth },
    twilightTint: { value: params.twilightTint },
    oceanSpecular: { value: params.oceanSpecular },
    oceanShininess: { value: params.oceanShininess },
    normalScale: { value: params.normalScale },
    oceanBoost: { value: params.oceanBoost },
    oceanTint: { value: new THREE.Vector3(1, 1, 1) },
    nightWarmth: { value: params.nightWarmth },
    atmosphereIntensity: { value: params.atmosphereIntensity },
    cloudShadow: { value: params.cloudShadow },
    cloudDensity: { value: params.cloudDensity },
    cloudDrift: { value: 0 },
    cloudMode: { value: params.cloudMode },
  },
});
const earth = new THREE.Mesh(earthGeo, earthMat);
spin.add(earth);

const cloudMat = new THREE.ShaderMaterial({
  vertexShader: cloudsVert,
  fragmentShader: cloudsFrag,
  transparent: true,
  depthWrite: false,
  uniforms: {
    cloudMap: { value: cloudMap },
    sunDir: { value: sunDir },
    time: { value: 0 },
    cloudDensity: { value: params.cloudDensity },
    cloudCoverage: { value: params.cloudCoverage },
    cloudSoftness: { value: params.cloudSoftness },
    cloudDrift: { value: 0 },
    cloudScale: { value: params.cloudScale },
    twilightWidth: { value: params.twilightWidth },
    cloudMode: { value: params.cloudMode },
    stormAtlas: { value: stormAtlas },
    stormCount: { value: params.stormCount },
    stormPos: { value: stormPos },
    stormSize: { value: params.stormSize },
    stormSpin: { value: params.stormSpin },
    stormDarkness: { value: params.stormDarkness },
    lightning: { value: params.lightning },
    nightFactorBias: { value: 0 },
    sunObj: { value: new THREE.Vector3(-1, 0, 0) },
    cloudRelief: { value: params.cloudRelief },
  },
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 192, 192), cloudMat);
spin.add(clouds);

const atmoMat = new THREE.ShaderMaterial({
  vertexShader: atmoVert,
  fragmentShader: atmoFrag,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    sunDir: { value: sunDir },
    earthCenter: { value: new THREE.Vector3() },
    earthRadius: { value: 1.0 },
    shellRadius: { value: 1.12 },
    intensity: { value: params.atmosphereIntensity },
    falloff: { value: params.atmosphereFalloff },
  },
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.12, 128, 128), atmoMat);
tilt.add(atmosphere);

const stars = new THREE.Mesh(
  new THREE.SphereGeometry(80, 64, 64),
  new THREE.MeshBasicMaterial({ map: starMap, side: THREE.BackSide, color: new THREE.Color(0.55, 0.55, 0.6) }),
);
stars.rotation.set(0.3, 1.2, 0.1);
scene.add(stars);

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), params.bloomStrength, params.bloomRadius, params.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- panel ----------
type CloudPreset = "Satellite" | "None" | "Clear" | "Scattered" | "Overcast" | "Storm" | "Live";
const ui = { clouds: "Satellite" as CloudPreset, twilight: params.twilightTint };
const pane = new Pane({ container: document.getElementById("panel")!, title: "Earth" });

const fGlobe = pane.addFolder({ title: "Globe" });
fGlobe.addBinding(params, "rotationSpeed", { min: 0, max: 10, step: 0.1, label: "spin" });
fGlobe.addBinding(params, "axialTilt", { min: -45, max: 45, step: 0.5, label: "tilt" });
fGlobe.addBinding(params, "exposure", { min: 0.4, max: 2.5, step: 0.01, label: "exposure" }).on("change", (e: { value: number }) => (renderer.toneMappingExposure = e.value));

const fSun = pane.addFolder({ title: "Sun" });
fSun.addBinding(params, "sunAzimuth", { min: 0, max: 360, step: 1, label: "direction" }).on("change", updateSun);
fSun.addBinding(params, "sunElevation", { min: -45, max: 45, step: 0.5, label: "height" }).on("change", updateSun);
fSun.addBinding(ui, "twilight", { min: 0, max: 1, step: 0.01, label: "sunset glow" }).on("change", (e: { value: number }) => { params.twilightTint = e.value; params.twilightWidth = 0.06 + 0.12 * e.value; });
fSun.addBinding(params, "nightIntensity", { min: 0, max: 5, step: 0.05, label: "city lights" });

const fClouds = pane.addFolder({ title: "Clouds & Weather" });
fClouds.addBinding(ui, "clouds", { options: { Satellite: "Satellite", None: "None" }, label: "sky" }).on("change", (e: { value: CloudPreset }) => applyWeather(e.value));
const liveStatus = { text: "" };
const liveRow = fClouds.addBinding(liveStatus, "text", { readonly: true, label: "status" });
fClouds.addBinding(params, "cloudDensity", { min: 0.3, max: 1.6, step: 0.01, label: "opacity" });

const fStorm = pane.addFolder({ title: "Storms" });
fStorm.addBinding(params, "stormCount", { min: 1, max: 4, step: 1, label: "hurricanes" });
fStorm.addBinding(params, "stormSize", { min: 0.1, max: 0.5, step: 0.01, label: "size" });
fStorm.addBinding(params, "stormSpin", { min: 0, max: 0.2, step: 0.005, label: "spin" });
fStorm.addBinding(params, "lightning", { min: 0, max: 1, step: 0.01, label: "lightning" });

const fLook = pane.addFolder({ title: "Atmosphere & Ocean" });
fLook.addBinding(params, "atmosphereIntensity", { min: 0, max: 2, step: 0.01, label: "atmosphere" });
fLook.addBinding(params, "bloomStrength", { min: 0, max: 1.5, step: 0.01, label: "glow" });
fLook.addBinding(params, "oceanBoost", { min: 0, max: 3, step: 0.01, label: "ocean brightness" });
fLook.addBinding(params, "oceanSpecular", { min: 0, max: 3, step: 0.01, label: "sun glint" });

const fQuality = pane.addFolder({ title: "Quality", expanded: false });
fQuality.addBinding(params, "textureSet", { options: { "NASA 16K": "NASA 16K", "NASA 8K": "NASA 8K", "Bootstrap 8K": "Bootstrap 8K" }, label: "textures" }).on("change", (e: { value: SetName }) => applyTextureSet(e.value));
fQuality.addBinding(params, "pixelRatio", { min: 0.5, max: 3, step: 0.25, label: "render scale" }).on("change", (e: { value: number }) => { renderer.setPixelRatio(e.value); onResize(); });

let liveTex: THREE.Texture | null = null;
async function loadLive() {
  liveStatus.text = "fetching NASA GIBS…";
  try {
    liveTex = await loadLiveClouds(params.liveDate, (d, t) => (liveStatus.text = `tiles ${d}/${t}`));
    liveStatus.text = `clouds for ${params.liveDate}`;
  } catch (err) { liveStatus.text = "failed: " + (err as Error).message; }
}

function applyWeather(w: CloudPreset) {
  ui.clouds = w;
  const presets: Record<CloudPreset, Partial<typeof params>> = {
    Satellite: { cloudMode: 0, cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.0, stormCount: 0, lightning: 0 },
    None:      { cloudMode: 0, cloudDensity: 0.0, stormCount: 0, lightning: 0 },
    Live:      { cloudMode: 2, cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.0, stormCount: 0, lightning: 0 },
    Clear:     { cloudMode: 1, cloudCoverage: 0.32, cloudDensity: 0.9,  cloudSoftness: 0.25, cloudScale: 2.2, stormCount: 0, lightning: 0.0 },
    Scattered: { cloudMode: 1, cloudCoverage: 0.55, cloudDensity: 1.0,  cloudSoftness: 0.0,  cloudScale: 2.2, stormCount: 0, lightning: 0.0 },
    Overcast:  { cloudMode: 1, cloudCoverage: 0.78, cloudDensity: 1.05, cloudSoftness: 0.15, cloudScale: 1.3, stormCount: 1, lightning: 0.15 },
    Storm:     { cloudMode: 1, cloudCoverage: 0.62, cloudDensity: 1.1,  cloudSoftness: 0.1,  cloudScale: 2.0, stormCount: 4, lightning: 1.0, stormSize: 0.26, stormSpin: 0.04 },
  };
  Object.assign(params, presets[w]);
  if (w === "Live") loadLive(); else liveStatus.text = "";
  fStorm.hidden = w !== "Storm";
  liveRow.hidden = w !== "Live";
  pane.refresh();
}
fStorm.hidden = true; liveRow.hidden = true;

// ---------- drag to rotate ----------
let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0, pitch = 0;
const DRAG_GAIN = 0.0045;
canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; velX = velY = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  velX = dx * DRAG_GAIN; velY = dy * DRAG_GAIN;
  spin.rotation.y += velX; pitch = THREE.MathUtils.clamp(pitch + velY, -1.2, 1.2);
});
const endDrag = (e: PointerEvent) => { if (!dragging) return; dragging = false; canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = "grab"; };
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
canvas.style.cursor = "grab";

// automation hook (screenshots, e2e): window.bm.params / window.bm.loadLive()
(window as any).bm = { params, loadLive, applyWeather, applyTextureSet, setStorm, pane, spin, tilt, cloudMat, earthMat };
const q = new URLSearchParams(location.search);
const qc = q.get("clouds");
if (qc === "live") applyWeather("Live");
else if (qc === "satellite") applyWeather("Satellite");
else if (qc) applyWeather((qc[0].toUpperCase() + qc.slice(1)) as CloudPreset);
applyTextureSet((q.get("set") as SetName) || params.textureSet);
pane.refresh();

// ---------- loop ----------
const timer = new THREE.Timer();
let cloudDrift = 0;
const statsEl = document.getElementById("stats")!;
let frames = 0, fpsT = 0;

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", onResize);

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  if (!dragging) {
    spin.rotation.y += THREE.MathUtils.degToRad(params.rotationSpeed) * dt + velX;
    pitch = THREE.MathUtils.clamp(pitch + velY, -1.2, 1.2);
    velX *= params.dragInertia; velY *= params.dragInertia;
    pitch *= 0.995; // ease back toward level
  }
  tilt.rotation.z = THREE.MathUtils.degToRad(params.axialTilt);
  tilt.rotation.x = pitch;
  cloudDrift += params.cloudDriftSpeed * dt;

  const eu = earthMat.uniforms;
  eu.nightIntensity.value = params.nightIntensity;
  eu.nightAmbient.value = params.nightAmbient;
  eu.twilightWidth.value = params.twilightWidth;
  eu.twilightTint.value = params.twilightTint;
  eu.oceanSpecular.value = params.oceanSpecular;
  eu.oceanShininess.value = params.oceanShininess;
  eu.normalScale.value = params.normalScale;
  eu.oceanBoost.value = params.oceanBoost;
  eu.oceanTint.value.set(params.oceanTint.r, params.oceanTint.g, params.oceanTint.b);
  eu.nightWarmth.value = params.nightWarmth;
  eu.atmosphereIntensity.value = params.atmosphereIntensity;
  eu.cloudShadow.value = params.cloudShadow;
  eu.cloudDensity.value = params.cloudDensity;
  eu.cloudDrift.value = cloudDrift;
  const liveReady = params.cloudMode === 2 && liveTex;
  eu.cloudMode.value = 0; // ground shadows always come from the satellite/live map
  eu.cloudMap.value = liveReady ? liveTex : cloudMap;

  const cu = cloudMat.uniforms;
  cu.time.value = t;
  cu.cloudDensity.value = params.cloudDensity;
  cu.cloudCoverage.value = params.cloudCoverage;
  cu.cloudSoftness.value = params.cloudSoftness;
  cu.cloudScale.value = params.cloudScale;
  cu.cloudDrift.value = cloudDrift;
  cu.twilightWidth.value = params.twilightWidth;
  cu.cloudMode.value = liveReady ? 0 : params.cloudMode === 2 ? 1 : params.cloudMode;
  cu.stormCount.value = params.stormCount;
  cu.cloudRelief.value = params.cloudRelief;
  clouds.updateWorldMatrix(true, false); cu.sunObj.value.copy(sunDir).transformDirection(clouds.matrixWorld.clone().invert()).normalize();
  cu.stormSize.value = params.stormSize;
  cu.stormSpin.value = params.stormSpin;
  cu.stormDarkness.value = params.stormDarkness;
  cu.lightning.value = params.lightning;
  cu.cloudMap.value = liveReady ? liveTex : cloudMap;
  clouds.rotation.y = params.cloudMode === 1 ? 0 : 0; // drift handled in uv/time

  atmoMat.uniforms.intensity.value = params.atmosphereIntensity;
  atmoMat.uniforms.falloff.value = params.atmosphereFalloff;
  atmosphere.getWorldPosition(atmoMat.uniforms.earthCenter.value);
  bloom.strength = params.bloomStrength;
  bloom.threshold = params.bloomThreshold;
  bloom.radius = params.bloomRadius;

  renderer.info.reset();
  composer.render();

  frames++; fpsT += dt;
  if (fpsT >= 0.5) { statsEl.textContent = `${Math.round(frames / fpsT)} FPS · ${renderer.info.render.triangles.toLocaleString()} tris`; frames = 0; fpsT = 0; }
});

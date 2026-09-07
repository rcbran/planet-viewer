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
import ringsVert from "./shaders/rings.vert.glsl?raw";
import ringsFrag from "./shaders/rings.frag.glsl?raw";
import sunVert from "./shaders/sun.vert.glsl?raw";
import sunFrag from "./shaders/sun.frag.glsl?raw";
import coronaVert from "./shaders/corona.vert.glsl?raw";
import coronaFrag from "./shaders/corona.frag.glsl?raw";
import cvolVert from "./shaders/corona-volume.vert.glsl?raw";
import cvolFrag from "./shaders/corona-volume.frag.glsl?raw";
import { loadLiveClouds, isoDaysAgo } from "./gibs";
import { BODIES, byId, type Body, type Moon } from "./planets";
import { createSunLoops, type SunLoops } from "./sunloops";
import { createSpace } from "./space";

// ---------- earth texture sets ----------
const EARTH_SETS = {
  "NASA 16K": { dir: "/textures/16k/", day: "day.jpg", night: "night.jpg", normal: "normal.jpg", specular: "specular.jpg" },
  "NASA 8K": { dir: "/textures/8k/", day: "day.jpg", night: "night.jpg", normal: "normal.jpg", specular: "specular.jpg" },
  "Bootstrap 8K": { dir: "/textures/8k/", day: "8k_earth_daymap.jpg", night: "8k_earth_nightmap.jpg", normal: "8k_earth_normal_map.jpg", specular: "8k_earth_specular_map.jpg" },
} as const;
type SetName = keyof typeof EARTH_SETS;

const params = {
  rotationSpeed: 1.5, axialTilt: 23.4, exposure: 1.1,
  sunAzimuth: 165, sunElevation: 8, twilightWidth: 0.12, twilightTint: 0.6,
  nightIntensity: 2.6, nightAmbient: 0.018, nightWarmth: 0.6,
  cloudMode: 0 as 0 | 1 | 2, liveDate: isoDaysAgo(2), textureSet: "NASA 16K" as SetName,
  cloudDensity: 1.0, cloudCoverage: 0.55, cloudSoftness: 0.0, cloudScale: 2.2, cloudDriftSpeed: 0.0003, cloudShadow: 0.6, cloudRelief: 0.35,
  stormCount: 0, stormSize: 0.22, stormSpin: 0.035, stormDarkness: 0.7, lightning: 0,
  atmosphereIntensity: 0.7, atmosphereFalloff: 0.22, bloomStrength: 0.55, bloomThreshold: 0.85, bloomRadius: 0.45,
  oceanSpecular: 1.0, oceanShininess: 80, normalScale: 1.4, oceanBoost: 1.0, oceanTint: { r: 0.72, g: 0.86, b: 1.12 },
  bandFlow: 0, dragInertia: 0.94, pixelRatio: Math.min(window.devicePixelRatio, 2),
  granulation: 1.0, coronaIntensity: 1.0, promIntensity: 1.0, sunBrightness: 1.0, surfaceFlow: 1.0, coronaVolume: 1.0, coronaTurbulence: 1.0, loopIntensity: 1.0, loopActivity: 1.0,
};

// ---------- renderer / scene ----------
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
camera.position.set(0, 0, 4.45);

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
function dataTex(r: number, g: number, b: number) { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; }
const BLACK = dataTex(0, 0, 0), FLAT_NORMAL = dataTex(128, 128, 255), GRAY = dataTex(110, 110, 112);
function tex(url: string, srgb = false, onError?: () => void) {
  const t = loader.load(url, undefined, undefined, () => { console.warn("[planet-viewer] missing texture", url); onError?.(); });
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const stormAtlas = tex("/textures/storms/atlas.png");
stormAtlas.wrapS = stormAtlas.wrapT = THREE.ClampToEdgeWrapping;
const earthClouds = tex("/textures/8k/8k_earth_clouds.jpg");

// ---------- sun ----------
const sunDir = new THREE.Vector3();
let space: ReturnType<typeof createSpace> | undefined;
function updateSun() {
  const az = THREE.MathUtils.degToRad(params.sunAzimuth), el = THREE.MathUtils.degToRad(params.sunElevation);
  sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  space?.setSunDir(sunDir);
}
updateSun();

// ---------- scene graph ----------
const tilt = new THREE.Group(); const spin = new THREE.Group(); tilt.add(spin); tilt.position.x = -0.42; scene.add(tilt);

const STORM_LL: [number, number][] = [[24, -62], [16, -128], [18, 135], [-16, 72]];
function llToVec(lat: number, lon: number) { const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon); return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); }
const stormPos = STORM_LL.map(([a, b]) => llToVec(a, b));
function setStorm(i: number, lat: number, lon: number) { stormPos[i].copy(llToVec(lat, lon)); }

const planetMat = new THREE.ShaderMaterial({
  vertexShader: earthVert, fragmentShader: earthFrag,
  uniforms: {
    dayMap: { value: BLACK }, nightMap: { value: BLACK }, normalMap: { value: FLAT_NORMAL }, specularMap: { value: BLACK }, cloudMap: { value: earthClouds },
    sunDir: { value: sunDir }, time: { value: 0 },
    nightIntensity: { value: 0 }, nightAmbient: { value: params.nightAmbient }, nightWarmth: { value: params.nightWarmth },
    twilightWidth: { value: params.twilightWidth }, twilightTint: { value: params.twilightTint },
    oceanSpecular: { value: 0 }, oceanShininess: { value: params.oceanShininess }, normalScale: { value: 0 },
    oceanBoost: { value: 0 }, oceanTint: { value: new THREE.Vector3(1, 1, 1) },
    atmosphereIntensity: { value: 0 }, cloudShadow: { value: 0 }, cloudDensity: { value: 1 }, cloudDrift: { value: 0 }, cloudMode: { value: 0 },
    bandFlow: { value: 0 }, ringShadow: { value: 0 }, ringMap: { value: BLACK }, ringRadii: { value: new THREE.Vector2(1.2, 2.2) },
    ringNormalW: { value: new THREE.Vector3(0, 1, 0) }, planetCenterW: { value: new THREE.Vector3() },
  },
});
const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), planetMat); spin.add(planet);

const cloudMat = new THREE.ShaderMaterial({
  vertexShader: cloudsVert, fragmentShader: cloudsFrag, transparent: true, depthWrite: false,
  uniforms: {
    cloudMap: { value: earthClouds }, sunDir: { value: sunDir }, sunObj: { value: new THREE.Vector3(-1, 0, 0) }, time: { value: 0 },
    cloudDensity: { value: 1 }, cloudCoverage: { value: 0.55 }, cloudSoftness: { value: 0 }, cloudDrift: { value: 0 }, cloudScale: { value: 2.2 },
    twilightWidth: { value: params.twilightWidth }, cloudMode: { value: 0 }, cloudRelief: { value: params.cloudRelief }, opaqueClouds: { value: 0 },
    stormAtlas: { value: stormAtlas }, stormCount: { value: 0 }, stormPos: { value: stormPos }, stormSize: { value: 0.22 }, stormSpin: { value: 0.035 },
    stormDarkness: { value: 0.7 }, lightning: { value: 0 }, nightFactorBias: { value: 0 },
  },
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 192, 192), cloudMat); spin.add(clouds);

const atmoMat = new THREE.ShaderMaterial({
  vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    sunDir: { value: sunDir }, earthCenter: { value: new THREE.Vector3() }, earthRadius: { value: 1 }, shellRadius: { value: 1.12 },
    intensity: { value: 0 }, falloff: { value: 0.22 },
    dayColor: { value: new THREE.Vector3(0.3, 0.58, 1) }, nightColor: { value: new THREE.Vector3(0.05, 0.08, 0.24) }, twilightColor: { value: new THREE.Vector3(1, 0.45, 0.15) },
  },
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), atmoMat); tilt.add(atmosphere);

// rings (Saturn)
function ringGeometry(inner: number, outer: number) {
  const g = new THREE.RingGeometry(inner, outer, 512, 4);
  const pos = g.attributes.position; const radial = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); radial[i] = (r - inner) / (outer - inner); }
  g.setAttribute("radial", new THREE.BufferAttribute(radial, 1));
  g.rotateX(-Math.PI / 2);
  return g;
}
const ringMat = new THREE.ShaderMaterial({
  vertexShader: ringsVert, fragmentShader: ringsFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { ringMap: { value: BLACK }, sunDir: { value: sunDir }, planetCenter: { value: new THREE.Vector3() }, planetRadius: { value: 1 } },
});
const rings = new THREE.Mesh(ringGeometry(1.24, 2.27), ringMat); rings.visible = false; tilt.add(rings);

// the Sun: self-luminous surface material (swapped onto the planet mesh) + additive corona billboard
const sunMat = new THREE.ShaderMaterial({
  vertexShader: sunVert, fragmentShader: sunFrag,
  uniforms: { photoMap: { value: BLACK }, chromoMap: { value: BLACK }, time: { value: 0 }, granulation: { value: 1 }, limbDarkening: { value: 0.6 }, chromoMix: { value: 0.85 }, brightness: { value: 1 }, flow: { value: 1 } },
});
const coronaMat = new THREE.ShaderMaterial({
  vertexShader: coronaVert, fragmentShader: coronaFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  uniforms: { limb304: { value: BLACK }, limb171: { value: BLACK }, time: { value: 0 }, coronaIntensity: { value: 1 }, promIntensity: { value: 1 }, discRadius: { value: 1 }, extent: { value: 3.2 }, promVideo: { value: BLACK }, videoReady: { value: 0 }, videoDiskR: { value: 0.417 } },
});
const corona = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), coronaMat); corona.renderOrder = 20; corona.visible = false; scene.add(corona);
// volumetric corona shell (raymarched), sits in the tilt group so its axis follows the Sun
const CVOL_R = 2.1;
const cvolMat = new THREE.ShaderMaterial({
  vertexShader: cvolVert, fragmentShader: cvolFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  uniforms: { sunCenter: { value: new THREE.Vector3() }, sunAxis: { value: new THREE.Vector3(0, 1, 0) }, rOuter: { value: CVOL_R }, time: { value: 0 }, intensity: { value: 1 }, turbulence: { value: 1 } },
});
const coronaVol = new THREE.Mesh(new THREE.SphereGeometry(CVOL_R, 64, 64), cvolMat); coronaVol.renderOrder = 15; coronaVol.visible = false; tilt.add(coronaVol);
// 3D magnetic loops anchored on today's sunspots (src/sunloops.ts)
let sunLoops: SunLoops | null = null, sunLoopsLoading = false;
function ensureSunLoops() {
  if (sunLoops) { sunLoops.group.visible = true; return; }
  if (sunLoopsLoading) return; sunLoopsLoading = true;
  fetch("/textures/sun/spots.json").then((r) => r.json()).catch(() => []).then((anchors) => {
    sunLoops = createSunLoops(anchors); spin.add(sunLoops.group); sunLoops.group.visible = !!current.star;
  });
}
// SDO 48-hour movie for live prominences
let sunVideo: HTMLVideoElement | null = null, sunVideoTex: THREE.VideoTexture | null = null;
function ensureSunVideo() {
  if (sunVideo) { sunVideo.play().catch(() => {}); return; }
  const v = document.createElement("video"); v.src = "/textures/sun/aia0304.mp4"; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.crossOrigin = "anonymous";
  v.style.cssText = "position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:-10px;top:-10px"; v.id = "sun-video"; document.body.appendChild(v);
  v.addEventListener("playing", () => { coronaMat.uniforms.videoReady.value = 1; });
  sunVideoTex = new THREE.VideoTexture(v); sunVideoTex.colorSpace = THREE.SRGBColorSpace; sunVideoTex.minFilter = THREE.LinearFilter;
  coronaMat.uniforms.promVideo.value = sunVideoTex; sunVideo = v; v.play().catch(() => {});
}

// space backdrop (NASA SVS Deep Star Maps 2020 cube + 40k point stars), see src/space.ts
space = createSpace(renderer, camera);
scene.add(space.group);
space.setSunDir(sunDir);

// mini moons
const MINI_VERT = `varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const MINI_FRAG = `uniform sampler2D map; uniform vec3 sunDir; uniform vec3 tint; varying vec3 vN; varying vec2 vUv; void main(){ vec3 c = texture2D(map, vUv).rgb * tint; float nl = max(dot(normalize(vN), normalize(sunDir)), 0.0); gl_FragColor = vec4(c * (nl * 0.95 + 0.07), 1.0); }`;
const SHOW_MOONS = false; // moons are built and clickable, but parked for now
const miniGroup = new THREE.Group(); scene.add(miniGroup);
const miniLabels = document.getElementById("minis")!;
type Mini = { mesh: THREE.Mesh; moon: Moon; label: HTMLDivElement };
let minis: Mini[] = [];
function buildMinis(body: Body) {
  for (const m of minis) { miniGroup.remove(m.mesh); (m.mesh.material as THREE.ShaderMaterial).dispose(); m.label.remove(); }
  minis = [];
  const list = SHOW_MOONS ? body.moons ?? [] : [];
  list.forEach((moon, i) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: MINI_VERT, fragmentShader: MINI_FRAG, uniforms: { map: { value: GRAY }, sunDir: { value: sunDir }, tint: { value: new THREE.Vector3(...(moon.tint ?? [1, 1, 1])) } } });
    const t = tex(moon.tex, true, () => (mat.uniforms.map.value = GRAY));
    loader.load(moon.tex, () => (mat.uniforms.map.value = t), undefined, () => {});
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), mat);
    mesh.userData.slot = i;
    mesh.userData.moon = moon;
    miniGroup.add(mesh);
    const label = document.createElement("div"); label.className = "label"; label.textContent = moon.name; miniLabels.appendChild(label);
    minis.push({ mesh, moon, label });
  });
}
const MINI_DEPTH = 2.45, _nv = new THREE.Vector3();
const panelEl = document.getElementById("panel")!;
let mobile = false;
function placeMinis() {
  // a row directly under the control panel, laid out in pixels then unprojected
  const pr = panelEl.getBoundingClientRect();
  const n = minis.length, pitch = Math.min(86, 300 / Math.max(n, 1));
  const x0 = pr.right - 300 + (300 - pitch * (n - 1)) / 2;
  const y = pr.bottom + 70;
  const pxPerUnit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * MINI_DEPTH);
  for (const m of minis) {
    const i = m.mesh.userData.slot as number;
    const px = x0 + i * pitch;
    _nv.set((px / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    m.mesh.position.copy(camera.position).addScaledVector(_nv, MINI_DEPTH);
    m.mesh.scale.setScalar((22 + m.moon.size * 40) / pxPerUnit);
    m.mesh.visible = !mobile;
    m.label.style.display = mobile ? "none" : "";
  }
}
function placeLabels() {
  const v = new THREE.Vector3();
  for (const m of minis) {
    v.copy(m.mesh.position); v.y -= m.mesh.scale.x * 1.35; v.project(camera);
    m.label.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; m.label.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  }
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), params.bloomStrength, params.bloomRadius, params.bloomThreshold);
composer.addPass(bloom); composer.addPass(new OutputPass());

// ---------- panel ----------
type CloudPreset = "Satellite" | "None" | "Clear" | "Scattered" | "Overcast" | "Storm" | "Live" | "Clouds";
const ui = { clouds: "Satellite" as CloudPreset, twilight: params.twilightTint };
const pane = new Pane({ container: document.getElementById("panel")!, title: "Earth" });
const fGlobe = pane.addFolder({ title: "Globe" });
fGlobe.addBinding(params, "rotationSpeed", { min: -10, max: 10, step: 0.1, label: "spin" });
const bTilt = fGlobe.addBinding(params, "axialTilt", { min: -45, max: 45, step: 0.5, label: "tilt" });
fGlobe.addBinding(params, "exposure", { min: 0.4, max: 2.5, step: 0.01, label: "exposure" }).on("change", (e: { value: number }) => (renderer.toneMappingExposure = e.value));
const fSun = pane.addFolder({ title: "Sun" });
fSun.addBinding(params, "sunAzimuth", { min: 0, max: 360, step: 1, label: "direction" }).on("change", updateSun);
fSun.addBinding(params, "sunElevation", { min: -45, max: 45, step: 0.5, label: "height" }).on("change", updateSun);
const bTwilight = fSun.addBinding(ui, "twilight", { min: 0, max: 1, step: 0.01, label: "sunset glow" }).on("change", (e: { value: number }) => { params.twilightTint = e.value; params.twilightWidth = 0.06 + 0.12 * e.value; });
const bLights = fSun.addBinding(params, "nightIntensity", { min: 0, max: 5, step: 0.05, label: "city lights" });
const fClouds = pane.addFolder({ title: "Clouds & Weather" });
const bSky = fClouds.addBinding(ui, "clouds", { options: { Satellite: "Satellite", None: "None" }, label: "sky" }).on("change", (e: { value: CloudPreset }) => applyWeather(e.value));
const liveStatus = { text: "" };
const liveRow = fClouds.addBinding(liveStatus, "text", { readonly: true, label: "status" });
fClouds.addBinding(params, "cloudDensity", { min: 0, max: 1.6, step: 0.01, label: "opacity" });
const fStorm = pane.addFolder({ title: "Storms" });
fStorm.addBinding(params, "stormCount", { min: 1, max: 4, step: 1, label: "hurricanes" });
fStorm.addBinding(params, "stormSize", { min: 0.1, max: 0.5, step: 0.01, label: "size" });
fStorm.addBinding(params, "stormSpin", { min: 0, max: 0.2, step: 0.005, label: "spin" });
fStorm.addBinding(params, "lightning", { min: 0, max: 1, step: 0.01, label: "lightning" });
const fLook = pane.addFolder({ title: "Atmosphere & Ocean" });
const bAtmo = fLook.addBinding(params, "atmosphereIntensity", { min: 0, max: 2, step: 0.01, label: "atmosphere" });
fLook.addBinding(params, "bloomStrength", { min: 0, max: 1.5, step: 0.01, label: "glow" });
const bOcean = fLook.addBinding(params, "oceanBoost", { min: 0, max: 3, step: 0.01, label: "ocean brightness" });
const bGlint = fLook.addBinding(params, "oceanSpecular", { min: 0, max: 3, step: 0.01, label: "sun glint" });
const bBands = fLook.addBinding(params, "bandFlow", { min: 0, max: 3, step: 0.05, label: "band flow" });
const fStar = pane.addFolder({ title: "Star" });
fStar.addBinding(params, "granulation", { min: 0, max: 3, step: 0.05, label: "granulation" });
fStar.addBinding(params, "coronaIntensity", { min: 0, max: 3, step: 0.05, label: "corona" });
fStar.addBinding(params, "promIntensity", { min: 0, max: 3, step: 0.05, label: "prominences" });
fStar.addBinding(params, "sunBrightness", { min: 0.3, max: 2, step: 0.01, label: "brightness" });
fStar.addBinding(params, "surfaceFlow", { min: 0, max: 3, step: 0.05, label: "surface flow" });
fStar.addBinding(params, "coronaVolume", { min: 0, max: 3, step: 0.05, label: "corona depth" });
fStar.addBinding(params, "coronaTurbulence", { min: 0, max: 3, step: 0.05, label: "turbulence" });
fStar.addBinding(params, "loopIntensity", { min: 0, max: 3, step: 0.05, label: "magnetic loops" });
fStar.addBinding(params, "loopActivity", { min: 0, max: 3, step: 0.05, label: "flare activity" });
fStar.hidden = true;
const fQuality = pane.addFolder({ title: "Quality", expanded: false });
const bSet = fQuality.addBinding(params, "textureSet", { options: { "NASA 16K": "NASA 16K", "NASA 8K": "NASA 8K" }, label: "textures" }).on("change", (e: { value: SetName }) => applyEarthSet(e.value));
fQuality.addBinding(params, "pixelRatio", { min: 0.5, max: 3, step: 0.25, label: "render scale" }).on("change", (e: { value: number }) => { renderer.setPixelRatio(e.value); onResize(); });

let liveTex: THREE.Texture | null = null;
async function loadLive() {
  liveStatus.text = "fetching NASA GIBS…";
  try { liveTex = await loadLiveClouds(params.liveDate, (d, t) => (liveStatus.text = `tiles ${d}/${t}`)); liveStatus.text = `clouds for ${params.liveDate}`; }
  catch (err) { liveStatus.text = "failed: " + (err as Error).message; }
}
function applyWeather(w: CloudPreset) {
  ui.clouds = w;
  const presets: Record<CloudPreset, Partial<typeof params>> = {
    Satellite: { cloudMode: 0, cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.0, stormCount: 0, lightning: 0 },
    Clouds:    { cloudMode: 0, cloudDensity: 1.0, stormCount: 0, lightning: 0 },
    None:      { cloudMode: 0, cloudDensity: 0.0, stormCount: 0, lightning: 0 },
    Live:      { cloudMode: 2, cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.0, stormCount: 0, lightning: 0 },
    Clear:     { cloudMode: 1, cloudCoverage: 0.32, cloudDensity: 0.9, cloudSoftness: 0.25, cloudScale: 2.2, stormCount: 0, lightning: 0 },
    Scattered: { cloudMode: 1, cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.0, cloudScale: 2.2, stormCount: 0, lightning: 0 },
    Overcast:  { cloudMode: 1, cloudCoverage: 0.78, cloudDensity: 1.05, cloudSoftness: 0.15, cloudScale: 1.3, stormCount: 1, lightning: 0.15 },
    Storm:     { cloudMode: 1, cloudCoverage: 0.62, cloudDensity: 1.1, cloudSoftness: 0.1, cloudScale: 2.0, stormCount: 4, lightning: 1.0, stormSize: 0.26, stormSpin: 0.04 },
  };
  Object.assign(params, presets[w]);
  if (w === "Live") loadLive(); else liveStatus.text = "";
  fStorm.hidden = w !== "Storm"; liveRow.hidden = w !== "Live";
  pane.refresh();
}
fStorm.hidden = true; liveRow.hidden = true;

// ---------- bodies ----------
let current: Body = byId("earth")!;
let parentBody: Body | null = null;
const titleH = document.querySelector("#title h1")!;
const fade = document.getElementById("fade")!, backBtn = document.getElementById("back") as HTMLButtonElement;

async function applyEarthSet(name: SetName) {
  const set = EARTH_SETS[name];
  const ok = name === "Bootstrap 8K" || (await fetch(set.dir + set.day, { method: "HEAD" }).then((r) => r.ok).catch(() => false));
  if (!ok) { const next: SetName = name === "NASA 16K" ? "NASA 8K" : "Bootstrap 8K"; params.textureSet = next; return applyEarthSet(next); }
  const u = planetMat.uniforms;
  u.dayMap.value = tex(set.dir + set.day, true); u.nightMap.value = tex(set.dir + set.night, true);
  u.normalMap.value = tex(set.dir + set.normal); u.specularMap.value = tex(set.dir + set.specular);
  const nasa = name.startsWith("NASA");
  params.oceanBoost = nasa ? 1.0 : 0; params.oceanTint = nasa ? { r: 0.72, g: 0.86, b: 1.12 } : { r: 1, g: 1, b: 1 }; params.normalScale = nasa ? 1.4 : 0.9;
  pane.refresh();
}

function moonAsBody(moon: Moon, parent: Body): Body {
  return { id: moon.id, name: moon.name, blurb: `moon of ${parent.name}`, dir: "", tex: { day: moon.tex }, spin: moon.spin, tilt: moon.id === "moon" ? 6.7 : 0, exposure: 1.15 };
}

function showBody(body: Body, parent: Body | null = null) {
  current = body; parentBody = parent;
  const u = planetMat.uniforms;
  const isEarth = body.id === "earth";
  const star = !!body.star;
  planet.material = star ? sunMat : planetMat;
  corona.visible = star; coronaVol.visible = star;
  if (star) { ensureSunVideo(); ensureSunLoops(); } else { if (sunVideo) sunVideo.pause(); if (sunLoops) sunLoops.group.visible = false; }
  if (star) {
    sunMat.uniforms.photoMap.value = tex(body.dir + body.tex.day, true);
    sunMat.uniforms.chromoMap.value = tex(body.dir + body.tex.clouds!, true);
    coronaMat.uniforms.limb304.value = tex(body.dir + "limb304.png", true);
    coronaMat.uniforms.limb171.value = tex(body.dir + "limb171.png", true);
    coronaMat.uniforms.limb304.value.wrapS = coronaMat.uniforms.limb171.value.wrapS = THREE.RepeatWrapping;
  }
  if (isEarth) { applyEarthSet(params.textureSet); }
  else {
    u.dayMap.value = tex(body.dir + body.tex.day, true);
    u.nightMap.value = body.tex.night ? tex(body.dir + body.tex.night, true) : BLACK;
    u.normalMap.value = body.tex.normal ? tex(body.dir + body.tex.normal) : FLAT_NORMAL;
    u.specularMap.value = body.tex.specular ? tex(body.dir + body.tex.specular) : BLACK;
    params.oceanBoost = 0; params.normalScale = body.tex.normal ? (body.relief ?? 1.2) : 0;
  }
  params.rotationSpeed = body.spin; params.axialTilt = body.tilt; params.exposure = body.exposure; renderer.toneMappingExposure = body.exposure;
  params.nightIntensity = body.cityLights ? 2.6 : 0; params.oceanSpecular = body.ocean ? 1.0 : 0;
  params.bandFlow = body.bands ?? 0;
  const atm = body.atmosphere;
  params.atmosphereIntensity = atm?.intensity ?? 0; params.atmosphereFalloff = atm?.falloff ?? 0.22;
  atmosphere.visible = !!atm || star;
  if (star) { // chromosphere shell: same additive shell, all-round "lit"
    atmosphere.scale.setScalar(1.03); atmoMat.uniforms.shellRadius.value = 1.03;
    atmoMat.uniforms.dayColor.value.set(1.0, 0.30, 0.08); atmoMat.uniforms.nightColor.value.set(1.0, 0.30, 0.08); atmoMat.uniforms.twilightColor.value.set(1.0, 0.45, 0.15);
    params.atmosphereIntensity = 0.38; params.atmosphereFalloff = 0.16;
  }
  if (atm) {
    atmosphere.scale.setScalar(atm.shell); atmoMat.uniforms.shellRadius.value = atm.shell;
    atmoMat.uniforms.dayColor.value.set(...atm.day); atmoMat.uniforms.nightColor.value.set(...atm.night); atmoMat.uniforms.twilightColor.value.set(...atm.twilight);
  }
  // clouds
  clouds.visible = !!body.sky;
  cloudMat.uniforms.opaqueClouds.value = body.sky === "venus" ? 1 : 0;
  clouds.scale.setScalar(body.sky === "venus" ? 1.02 : 1.0);
  if (body.sky === "venus") { cloudMat.uniforms.cloudMap.value = tex(body.dir + body.tex.clouds!, true); }
  else if (body.sky === "earth") { cloudMat.uniforms.cloudMap.value = earthClouds; }
  params.cloudDriftSpeed = body.cloudDrift ?? 0; params.cloudShadow = body.sky === "earth" ? 0.6 : 0;
  // rings
  rings.visible = !!body.rings;
  if (body.rings) { rings.geometry.dispose(); rings.geometry = ringGeometry(body.rings.inner, body.rings.outer); ringMat.uniforms.ringMap.value = tex(body.rings.tex); u.ringMap.value = ringMat.uniforms.ringMap.value; u.ringRadii.value.set(body.rings.inner, body.rings.outer); }
  u.ringShadow.value = body.rings ? 1 : 0;
  clouds.visible = clouds.visible && !star;
  // sky dropdown per body
  const skyOpts = body.sky === "venus" ? { Clouds: "Clouds", None: "None" } : { Satellite: "Satellite", None: "None" };
  (bSky as any).options = Object.entries(skyOpts).map(([text, value]) => ({ text, value }));
  applyWeather(body.sky === "venus" ? "Clouds" : "Satellite");
  // panel visibility
  bLights.hidden = !body.cityLights; bTwilight.hidden = !atm; fClouds.hidden = !body.sky; bAtmo.hidden = !atm;
  fSun.hidden = star; fStar.hidden = !star; fLook.hidden = star;
  bOcean.hidden = !body.ocean; bGlint.hidden = !body.ocean; bBands.hidden = !body.bands; bSet.hidden = !isEarth; bTilt.hidden = false;
  pane.title = body.name;
  fLook.title = body.ocean ? "Atmosphere & Ocean" : atm ? "Atmosphere" : "Look";
  // chrome
  titleH.textContent = body.name.toUpperCase();
  backBtn.hidden = !parent; if (parent) backBtn.textContent = `‹ ${parent.name}`;
  buildMinis(parent ? { ...body, moons: [] } : body);
  history.replaceState(null, "", `?body=${body.id}`);
  pane.refresh();
}
function switchTo(body: Body, parent: Body | null = null) {
  fade.classList.add("on");
  setTimeout(() => { showBody(body, parent); requestAnimationFrame(() => setTimeout(() => fade.classList.remove("on"), 250)); }, 350);
}
function step(dir: 1 | -1) { const base = parentBody ?? current; const i = BODIES.findIndex((b) => b.id === base.id); switchTo(BODIES[(i + dir + BODIES.length) % BODIES.length]); }
document.getElementById("prev")!.addEventListener("click", () => step(-1));
document.getElementById("next")!.addEventListener("click", () => step(1));
backBtn.addEventListener("click", () => parentBody && switchTo(parentBody));
addEventListener("keydown", (e) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); if (e.key === "Escape" && parentBody) switchTo(parentBody); });

// ---------- drag to rotate + mini click ----------
let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0, pitch = 0, downX = 0, downY = 0;
const DRAG_GAIN = 0.0045;
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = downX = e.clientX; lastY = downY = e.clientY; velX = velY = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
canvas.addEventListener("pointermove", (e) => {
  if (dragging) { const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; velX = dx * DRAG_GAIN; velY = dy * DRAG_GAIN; spin.rotation.y += velX; pitch = THREE.MathUtils.clamp(pitch + velY, -1.2, 1.2); }
  else { canvas.style.cursor = pickMini(e.clientX, e.clientY) ? "pointer" : "grab"; }
});
function pickMini(x: number, y: number) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(minis.map((m) => m.mesh))[0]; return hit ? (hit.object.userData.moon as Moon) : null; }
const endDrag = (e: PointerEvent) => {
  if (!dragging) return; dragging = false; canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = "grab";
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 4) { const moon = pickMini(e.clientX, e.clientY); if (moon) switchTo(moonAsBody(moon, current), current); }
};
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
canvas.style.cursor = "grab";

// ---------- boot ----------
(window as any).bm = { params, loadLive, applyWeather, applyEarthSet, setStorm, showBody, switchTo, pane, spin, tilt, cloudMat, planetMat, coronaMat, cvolMat, BODIES };
const q = new URLSearchParams(location.search);
showBody(byId(q.get("body") ?? "earth") ?? byId("earth")!);
const qc = q.get("clouds");
if (qc === "live") applyWeather("Live"); else if (qc === "satellite") applyWeather("Satellite"); else if (qc) applyWeather((qc[0].toUpperCase() + qc.slice(1)) as CloudPreset);
pane.refresh();

// ---------- loop ----------
const timer = new THREE.Timer();
let cloudDrift = 0; const statsEl = document.getElementById("stats")!; let frames = 0, fpsT = 0;
function onResize() {
  const aspect = innerWidth / innerHeight;
  mobile = innerWidth < 820 || aspect < 0.9;
  document.body.classList.toggle("mobile", mobile);
  camera.aspect = aspect; camera.updateProjectionMatrix();
  // desktop: globe sits left of centre to leave room for the panel; mobile: centred, camera backs off so it fits the width
  tilt.position.x = mobile ? 0 : -0.42;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.z = mobile ? Math.max(4.45, 1.28 / (aspect * halfTan)) : 4.45;
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}
onResize();
addEventListener("resize", onResize);
const _m = new THREE.Matrix4(); const _toCam = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  timer.update(); const dt = Math.min(timer.getDelta(), 0.1); const t = timer.getElapsed();
  if (!dragging) { spin.rotation.y += THREE.MathUtils.degToRad(params.rotationSpeed) * dt + velX; pitch = THREE.MathUtils.clamp(pitch + velY, -1.2, 1.2); velX *= params.dragInertia; velY *= params.dragInertia; pitch *= 0.995; }
  tilt.rotation.z = THREE.MathUtils.degToRad(params.axialTilt); tilt.rotation.x = pitch + THREE.MathUtils.degToRad(current.view ?? 7);
  cloudDrift += params.cloudDriftSpeed * dt;
  tilt.updateWorldMatrix(true, true);

  const eu = planetMat.uniforms;
  eu.time.value = t; eu.nightIntensity.value = params.nightIntensity; eu.nightAmbient.value = params.nightAmbient; eu.nightWarmth.value = params.nightWarmth;
  eu.twilightWidth.value = params.twilightWidth; eu.twilightTint.value = params.twilightTint;
  eu.oceanSpecular.value = params.oceanSpecular; eu.oceanShininess.value = params.oceanShininess; eu.normalScale.value = params.normalScale;
  eu.oceanBoost.value = params.oceanBoost; eu.oceanTint.value.set(params.oceanTint.r, params.oceanTint.g, params.oceanTint.b);
  eu.atmosphereIntensity.value = params.atmosphereIntensity; eu.cloudShadow.value = params.cloudShadow; eu.cloudDensity.value = params.cloudDensity; eu.cloudDrift.value = cloudDrift;
  eu.bandFlow.value = params.bandFlow;
  const liveReady = params.cloudMode === 2 && liveTex;
  eu.cloudMap.value = current.sky === "venus" ? BLACK : liveReady ? liveTex : earthClouds;
  tilt.getWorldPosition(eu.planetCenterW.value); eu.ringNormalW.value.set(0, 1, 0).transformDirection(tilt.matrixWorld);

  const cu = cloudMat.uniforms;
  cu.time.value = t; cu.cloudDensity.value = params.cloudDensity; cu.cloudCoverage.value = params.cloudCoverage; cu.cloudSoftness.value = params.cloudSoftness; cu.cloudScale.value = params.cloudScale;
  cu.cloudDrift.value = cloudDrift; cu.twilightWidth.value = params.twilightWidth; cu.cloudRelief.value = params.cloudRelief;
  cu.cloudMode.value = liveReady ? 0 : params.cloudMode === 2 ? 1 : params.cloudMode;
  if (current.sky === "earth") cu.cloudMap.value = liveReady ? liveTex : earthClouds;
  cu.stormCount.value = params.stormCount; cu.stormSize.value = params.stormSize; cu.stormSpin.value = params.stormSpin; cu.stormDarkness.value = params.stormDarkness; cu.lightning.value = params.lightning;
  _m.copy(clouds.matrixWorld).invert(); cu.sunObj.value.copy(sunDir).transformDirection(_m).normalize();

  atmoMat.uniforms.intensity.value = params.atmosphereIntensity; atmoMat.uniforms.falloff.value = params.atmosphereFalloff;
  if (current.star) {
    const su = sunMat.uniforms; su.time.value = t; su.granulation.value = params.granulation; su.brightness.value = params.sunBrightness; su.flow.value = params.surfaceFlow;
    const vu = cvolMat.uniforms; vu.time.value = t; vu.intensity.value = params.coronaVolume; vu.turbulence.value = params.coronaTurbulence;
    tilt.getWorldPosition(vu.sunCenter.value); vu.sunAxis.value.set(0, 1, 0).transformDirection(tilt.matrixWorld);
    if (sunLoops) { sunLoops.setIntensity(params.loopIntensity); sunLoops.setActivity(params.loopActivity); sunLoops.update(dt, t); }
    const cu2 = coronaMat.uniforms; cu2.time.value = t; cu2.coronaIntensity.value = params.coronaIntensity; cu2.promIntensity.value = params.promIntensity;
    tilt.getWorldPosition(corona.position); corona.quaternion.copy(camera.quaternion);
    // light the chromosphere shell from the viewer so the whole limb glows
    _toCam.copy(camera.position).sub(corona.position).normalize(); atmoMat.uniforms.sunDir.value = _toCam;
  } else { atmoMat.uniforms.sunDir.value = sunDir; }
  atmosphere.getWorldPosition(atmoMat.uniforms.earthCenter.value);
  tilt.getWorldPosition(ringMat.uniforms.planetCenter.value);
  bloom.strength = params.bloomStrength; bloom.threshold = params.bloomThreshold; bloom.radius = params.bloomRadius;
  for (const m of minis) m.mesh.rotation.y += THREE.MathUtils.degToRad(m.moon.spin * 4) * dt;
  if (space) { space.group.rotation.y += velX * 0.03; space.update(dt, t); }
  placeMinis(); placeLabels();

  renderer.info.reset(); composer.render();
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { statsEl.textContent = `${Math.round(frames / fpsT)} FPS · ${renderer.info.render.triangles.toLocaleString()} tris`; frames = 0; fpsT = 0; }
});

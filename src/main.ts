import * as THREE from "three";
import { Pane } from "tweakpane";
import earthVert from "./shaders/earth.vert.glsl?raw";
import earthFrag from "./shaders/earth.frag.glsl?raw";
import cloudsVert from "./shaders/clouds.vert.glsl?raw";
import cloudsFrag from "./shaders/clouds.frag.glsl?raw";
import atmoVert from "./shaders/atmosphere.vert.glsl?raw";
import atmoFrag from "./shaders/atmosphere.frag.glsl?raw";

const TEX = "/textures/8k/";

const params = {
  rotationSpeed: 1.5, // deg/s
  axialTilt: 23.4,
  exposure: 1.1,
  sunAzimuth: 165,
  sunElevation: 8,
  twilightWidth: 0.12,
  twilightTint: 0.6,
  nightIntensity: 1.6,
  nightAmbient: 0.05,
  cloudMode: 1 as 0 | 1,
  cloudDensity: 1.0,
  cloudCoverage: 0.55,
  cloudSoftness: 0.18,
  cloudScale: 2.2,
  cloudDriftSpeed: 0.004,
  cloudShadow: 0.6,
  atmosphereIntensity: 1.0,
  atmosphereFalloff: 4.0,
  oceanSpecular: 1.2,
  oceanShininess: 180,
  normalScale: 0.9,
  weather: "Scattered" as "Clear" | "Scattered" | "Overcast" | "Storm",
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(params.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 4.6);

// loaders
const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
function tex(name: string, srgb = false) {
  const t = loader.load(TEX + name);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const dayMap = tex("8k_earth_daymap.jpg", true);
const nightMap = tex("8k_earth_nightmap.jpg", true);
const normalMap = tex("8k_earth_normal_map.jpg");
const specularMap = tex("8k_earth_specular_map.jpg");
const cloudMap = tex("8k_earth_clouds.jpg");
const starMap = tex("8k_stars_milky_way.jpg", true);

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
    intensity: { value: params.atmosphereIntensity },
    falloff: { value: params.atmosphereFalloff },
  },
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.075, 128, 128), atmoMat);
tilt.add(atmosphere);

const stars = new THREE.Mesh(
  new THREE.SphereGeometry(80, 64, 64),
  new THREE.MeshBasicMaterial({ map: starMap, side: THREE.BackSide, color: new THREE.Color(0.55, 0.55, 0.6) }),
);
stars.rotation.set(0.3, 1.2, 0.1);
scene.add(stars);

// ---------- panel ----------
const pane = new Pane({ container: document.getElementById("panel")!, title: "Earth" });
const fGlobe = pane.addFolder({ title: "Globe" });
fGlobe.addBinding(params, "rotationSpeed", { min: 0, max: 20, step: 0.1, label: "spin °/s" });
fGlobe.addBinding(params, "axialTilt", { min: -90, max: 90, step: 0.1, label: "tilt °" });
fGlobe.addBinding(params, "exposure", { min: 0.2, max: 3, step: 0.01 }).on("change", (e: { value: number }) => (renderer.toneMappingExposure = e.value));

const fSun = pane.addFolder({ title: "Sun" });
fSun.addBinding(params, "sunAzimuth", { min: 0, max: 360, step: 1, label: "azimuth °" }).on("change", updateSun);
fSun.addBinding(params, "sunElevation", { min: -60, max: 60, step: 0.5, label: "elevation °" }).on("change", updateSun);
fSun.addBinding(params, "twilightWidth", { min: 0.01, max: 0.4, step: 0.005, label: "twilight width" });
fSun.addBinding(params, "twilightTint", { min: 0, max: 1, step: 0.01, label: "twilight tint" });

const fNight = pane.addFolder({ title: "Night" });
fNight.addBinding(params, "nightIntensity", { min: 0, max: 5, step: 0.05, label: "city lights" });
fNight.addBinding(params, "nightAmbient", { min: 0, max: 0.3, step: 0.005, label: "moonlight" });

const fClouds = pane.addFolder({ title: "Clouds & Weather" });
fClouds.addBinding(params, "weather", { options: { Clear: "Clear", Scattered: "Scattered", Overcast: "Overcast", Storm: "Storm" } }).on("change", (e: { value: typeof params.weather }) => applyWeather(e.value));
fClouds.addBinding(params, "cloudMode", { options: { "Satellite (static)": 0, Procedural: 1 }, label: "mode" });
fClouds.addBinding(params, "cloudDensity", { min: 0, max: 2, step: 0.01, label: "density" });
fClouds.addBinding(params, "cloudCoverage", { min: 0, max: 1, step: 0.01, label: "coverage" });
fClouds.addBinding(params, "cloudSoftness", { min: 0.01, max: 0.5, step: 0.01, label: "softness" });
fClouds.addBinding(params, "cloudScale", { min: 0.5, max: 8, step: 0.1, label: "scale" });
fClouds.addBinding(params, "cloudDriftSpeed", { min: 0, max: 0.05, step: 0.0005, label: "drift" });
fClouds.addBinding(params, "cloudShadow", { min: 0, max: 1, step: 0.01, label: "shadows" });

const fAtmo = pane.addFolder({ title: "Atmosphere & Ocean" });
fAtmo.addBinding(params, "atmosphereIntensity", { min: 0, max: 3, step: 0.01, label: "glow" });
fAtmo.addBinding(params, "atmosphereFalloff", { min: 1, max: 12, step: 0.1, label: "falloff" });
fAtmo.addBinding(params, "oceanSpecular", { min: 0, max: 4, step: 0.01, label: "sun glint" });
fAtmo.addBinding(params, "oceanShininess", { min: 8, max: 600, step: 1, label: "glint size" });
fAtmo.addBinding(params, "normalScale", { min: 0, max: 3, step: 0.01, label: "relief" });

const fQuality = pane.addFolder({ title: "Quality", expanded: false });
fQuality.addBinding(params, "pixelRatio", { min: 0.5, max: 3, step: 0.25, label: "pixel ratio" }).on("change", (e: { value: number }) => { renderer.setPixelRatio(e.value); onResize(); });

function applyWeather(w: typeof params.weather) {
  const presets = {
    Clear: { cloudCoverage: 0.25, cloudDensity: 0.7, cloudSoftness: 0.12 },
    Scattered: { cloudCoverage: 0.55, cloudDensity: 1.0, cloudSoftness: 0.18 },
    Overcast: { cloudCoverage: 0.85, cloudDensity: 1.4, cloudSoftness: 0.3 },
    Storm: { cloudCoverage: 0.75, cloudDensity: 1.8, cloudSoftness: 0.08 },
  }[w];
  Object.assign(params, presets);
  params.cloudMode = 1;
  pane.refresh();
}

// ---------- loop ----------
const clock = new THREE.Clock();
let cloudDrift = 0;
const statsEl = document.getElementById("stats")!;
let frames = 0, fpsT = 0;

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", onResize);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  spin.rotation.y += THREE.MathUtils.degToRad(params.rotationSpeed) * dt;
  tilt.rotation.z = THREE.MathUtils.degToRad(params.axialTilt);
  cloudDrift += params.cloudDriftSpeed * dt;

  const eu = earthMat.uniforms;
  eu.nightIntensity.value = params.nightIntensity;
  eu.nightAmbient.value = params.nightAmbient;
  eu.twilightWidth.value = params.twilightWidth;
  eu.twilightTint.value = params.twilightTint;
  eu.oceanSpecular.value = params.oceanSpecular;
  eu.oceanShininess.value = params.oceanShininess;
  eu.normalScale.value = params.normalScale;
  eu.atmosphereIntensity.value = params.atmosphereIntensity;
  eu.cloudShadow.value = params.cloudShadow;
  eu.cloudDensity.value = params.cloudDensity;
  eu.cloudDrift.value = cloudDrift;
  eu.cloudMode.value = params.cloudMode;

  const cu = cloudMat.uniforms;
  cu.time.value = t;
  cu.cloudDensity.value = params.cloudDensity;
  cu.cloudCoverage.value = params.cloudCoverage;
  cu.cloudSoftness.value = params.cloudSoftness;
  cu.cloudScale.value = params.cloudScale;
  cu.cloudDrift.value = cloudDrift;
  cu.twilightWidth.value = params.twilightWidth;
  cu.cloudMode.value = params.cloudMode;
  clouds.rotation.y = params.cloudMode === 1 ? 0 : 0; // drift handled in uv/time

  atmoMat.uniforms.intensity.value = params.atmosphereIntensity;
  atmoMat.uniforms.falloff.value = params.atmosphereFalloff;

  renderer.render(scene, camera);

  frames++; fpsT += dt;
  if (fpsT >= 0.5) { statsEl.textContent = `${Math.round(frames / fpsT)} FPS · ${renderer.info.render.triangles.toLocaleString()} tris`; frames = 0; fpsT = 0; }
});

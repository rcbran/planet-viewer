// Standalone harness for src/space.ts: same renderer / post stack as main.ts, a black stand-in planet.
// Query params: debug=1 (magenta alignment sprites), notex=1, nostars=1, sun=1 (sun on-screen),
// yaw=<deg>, gain=<f>, zod=<f>, panel=1 (shade the control-panel strip), bench=1 (ms/frame in #stats).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createSpace, type SpaceParams } from "./space";

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 4.9);

const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), new THREE.MeshBasicMaterial({ color: 0x000000 }));
planet.position.x = -0.42;
scene.add(planet);

const space = createSpace(renderer, camera);
const params = (space as unknown as { __params: SpaceParams }).__params;
scene.add(space.group);

function sunFrom(azDeg: number, elDeg: number) {
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}
space.setSunDir(q.has("sun") ? sunFrom(num("sunAz", 250), num("sunEl", 12)) : sunFrom(165, 8));
if (q.has("sun")) params.sunGlare = 1;
if (q.has("debug")) { params.debug = 1; params.twinkle = 0; }
if (q.has("notex")) params.skyGain = 0;
if (q.has("nostars")) params.starMagCut = -10;
if (q.has("yaw")) params.skyYawDeg = num("yaw", params.skyYawDeg);
if (q.has("gain")) params.skyGain = num("gain", params.skyGain);
if (q.has("zod")) params.zodiacal = num("zod", params.zodiacal);
if (q.has("drift")) params.driftDegPerSec = num("drift", 0);
if (q.has("twinkle")) params.twinkle = num("twinkle", params.twinkle);
if (q.has("intensity")) params.starIntensity = num("intensity", params.starIntensity);
if (q.has("nospace")) space.group.visible = false;
if (q.has("sat")) params.skySaturation = num("sat", 1);
if (q.has("panel")) document.getElementById("panel")!.style.display = "block";
if (q.has("spin")) { camera.position.set(Math.sin(num("spin", 0)) * 4.9, 0, Math.cos(num("spin", 0)) * 4.9); camera.lookAt(0, 0, 0); }

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const statsEl = document.getElementById("stats")!;
const timer = new THREE.Timer();
let frames = 0, fpsT = 0;
function frame() {
  timer.update();
  const dt = timer.getDelta();
  space.update(dt, timer.getElapsed());
  composer.render();
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { statsEl.textContent = `${Math.round(frames / fpsT)} FPS`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
frame();

// crude cost probe: render N frames back to back with gl.finish(), with and without the space group
async function bench(n = 120) {
  const gl = renderer.getContext();
  const run = () => { const t0 = performance.now(); for (let i = 0; i < n; i++) { space.update(1 / 60, i / 60); composer.render(); gl.finish(); } return (performance.now() - t0) / n; };
  run(); const withSpace = run();
  space.group.visible = false; run(); const without = run(); space.group.visible = true;
  return { withSpace: +withSpace.toFixed(2), without: +without.toFixed(2), delta: +(withSpace - without).toFixed(2) };
}
(window as unknown as { bench: typeof bench; space: typeof space; params: SpaceParams }).bench = bench;
(window as unknown as { space: typeof space }).space = space;
(window as unknown as { params: SpaceParams }).params = params;
if (q.has("bench")) setTimeout(async () => { (window as unknown as { __bench: unknown }).__bench = await bench(); }, 9000);

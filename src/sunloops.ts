// Magnetic plasma loops above the Sun: arcades of glowing arches anchored over active regions
// (sunspot anchors), plasma flowing along them, periodic flares and occasional eruptions.
// One merged ribbon geometry, one draw call; all per-frame motion happens in the shaders, the
// CPU only writes a tiny per-loop state texture (flare / eruption progress).
import * as THREE from "three";
import loopsVert from "./shaders/loops-ribbon.vert.glsl?raw";
import loopsFrag from "./shaders/loops-ribbon.frag.glsl?raw";

export type SunLoops = {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setIntensity(v: number): void;
  setActivity(v: number): void;
  dispose(): void;
};

type Anchor = { lat: number; lon: number; strength: number };
type Loop = { system: number; flareWeight: number };
type System = {
  strength: number; loops: number[];
  nextFlare: number;              // on the activity clock
  flareStart: number;             // real elapsed, -Infinity when idle
};
type Eruption = { loop: number; start: number };

const SEGMENTS = 28;
const FLARE_RAMP = 1.5, FLARE_DECAY = 6.0;
const ERUPT_DURATION = 8.0, RESPAWN = 2.5;
const D2R = Math.PI / 180;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// lat/lon (deg) -> unit vector, matching THREE.SphereGeometry's UV mapping
function toVec(lat: number, lon: number, out = new THREE.Vector3()) {
  const la = lat * D2R, phi = (lon + 180) * D2R;
  return out.set(-Math.cos(la) * Math.cos(phi), Math.sin(la), Math.cos(la) * Math.sin(phi));
}

export function createSunLoops(anchors: Anchor[]): SunLoops {
  const rand = mulberry32(0x5eed5017);
  const rr = (a: number, b: number) => a + (b - a) * rand();
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15; // cheap ~N(0,1)

  // ---------- build loop descriptions ----------
  const footA: THREE.Vector3[] = [], footB: THREE.Vector3[] = [];
  const params: number[] = [], misc: number[] = [];
  const loops: Loop[] = [];
  const systems: System[] = [];

  const addLoop = (aLat: number, aLon: number, bLat: number, bLon: number, height: number, width: number,
    bright: number, system: number, flareWeight: number) => {
    const A = toVec(aLat, aLon), B = toVec(bLat, bLon);
    const len = Math.acos(THREE.MathUtils.clamp(A.dot(B), -1, 1)) + 2 * height; // rough arc length (R)
    footA.push(A); footB.push(B);
    params.push(height, width, rand(), rr(0.35, 0.9));
    misc.push(bright, flareWeight, loops.length, len);
    loops.push({ system, flareWeight });
    if (system >= 0) systems[system].loops.push(loops.length - 1);
  };

  // active regions: a bipolar pair of footpoint clusters straddling each sunspot, loops
  // bridging them as an arcade (roughly parallel, jittered)
  const sorted = [...anchors].filter((a) => Math.abs(a.lat) < 72).sort((a, b) => b.strength - a.strength);
  for (const a of sorted) {
    const s = THREE.MathUtils.clamp(a.strength, 0, 1);
    const sysIndex = systems.length;
    systems.push({ strength: s, loops: [], nextFlare: 0, flareStart: -Infinity });
    const count = Math.round(4 + 18 * s * s + rr(0, 3));
    const sep = 3 + 12 * (0.35 + 0.65 * s) * rr(0.8, 1.15);       // footpoint separation, deg
    const axis = rr(-25, 25) * D2R + (rand() < 0.5 ? 0 : Math.PI); // mostly east-west, like real bipoles
    const cosl = Math.max(Math.cos(a.lat * D2R), 0.3);
    const scatter = 1.2 + 3.2 * s;                                   // cluster radius, deg
    const crowd = Math.min(1, 4.5 / Math.sqrt(count));               // many overlapping loops -> each dimmer
    for (let i = 0; i < count; i++) {
      const f = 0.55 + 0.45 * rand();                                // some loops shorter/inner
      const d = sep * f;
      const ang = axis + gauss() * 0.22;
      // scatter mostly along the neutral line (perpendicular to the bipole axis) -> an arcade
      const along = gauss() * scatter * 0.6, across = gauss() * scatter * 1.1;
      const ca = Math.cos(axis), sa = Math.sin(axis);
      const ox = ca * along - sa * across, oy = sa * along + ca * across;
      const ax = ox - Math.cos(ang) * d / 2, ay = oy - Math.sin(ang) * d / 2;
      const bx = ox + Math.cos(ang) * d / 2, by = oy + Math.sin(ang) * d / 2;
      // arch height ~0.4-0.8 of the chord (semicircular-ish), taller over strong regions
      const h = THREE.MathUtils.clamp(d * D2R * rr(0.4, 0.8) * (1 + 0.5 * s), 0.05, 0.35);
      const w = 0.0042 + 0.0085 * (h / 0.35) * rr(0.7, 1.3);
      const bright = (0.24 + 0.22 * s) * rr(0.6, 1.05) * crowd;
      // only a few loops in a system carry most of a flare, the rest just warm up
      const fw = 0.12 + 0.88 * Math.pow(rand(), 2.2);
      addLoop(a.lat + ay, a.lon + ax / cosl, a.lat + by, a.lon + bx / cosl, h, w, bright, sysIndex, fw);
    }
  }
  // quiet Sun: small dim loops scattered everywhere so the whole sphere has some life
  const quiet = 44;
  for (let i = 0; i < quiet; i++) {
    const lat = Math.asin(rr(-0.9, 0.9)) / D2R, lon = rr(-180, 180);
    const d = rr(3, 6), ang = rr(0, Math.PI * 2);
    const cosl = Math.max(Math.cos(lat * D2R), 0.3);
    const h = THREE.MathUtils.clamp(d * D2R * rr(0.6, 1.1), 0.05, 0.11);
    addLoop(lat - Math.sin(ang) * d / 2, lon - Math.cos(ang) * d / 2 / cosl,
      lat + Math.sin(ang) * d / 2, lon + Math.cos(ang) * d / 2 / cosl, h, 0.0032 * rr(0.8, 1.2), rr(0.22, 0.36), -1, 0);
  }
  const N = loops.length;

  // ---------- merged ribbon geometry ----------
  const vertsPerLoop = (SEGMENTS + 1) * 2;
  const aU = new Float32Array(N * vertsPerLoop), aSide = new Float32Array(N * vertsPerLoop);
  const aFootA = new Float32Array(N * vertsPerLoop * 3), aFootB = new Float32Array(N * vertsPerLoop * 3);
  const aParam = new Float32Array(N * vertsPerLoop * 4), aMisc = new Float32Array(N * vertsPerLoop * 4);
  const index = new Uint32Array(N * SEGMENTS * 6);
  let vi = 0, ii = 0;
  for (let l = 0; l < N; l++) {
    const A = footA[l], B = footB[l];
    const base = vi;
    for (let sgm = 0; sgm <= SEGMENTS; sgm++) {
      const u = sgm / SEGMENTS;
      for (let side = -1; side <= 1; side += 2) {
        aU[vi] = u; aSide[vi] = side;
        aFootA.set([A.x, A.y, A.z], vi * 3); aFootB.set([B.x, B.y, B.z], vi * 3);
        aParam.set(params.slice(l * 4, l * 4 + 4), vi * 4); aMisc.set(misc.slice(l * 4, l * 4 + 4), vi * 4);
        vi++;
      }
    }
    for (let sgm = 0; sgm < SEGMENTS; sgm++) {
      const o = base + sgm * 2;
      index.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], ii); ii += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
  geo.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  geo.setAttribute("aFootA", new THREE.BufferAttribute(aFootA, 3));
  geo.setAttribute("aFootB", new THREE.BufferAttribute(aFootB, 3));
  geo.setAttribute("aParam", new THREE.BufferAttribute(aParam, 4));
  geo.setAttribute("aMisc", new THREE.BufferAttribute(aMisc, 4));
  // three needs a `position` attribute for bounds/culling; a dummy plus a generous sphere
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * vertsPerLoop * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.6);

  // ---------- per-loop dynamic state texture ----------
  const state = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) state[i * 4 + 2] = 1; // fade = 1
  const stateTex = new THREE.DataTexture(state, N, 1, THREE.RGBAFormat, THREE.FloatType);
  stateTex.minFilter = stateTex.magFilter = THREE.NearestFilter;
  stateTex.needsUpdate = true;

  const mat = new THREE.ShaderMaterial({
    vertexShader: loopsVert, fragmentShader: loopsFrag,
    uniforms: { stateTex: { value: stateTex }, stateN: { value: N }, time: { value: 0 }, intensity: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const group = new THREE.Group();
  group.name = "sunLoops";
  group.add(mesh);

  // ---------- scheduling (activity clock advances at `activity` x real time) ----------
  let activity = 1, aClock = 0, lastElapsed = -1, elapsedNow = 0;
  const flareInterval = (s: number) => (40 + 70 * (1 - s)) * rr(0.6, 1.5);
  for (const sys of systems) sys.nextFlare = flareInterval(sys.strength) * rr(0.05, 1);
  let nextErupt = rr(6, 14);
  const eruptInterval = () => rr(18, 40);
  const eruptions: Eruption[] = [];
  const eruptingLoop = new Set<number>();

  const pickEruptionLoop = () => {
    // weight systems by strength; avoid loops already erupting
    const pool = systems.flatMap((s) => s.loops.map((l) => ({ l, w: 0.15 + s.strength * s.strength })));
    const total = pool.reduce((t, p) => t + (eruptingLoop.has(p.l) ? 0 : p.w), 0);
    let r = rand() * total;
    for (const p of pool) { if (eruptingLoop.has(p.l)) continue; r -= p.w; if (r <= 0) return p.l; }
    return pool.length ? pool[pool.length - 1].l : -1;
  };
  const startFlare = (sys: System, at: number) => { sys.flareStart = at; };
  const midpoint = (l: number) => footA[l].clone().add(footB[l]).normalize();
  const startEruption = (loop: number, at: number) => {
    if (loop < 0 || eruptingLoop.has(loop)) return;
    // the loop takes a few close neighbours from its arcade with it, slightly staggered
    const sysIdx = loops[loop].system;
    const sys = systems[sysIdx];
    const m = midpoint(loop);
    const bundle = (sys ? sys.loops : [])
      .filter((l) => l !== loop && !eruptingLoop.has(l))
      .map((l) => ({ l, d: midpoint(l).distanceTo(m) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.floor(rand() * 2));
    eruptions.push({ loop, start: at }); eruptingLoop.add(loop);
    for (const b of bundle) { eruptions.push({ loop: b.l, start: at + rr(0.15, 0.6) }); eruptingLoop.add(b.l); }
    if (sys && at - sys.flareStart > FLARE_RAMP * 2) startFlare(sys, at); // eruptions come with a flare
  };

  const flareValue = (sys: System, t: number) => {
    const dt = t - sys.flareStart;
    if (dt < 0) return 0;
    if (dt < FLARE_RAMP) { const x = dt / FLARE_RAMP; return x * x * (3 - 2 * x); }
    const d = (dt - FLARE_RAMP) / FLARE_DECAY;
    return d >= 1 ? 0 : (1 - d) * (1 - d) * Math.exp(-d * 1.5) ;
  };

  function update(_dt: number, elapsed: number) {
    elapsedNow = elapsed;
    mat.uniforms.time.value = elapsed;
    const real = lastElapsed < 0 ? 0 : Math.max(0, elapsed - lastElapsed);
    lastElapsed = elapsed;
    aClock += real * activity;

    // schedule flares per system, eruptions globally
    for (const sys of systems) {
      while (aClock >= sys.nextFlare) {
        // convert the scheduled activity-time to real time (approx: the current frame)
        startFlare(sys, elapsed - (aClock - sys.nextFlare) / Math.max(activity, 1e-3));
        sys.nextFlare += flareInterval(sys.strength);
      }
    }
    while (aClock >= nextErupt) {
      startEruption(pickEruptionLoop(), elapsed - (aClock - nextErupt) / Math.max(activity, 1e-3));
      nextErupt += eruptInterval();
    }

    // per-system flare level -> per-loop state
    const sysFlare = systems.map((s) => flareValue(s, elapsed));
    for (let i = 0; i < N; i++) {
      const sIdx = loops[i].system;
      state[i * 4] = sIdx >= 0 ? sysFlare[sIdx] : 0;
      state[i * 4 + 1] = 0; state[i * 4 + 2] = 1;
    }
    for (let k = eruptions.length - 1; k >= 0; k--) {
      const e = eruptions[k];
      const t = elapsed - e.start;
      if (t < ERUPT_DURATION) {
        state[e.loop * 4 + 1] = t / ERUPT_DURATION;
      } else if (t < ERUPT_DURATION + RESPAWN) {
        const f = (t - ERUPT_DURATION) / RESPAWN;
        state[e.loop * 4 + 2] = f * f; // respawn: the loop refills from the footpoints
      } else {
        eruptions.splice(k, 1); eruptingLoop.delete(e.loop);
      }
    }
    stateTex.needsUpdate = true;
  }

  const api: SunLoops & { debug: { triggerFlare(system?: number): void; triggerEruption(loop?: number): void; loopCount: number; systemCount: number } } = {
    group, update,
    setIntensity(v) { mat.uniforms.intensity.value = THREE.MathUtils.clamp(v, 0, 3); },
    setActivity(v) { activity = THREE.MathUtils.clamp(v, 0, 3); },
    dispose() { group.remove(mesh); geo.dispose(); mat.dispose(); stateTex.dispose(); },
    debug: {
      triggerFlare(system) {
        const sys = system != null ? systems[system] : systems.reduce((a, b) => (a.strength >= b.strength ? a : b));
        if (sys) startFlare(sys, elapsedNow);
      },
      triggerEruption(loop) { startEruption(loop != null ? loop : pickEruptionLoop(), elapsedNow); },
      loopCount: N, systemCount: systems.length,
    },
  };
  return api;
}

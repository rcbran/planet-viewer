/**
 * Deep space backdrop for Blue Marble: star map cube, point-sprite stars, zodiacal light.
 *
 * Assets (all under public/textures/space/, built by scripts/fetch-space.sh):
 *   sky_{px,nx,py,ny,pz,nz}.jpg  Cube faces resampled from NASA SVS "Deep Star Maps 2020"
 *       (https://svs.gsfc.nasa.gov/4851, starmap_2020_16k.exr, celestial J2000 coordinates).
 *       Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC.
 *       NASA SVS material is public domain (not copyrighted) per https://svs.gsfc.nasa.gov/help/#copyright.
 *   stars.bin  40,000 brightest stars (unit direction, magnitude, colour) extracted by scripts/build-space.mjs
 *       from hiptyc_2020_8k.exr of the same SVS release (Hipparcos-2 / Tycho-2 foreground). Magnitudes are
 *       rank-calibrated, with the 21 brightest taken from a small hand-written table (public domain data).
 *   No other third-party assets are used; the Solar System Scope 8k_stars_milky_way.jpg in textures/8k is
 *   no longer needed by this module.
 *
 * Coordinate conventions: "sky space" is the J2000 equatorial frame with x = cos(dec)cos(ra),
 * y = sin(dec) (celestial north), z = -cos(dec)sin(ra). The group's quaternion carries the sky->world
 * rotation: celestial north is tilted 23.4 deg about world Z to match the planet's spin axis in main.ts,
 * then a slow sidereal drift about that pole and a small fraction of any camera rotation (parallax).
 *
 * Rendering: the sky is a fullscreen triangle at depth 1.0 drawn after the scene (renderOrder 1000, depth-tested) so it fills
 * behind everything with zero parallax; the stars are additive points on a sphere of radius 150 centred on
 * the camera each frame (depth-tested, no depth write, so the planet occludes them; camera far must be > 150).
 * Output is linear HDR: the ~30 brightest stars peak above the 0.85 bloom threshold on purpose, everything
 * else stays below. Cost on an RTX 4080 at 1080p: ~0.04 ms/frame. The six 4096^2 faces (~47 MB of JPEG)
 * upload in one go when they arrive, which causes a single ~0.3 s hitch a few seconds after page load.
 *
 * Integration: `scene.add(space.group)`, call `space.update(dt, elapsed)` once per frame before rendering,
 * `space.setSunDir(sunDir)` whenever the sun moves (world space). The caller owns `group`'s transform: my
 * orientation lives on an inner child, so e.g. `space.group.rotation.y += dragVelX * 0.03` gives drag
 * parallax. Tunables (gain, star intensity, twinkle, zodiacal, sunGlare, sidereal yaw, drift) are on
 * `(space as any).__params` (see SpaceParams); `sunGlare` defaults to 0 because the sun is normally off-screen.
 */
import * as THREE from "three";
import skyVert from "./shaders/space-sky.vert.glsl?raw";
import skyFrag from "./shaders/space-sky.frag.glsl?raw";
import starsVert from "./shaders/space-stars.vert.glsl?raw";
import starsFrag from "./shaders/space-stars.frag.glsl?raw";

export type Space = {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setSunDir(dir: THREE.Vector3): void;
  dispose(): void;
};

const ASSET_DIR = "/textures/space/";
const FACES = ["px", "nx", "py", "ny", "pz", "nz"].map((f) => `sky_${f}.jpg`);
const AXIAL_TILT_DEG = 23.4;
const STAR_RADIUS = 150; // inside the caller's far plane (200), far outside the planet

/** Tunables; exposed on the returned object as `__params` for the test page, not part of the public type. */
export type SpaceParams = {
  skyGain: number;      // star-map multiplier (linear)
  skyBlack: number;     // black-level lift removed from the star map before gain
  skySaturation: number;
  starIntensity: number;
  starSizeMin: number;
  starSizeScale: number;
  starSizeMax: number;
  starMagRef: number;
  starMagCut: number;
  twinkle: number;
  zodiacal: number;
  sunGlare: number;
  driftDegPerSec: number;
  skyYawDeg: number;    // sidereal angle offset: which part of the sky faces the camera
  parallax: number;     // fraction of camera rotation applied to the sky
  debug: number;
};

const DEFAULTS: SpaceParams = {
  skyGain: 0.2,
  skyBlack: 0.002,
  skySaturation: 0.7,
  starIntensity: 170,
  starSizeMin: 2.4,
  starSizeScale: 1.6,
  starSizeMax: 16,
  starMagRef: 6.5,
  starMagCut: 7.6,
  twinkle: 0.28,
  zodiacal: 0.02,
  sunGlare: 0,
  driftDegPerSec: 0.06,
  skyYawDeg: 155,
  parallax: 0.08,
  debug: 0,
};

export function createSpace(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Space {
  const params: SpaceParams = { ...DEFAULTS };
  const group = new THREE.Group(); // owned by the caller: rotate it freely (e.g. a few % of drag) for parallax
  group.name = "space";
  const inner = new THREE.Group(); // carries the celestial orientation (tilt + drift + camera parallax)
  inner.name = "space-sky";
  group.add(inner);

  // ---- sky (fullscreen triangle) ----
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const placeholder = new THREE.CubeTexture(Array.from({ length: 6 }, () => new ImageData(1, 1)));
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: {
      uSkyMap: { value: placeholder },
      uWorldToSky: { value: new THREE.Matrix3() },
      uInvProj: { value: new THREE.Matrix4() },
      uCamRot: { value: new THREE.Matrix3() },
      uGain: { value: params.skyGain },
      uLoaded: { value: 0 },
      uBlack: { value: params.skyBlack },
      uSaturation: { value: params.skySaturation },
      uTint: { value: new THREE.Vector3(0.94, 0.97, 1.06) },
      uSunSky: { value: new THREE.Vector3(1, 0, 0) },
      uEclNormalSky: { value: new THREE.Vector3(0, 1, 0) },
      uZodiacal: { value: params.zodiacal },
      uSunGlare: { value: params.sunGlare },
      uTime: { value: 0 },
    },
    // drawn last with depth testing on: the vertex shader emits depth 1.0, so pixels the opaque planet
    // already covers are rejected early instead of shading the sky underneath it
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = 1000;
  inner.add(sky);

  let skyTex: THREE.CubeTexture | null = null;
  let disposed = false;
  new THREE.CubeTextureLoader().setPath(ASSET_DIR).load(FACES, (tex) => {
    if (disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    skyTex = tex;
    skyMat.uniforms.uSkyMap.value = tex;
    skyMat.uniforms.uLoaded.value = 1;
  });

  // ---- stars (points) ----
  const starsMat = new THREE.ShaderMaterial({
    vertexShader: starsVert,
    fragmentShader: starsFrag,
    uniforms: {
      uSkyToWorld: { value: new THREE.Matrix3() },
      uRadius: { value: STAR_RADIUS },
      uTime: { value: 0 },
      uPixelScale: { value: 1 },
      uMagRef: { value: params.starMagRef },
      uSizeMin: { value: params.starSizeMin },
      uSizeScale: { value: params.starSizeScale },
      uSizeMax: { value: params.starSizeMax },
      uIntensity: { value: params.starIntensity },
      uTwinkle: { value: params.twinkle },
      uMagCut: { value: params.starMagCut },
      uDebug: { value: 0 },
    },
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: false,
  });
  let stars: THREE.Points | null = null;
  fetch(ASSET_DIR + "stars.bin")
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`stars.bin ${r.status}`))))
    .then((buf) => {
      if (disposed) return;
      const f = new Float32Array(buf);
      const n = Math.floor(f.length / 7);
      const pos = new Float32Array(n * 3), mag = new Float32Array(n), col = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = f[i * 7]; pos[i * 3 + 1] = f[i * 7 + 1]; pos[i * 3 + 2] = f[i * 7 + 2];
        mag[i] = f[i * 7 + 3];
        col[i * 3] = f[i * 7 + 4]; col[i * 3 + 1] = f[i * 7 + 5]; col[i * 3 + 2] = f[i * 7 + 6];
        seed[i] = (i * 0.618033988749895) % 1;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      stars = new THREE.Points(geo, starsMat);
      stars.frustumCulled = false;
      stars.renderOrder = 1001;
      inner.add(stars);
    })
    .catch((err) => console.warn("[space] stars unavailable:", err));

  // ---- orientation ----
  const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(AXIAL_TILT_DEG));
  const qYaw = new THREE.Quaternion();
  const qPar = new THREE.Quaternion();
  const qCamRef = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const qIdentity = new THREE.Quaternion();
  let haveCamRef = false;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const sunWorld = new THREE.Vector3(-1, 0.14, 0.26).normalize();
  const sunSky = new THREE.Vector3();
  const eclPoleSky = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(66.56)), Math.cos(THREE.MathUtils.degToRad(66.56)));
  const tmpV = new THREE.Vector3();
  const m3 = new THREE.Matrix3();
  const size = new THREE.Vector2();
  let drift = 0;

  function update(dt: number, elapsed: number) {
    drift += THREE.MathUtils.degToRad(params.driftDegPerSec) * Math.min(dt, 0.1);
    qYaw.setFromAxisAngle(yAxis, THREE.MathUtils.degToRad(params.skyYawDeg) + drift);
    if (!haveCamRef) { qCamRef.copy(camera.quaternion); haveCamRef = true; }
    // parallax: a small fraction of the camera's rotation since the first frame, so the sky reads as very far away
    qTmp.copy(qCamRef).invert().premultiply(camera.quaternion); // camera delta in world space
    qPar.copy(qIdentity).slerp(qTmp, params.parallax);
    inner.quaternion.copy(qPar).multiply(qTilt).multiply(qYaw);
    inner.updateWorldMatrix(true, false);

    const su = skyMat.uniforms;
    m3.setFromMatrix4(inner.matrixWorld); // rotation only: neither group carries scale
    starsMat.uniforms.uSkyToWorld.value.copy(m3);
    su.uWorldToSky.value.copy(m3).transpose();
    su.uInvProj.value.copy(camera.projectionMatrixInverse);
    su.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    su.uGain.value = params.skyGain;
    su.uBlack.value = params.skyBlack;
    su.uSaturation.value = params.skySaturation;
    su.uZodiacal.value = params.zodiacal;
    su.uSunGlare.value = params.sunGlare;
    su.uTime.value = elapsed;
    sunSky.copy(sunWorld).applyMatrix3(su.uWorldToSky.value).normalize();
    su.uSunSky.value.copy(sunSky);
    // zodiacal band: the plane through the sun that is closest to the true ecliptic
    tmpV.copy(eclPoleSky).addScaledVector(sunSky, -eclPoleSky.dot(sunSky)); // ecliptic pole made perpendicular to the sun
    if (tmpV.lengthSq() < 1e-8) tmpV.set(0, 1, 0);
    su.uEclNormalSky.value.copy(tmpV.normalize());

    const st = starsMat.uniforms;
    renderer.getDrawingBufferSize(size);
    st.uPixelScale.value = size.y / 1080;
    st.uTime.value = elapsed;
    st.uMagRef.value = params.starMagRef;
    st.uSizeMin.value = params.starSizeMin;
    st.uSizeScale.value = params.starSizeScale;
    st.uSizeMax.value = params.starSizeMax;
    st.uIntensity.value = params.starIntensity;
    st.uTwinkle.value = params.twinkle;
    st.uMagCut.value = params.starMagCut;
    st.uDebug.value = params.debug;
  }

  function setSunDir(dir: THREE.Vector3) { sunWorld.copy(dir).normalize(); }

  function dispose() {
    disposed = true;
    inner.remove(sky);
    skyGeo.dispose();
    skyMat.dispose();
    placeholder.dispose();
    skyTex?.dispose();
    if (stars) { inner.remove(stars); stars.geometry.dispose(); }
    group.remove(inner);
    starsMat.dispose();
  }

  const space: Space & { __params: SpaceParams } = { group, update, setSunDir, dispose, __params: params };
  return space;
}

// Coronal loop ribbon: the arc is evaluated here from per-loop footpoints, so the CPU never
// touches vertices. Each vertex carries its arc parameter (aU) and ribbon side (aSide); the
// ribbon is turned to face the camera in world space.
uniform sampler2D stateTex;   // per-loop dynamic state: r=flare, g=erupt (0..1), b=fade, a=spare
uniform float stateN;         // loop count (texture width)
uniform float time;
attribute float aU;           // 0..1 along the arc
attribute float aSide;        // -1 / +1 across the ribbon
attribute vec3 aFootA;        // unit vectors on the sphere
attribute vec3 aFootB;
attribute vec4 aParam;        // x=height (R), y=half width (R), z=seed 0..1, w=flow speed
attribute vec4 aMisc;         // x=base brightness, y=flare weight, z=loop index, w=arc length (rad)
varying float vU, vV, vBright, vFlare, vErupt, vSeed, vLen, vFlow, vFade, vLift;
varying float vLimb;          // 1 at the limb, 0 facing the camera

const float PI = 3.14159265;

// Arch: great-circle base between the footpoints lifted radially by a rounded profile.
// During an eruption the top spreads sideways (proportional to lift) so the arch balloons
// into a bubble while the footpoints stay anchored.
vec3 arcPos(float u, float h, float k, float spread) {
  vec3 mid = normalize(aFootA + aFootB);
  vec3 chord = mix(aFootA, aFootB, u);
  float s = max(sin(PI * u), 0.0);
  float lift = pow(s, k);
  vec3 base = normalize(mid + (chord - mid) * (1.0 + spread * lift));
  return base * (0.985 + h * lift);
}

void main() {
  float idx = aMisc.z;
  vec4 st = texture2D(stateTex, vec2((idx + 0.5) / stateN, 0.5));
  float flare = st.r, erupt = st.g, fade = st.b;

  // eruption: height grows to 1.5-2 R (accelerating), top flattens and spreads
  float e2 = erupt * erupt;
  float hTarget = 1.5 + 0.5 * aParam.z;
  float h = mix(aParam.x, hTarget, e2);
  float k = mix(0.72, 0.45, erupt);
  float spread = 7.0 * e2;

  float u = aU;
  vec3 p0 = arcPos(u, h, k, spread);
  vec3 p1 = arcPos(u + 0.01, h, k, spread);
  vec3 pm = arcPos(u - 0.01, h, k, spread);
  vec3 T = p1 - pm;

  vec3 Pw = (modelMatrix * vec4(p0, 1.0)).xyz;
  vec3 Tw = normalize(mat3(modelMatrix) * T);
  vec3 V = normalize(cameraPosition - Pw);
  vec3 S = normalize(cross(Tw, V));

  // width: a little fatter while flaring, ballooning while erupting (plasma disperses)
  float w = aParam.y * (1.0 + 0.5 * flare) * (1.0 + 2.5 * e2);
  // footpoints taper slightly so the ribbon does not read as a flat-cut end
  float lift = pow(max(sin(PI * u), 0.0), 0.72);
  w *= 0.5 + 0.5 * smoothstep(0.0, 0.12, min(u, 1.0 - u));
  Pw += S * aSide * w;

  vU = u; vV = aSide; vSeed = aParam.z; vFlow = aParam.w; vLen = aMisc.w;
  vBright = aMisc.x; vFlare = flare * aMisc.y; vErupt = erupt; vFade = fade; vLift = lift;
  // loops are only conspicuous against the sky: fade the ones seen face-on over the disc
  {
    vec3 nW = normalize(mat3(modelMatrix) * normalize(aFootA + aFootB));
    vec3 cW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float facing = dot(nW, normalize(cameraPosition - cW));
    vLimb = 1.0 - smoothstep(0.15, 0.85, facing);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(Pw, 1.0);
}

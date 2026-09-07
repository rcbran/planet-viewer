uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform sampler2D cloudMap;
uniform vec3 sunDir;
uniform float nightIntensity;
uniform float nightAmbient;
uniform float twilightWidth;
uniform float twilightTint;
uniform float oceanSpecular;
uniform float oceanShininess;  // water lobe width: Beckmann alpha = sqrt(2 / (s + 2)); 80 -> ~0.156
uniform float normalScale;
uniform float oceanBoost;
uniform vec3 oceanTint;
uniform float nightWarmth;
uniform float atmosphereIntensity;
uniform float cloudShadow;
uniform float cloudDensity;
uniform float cloudDrift;
uniform int cloudMode;
uniform float time;
uniform float bandFlow;        // gas giants: differential band drift
uniform float surfaceDetail;   // gas giants: streaky haze so 2K maps do not read flat
uniform float ringShadow;      // 1 = cast ring shadow
uniform sampler2D ringMap;
uniform vec2 ringRadii;
uniform vec3 ringNormalW;
uniform vec3 planetCenterW;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vTangentW;
varying vec3 vBitangentW;
// small value noise for the wave field (inputs wrapped so the hash stays in fp32 range)
float hash21(vec2 p) {
  p = mod(p, 289.0);
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 nmS = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  nmS.xy *= normalScale;
  vec3 T = normalize(vTangentW), B = normalize(vBitangentW);
  vec3 Np = normalize(mat3(T, B, N) * normalize(nmS));
  vec3 L = normalize(sunDir);
  vec3 V = normalize(cameraPosition - vPosW);
  float NdotL = dot(N, L);
  float NdotLp = max(dot(Np, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  vec2 uvD = vUv;
  if (bandFlow > 0.0) {
    // zonal jets: alternate bands slide east/west at different rates
    float lat = (vUv.y - 0.5) * 3.14159265;
    uvD.x += bandFlow * time * 0.0025 * sin(lat * 11.0) * cos(lat);
  }
  vec3 day = texture2D(dayMap, uvD).rgb;
  if (surfaceDetail > 0.0) {
    // zonal streaks: noise stretched along longitude, three octaves, slowly drifting
    vec2 duv = uvD * vec2(2.0, 1.0);
    float d = vnoise(duv * vec2(18.0, 70.0) + vec2(time * 0.004, 0.0)) * 0.5
            + vnoise(duv * vec2(50.0, 190.0) - vec2(time * 0.003, 0.0)) * 0.32
            + vnoise(duv * vec2(140.0, 420.0)) * 0.18;
    day *= 1.0 + surfaceDetail * 0.22 * (d - 0.5);
  }
  // mip bias softens single-pixel lights so they stop shimmering as the globe turns
  vec3 night = texture2D(nightMap, vUv, 1.5).rgb;
  float ocean = texture2D(specularMap, vUv).r;
  // NASA oceans are physically dark; lift and tint them by the water mask
  day = mix(day, day * oceanTint * (1.0 + oceanBoost), ocean);
  // colorize lights: grayscale radiance -> warm sodium/LED mix; colored maps blend toward it
  float lum = max(night.r, max(night.g, night.b));
  night = mix(night, lum * vec3(1.0, 0.78, 0.5), nightWarmth);
  vec3 sunColor = vec3(1.0, 0.97, 0.9);
  float dayFactor = smoothstep(-twilightWidth, twilightWidth, NdotL);
  // direct sun + faint sky fill on the lit side
  vec3 diffuse = day * (NdotLp * sunColor + 0.05 * dayFactor);
  // warm terminator band
  float twilight = 1.0 - smoothstep(0.0, twilightWidth * 2.5, abs(NdotL));
  diffuse = mix(diffuse, diffuse * vec3(1.35, 0.75, 0.45), twilight * twilightTint);
  // cloud shadows on the ground (static mode only; procedural handled in cloud layer)
  if (cloudMode == 0) {
    vec2 cuv = vUv + vec2(cloudDrift, 0.0) - vec2(0.0035, 0.0) * NdotL;
    float c = texture2D(cloudMap, cuv).r * cloudDensity;
    diffuse *= 1.0 - cloudShadow * c * dayFactor;
  }
  // Saturn: ring shadow on the globe
  if (ringShadow > 0.5) {
    float denom = dot(L, ringNormalW);
    if (abs(denom) > 1e-4) {
      float tt = dot(planetCenterW - vPosW, ringNormalW) / denom;
      if (tt > 0.0) {
        float rr = length(vPosW + L * tt - planetCenterW);
        if (rr > ringRadii.x && rr < ringRadii.y) {
          float ra = texture2D(ringMap, vec2((rr - ringRadii.x) / (ringRadii.y - ringRadii.x), 0.5)).a;
          diffuse *= 1.0 - ra * 0.85;
        }
      }
    }
  }
  // ---- ocean sun glint: rough-water microfacet model (Cox-Munk style slope statistics) ----
  // Two Beckmann lobes: a narrow one for the calm-water hot core and a wide, faint one for the
  // wind-roughened sheen around it. Only on the water mask, only on the day side; bodies
  // without oceans pass oceanSpecular = 0 and skip this entirely.
  float spec = 0.0;
  float glintMask = ocean * oceanSpecular * smoothstep(0.0, 0.12, NdotL);
  if (glintMask > 0.001) {
    float aCore = sqrt(2.0 / (oceanShininess + 2.0));      // s = 900 -> ~0.047 (sigma ~2 deg)
    // wave field: small slope noise perturbs the water normal and jitters the core roughness so the
    // edge of the hot spot breaks into ripples instead of a clean radial gradient
    vec2 wuv = vUv * vec2(2.0, 1.0);
    float w1 = vnoise(wuv * 640.0 + vec2(time * 0.03, 0.0)) * 2.0 - 1.0;
    float w2 = vnoise(wuv * 1490.0 + vec2(0.0, -time * 0.05)) * 2.0 - 1.0;
    float w3 = vnoise(wuv * 1100.0 + vec2(-time * 0.02, time * 0.04) + 7.3) * 2.0 - 1.0;
    vec3 Nw = normalize(N + (T * (w1 * 0.6 + w2 * 0.4) + B * (w3 * 0.6 + w1 * 0.4)) * 0.006);
    vec3 H = normalize(L + V);
    float NwH = max(dot(Nw, H), 1e-4);
    float c2 = NwH * NwH;
    float t2 = (1.0 - c2) / c2;                             // tan^2 of the half-vector angle
    float a2c = aCore * aCore * (1.0 + 0.25 * (w2 * 0.5 + w3 * 0.5));
    float Dc = exp(-t2 / a2c) / (3.14159265 * a2c * c2 * c2);
    float D = Dc;   // core lobe only: the wide sheen read as a white haze disc on screen
    // Schlick Fresnel for water (F0 = 0.02) on the half vector
    float VdotH = max(dot(V, H), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);
    // Smith-Schlick masking/shadowing; G/(4 NL NV) * NL stays bounded at the limb
    float k = aCore * 0.7978845608;
    float NwL = max(dot(Nw, L), 1e-3), NwV = max(dot(Nw, V), 1e-3);
    float G1L = NwL / (NwL * (1.0 - k) + k), G1V = NwV / (NwV * (1.0 - k) + k);
    spec = D * F * G1L * G1V / (4.0 * NwV) * 2.5;
    // energy knee: the peak saturates into a small hot spot instead of blooming into a white disc
    spec = 0.3 * spec / (0.3 + spec);   // hard cap below the bloom threshold: a hot spot, never a glow
    spec *= glintMask;
  }
  vec3 glintColor = vec3(0.96, 0.98, 1.0);   // near-white: a warm tint reads as a brown smudge on deep blue water
  // night side: city lights + faint moonlight so coastlines read
  float nightFactor = 1.0 - dayFactor;
  // clamp under the bloom threshold so lights never pop in and out of the glow pass
  vec3 lights = min(pow(night, vec3(1.25)) * nightIntensity, vec3(0.8)) * nightFactor;
  // moonlit ocean is a shade brighter than land so coastlines outline the continents
  vec3 moon = day * nightAmbient * nightFactor * vec3(0.4, 0.55, 1.0);
  moon += ocean * nightAmbient * nightFactor * vec3(0.06, 0.12, 0.30);
  // inner atmosphere rim: thin, hugs the limb
  float rim = pow(1.0 - NdotV, 4.0);
  vec3 atmo = mix(vec3(0.03, 0.06, 0.18), vec3(0.30, 0.52, 0.92), dayFactor) * rim * atmosphereIntensity * 0.42;
  vec3 color = diffuse + spec * glintColor + lights + moon + atmo;
  gl_FragColor = vec4(color, 1.0);
}

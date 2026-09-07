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
  vec3 night = texture2D(nightMap, vUv).rgb;
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
  // ---- ocean sun glint: rough-water microfacet lobe (Beckmann / Cox-Munk slope statistics) ----
  // Only on the water mask, only on the day side. Bodies without oceans pass oceanSpecular = 0.
  float spec = 0.0;
  float glintMask = ocean * oceanSpecular * smoothstep(0.0, 0.12, NdotL);
  if (glintMask > 0.001) {
    float alpha = sqrt(2.0 / (oceanShininess + 2.0));
    // wave field: high-frequency slope noise perturbs the water normal and jitters roughness,
    // so the lobe edge breaks into ripples instead of a clean radial gradient
    vec2 wuv = vUv * vec2(2.0, 1.0);
    float w1 = vnoise(wuv * 640.0 + vec2(time * 0.03, 0.0)) * 2.0 - 1.0;
    float w2 = vnoise(wuv * 1490.0 + vec2(0.0, -time * 0.05)) * 2.0 - 1.0;
    float w3 = vnoise(wuv * 1100.0 + vec2(-time * 0.02, time * 0.04) + 7.3) * 2.0 - 1.0;
    vec3 Nw = normalize(N + (T * (w1 * 0.6 + w2 * 0.4) + B * (w3 * 0.6 + w1 * 0.4)) * 0.035);
    float a2 = alpha * alpha * (1.0 + 0.45 * (w2 * 0.5 + w3 * 0.5));
    vec3 H = normalize(L + V);
    float NwH = max(dot(Nw, H), 1e-4);
    float c2 = NwH * NwH;
    float D = exp(-(1.0 - c2) / (c2 * a2)) / (3.14159265 * a2 * c2 * c2);
    // Schlick Fresnel for water (F0 = 0.02) on the half vector
    float VdotH = max(dot(V, H), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);
    // Smith-Schlick masking/shadowing; G/(4 NL NV) * NL stays bounded at the limb
    float k = alpha * 0.7978845608;
    float NwL = max(dot(Nw, L), 1e-3), NwV = max(dot(Nw, V), 1e-3);
    float G1L = NwL / (NwL * (1.0 - k) + k), G1V = NwV / (NwV * (1.0 - k) + k);
    spec = D * F * G1L * G1V / (4.0 * NwV) * 3.2;
    // energy knee: the peak saturates to a hot spot instead of blooming into a white disc
    spec = 3.0 * spec / (3.0 + spec);
    spec *= glintMask;
  }
  vec3 glintColor = vec3(1.0, 0.93, 0.80);
  // night side: city lights + faint moonlight so coastlines read
  float nightFactor = 1.0 - dayFactor;
  vec3 lights = pow(night, vec3(1.25)) * nightIntensity * nightFactor;
  // moonlit ocean is a shade brighter than land so coastlines outline the continents
  vec3 moon = day * nightAmbient * nightFactor * vec3(0.4, 0.55, 1.0);
  moon += ocean * nightAmbient * nightFactor * vec3(0.06, 0.12, 0.30);
  // inner atmosphere rim: thin, hugs the limb
  float rim = pow(1.0 - NdotV, 4.0);
  vec3 atmo = mix(vec3(0.03, 0.06, 0.18), vec3(0.30, 0.52, 0.92), dayFactor) * rim * atmosphereIntensity * 0.42;
  vec3 color = diffuse + spec * glintColor + lights + moon + atmo;
  gl_FragColor = vec4(color, 1.0);
}

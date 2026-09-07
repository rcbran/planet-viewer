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
uniform float oceanShininess;
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

void main() {
  vec3 N = normalize(vNormalW);
  vec3 nmS = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  nmS.xy *= normalScale;
  vec3 Np = normalize(mat3(normalize(vTangentW), normalize(vBitangentW), N) * normalize(nmS));
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

  // ocean sun glint (day side only)
  vec3 H = normalize(L + V);
  float fresnel = pow(1.0 - NdotV, 4.0);
  float spec = pow(max(dot(Np, H), 0.0), oceanShininess) * ocean * oceanSpecular;
  spec *= (0.25 + 0.75 * fresnel) * smoothstep(0.0, 0.15, NdotL);

  // night side: city lights + faint moonlight so coastlines read
  float nightFactor = 1.0 - dayFactor;
  vec3 lights = pow(night, vec3(1.25)) * nightIntensity * nightFactor;
  // moonlit ocean is a shade brighter than land so coastlines outline the continents
  vec3 moon = day * nightAmbient * nightFactor * vec3(0.4, 0.55, 1.0);
  moon += ocean * nightAmbient * nightFactor * vec3(0.06, 0.12, 0.30);

  // inner atmosphere rim
  float rim = pow(1.0 - NdotV, 2.5);
  vec3 atmo = mix(vec3(0.03, 0.06, 0.18), vec3(0.28, 0.52, 0.95), dayFactor) * rim * atmosphereIntensity * 0.4;

  vec3 color = diffuse + spec * sunColor + lights + moon + atmo;
  gl_FragColor = vec4(color, 1.0);
}

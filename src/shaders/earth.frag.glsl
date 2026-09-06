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
uniform float atmosphereIntensity;
uniform float cloudShadow;
uniform float cloudDensity;
uniform float cloudDrift;
uniform int cloudMode;

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

  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float ocean = texture2D(specularMap, vUv).r;

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

  // ocean sun glint (day side only)
  vec3 H = normalize(L + V);
  float fresnel = pow(1.0 - NdotV, 4.0);
  float spec = pow(max(dot(Np, H), 0.0), oceanShininess) * ocean * oceanSpecular;
  spec *= (0.25 + 0.75 * fresnel) * smoothstep(0.0, 0.15, NdotL);

  // night side: city lights + faint moonlight so coastlines read
  float nightFactor = 1.0 - dayFactor;
  vec3 lights = pow(night, vec3(1.25)) * nightIntensity * nightFactor;
  vec3 moon = day * nightAmbient * nightFactor * vec3(0.4, 0.55, 1.0);

  // inner atmosphere rim
  float rim = pow(1.0 - NdotV, 2.5);
  vec3 atmo = mix(vec3(0.04, 0.07, 0.2), vec3(0.35, 0.6, 1.0), dayFactor) * rim * atmosphereIntensity * 0.55;

  vec3 color = diffuse + spec * sunColor + lights + moon + atmo;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

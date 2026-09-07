uniform sampler2D ringMap;
uniform vec3 sunDir;
uniform vec3 planetCenter;
uniform float planetRadius;
uniform vec3 ringTint;
varying float vR;
varying vec3 vPosW;
varying vec3 vNormalW;
float h1(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec4 t = texture2D(ringMap, vec2(vR, 0.5));
  if (t.a < 0.02) discard;
  // fine ringlets: radial 1D noise in two octaves (Cassini resolved thousands of them; the strip has dozens)
  float fine = 0.82 + 0.18 * (n1(vR * 700.0) * 0.55 + n1(vR * 2300.0) * 0.45);
  vec3 albedo = t.rgb * ringTint * fine;
  vec3 L = normalize(sunDir);
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float nl = dot(N, L), nv = dot(N, V);
  float litFace = step(0.0, nl * nv);          // 1 when the viewer looks at the sunlit face
  float inc = abs(nl);
  // planet shadow on the rings: ray toward the sun hits the globe; soft penumbra
  vec3 oc = planetCenter - vPosW;
  float tca = dot(oc, L);
  float d2 = dot(oc, oc) - tca * tca;
  float R2 = planetRadius * planetRadius;
  float shadow = tca > 0.0 ? 1.0 - smoothstep(R2 * 0.9, R2 * 1.08, d2) : 0.0;
  // lit face reflects; the unlit face shows sunlight coming through the thin, sparse regions
  float refl = inc * 0.95 + 0.05;
  float trans = (1.0 - t.a * t.a) * inc * 0.7 + 0.03;
  float face = mix(trans, refl, litFace);
  // opposition surge: ice brightens sharply when the sun is behind the viewer
  float phase = max(dot(L, V), 0.0);
  face *= 1.0 + 0.35 * pow(phase, 12.0);
  // planetshine on the inner rings
  float rp = length(vPosW - planetCenter) / planetRadius;
  float shine = 0.06 / (rp * rp);
  vec3 col = albedo * (face * (1.0 - shadow * 0.97) + shine);
  gl_FragColor = vec4(col, t.a * 0.95);
}

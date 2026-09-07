uniform sampler2D ringMap;
uniform vec3 sunDir;
uniform vec3 planetCenter;
uniform float planetRadius;
varying float vR;
varying vec3 vPosW;
varying vec3 vNormalW;
void main() {
  vec4 t = texture2D(ringMap, vec2(vR, 0.5));
  if (t.a < 0.02) discard;
  vec3 L = normalize(sunDir);
  vec3 N = normalize(vNormalW);
  float nl = abs(dot(N, L));
  // planet shadow on the rings: does the ray toward the sun hit the planet?
  vec3 oc = planetCenter - vPosW;
  float tca = dot(oc, L);
  float d2 = dot(oc, oc) - tca * tca;
  float shadow = (tca > 0.0 && d2 < planetRadius * planetRadius) ? smoothstep(planetRadius * planetRadius, planetRadius * planetRadius * 0.85, d2) : 0.0;
  float lit = mix(nl * 0.9 + 0.1, 0.03, shadow);
  // faint backscatter so the unlit face isn't black
  vec3 col = t.rgb * (lit + 0.06);
  gl_FragColor = vec4(col, t.a * 0.95);
}

// Coronal loop ribbon fragment: plasma flowing along the arc (scrolling noise in u), bright at
// the footpoints, soft edges across the ribbon, colour ramp deep orange-red -> gold -> white.
uniform float time;
uniform float intensity;
varying float vU, vV, vBright, vFlare, vErupt, vSeed, vLen, vFlow, vFade, vLift;
varying float vLimb;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

// brightness -> colour: deep red-orange, orange-gold, pale gold, white
vec3 plasma(float b) {
  vec3 c0 = vec3(0.85, 0.16, 0.03);
  vec3 c1 = vec3(1.00, 0.50, 0.10);
  vec3 c2 = vec3(1.00, 0.82, 0.42);
  vec3 c3 = vec3(1.00, 0.97, 0.90);
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.45, b));
  c = mix(c, c2, smoothstep(0.45, 1.1, b));
  c = mix(c, c3, smoothstep(1.1, 2.4, b));
  return c * b;
}

void main() {
  float u = vU, v = vV;
  // plasma flowing along the arc: scrolling noise in arc-length units (so long loops do not
  // look stretched), direction per loop from the seed
  float dir = vSeed > 0.5 ? 1.0 : -1.0;
  float x = u * vLen * 22.0;
  float t = time * vFlow * dir;
  float n = 0.50 * noise1(x - t + vSeed * 97.0)
          + 0.30 * noise1(x * 2.7 - t * 1.6 + vSeed * 31.0)
          + 0.20 * noise1(x * 6.1 - t * 2.3 + vSeed * 13.0);
  // fine strands across the ribbon that drift with the flow
  float strand = noise2(vec2(x * 0.8 - t * 0.7, v * 2.5 + vSeed * 50.0));
  float flow = 0.45 + 0.9 * n * (0.7 + 0.5 * strand);

  // along-loop profile: footpoints hot, faint dip on the legs, warm apex
  float foot = exp(-pow(u / 0.10, 2.0)) + exp(-pow((1.0 - u) / 0.10, 2.0));
  float apex = exp(-pow((u - 0.5) / 0.22, 2.0));
  float profile = 0.62 + 0.3 * foot + 0.2 * apex;

  // across-ribbon: soft edges, hotter core
  float edge = max(1.0 - v * v, 0.0);
  float core = exp(-v * v * 4.5);
  float alpha = pow(edge, 1.4) * (0.35 + 0.65 * core);
  // legs sink into the chromosphere rather than ending on a hard line
  alpha *= smoothstep(0.0, 0.045, min(u, 1.0 - u));

  // eruption: a bright pulse as the loop lets go, the rising bubble stays luminous through
  // mid-flight, then disperses and fades toward deep red
  float e = vErupt;
  float pulse = 2.2 * exp(-pow((e - 0.1) / 0.09, 2.0));
  float sustain = 1.0 + 1.1 * sin(3.14159 * min(e * 1.15, 1.0));
  float dispersal = pow(1.0 - e, 1.15);
  alpha *= dispersal;

  float b = vBright * profile * flow * (1.0 + 2.6 * vFlare) * (sustain + pulse) * vFade;
  // flares whiten the core more than the fringe
  b *= 0.85 + 0.15 * core + 0.3 * vFlare * core;
  // cooling: the erupted plasma slides down the colour ramp as it thins out
  b *= mix(1.0, 0.55, e * e);

  // disc-facing loops are faint; eruptions and flares stay visible anywhere
  float vis = mix(0.18, 1.0, vLimb);
  vis = max(vis, vErupt);
  vis = max(vis, vFlare * 0.9);
  vec3 col = plasma(b) * intensity * vis;
  gl_FragColor = vec4(col, alpha * vis);
}

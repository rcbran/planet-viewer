uniform sampler2D limb304;   // prominences: angle x radius (1.0..1.3)
uniform sampler2D limb171;   // coronal loops: angle x radius (1.0..1.4)
uniform float time;
uniform float coronaIntensity;
uniform float promIntensity;
uniform float discRadius;    // sun radius in plane units (plane spans -1..1 => extent)
uniform float extent;        // plane half-size in sun radii
uniform sampler2D promVideo; // SDO AIA 304 48-hour movie (full disk, 1024)
uniform float videoReady;
uniform float videoDiskR;    // disk radius as a fraction of frame width
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.1 + 7.3; a *= 0.5; } return s; }

void main() {
  vec2 q = vUv * extent;            // in sun radii
  float r = length(q);
  if (r < 1.0) discard;
  float ang = atan(q.y, q.x);
  float u = ang / 6.2831853 + 0.5;
  // slow rotation of the limb features with the sun (ang direction), plus drift
  float uRot = fract(u - time * 0.002);
  // prominences (304): radius 1.0..1.3
  vec4 pr = texture2D(limb304, vec2(uRot, clamp((r - 1.0) / 0.27, 0.0, 1.0)));
  float promMask = (r < 1.27) ? pr.a * (0.4 + 0.6 * exp(-(r - 1.0) * 5.0)) * (1.0 - smoothstep(1.17, 1.27, r)) : 0.0;
  vec3 prom = vec3(1.0, 0.36, 0.12) * pr.rgb * 1.3 * promMask * promIntensity;
  // loops (171): radius 1.0..1.4
  vec4 lp = texture2D(limb171, vec2(uRot, clamp((r - 1.0) / 0.27, 0.0, 1.0)));
  float loopMask = (r < 1.27) ? lp.a * exp(-(r - 1.0) * 9.0) * (1.0 - smoothstep(1.15, 1.27, r)) : 0.0;
  vec3 loops = vec3(1.0, 0.85, 0.55) * lp.rgb * 0.8 * loopMask * coronaIntensity;
  // streamers: radial fbm, r^-2.4 falloff, brighter near equatorial belt
  float streak = fbm(vec2(ang * 3.0 + time * 0.01, r * 1.6 - time * 0.03));
  float belt = 0.55 + 0.45 * pow(abs(cos(ang)), 1.5);
  float halo = pow(1.0 / r, 3.6) * (0.3 + 0.7 * streak) * belt;
  vec3 corona = vec3(1.0, 0.78, 0.5) * halo * 0.11 * coronaIntensity;
  // inner glow just off the limb
  float inner = exp(-(r - 1.0) * 22.0) * 0.55 * coronaIntensity;
  vec3 col = corona + loops + prom + vec3(1.0, 0.55, 0.25) * inner;
  float edgeFade = 1.0 - smoothstep(extent * 0.8, extent, r);
  gl_FragColor = vec4(col * edgeFade, 1.0);
}

// Gaussian core with a faint wider skirt; additive, so no alpha needed.
precision highp float;
varying vec3 vColor;
varying float vIntensity;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;   // 1.0 at the sprite edge
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.5);
  float skirt = 0.16 * exp(-r2 * 1.8);
  float g = (core + skirt) * (1.0 - r2 * r2);
  gl_FragColor = vec4(vColor * vIntensity * g, 1.0);
}

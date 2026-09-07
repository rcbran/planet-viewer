uniform vec3 sunDir;
uniform vec3 earthCenter;
uniform float earthRadius;
uniform float shellRadius;
uniform float intensity;
uniform float falloff;   // scale height as a fraction of (shell - earth)
uniform vec3 dayColor;
uniform vec3 nightColor;
uniform vec3 twilightColor;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(sunDir);
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vPosW - ro);
  // closest approach of the view ray to the planet centre = altitude of this line of sight
  vec3 oc = earthCenter - ro;
  float b = length(oc - dot(oc, rd) * rd);
  float thickness = shellRadius - earthRadius;
  float h = clamp((b - earthRadius) / thickness, 0.0, 1.0);
  float density = exp(-h / falloff) * (1.0 - smoothstep(0.85, 1.0, h));
  // lighting: use the limb normal where the ray grazes the planet
  vec3 limbN = normalize(oc - dot(oc, rd) * rd) * -1.0;
  float sun = smoothstep(-0.25, 0.45, dot(limbN, L));
  vec3 col = mix(nightColor, dayColor, sun);
  float twilight = 1.0 - smoothstep(0.0, 0.28, abs(dot(limbN, L)));
  col += twilightColor * twilight * 0.45 * (0.3 + 0.7 * sun);
  float a = density * intensity * (0.15 + 0.65 * sun + 0.35 * twilight);
  a = min(a, 0.85);
  gl_FragColor = vec4(col * a, a);
}

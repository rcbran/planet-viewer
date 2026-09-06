uniform vec3 sunDir;
uniform float intensity;
uniform float falloff;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(sunDir);
  // back faces: dot(N,V) is -1 at the disc centre and 0 at the limb
  float rim = pow(clamp(1.0 + dot(N, V), 0.0, 1.0), falloff);
  float sun = smoothstep(-0.35, 0.55, dot(N, L));
  vec3 col = mix(vec3(0.05, 0.08, 0.25), vec3(0.45, 0.68, 1.0), sun);
  float twilight = 1.0 - smoothstep(0.0, 0.3, abs(dot(N, L)));
  col += vec3(1.0, 0.45, 0.15) * twilight * 0.55;
  float a = rim * intensity;
  gl_FragColor = vec4(col * a, a);
}

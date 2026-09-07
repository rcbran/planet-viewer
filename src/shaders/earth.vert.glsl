varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vTangentW;
varying vec3 vBitangentW;
void main() {
  vUv = uv;
  vec3 n = normalize(normal);
  // analytic sphere tangent frame (avoids needing tangent attributes)
  vec3 t = cross(vec3(0.0, 1.0, 0.0), n);
  // at the two pole vertices the cross product is zero and normalize() would give NaN (a black dot when a pole faces the camera)
  t = dot(t, t) < 1e-8 ? vec3(1.0, 0.0, 0.0) : normalize(t);
  vec3 b = cross(n, t);
  mat3 nm = mat3(modelMatrix);
  vNormalW = normalize(nm * n);
  vTangentW = normalize(nm * t);
  vBitangentW = normalize(nm * b);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}

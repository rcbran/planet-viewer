attribute float radial;
varying float vR;
varying vec3 vPosW;
varying vec3 vNormalW;
void main() {
  vR = radial;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}

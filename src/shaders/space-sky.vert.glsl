// Fullscreen triangle; reconstructs the world-space view ray per vertex.
uniform mat4 uInvProj;
uniform mat3 uCamRot;
varying vec3 vDir;
void main() {
  vec4 p = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = uCamRot * (p.xyz / p.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}

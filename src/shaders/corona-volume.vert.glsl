varying vec3 vPosW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vPosW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }

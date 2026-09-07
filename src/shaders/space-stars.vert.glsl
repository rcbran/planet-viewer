// Point-sprite stars: size and brightness from visual magnitude, faint ones scintillate.
attribute float aMag;
attribute vec3 aColor;
attribute float aSeed;
uniform mat3 uSkyToWorld;
uniform float uRadius;
uniform float uTime;
uniform float uPixelScale;   // drawing-buffer height / 1080 (includes device pixel ratio)
uniform float uMagRef;       // magnitude at which size reaches uSizeMin
uniform float uSizeMin;
uniform float uSizeScale;    // px per magnitude
uniform float uSizeMax;
uniform float uIntensity;    // peak linear intensity of a mag-0 star before size normalisation
uniform float uTwinkle;      // amplitude for the faintest stars
uniform float uMagCut;       // stars fainter than this are not drawn
uniform float uDebug;
varying vec3 vColor;
varying float vIntensity;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float tnoise(float t, float seed) {
  float i = floor(t), f = fract(t);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i + seed * 17.13), hash1(i + 1.0 + seed * 17.13), f);
}

void main() {
  vec3 wd = normalize(uSkyToWorld * position);
  vec4 mv = viewMatrix * vec4(cameraPosition + wd * uRadius, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = clamp(uSizeMin + uSizeScale * (uMagRef - aMag), uSizeMin, uSizeMax);
  float flux = pow(10.0, -0.4 * aMag);
  float amp = uTwinkle * smoothstep(2.0, 6.5, aMag);
  float rate = 1.6 + 2.4 * hash1(aSeed * 3.7);
  float n = tnoise(uTime * rate + aSeed * 100.0, aSeed);
  float tw = 1.0 + amp * (n * 2.0 - 1.0);
  float px = size * uPixelScale;
  gl_PointSize = max(px, 1.0);
  // sub-quadratic size normalisation: keeps the faint end visible without flattening the bright end
  vIntensity = uIntensity * flux * tw / pow(size, 1.6);
  vColor = aColor;
  if (uDebug > 0.5) { gl_PointSize = 6.0 * uPixelScale; vIntensity = 1.5; vColor = vec3(1.0, 0.1, 1.0); }
  if (aMag > uMagCut) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}

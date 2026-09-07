// Deep-sky background: NASA SVS 2020 star map (cube map, sRGB-encoded with a soft knee),
// plus faint zodiacal light / gegenschein and an optional sun disc. Output is linear HDR;
// tone mapping happens in the OutputPass.
precision highp float;
uniform samplerCube uSkyMap;
uniform mat3 uWorldToSky;
uniform float uGain;        // linear multiplier for the star map
uniform float uLoaded;      // 0 until the cube map has arrived
uniform float uBlack;       // black-level subtraction (linear, after gain)
uniform float uSaturation;  // 1 = star-map colours as-is
uniform vec3 uTint;         // gentle white-balance on the star map
uniform vec3 uSunSky;       // sun direction, sky space
uniform vec3 uEclNormalSky; // normal of the zodiacal band, sky space
uniform float uZodiacal;    // peak zodiacal brightness (linear)
uniform float uSunGlare;    // 0 = no sun disc
uniform float uTime;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 s = uWorldToSky * d;
  vec3 col = textureCube(uSkyMap, s).rgb * uLoaded;
  col = max(col - uBlack, 0.0) * uGain;
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSaturation) * uTint;

  // zodiacal light: brightest and narrowest near the sun, a wide faint band elsewhere, gegenschein at anti-sun.
  float cosE = clamp(dot(s, uSunSky), -1.0, 1.0);
  float e = acos(cosE);
  float lat = abs(asin(clamp(dot(s, uEclNormalSky), -1.0, 1.0)));
  float width = 0.22 + 0.30 * smoothstep(0.0, 2.2, e);
  float z = exp(-e * 1.35) * exp(-lat / width);
  z += 0.10 * exp(-(3.14159265 - e) * 5.0) * exp(-lat / 0.28);
  col += vec3(1.0, 0.94, 0.85) * z * uZodiacal;

  // sun: 0.53 deg disc that blooms, with a tight glare. Off by default (sun is usually off-screen).
  float disc = smoothstep(0.99996, 0.999985, cosE);
  float glare = pow(max(cosE, 0.0), 600.0) * 0.05 + pow(max(cosE, 0.0), 60.0) * 0.003;
  col += vec3(1.0, 0.98, 0.92) * (disc * 6.0 + glare) * uSunGlare;

  // tiny temporal dither so the faint Milky Way gradients never band after tone mapping
  col += (hash12(gl_FragCoord.xy + fract(uTime * 0.37) * 1000.0) - 0.5) * 0.0010;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}

uniform sampler2D cloudMap;
uniform vec3 sunDir;
uniform float time;
uniform float cloudDensity;
uniform float cloudCoverage;
uniform float cloudSoftness;
uniform float cloudDrift;
uniform float cloudScale;
uniform float twilightWidth;
uniform int cloudMode;
uniform sampler2D stormAtlas;   // 2x2 atlas of hurricane cloud masks
uniform int stormCount;         // 0..4
uniform vec3 stormPos[4];       // unit vectors (object space)
uniform float stormSize;        // angular radius in sphere units (~0.35 = very big)
uniform float stormSpin;        // rad/s
uniform float stormDarkness;
uniform float lightning;        // 0..1 intensity
uniform float nightFactorBias;
uniform vec3 sunObj;        // sun direction in object space
uniform float cloudRelief;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vPosO;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

// hurricane decal: returns cloud amount and writes storm weight for darkening/lightning
float hurricane(vec3 p, int i, out float w) {
  vec3 c = normalize(stormPos[i]);
  vec3 up = abs(c.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(up, c));
  vec3 b = cross(c, t);
  vec3 d = p - c;
  vec2 l = vec2(dot(d, t), dot(d, b)) / stormSize;
  float r = length(l);
  w = 0.0;
  if (r > 1.0 || dot(p, c) < 0.0) return 0.0;
  float dir = c.y >= 0.0 ? 1.0 : -1.0;        // NH counter-clockwise, SH clockwise
  float a = time * stormSpin * dir + float(i) * 1.7;
  float ca = cos(a), sa = sin(a);
  l = mat2(ca, -sa, sa, ca) * l;
  vec2 uv = l * 0.5 + 0.5;
  vec2 cell = vec2(float(i % 2), float(i / 2)) * 0.5;
  float m = pow(texture2D(stormAtlas, cell + uv * 0.5).r, 1.25);
  float edge = 1.0 - smoothstep(0.7, 1.0, r);
  w = m * edge;
  return w;
}

// Ashima simplex noise 3D
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float a=0.5, f=0.0;
  for(int i=0;i<6;i++){ f+=a*snoise(p); p=p*2.02+vec3(17.1,9.7,3.3); a*=0.5; }
  return f;
}

// cloud density at a surface point (object space) with its equirect uv
float cloudAt(vec3 pO, vec2 uv, out float storm) {
  float c;
  storm = 0.0;
  if (cloudMode == 0) {
    c = texture2D(cloudMap, uv + vec2(cloudDrift, 0.0)).r;
  } else {
    // Dynamic: the satellite cloud map is the structure; weather reshapes it.
    // slow domain warp so the pattern evolves instead of sliding as a rigid sheet
    vec3 q = pO * 2.5 + vec3(time * 0.015, 0.0, time * 0.011);
    vec2 warp = vec2(fbm(q), fbm(q + vec3(5.2, 1.3, 7.9))) * 0.012;
    vec2 uv2 = uv + vec2(cloudDrift, 0.0) + warp;
    float sat = texture2D(cloudMap, uv2).r;
    float n = fbm(pO * cloudScale + vec3(time * 0.02, 0.0, 0.0)) * 0.5 + 0.5;
    // coverage: 0.55 reproduces the satellite map; lower thins to the densest cores, higher thickens
    float s = cloudCoverage - 0.55;
    c = clamp(sat * (1.0 + 1.6 * s) + 0.6 * s, 0.0, 1.0);
    // softness: let noise erode / feather the mass
    c *= 1.0 - cloudSoftness * 0.9 * (1.0 - n);
    // overcast: add broad structured sheets that still carry satellite texture
    if (s > 0.0) {
      float sheet = smoothstep(0.3, 0.8, fbm(pO * cloudScale * 0.55 + vec3(31.0, 7.0, time * 0.006)) * 0.5 + 0.5);
      sheet *= (0.45 + 0.55 * sat) * s * 3.0;
      c = max(c, min(sheet, 1.0));
    }
    c = pow(c, 0.95);
  }
  // hurricanes (any mode)
  for (int i = 0; i < 4; i++) {
    if (i >= stormCount) break;
    float w; float h = hurricane(pO, i, w);
    c = max(c, h);
    storm = max(storm, w);
  }
  return c;
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(sunDir);
  float NdotL = dot(N, L);
  float storm;
  float c = cloudAt(vPosO, vUv, storm);
  // relief: density change toward the sun along the surface (lit on the sun-facing slope)
  vec3 Po = normalize(vPosO);
  vec3 Lo = normalize(sunObj);
  vec3 sunT = Lo - Po * dot(Po, Lo);
  float sl = length(sunT);
  float slope = 0.0;
  if (sl > 1e-3) {
    sunT /= sl;
    vec3 east = normalize(vec3(Po.z, 0.0, -Po.x));
    vec3 north = cross(Po, east);
    float cosLat = max(sqrt(1.0 - Po.y * Po.y), 0.05);
    float eps = 0.018;
    vec2 uvOff = vec2(dot(sunT, east) / (6.2831853 * cosLat), dot(sunT, north) / 3.14159265) * eps;
    float s2;
    float c2 = cloudAt(normalize(Po + sunT * eps), vUv + uvOff, s2);
    slope = (c2 - c) / eps;
  }
  float alpha = clamp(c * cloudDensity, 0.0, 1.0);
  float dayFactor = smoothstep(-twilightWidth, twilightWidth, NdotL);
  vec3 sunColor = vec3(1.0, 0.97, 0.9);
  vec3 lit = sunColor * (max(NdotL, 0.0) * 0.95 + 0.08 * dayFactor);
  // cheap volumetric feel: shade cloud density by its screen-space slope toward the sun
  float relief = clamp(1.0 - cloudRelief * slope * 0.16, 0.55, 1.35);
  lit *= mix(1.0, relief, dayFactor);
  float twilight = 1.0 - smoothstep(0.0, twilightWidth * 2.5, abs(NdotL));
  lit = mix(lit, lit * vec3(1.4, 0.7, 0.45), twilight * 0.7);
  vec3 color = lit + vec3(0.055, 0.07, 0.10) * (1.0 - dayFactor);
  // storm tops are denser and darker toward the core
  color *= 1.0 - stormDarkness * storm * 0.55;
  // lightning: brief flashes inside storm clouds, strongest on the night side
  if (lightning > 0.0 && storm > 0.2) {
    // sparse, tiny, fast flashes inside the storm mass; brighter on the night side
    vec3 cell = floor(vPosO * 260.0);
    float seed = dot(cell, vec3(3.1, 7.7, 11.3)) + floor(time * 12.0);
    float flash = step(1.0 - 0.012 * lightning, hash1(seed));
    float fade = pow(1.0 - fract(time * 12.0), 2.0);
    vec3 jitter = fract(vPosO * 260.0) - 0.5;
    float spot = 1.0 - smoothstep(0.0, 0.45, length(jitter));
    float f = flash * fade * spot * storm;
    color += vec3(0.8, 0.88, 1.0) * f * (0.6 + 1.4 * (1.0 - dayFactor)) * 2.5;
    alpha = max(alpha, f * 0.8);
  }
  gl_FragColor = vec4(color, alpha);
}

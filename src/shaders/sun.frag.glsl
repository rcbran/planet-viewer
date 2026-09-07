uniform sampler2D photoMap;     // HMI continuum, equirect
uniform sampler2D chromoMap;    // AIA 304, equirect
uniform float time;
uniform float granulation;      // animated fine-scale noise strength
uniform float limbDarkening;    // 0..1 (0.6 physical)
uniform float chromoMix;        // how much 304 shows near the limb
uniform float brightness;
uniform float flow;             // surface advection strength
uniform int wavelength;         // 0 = visible light (HMI), 1 = ultraviolet (AIA 304/171 look)
uniform sampler2D uvVideo;      // animated full-sphere 304 map (SVS 3851), optional
uniform sampler2D uvMap;        // packed: R = AIA 304, G = AIA 171 (today, reprojected)
uniform float uvMapReady;
uniform float uvVideoReady;
varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW; varying vec3 vPosO;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m; return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float mu = max(dot(N, V), 0.0);
  // the photosphere boils: advect the image with a slow, divergence-free-ish drift field
  vec3 fp = vPosO * 7.0 + vec3(time * 0.02, 0.0, -time * 0.015);
  vec2 drift = vec2(snoise(fp), snoise(fp + vec3(3.7, 9.1, 1.3))) * 0.0035 * flow;
  vec2 uvF = vUv + drift;
  if (wavelength == 1) {
    // Ultraviolet composite look (SDO AIA 304 + 171 style): dark red fibrous surface,
    // plage and active regions glowing yellow-white, brighter limb (optically thin emission)
    float l, gold = 0.0;
    if (uvMapReady > 0.5) {
      vec3 pk = texture2D(uvMap, uvF).rgb;
      l = pow(clamp((pk.r - 0.10) / 0.9, 0.0, 1.0), 2.4);            // 304: red base + plage
      gold = pow(clamp((pk.g - 0.30) / 0.70, 0.0, 1.0), 2.4);        // 171: only the hot active regions
    } else {
      vec3 src = uvVideoReady > 0.5 ? texture2D(uvVideo, uvF).rgb : texture2D(chromoMap, uvF).rgb;
      l = pow(clamp((dot(src, vec3(0.5, 0.35, 0.15)) - 0.12) / 0.88, 0.0, 1.0), 2.6);
    }
    // fibrous fine structure from the same noise stack
    vec3 pp = vPosO * 90.0;
    float fib = snoise(pp + vec3(time * 0.04, 0.0, time * 0.03)) * 0.5 + snoise(pp * 2.3 + vec3(-time * 0.07, time * 0.05, 0.0)) * 0.3;
    l *= 1.0 + granulation * 0.22 * fib;
    vec3 c0 = vec3(0.22, 0.02, 0.0), c1 = vec3(0.85, 0.16, 0.02), c2 = vec3(1.0, 0.50, 0.08), c3 = vec3(1.0, 0.86, 0.38), c4 = vec3(1.0, 1.0, 0.85);
    vec3 col = l < 0.3 ? mix(c0, c1, l / 0.3) : l < 0.55 ? mix(c1, c2, (l - 0.3) / 0.25) : l < 0.8 ? mix(c2, c3, (l - 0.55) / 0.25) : mix(c3, c4, (l - 0.8) / 0.2);
    float mu2 = max(dot(N, V), 0.0);
    // 171 channel paints the gold active regions and coronal loops over the red base
    col *= 0.72;                                        // keep the quiet Sun deep red
    col += vec3(1.0, 0.80, 0.30) * gold * 0.9 + vec3(1.0, 0.98, 0.85) * pow(gold, 3.0) * 0.5;
    col *= 1.0 + 0.8 * pow(1.0 - mu2, 2.0);            // limb brightening (optically thin emission)
    col *= 0.8 + 0.7 * smoothstep(0.5, 1.0, max(l, gold));
    col *= brightness;
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  vec3 photo = texture2D(photoMap, uvF).rgb;
  // real photosphere is white-yellow (~5800 K); the HMI image is a flat pale disk with spots
  float lum = dot(photo, vec3(0.3, 0.59, 0.11));
  // saturated orange-gold; contrast-stretched so granulation and faculae read
  float l2 = pow(smoothstep(0.05, 1.0, lum), 1.6);
  vec3 base = mix(vec3(0.95, 0.30, 0.04), vec3(1.0, 0.72, 0.30), l2) * (0.30 + 0.70 * l2) * 0.62;
  // convective cells: two noise scales, slowly boiling, plus a sub-pixel shimmer
  vec3 p = vPosO * 55.0;
  float g1 = snoise(p + vec3(time * 0.05, 0.0, time * 0.035));
  float g2 = snoise(p * 3.1 + vec3(-time * 0.09, time * 0.04, 0.0));
  float g3 = snoise(p * 9.0 + vec3(time * 0.2, -time * 0.15, 0.0));
  float gran = 1.0 + granulation * (0.16 * g1 + 0.09 * g2 + 0.05 * g3);
  vec3 col = base * gran;
  // limb darkening (Eddington), then the chromosphere bleeds in at the limb
  col *= 1.0 - limbDarkening * (1.0 - mu);
  col = mix(col, col * vec3(1.05, 0.92, 0.7), 1.0 - mu); // slightly warmer toward the limb
  vec3 chromo = texture2D(chromoMap, uvF).rgb;
  vec3 limbCol = vec3(1.0, 0.32, 0.10) * (0.35 + 0.65 * dot(chromo, vec3(0.3, 0.59, 0.11)) * 1.4);
  float limb = pow(1.0 - mu, 3.0);
  col = mix(col, limbCol * 0.9, limb * chromoMix);
  col *= brightness;
  // ACES flattens a bright warm disc; give the surface back some saturation and contrast
  float y = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(y), col, 1.35);
  col = (col - y) * 1.15 + y;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}

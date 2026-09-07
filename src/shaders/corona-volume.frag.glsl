// Raymarched corona: a shell of drifting 3D noise between the photosphere (r=1) and rOuter,
// emissive only, brighter near the surface and along an equatorial belt, with radial streamers.
uniform vec3 sunCenter;
uniform vec3 sunAxis;       // world-space north pole
uniform float rOuter;
uniform float time;
uniform float intensity;
uniform float turbulence;
varying vec3 vPosW;

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
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

// ray / sphere: returns (tNear, tFar) or tFar < 0 when missed
vec2 sphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd); float c = dot(ro, ro) - R * R; float h = b * b - c;
  if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b - h, -b + h);
}

float density(vec3 p) {
  float r = length(p);
  vec3 dir = p / r;
  // radial streamers: noise stretched along the radius, drifting outward
  vec3 q = dir * 3.2 + vec3(0.0, 0.0, 0.0);
  float streamer = fbm(q * 1.4 + vec3(time * 0.012, 0.0, -time * 0.009) - dir * (r - 1.0) * 0.6 + dir * time * 0.03);
  float boil = fbm(p * 5.0 + vec3(time * 0.05, -time * 0.03, time * 0.04));
  float lat = abs(dot(dir, sunAxis));
  float belt = 0.55 + 0.45 * (1.0 - lat * lat);           // brighter near the equator
  float fall = exp(-(r - 1.0) * 5.5) + 0.05 * exp(-(r - 1.0) * 1.8);   // dense low corona + faint outer halo
  float d = (0.55 + 0.45 * streamer) * (0.6 + 0.4 * turbulence * boil) * belt * fall;
  return max(d, 0.0);
}

void main() {
  vec3 ro = cameraPosition - sunCenter;
  vec3 rd = normalize(vPosW - cameraPosition);
  vec2 outer = sphere(ro, rd, rOuter);
  if (outer.y < 0.0) discard;
  float t0 = max(outer.x, 0.0), t1 = outer.y;
  vec2 inner = sphere(ro, rd, 1.0);
  if (inner.y > 0.0 && inner.x > 0.0) t1 = min(t1, inner.x);   // stop at the photosphere
  if (t1 <= t0) discard;
  const int STEPS = 40;
  float dt = (t1 - t0) / float(STEPS);
  // dither the start to hide banding
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = t0 + dt * jitter;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = density(p);
    float r = length(p);
    // colour: white-gold near the surface, cooler orange further out
    vec3 c = mix(vec3(1.0, 0.72, 0.35), vec3(1.0, 0.45, 0.18), clamp((r - 1.0) / (rOuter - 1.0), 0.0, 1.0));
    acc += c * d * dt;
    t += dt;
  }
  vec3 col = acc * intensity * 0.32;
  gl_FragColor = vec4(col, 1.0);
}

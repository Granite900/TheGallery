/**
 * The film pipeline (all GPU):
 *
 *  capture  – scene → HDR render target from the photographic camera,
 *             optionally accumulating sub-frames (hand shake / motion over
 *             the real shutter time), then a LENS pass (physically sized
 *             depth-of-field gather with per-lens swirl / cat's-eye, wide
 *             open softness, vignetting, haze veil) and a LATENT pass that
 *             applies exposure error, shutter capping and light-leak streaks
 *             and log-encodes exposure into an 8-bit "latent image" JPEG.
 *  develop  – latent → negative density via the stock's characteristic
 *             curve and the DevResult (gamma, fog, speed shift, crossover,
 *             grain, uneven development, drag, underfix, drying marks,
 *             dust, kinks, fogging). Outputs the negative as seen on the
 *             light table, a lab-style positive scan, and a density map.
 *  print    – density map → enlarger exposure through paper grade curve,
 *             including test strips and paper development time.
 */
import { AbstractEngine, Camera, Constants, EffectRenderer, EffectWrapper, RenderTargetTexture, Scene, Texture, Vector3, BaseTexture, InternalTexture } from '@babylonjs/core';
import { LOG10_2 } from '../sim/filmcurve';

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUV;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
`;

const ACCUM_FS = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D prevTex;
uniform sampler2D curTex;
uniform float weight;
uniform float first;
void main(){
  vec3 p = first > 0.5 ? vec3(0.0) : texture2D(prevTex, vUV).rgb;
  gl_FragColor = vec4(p + texture2D(curTex, vUV).rgb * weight, 1.0);
}`;

const LENS_FS = /* glsl */ `${COMMON}
uniform sampler2D colorTex;
uniform sampler2D depthTex;
uniform vec2 texel;
uniform float aspect;
uniform float nearZ;
uniform float farZ;
uniform float focal;
uniform float fstop;
uniform float focusDist;
uniform float frameW;
uniform float widthPx;
uniform float swirl;
uniform float catsEye;
uniform float vignette;
uniform float soft;
uniform float haze;
uniform float openness;
uniform float maxCoc;

float linDepth(vec2 uv){
  float d = texture2D(depthTex, uv).r;
  float z = d * 2.0 - 1.0;
  return (2.0 * nearZ * farZ) / (farZ + nearZ - z * (farZ - nearZ));
}
float cocPx(float dist){
  float f = focal / 1000.0;
  float A = f / fstop;
  float c = A * abs(dist - focusDist) * f / (max(dist, 0.01) * max(focusDist - f, 1e-4));
  return min(c * 1000.0 / frameW * widthPx * 0.5, maxCoc);
}
void main(){
  vec2 p = (vUV - 0.5) * vec2(aspect, 1.0);
  float rad = length(p) / (0.5 * length(vec2(aspect, 1.0)));
  vec2 radial = length(p) > 1e-4 ? normalize(p) : vec2(1.0, 0.0);
  vec2 tang = vec2(-radial.y, radial.x);
  float d0 = linDepth(vUV);
  float r0 = cocPx(d0);
  r0 = max(r0, soft * openness * (0.5 + 1.6 * rad * rad));
  vec3 center = texture2D(colorTex, vUV).rgb;
  vec3 col = center;
  if (r0 > 0.6) {
    vec3 sum = center;
    float wsum = 1.0;
    const int N = 112;
    float sq = 1.0 - swirl * rad * 0.75;
    for (int i = 0; i < N; i++) {
      float t = (float(i) + 0.5) / float(N);
      float r = sqrt(t);
      float a = float(i) * 2.39996323;
      vec2 o = vec2(cos(a), sin(a)) * r;
      vec2 sh = o + radial * catsEye * rad * 0.85;
      if (length(sh) > 1.0) continue;
      vec2 oo = radial * dot(o, radial) * sq + tang * dot(o, tang) * (1.0 + swirl * rad * 0.25);
      vec2 uv = vUV + oo * r0 * texel;
      float ds = linDepth(uv);
      float rs = cocPx(ds);
      float rc = ds < d0 ? rs : min(rs, r0);
      float dist = length(oo) * r0;
      float w = clamp(rc - dist + 1.0, 0.0, 1.0);
      sum += texture2D(colorTex, uv).rgb * w;
      wsum += w;
    }
    col = sum / wsum;
  }
  // veiling glare / haze: wide ring average adds a milky lift and glow
  if (haze > 0.01) {
    vec3 wide = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float a = float(i) * 0.2618;
      float rr = 0.04 + 0.06 * fract(float(i) * 0.618);
      wide += texture2D(colorTex, vUV + vec2(cos(a), sin(a) * aspect) * rr).rgb;
    }
    wide /= 24.0;
    col = col * (1.0 - 0.35 * haze) + wide * 0.75 * haze + max(wide - 1.0, 0.0) * haze * 0.6;
  }
  float natural = 1.0 - clamp(0.22 * rad * rad * (40.0 / max(focal, 20.0)), 0.0, 0.6);
  float v = 1.0 - vignette * openness * rad * rad * 0.85;
  col *= natural * clamp(v, 0.2, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const LATENT_FS = /* glsl */ `${COMMON}
uniform sampler2D optTex;
uniform float k;
uniform float expo;
uniform float capping;
uniform float cappingDir;
uniform float leak;
uniform vec2 leakPos;
uniform float leakWidth;
uniform float seed;
uniform float colorFilm;
uniform float sceneBright;
void main(){
  vec3 E = texture2D(optTex, vUV).rgb * k * expo;
  float u = cappingDir > 0.0 ? vUV.x : 1.0 - vUV.x;
  E *= mix(1.0, 1.0 - capping, smoothstep(0.45, 1.0, u));
  if (leak > 0.0) {
    float n = fbm(vec2(vUV.x * 3.0 + seed, vUV.y * 9.0));
    float band = exp(-pow((vUV.x - leakPos.x) / leakWidth, 2.0));
    float vert = smoothstep(0.0, 0.6, 1.0 - abs(vUV.y - leakPos.y) * 1.4);
    float edge = exp(-pow(min(vUV.x, 1.0 - vUV.x) / 0.05, 2.0)) * 0.6;
    float L = leak * sceneBright * (band * vert * (0.6 + 0.8 * n) + edge * n);
    vec3 tint = colorFilm > 0.5 ? vec3(1.0, 0.42, 0.12) : vec3(1.0);
    E += tint * L * 1.4;
  }
  vec3 v = clamp((log2(max(E, vec3(1e-6))) + 10.0) / 16.0, 0.0, 1.0);
  gl_FragColor = vec4(v, 1.0);
}`;

const DEVELOP_FS = /* glsl */ `${COMMON}
uniform sampler2D latentTex;
uniform vec2 texel;
uniform float process;      // 0 bw neg, 1 c41, 2 e6, 3 bw reversal
uniform float mode;         // 0 negative view, 1 positive scan, 2 density map
uniform float gamma;
uniform vec3 crossover;
uniform float latUnder;
uniform float latOver;
uniform float speedShift;
uniform float baseFog;
uniform float fog;
uniform float grain;
uniform float grainScale;
uniform float uneven;
uniform float surge;
uniform float underfix;
uniform float drying;
uniform float dust;
uniform float lightFog;
uniform float backFog;
uniform float kink;
uniform vec2 kinkPos;
uniform float seed;
uniform vec3 scanK;
uniform vec3 palette;
uniform float saturation;
uniform float slideShift;
uniform float reversed;
uniform float blank;
uniform float halation;
uniform float colorShift;
uniform float aspect;

const float L2 = ${LOG10_2.toFixed(6)};
const float LOGMID = -0.744727; // log10(0.18)

vec3 logE(vec2 uv){ return (texture2D(latentTex, uv).rgb * 16.0 - 10.0) * L2; }

float negD(float x){
  float s = 0.2;
  float xt = x + latUnder * L2 + 0.15;
  float dtoe = gamma * s * log(1.0 + exp(xt / s));
  float dmax = gamma * (latUnder + latOver + 2.0) * L2 + 0.3;
  return dmax * (1.0 - exp(-dtoe / dmax));
}
float negDg(float x, float g){
  float s = 0.2;
  float xt = x + latUnder * L2 + 0.15;
  float dtoe = g * s * log(1.0 + exp(xt / s));
  float dmax = g * (latUnder + latOver + 2.0) * L2 + 0.3;
  return dmax * (1.0 - exp(-dtoe / dmax));
}
// paper / scan curve: log exposure → print density (grade 2)
float paperD(float lh){
  float range = 1.05;
  float sgm = 1.0 / (1.0 + exp(-6.0 * (lh / range - 0.5)));
  return 0.06 + (2.05 - 0.06) * sgm;
}
float slideD(float x, float g){
  // reversal: density falls with exposure
  return 0.2 + 3.0 / (1.0 + exp(g * 2.3 * (x + 0.05)));
}

void main(){
  vec2 uv = vUV;
  vec3 le = logE(uv);
  // halation: bright neighbours bleed into the red-sensitive layer
  if (halation > 0.0) {
    float hsum = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec3 l2 = logE(uv + vec2(cos(a), sin(a) * aspect) * texel * 7.0);
      hsum += max(l2.r - 0.25, 0.0);
    }
    le.r = log(pow(10.0, le.r) + halation * hsum * 0.15) / log(10.0);
  }
  vec3 x = le - LOGMID + speedShift * L2;
  float mono = dot(x, vec3(0.24, 0.66, 0.10));

  // grain noise (density domain)
  vec2 gp = uv / texel / grainScale;
  float g1 = hash(floor(gp) + seed) - 0.5;
  float g2 = hash(floor(gp * 0.5) + seed * 1.7) - 0.5;
  float gn = (g1 * 0.65 + g2 * 0.55) * grain;

  // processing defects (density added to the negative)
  float edge = smoothstep(0.82, 1.0, abs(uv.y - 0.5) * 2.0);
  float blotch = fbm(uv * 3.0 + seed);
  float drag = vnoise(vec2(uv.x * 90.0 + seed, uv.y * 3.0)) * smoothstep(0.62, 1.0, abs(uv.y - 0.5) * 2.0);
  float defectD = uneven * (0.18 * (blotch - 0.5) + 0.22 * drag) + surge * 0.14 * edge;
  defectD += lightFog * (0.35 + 0.65 * smoothstep(0.3, 1.0, abs(uv.x - 0.5) * 2.0));
  defectD += backFog * (0.9 + 0.6 * fbm(uv * 2.0 + seed * 3.1)) * smoothstep(-0.2, 1.0, uv.x);
  float dryRing = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 c = vec2(hash(vec2(seed, float(i))), hash(vec2(float(i), seed)));
    float r = 0.03 + 0.05 * hash(vec2(float(i) + seed, 3.0));
    float d = length((uv - c) * vec2(aspect, 1.0));
    dryRing += smoothstep(0.004, 0.0, abs(d - r)) * 0.7 + smoothstep(r, 0.0, d) * 0.15;
  }
  defectD += drying * 0.12 * dryRing;
  if (kink > 0.0) {
    vec2 kp = (uv - kinkPos) * vec2(aspect, 1.0);
    float kd = length(kp);
    float crescent = smoothstep(0.004, 0.0, abs(kd - 0.025)) * step(0.0, kp.y);
    defectD += kink * crescent * 0.9;
  }
  float speck = 0.0;
  if (dust > 0.0) {
    vec2 cell = floor(uv * vec2(aspect, 1.0) * 60.0);
    float hcell = hash(cell + seed * 0.37);
    vec2 cpos = (cell + vec2(hash(cell + 1.3), hash(cell + 7.1))) / 60.0;
    float dd = length(uv * vec2(aspect, 1.0) - cpos);
    speck = step(1.0 - dust * 0.05, hcell) * smoothstep(0.0025, 0.001, dd);
    // occasional hair
    float hair = smoothstep(0.0012, 0.0, abs(sin(uv.x * 9.0 + seed) * 0.08 + 0.5 - uv.y - hash(vec2(seed, 9.0)) * 0.6 + 0.3)) * step(0.7, hash(vec2(seed, 11.0))) * step(abs(uv.x - hash(vec2(seed,5.0))), 0.12);
    speck = max(speck, hair * dust);
  }

  vec3 outc;
  if (blank > 0.5) {
    // clear film (or black if reversal not bleached)
    float D = baseFog + (reversed < 0.5 ? 2.6 : 0.0);
    outc = mode < 0.5 ? vec3(pow(10.0, -D)) * vec3(0.96, 0.95, 0.92) : (mode < 1.5 ? vec3(process > 1.5 ? pow(10.0, -D) : 0.02) : vec3(D / 3.0));
    gl_FragColor = vec4(mode < 1.5 ? toSRGB(outc) : outc, 1.0);
    return;
  }

  if (process < 0.5) {
    // ---------------- black & white negative ----------------
    float D = negD(mono) + baseFog + fog + defectD + gn * (0.25 + 0.75 * smoothstep(0.05, 1.0, negD(mono)));
    float milky = underfix * (0.55 + 0.45 * blotch);
    D += milky * 0.35 + speck * 1.6;
    if (mode < 0.5) {
      vec3 base = vec3(0.93, 0.92, 0.9) - milky * vec3(0.0, 0.18, 0.05);
      outc = base * pow(10.0, -D);
    } else if (mode < 1.5) {
      float lh = scanK.g - D;
      float pd = paperD(lh) - underfix * 0.25;
      outc = vec3(pow(10.0, -pd));
      outc = mix(outc, outc * vec3(1.02, 0.9, 1.0), underfix);
      outc = mix(outc, vec3(1.0), speck);
    } else outc = vec3(D / 3.0);
  } else if (process < 1.5) {
    // ---------------- C-41 colour negative ----------------
    vec3 cx = x + vec3(0.0, colorShift * 0.03, -colorShift * 0.05);
    vec3 D = vec3(negDg(cx.r, gamma * crossover.r), negDg(cx.g, gamma * crossover.g), negDg(cx.b, gamma * crossover.b));
    D += vec3(baseFog + fog) + vec3(defectD) + vec3(gn * 0.8) + speck * 1.6;
    D += underfix * vec3(0.25, 0.25, 0.25) * (0.5 + blotch);
    vec3 mask = vec3(0.22, 0.48, 0.78);
    if (mode < 0.5) {
      outc = pow(vec3(10.0), -(D + mask));
    } else if (mode < 1.5) {
      vec3 lh = scanK - D;
      vec3 pd = vec3(paperD(lh.r), paperD(lh.g), paperD(lh.b));
      vec3 lin = pow(vec3(10.0), -pd) * palette;
      float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      lin = mix(vec3(lum), lin, saturation * (1.0 - underfix * 0.6));
      lin = mix(lin, vec3(1.0), speck);
      outc = lin;
    } else outc = D / 3.0;
  } else {
    // ---------------- reversal: E-6 slides and B&W Super 8 ----------------
    float g = gamma;
    vec3 sx = x + slideShift * L2;
    vec3 D;
    if (process < 2.5) D = vec3(slideD(sx.r, g * crossover.r), slideD(sx.g, g * crossover.g), slideD(sx.b, g * crossover.b));
    else D = vec3(slideD(dot(sx, vec3(0.24, 0.66, 0.1)), g));
    if (reversed < 0.5) D += 2.0;
    D += vec3(gn * 0.6) + fog * 0.5 - defectD * 0.5 + underfix * 0.6;
    D = max(D, vec3(0.15));
    vec3 lin = pow(vec3(10.0), -D) * 3.2;
    if (process < 2.5) {
      lin *= palette;
      float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      lin = mix(vec3(lum), lin, saturation);
    }
    lin = mix(lin, vec3(0.0), speck);
    outc = mode < 1.5 ? lin : D / 3.0;
  }
  gl_FragColor = vec4(mode < 1.5 ? toSRGB(outc) : outc, 1.0);
}`;

const PRINT_FS = /* glsl */ `${COMMON}
uniform sampler2D densTex;
uniform vec2 texel;
uniform float logExpo;   // log10(seconds * aperture factor) - K
uniform float range;
uniform float dev;       // development completion 0..1
uniform float blur;
uniform float stripCount;
uniform float stripStart;
uniform float stripStep;
uniform float apFactor;
uniform float paperK;
uniform float dodge;
uniform float burn;
uniform float fixed_;
uniform float seed;
uniform float colorPrint;
float paper(float lh){
  float dmax = 0.06 + 1.99 * pow(dev, 0.7);
  float shift = (1.0 - dev) * 0.35;
  float sgm = 1.0 / (1.0 + exp(-6.0 * ((lh - shift) / range - 0.5)));
  return 0.06 + (dmax - 0.06) * sgm;
}
void main(){
  vec3 D = texture2D(densTex, vUV).rgb * 3.0;
  if (blur > 0.0) {
    vec3 s = D;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      s += texture2D(densTex, vUV + vec2(cos(a), sin(a)) * texel * blur).rgb * 3.0;
    }
    D = s / 13.0;
  }
  float le = logExpo;
  if (stripCount > 0.5) {
    float idx = floor(vUV.x * stripCount);
    float secs = stripStart + stripStep * idx;
    le = log(secs * apFactor) / log(10.0) - paperK;
  }
  vec2 c = (vUV - 0.5);
  float centre = smoothstep(0.35, 0.15, length(c));
  float edges = smoothstep(0.3, 0.55, max(abs(c.x), abs(c.y)));
  le += log(max(0.05, 1.0 - dodge * centre)) / log(10.0) + log(1.0 + burn * edges) / log(10.0);
  vec3 lh = vec3(le) - D;
  vec3 pd = colorPrint > 0.5 ? vec3(paper(lh.r), paper(lh.g), paper(lh.b)) : vec3(paper(dot(lh, vec3(0.3333))));
  vec3 lin = pow(vec3(10.0), -pd) * vec3(0.97, 0.96, 0.93);
  if (fixed_ < 0.5) lin *= vec3(1.0, 0.93, 0.9);
  if (stripCount > 0.5) {
    float sx = fract(vUV.x * stripCount);
    lin *= mix(0.85, 1.0, smoothstep(0.0, 0.01, sx));
  }
  gl_FragColor = vec4(toSRGB(lin), 1.0);
}`;

export interface CaptureParams {
  width: number;
  height: number;
  focalMm: number;
  fStop: number;
  focusDist: number;
  frameWidthMm: number;
  swirl: number;
  catsEye: number;
  vignette: number;
  softWideOpen: number;
  haze: number;
  openness: number;
  calibration: number;
  exposureStops: number;
  capping: number;
  cappingDir: number;
  leak: number;
  leakPos: [number, number];
  colorFilm: boolean;
  sceneBright: number;
  seed: number;
  /** camera rotations (radians) per sub-frame for shake; empty = single frame */
  shakePath: [number, number][];
}

export interface DevelopParams {
  process: 0 | 1 | 2 | 3;
  gamma: number;
  crossover: [number, number, number];
  latUnder: number;
  latOver: number;
  speedShift: number;
  baseFog: number;
  fog: number;
  grain: number;
  grainScale: number;
  uneven: number;
  surge: number;
  underfix: number;
  drying: number;
  dust: number;
  lightFog: number;
  backFog: number;
  kink: number;
  kinkPos: [number, number];
  seed: number;
  scanK: [number, number, number];
  palette: [number, number, number];
  saturation: number;
  slideShift: number;
  reversed: boolean;
  blank: boolean;
  halation: number;
  colorShift: number;
}

export interface PrintParams {
  seconds: number;
  apFactor: number;
  range: number;
  dev: number;
  blur: number;
  strip?: { count: number; start: number; step: number };
  paperK: number;
  dodge: number;
  burn: number;
  fixed: boolean;
  seed: number;
  color: boolean;
}

function wrap(engine: AbstractEngine, name: string, fs: string, uniforms: string[], samplers: string[]): EffectWrapper {
  return new EffectWrapper({ engine, name, fragmentShader: fs, uniformNames: uniforms, samplerNames: samplers, useShaderStore: false });
}

async function ready(w: EffectWrapper): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if (w.isReady()) return;
    await new Promise((r) => setTimeout(r, 16));
  }
  throw new Error(`shader ${w.name} failed to compile`);
}

/** Wrap an InternalTexture (depth attachment) as a BaseTexture for sampling */
function asBase(engine: AbstractEngine, it: InternalTexture): BaseTexture {
  const b = new BaseTexture(engine);
  b._texture = it;
  return b;
}

export class FilmLab {
  private renderer: EffectRenderer;
  private accum: EffectWrapper;
  private lens: EffectWrapper;
  private latent: EffectWrapper;
  private developW: EffectWrapper;
  private printW: EffectWrapper;

  constructor(private engine: AbstractEngine) {
    this.renderer = new EffectRenderer(engine);
    this.accum = wrap(engine, 'accum', ACCUM_FS, ['weight', 'first'], ['prevTex', 'curTex']);
    this.lens = wrap(engine, 'lens', LENS_FS, ['texel', 'aspect', 'nearZ', 'farZ', 'focal', 'fstop', 'focusDist', 'frameW', 'widthPx', 'swirl', 'catsEye', 'vignette', 'soft', 'haze', 'openness', 'maxCoc'], ['colorTex', 'depthTex']);
    this.latent = wrap(engine, 'latent', LATENT_FS, ['k', 'expo', 'capping', 'cappingDir', 'leak', 'leakPos', 'leakWidth', 'seed', 'colorFilm', 'sceneBright'], ['optTex']);
    this.developW = wrap(
      engine,
      'develop',
      DEVELOP_FS,
      ['texel', 'process', 'mode', 'gamma', 'crossover', 'latUnder', 'latOver', 'speedShift', 'baseFog', 'fog', 'grain', 'grainScale', 'uneven', 'surge', 'underfix', 'drying', 'dust', 'lightFog', 'backFog', 'kink', 'kinkPos', 'seed', 'scanK', 'palette', 'saturation', 'slideShift', 'reversed', 'blank', 'halation', 'colorShift', 'aspect'],
      ['latentTex'],
    );
    this.printW = wrap(engine, 'print', PRINT_FS, ['texel', 'logExpo', 'range', 'dev', 'blur', 'stripCount', 'stripStart', 'stripStep', 'apFactor', 'paperK', 'dodge', 'burn', 'fixed_', 'seed', 'colorPrint'], ['densTex']);
  }

  private rtt(scene: Scene | AbstractEngine, w: number, h: number, float: boolean, name: string): RenderTargetTexture {
    const t = new RenderTargetTexture(name, { width: w, height: h }, scene as Scene, {
      generateMipMaps: false,
      type: float ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE,
      samplingMode: Texture.BILINEAR_SAMPLINGMODE,
      generateDepthBuffer: false,
    });
    t.wrapU = Texture.CLAMP_ADDRESSMODE;
    t.wrapV = Texture.CLAMP_ADDRESSMODE;
    return t;
  }

  /**
   * Render a photograph's latent image. The camera must already have the
   * film format's vertical FOV.
   */
  async capture(scene: Scene, cam: Camera, p: CaptureParams): Promise<Blob> {
    await Promise.all([ready(this.accum), ready(this.lens), ready(this.latent)]);
    const w = p.width;
    const h = p.height;
    const color = new RenderTargetTexture('photoColor', { width: w, height: h }, scene, {
      generateMipMaps: false,
      type: Constants.TEXTURETYPE_HALF_FLOAT,
      samplingMode: Texture.BILINEAR_SAMPLINGMODE,
      generateDepthBuffer: true,
    });
    color.createDepthStencilTexture(Constants.LESS, false, false, 1);
    color.activeCamera = cam;
    color.renderList = null;
    color.renderParticles = true;
    color.renderSprites = true;
    color.clearColor = scene.clearColor;
    // scene.meshes as render list
    color.renderList = scene.meshes.filter((m) => m.isEnabled() && m.isVisible && !(m.metadata as { noPhoto?: boolean } | undefined)?.noPhoto);
    const accA = this.rtt(scene, w, h, true, 'accA');
    const accB = this.rtt(scene, w, h, true, 'accB');
    const path = p.shakePath.length ? p.shakePath : [[0, 0] as [number, number]];
    const baseRot = cam instanceof Object && 'rotation' in cam ? (cam as unknown as { rotation: Vector3 }).rotation.clone() : null;
    let src = accA;
    let dst = accB;
    for (let i = 0; i < path.length; i++) {
      if (baseRot) {
        const r = (cam as unknown as { rotation: Vector3 }).rotation;
        r.x = baseRot.x + path[i][0];
        r.y = baseRot.y + path[i][1];
        cam.computeWorldMatrix();
      }
      color.render();
      const first = i === 0;
      this.accum.onApplyObservable.clear();
      this.accum.onApplyObservable.add(() => {
        this.accum.effect.setTexture('prevTex', src);
        this.accum.effect.setTexture('curTex', color);
        this.accum.effect.setFloat('weight', 1 / path.length);
        this.accum.effect.setFloat('first', first ? 1 : 0);
      });
      this.renderer.render(this.accum, dst);
      const t = src;
      src = dst;
      dst = t;
      // keep the depth from the central sub-frame
      if (i === Math.floor(path.length / 2) || path.length === 1) {
        /* depth already in color's depth texture after this render */
      }
    }
    if (baseRot) {
      (cam as unknown as { rotation: Vector3 }).rotation.copyFrom(baseRot);
      cam.computeWorldMatrix();
    }
    const depthBase = asBase(scene.getEngine(), color.depthStencilTexture!);
    const optical = dst;
    this.lens.onApplyObservable.clear();
    this.lens.onApplyObservable.add(() => {
      const e = this.lens.effect;
      e.setTexture('colorTex', src);
      e.setTexture('depthTex', depthBase);
      e.setFloat2('texel', 1 / w, 1 / h);
      e.setFloat('aspect', w / h);
      e.setFloat('nearZ', cam.minZ);
      e.setFloat('farZ', cam.maxZ);
      e.setFloat('focal', p.focalMm);
      e.setFloat('fstop', p.fStop);
      e.setFloat('focusDist', p.focusDist);
      e.setFloat('frameW', p.frameWidthMm);
      e.setFloat('widthPx', w);
      e.setFloat('swirl', p.swirl);
      e.setFloat('catsEye', p.catsEye);
      e.setFloat('vignette', p.vignette);
      e.setFloat('soft', p.softWideOpen * 1.6);
      e.setFloat('haze', p.haze);
      e.setFloat('openness', p.openness);
      e.setFloat('maxCoc', Math.max(8, w * 0.035));
    });
    this.renderer.render(this.lens, optical);
    const out = this.rtt(scene, w, h, false, 'latentOut');
    this.latent.onApplyObservable.clear();
    this.latent.onApplyObservable.add(() => {
      const e = this.latent.effect;
      e.setTexture('optTex', optical);
      e.setFloat('k', p.calibration);
      e.setFloat('expo', Math.pow(2, p.exposureStops));
      e.setFloat('capping', p.capping);
      e.setFloat('cappingDir', p.cappingDir);
      e.setFloat('leak', p.leak);
      e.setFloat2('leakPos', p.leakPos[0], p.leakPos[1]);
      e.setFloat('leakWidth', 0.05 + 0.1 * (p.seed % 1));
      e.setFloat('seed', p.seed);
      e.setFloat('colorFilm', p.colorFilm ? 1 : 0);
      e.setFloat('sceneBright', p.sceneBright);
    });
    this.renderer.render(this.latent, out);
    const blob = await this.readToBlob(out, w, h, 'image/jpeg', 0.93);
    color.dispose();
    accA.dispose();
    accB.dispose();
    out.dispose();
    depthBase._texture = null;
    depthBase.dispose();
    return blob;
  }

  /** Average luminance of the scene as seen by cam (for the meter), center-weighted. */
  async meter(scene: Scene, cam: Camera, calibration: number, spot = false): Promise<number> {
    const w = 64;
    const h = 48;
    const t = new RenderTargetTexture('meterRT', { width: w, height: h }, scene, { generateMipMaps: false, type: Constants.TEXTURETYPE_FLOAT, generateDepthBuffer: true });
    t.activeCamera = cam;
    t.renderList = scene.meshes.filter((m) => m.isEnabled() && m.isVisible);
    t.clearColor = scene.clearColor;
    t.render();
    const px = (await t.readPixels()) as Float32Array;
    t.dispose();
    let sum = 0;
    let wsum = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const L = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        const dx = (x / w - 0.5) * 2;
        const dy = (y / h - 0.5) * 2;
        const wt = spot ? (dx * dx + dy * dy < 0.06 ? 1 : 0) : 1 / (0.6 + dx * dx + dy * dy);
        // meters average in log space-ish: clamp extremes
        sum += Math.log2(Math.max(1e-4, L * calibration)) * wt;
        wsum += wt;
      }
    return Math.pow(2, sum / Math.max(wsum, 1e-6));
  }

  async develop(engine: AbstractEngine, latent: Blob, w: number, h: number, p: DevelopParams): Promise<{ neg: Blob; pos: Blob; dens: Blob }> {
    await ready(this.developW);
    const url = URL.createObjectURL(latent);
    const tex = await new Promise<Texture>((resolve, reject) => {
      const t: Texture = new Texture(url, engine, true, true, Texture.BILINEAR_SAMPLINGMODE, () => resolve(t), (m) => reject(new Error(String(m))));
    });
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const out = this.rtt(engine, w, h, false, 'devOut');
    const run = async (mode: number, type: string, q: number) => {
      this.developW.onApplyObservable.clear();
      this.developW.onApplyObservable.add(() => {
        const e = this.developW.effect;
        e.setTexture('latentTex', tex);
        e.setFloat2('texel', 1 / w, 1 / h);
        e.setFloat('process', p.process);
        e.setFloat('mode', mode);
        e.setFloat('gamma', p.gamma);
        e.setFloat3('crossover', ...p.crossover);
        e.setFloat('latUnder', p.latUnder);
        e.setFloat('latOver', p.latOver);
        e.setFloat('speedShift', p.speedShift);
        e.setFloat('baseFog', p.baseFog);
        e.setFloat('fog', p.fog);
        e.setFloat('grain', p.grain);
        e.setFloat('grainScale', p.grainScale);
        e.setFloat('uneven', p.uneven);
        e.setFloat('surge', p.surge);
        e.setFloat('underfix', p.underfix);
        e.setFloat('drying', p.drying);
        e.setFloat('dust', p.dust);
        e.setFloat('lightFog', p.lightFog);
        e.setFloat('backFog', p.backFog);
        e.setFloat('kink', p.kink);
        e.setFloat2('kinkPos', ...p.kinkPos);
        e.setFloat('seed', p.seed);
        e.setFloat3('scanK', ...p.scanK);
        e.setFloat3('palette', ...p.palette);
        e.setFloat('saturation', p.saturation);
        e.setFloat('slideShift', p.slideShift);
        e.setFloat('reversed', p.reversed ? 1 : 0);
        e.setFloat('blank', p.blank ? 1 : 0);
        e.setFloat('halation', p.halation);
        e.setFloat('colorShift', p.colorShift);
        e.setFloat('aspect', w / h);
      });
      this.renderer.render(this.developW, out);
      return this.readToBlob(out, w, h, type, q);
    };
    const neg = await run(0, 'image/jpeg', 0.9);
    const pos = await run(1, 'image/jpeg', 0.92);
    const dens = await run(2, 'image/png', 1);
    out.dispose();
    tex.dispose();
    URL.revokeObjectURL(url);
    return { neg, pos, dens };
  }

  async print(engine: AbstractEngine, densBlob: Blob, w: number, h: number, p: PrintParams): Promise<{ img: Blob; densities: Float32Array }> {
    await ready(this.printW);
    const url = URL.createObjectURL(densBlob);
    const tex = await new Promise<Texture>((resolve, reject) => {
      const t: Texture = new Texture(url, engine, true, true, Texture.BILINEAR_SAMPLINGMODE, () => resolve(t), (m) => reject(new Error(String(m))));
    });
    const out = this.rtt(engine, w, h, false, 'printOut');
    this.printW.onApplyObservable.clear();
    this.printW.onApplyObservable.add(() => {
      const e = this.printW.effect;
      e.setTexture('densTex', tex);
      e.setFloat2('texel', 1 / w, 1 / h);
      e.setFloat('logExpo', Math.log10(Math.max(0.05, p.seconds) * p.apFactor) - p.paperK);
      e.setFloat('range', p.range);
      e.setFloat('dev', p.dev);
      e.setFloat('blur', p.blur);
      e.setFloat('stripCount', p.strip?.count ?? 0);
      e.setFloat('stripStart', p.strip?.start ?? 0);
      e.setFloat('stripStep', p.strip?.step ?? 0);
      e.setFloat('apFactor', p.apFactor);
      e.setFloat('paperK', p.paperK);
      e.setFloat('dodge', p.dodge);
      e.setFloat('burn', p.burn);
      e.setFloat('fixed_', p.fixed ? 1 : 0);
      e.setFloat('seed', p.seed);
      e.setFloat('colorPrint', p.color ? 1 : 0);
    });
    this.renderer.render(this.printW, out);
    const px = (await out.readPixels()) as Uint8Array;
    const densities = new Float32Array(w * h / 16);
    let k = 0;
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        const srgb = (px[i] + px[i + 1] + px[i + 2]) / 765;
        const lin = srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
        if (k < densities.length) densities[k++] = -Math.log10(Math.max(lin / 0.96, 0.004));
      }
    const img = await this.pixelsToBlob(px, w, h, 'image/jpeg', 0.92);
    out.dispose();
    tex.dispose();
    URL.revokeObjectURL(url);
    return { img, densities };
  }

  private async readToBlob(t: RenderTargetTexture, w: number, h: number, type: string, q: number): Promise<Blob> {
    const px = (await t.readPixels()) as Uint8Array;
    return this.pixelsToBlob(px, w, h, type, q);
  }

  private pixelsToBlob(px: Uint8Array, w: number, h: number, type: string, q: number): Promise<Blob> {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    // GL rows are bottom-up
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    return new Promise((resolve) => c.toBlob((b) => resolve(b!), type, q));
  }

  dispose() {
    this.accum.dispose();
    this.lens.dispose();
    this.latent.dispose();
    this.developW.dispose();
    this.printW.dispose();
    this.renderer.dispose();
  }
}

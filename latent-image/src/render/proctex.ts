/**
 * Procedural PBR texture sets generated on the CPU once and cached.
 * Each set packs: albedo (sRGB), normal (tangent space), ORM (R = AO,
 * G = roughness, B = metallic) as Babylon expects in metallicTexture.
 */
import { RawTexture, Scene, Texture, Constants } from '@babylonjs/core';
import { fbm, fbm2, rand2, vnoise, worley } from './noise';

export interface TexData {
  w: number;
  h: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  orm: Uint8Array;
}

type Gen = (u: number, v: number, x: number, y: number) => { c: [number, number, number]; h: number; r: number; m?: number; ao?: number };

const cache = new Map<string, TexData>();

function build(w: number, h: number, gen: Gen, normalStrength: number): TexData {
  const albedo = new Uint8Array(w * h * 4);
  const normal = new Uint8Array(w * h * 4);
  const orm = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = gen(x / w, y / h, x, y);
      height[i] = s.h;
      albedo[i * 4] = toSRGB8(s.c[0]);
      albedo[i * 4 + 1] = toSRGB8(s.c[1]);
      albedo[i * 4 + 2] = toSRGB8(s.c[2]);
      albedo[i * 4 + 3] = 255;
      orm[i * 4] = Math.round(255 * clamp01(s.ao ?? 1));
      orm[i * 4 + 1] = Math.round(255 * clamp01(s.r));
      orm[i * 4 + 2] = Math.round(255 * clamp01(s.m ?? 0));
      orm[i * 4 + 3] = 255;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const d = height[((y - 1 + h) % h) * w + x];
      const u = height[((y + 1) % h) * w + x];
      let nx = (l - r) * normalStrength;
      let ny = (d - u) * normalStrength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      normal[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[i * 4 + 3] = 255;
    }
  }
  return { w, h, albedo, normal, orm };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function toSRGB8(lin: number): number {
  const c = clamp01(lin);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixc = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

const GENERATORS: Record<string, () => TexData> = {
  leatherette: () =>
    build(512, 512, (u, v) => {
      const [f1, f2] = worley(u, v, 48, 3);
      const pebble = smooth(0.0, 0.55, f2 - f1);
      const n = fbm(u, v, 16, 3, 9);
      const hgt = pebble * 0.8 + n * 0.2;
      const base = 0.018 + n * 0.01;
      return { c: [base, base, base * 1.05], h: hgt, r: mix(0.82, 0.6, pebble) };
    }, 3.5),
  leatherBrown: () =>
    build(512, 512, (u, v) => {
      const [f1, f2] = worley(u, v, 40, 5);
      const pebble = smooth(0.0, 0.6, f2 - f1);
      const n = fbm(u, v, 12, 3, 4);
      return { c: [0.12 + n * 0.04, 0.06 + n * 0.02, 0.03], h: pebble * 0.8 + n * 0.2, r: mix(0.7, 0.5, pebble) };
    }, 3),
  knurl: () =>
    build(512, 64, (u, v) => {
      // diamond knurl: two crossing ridges
      const a = Math.abs(Math.sin((u * 96 + v * 12) * Math.PI));
      const b = Math.abs(Math.sin((u * 96 - v * 12) * Math.PI));
      const hgt = Math.min(a, b);
      return { c: [0.02, 0.02, 0.02], h: hgt, r: 0.45 };
    }, 2.4),
  ribbed: () =>
    build(512, 32, (u) => {
      const hgt = 0.5 + 0.5 * Math.cos(u * 128 * Math.PI * 2);
      return { c: [0.03, 0.03, 0.03], h: hgt, r: 0.4 };
    }, 2.8),
  brushed: () =>
    build(512, 512, (u, v) => {
      const n = fbm2(u, v, 4, 256, 3, 2);
      return { c: [0.8, 0.8, 0.8], h: n, r: 0.22 + n * 0.12, m: 1 };
    }, 0.6),
  floorWood: () =>
    build(1024, 1024, (u, v) => {
      const planks = 6;
      const pv = v * planks;
      const row = Math.floor(pv);
      const fy = pv - row;
      const offset = rand2(row, 0, 5);
      const pu = (u + offset) % 1;
      const seg = Math.floor(pu * 2);
      const id = rand2(row, seg, 9);
      const grain = fbm2(pu, fy / planks + row * 0.37, 3, 24, 4, row);
      const rings = 0.5 + 0.5 * Math.sin((grain * 9 + fy * 3) * Math.PI * 2);
      const tone = 0.55 + id * 0.5;
      const dark: [number, number, number] = [0.13 * tone, 0.065 * tone, 0.03 * tone];
      const light: [number, number, number] = [0.3 * tone, 0.16 * tone, 0.075 * tone];
      let c = mixc(dark, light, rings * 0.6 + grain * 0.4);
      const gapY = smooth(0.0, 0.02, fy) * smooth(0.0, 0.02, 1 - fy);
      const ex = (pu * 2) % 1;
      const gapX = smooth(0.0, 0.004, ex) * smooth(0.0, 0.004, 1 - ex);
      const gap = gapY * gapX;
      c = mixc([0.01, 0.006, 0.004], c, gap);
      const wear = fbm(u, v, 6, 3, 77);
      return { c, h: gap * 0.6 + rings * 0.08 + grain * 0.1, r: mix(0.7, 0.45, wear) - rings * 0.06, ao: mix(0.4, 1, gap) };
    }, 4),
  deskWood: () =>
    build(1024, 512, (u, v) => {
      const grain = fbm2(u, v, 2, 12, 5, 11);
      const rings = 0.5 + 0.5 * Math.sin((grain * 14 + v * 2) * Math.PI * 2);
      const fine = fbm2(u, v, 64, 2, 2, 3);
      const c = mixc([0.12, 0.05, 0.022], [0.26, 0.13, 0.06], rings * 0.7 + fine * 0.3);
      return { c, h: rings * 0.15 + fine * 0.1, r: 0.42 + fine * 0.15 };
    }, 2),
  plaster: () =>
    build(512, 512, (u, v) => {
      const n = fbm(u, v, 8, 6, 21);
      const blotch = fbm(u, v, 3, 3, 23);
      const t = 0.62 + blotch * 0.12 + n * 0.06;
      return { c: [t * 0.95, t * 0.9, t * 0.8], h: n, r: 0.88 };
    }, 1.6),
  brick: () =>
    build(512, 512, (u, v) => {
      const rows = 16;
      const cols = 8;
      const ry = v * rows;
      const row = Math.floor(ry);
      const fy = ry - row;
      const rx = u * cols + (row % 2) * 0.5;
      const col = Math.floor(rx);
      const fx = rx - col;
      const id = rand2(col % cols, row, 3);
      const mortar = smooth(0.0, 0.06, fy) * smooth(0.0, 0.06, 1 - fy) * smooth(0.0, 0.03, fx) * smooth(0.0, 0.03, 1 - fx);
      const n = fbm(u, v, 32, 3, 1);
      const brick: [number, number, number] = [0.33 + id * 0.12 + n * 0.05, 0.12 + id * 0.05, 0.07 + id * 0.03];
      const c = mixc([0.42, 0.4, 0.36], brick, mortar);
      return { c, h: mortar * 0.7 + n * 0.3, r: 0.85, ao: mix(0.55, 1, mortar) };
    }, 4),
  cobbles: () =>
    build(1024, 1024, (u, v) => {
      const [f1, f2, id] = worley(u, v, 22, 41);
      const edge = smooth(0.01, 0.1, f2 - f1);
      const n = fbm(u, v, 40, 3, 44);
      const tone = 0.1 + id * 0.08 + n * 0.04;
      const stone: [number, number, number] = [tone, tone * 0.96, tone * 0.9];
      const c = mixc([0.05, 0.042, 0.032], stone, edge);
      const dome = Math.sqrt(clamp01(edge)) * (1 - f1 * 0.6);
      return { c, h: dome * 0.8 + n * 0.2, r: mix(0.95, 0.55, edge * (0.5 + id * 0.5)), ao: mix(0.35, 1, edge) };
    }, 5),
  quayStone: () =>
    build(512, 512, (u, v) => {
      const rows = 4;
      const ry = v * rows;
      const row = Math.floor(ry);
      const fy = ry - row;
      const rx = u * 3 + (row % 2) * 0.5;
      const col = Math.floor(rx);
      const fx = rx - col;
      const id = rand2(col, row, 13);
      const seam = smooth(0, 0.03, fy) * smooth(0, 0.03, 1 - fy) * smooth(0, 0.015, fx) * smooth(0, 0.015, 1 - fx);
      const n = fbm(u, v, 16, 5, 14);
      const t = 0.3 + id * 0.1 + n * 0.12;
      return { c: mixc([0.08, 0.08, 0.07], [t, t * 0.98, t * 0.93], seam), h: seam * 0.5 + n * 0.5, r: 0.9, ao: mix(0.5, 1, seam) };
    }, 3),
  roofTiles: () =>
    build(512, 512, (u, v) => {
      const rows = 12;
      const ry = v * rows;
      const row = Math.floor(ry);
      const fy = ry - row;
      const rx = u * 10 + (row % 2) * 0.5;
      const col = Math.floor(rx);
      const fx = rx - col;
      const id = rand2(col, row, 61);
      const curve = Math.sin(fx * Math.PI);
      const n = fbm(u, v, 24, 3, 62);
      const c: [number, number, number] = [0.22 + id * 0.08 + n * 0.04, 0.08 + id * 0.03, 0.05];
      return { c: mixc([0.04, 0.02, 0.015], c, smooth(0, 0.1, fy)), h: curve * 0.4 + fy * 0.6, r: 0.75, ao: mix(0.4, 1, fy) };
    }, 3),
  grass: () =>
    build(512, 512, (u, v) => {
      const n = fbm(u, v, 32, 5, 71);
      const b = fbm(u, v, 4, 3, 72);
      const blades = vnoise(u * 256, v * 256, 256, 73);
      const c: [number, number, number] = [0.05 + b * 0.04, 0.12 + n * 0.08 + blades * 0.03, 0.025 + n * 0.02];
      return { c, h: blades * 0.5 + n * 0.5, r: 0.85 };
    }, 2),
  gravel: () =>
    build(512, 512, (u, v) => {
      const [f1, f2, id] = worley(u, v, 64, 81);
      const e = smooth(0.0, 0.3, f2 - f1);
      const t = 0.32 + id * 0.15;
      return { c: mixc([0.15, 0.13, 0.1], [t, t * 0.95, t * 0.85], e), h: e * (1 - f1), r: 0.92, ao: mix(0.5, 1, e) };
    }, 3),
  water: () =>
    build(512, 512, (u, v) => {
      const n = fbm(u, v, 6, 6, 91, 0.55);
      return { c: [0.02, 0.05, 0.06], h: n, r: 0.05 };
    }, 6),
  cloth: () =>
    build(512, 512, (u, v, x, y) => {
      const warp = 0.5 + 0.5 * Math.sin(x * Math.PI * 0.5);
      const weft = 0.5 + 0.5 * Math.sin(y * Math.PI * 0.5);
      const over = ((x >> 1) + (y >> 1)) % 2 ? warp : weft;
      const n = fbm(u, v, 16, 3, 101);
      const t = 0.6 + n * 0.15;
      return { c: [t, t * 0.97, t * 0.9], h: over * 0.6 + n * 0.4, r: 0.95 };
    }, 1.5),
  paper: () =>
    build(256, 256, (u, v) => {
      const n = fbm(u, v, 32, 4, 111);
      const t = 0.82 + n * 0.06;
      return { c: [t, t * 0.97, t * 0.9], h: n, r: 0.92 };
    }, 0.8),
  scratches: () =>
    build(512, 512, (u, v, x, y) => {
      // sparse fine scratches for worn chrome / paint
      let s = 0;
      for (let k = 0; k < 6; k++) {
        const ang = rand2(k, 0, 5) * Math.PI;
        const d = Math.abs(Math.cos(ang) * (u - rand2(k, 1, 5)) + Math.sin(ang) * (v - rand2(k, 2, 5)));
        s = Math.max(s, smooth(0.003, 0, d) * (0.4 + 0.6 * fbm(u, v, 16, 2, k)));
      }
      const n = fbm(u, v, 64, 2, 121);
      void x;
      void y;
      return { c: [1, 1, 1], h: n * 0.3 - s * 0.7, r: 0.25 + s * 0.4 + n * 0.08 };
    }, 1),
  concrete: () =>
    build(512, 512, (u, v) => {
      const n = fbm(u, v, 10, 6, 131);
      const pits = smooth(0.08, 0.0, worley(u, v, 90, 132)[0]);
      const t = 0.38 + n * 0.12;
      return { c: [t, t * 0.98, t * 0.94], h: n - pits * 0.4, r: 0.92 };
    }, 2),
  bark: () =>
    build(256, 512, (u, v) => {
      const n = fbm2(u, v, 6, 2, 5, 141);
      const ridges = 0.5 + 0.5 * Math.sin((u * 12 + n * 2) * Math.PI * 2);
      return { c: [0.07 + n * 0.04, 0.05 + n * 0.03, 0.035], h: ridges * 0.7 + n * 0.3, r: 0.95, ao: mix(0.5, 1, ridges) };
    }, 4),
  leaves: () =>
    build(256, 256, (u, v) => {
      const [f1, , id] = worley(u, v, 16, 151);
      const n = fbm(u, v, 8, 3, 152);
      const c: [number, number, number] = [0.04 + id * 0.05, 0.1 + id * 0.08 + n * 0.04, 0.025];
      return { c, h: 1 - f1, r: 0.6 };
    }, 2),
  wallpaper: () =>
    build(512, 512, (u, v) => {
      const stripe = 0.5 + 0.5 * Math.cos(u * 24 * Math.PI * 2);
      const n = fbm(u, v, 12, 4, 161);
      const c = mixc([0.42, 0.36, 0.26], [0.5, 0.44, 0.32], stripe * 0.4 + n * 0.3);
      return { c, h: n * 0.3, r: 0.85 };
    }, 0.8),
};

export function texData(name: string): TexData {
  let d = cache.get(name);
  if (!d) {
    const g = GENERATORS[name];
    if (!g) throw new Error(`no texture generator ${name}`);
    d = g();
    cache.set(name, d);
  }
  return d;
}

export interface TexSet {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
}

const sceneCache = new WeakMap<Scene, Map<string, TexSet>>();

export function texSet(scene: Scene, name: string): TexSet {
  let m = sceneCache.get(scene);
  if (!m) {
    m = new Map();
    sceneCache.set(scene, m);
  }
  let t = m.get(name);
  if (!t) {
    const d = texData(name);
    const mk = (data: Uint8Array, srgb: boolean) => {
      const tex = new RawTexture(data, d.w, d.h, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE, undefined, undefined, srgb);
      tex.wrapU = Texture.WRAP_ADDRESSMODE;
      tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.anisotropicFilteringLevel = 8;
      tex.name = `${name}-${srgb ? 'albedo' : 'lin'}`;
      return tex;
    };
    t = { albedo: mk(d.albedo, false), normal: mk(d.normal, false), orm: mk(d.orm, false) };
    t.albedo.gammaSpace = true;
    t.normal.gammaSpace = false;
    t.orm.gammaSpace = false;
    m.set(name, t);
  }
  return t;
}

/** A texture set with its own UV scale (fresh RawTextures from the cached pixel data) */
export function scaledSet(scene: Scene, name: string, uScale: number, vScale: number): TexSet {
  let m = sceneCache.get(scene);
  if (!m) {
    m = new Map();
    sceneCache.set(scene, m);
  }
  const key = `${name}@${uScale}x${vScale}`;
  let t = m.get(key);
  if (t) return t;
  const d = texData(name);
  const mk = (data: Uint8Array, kind: string) => {
    const tex = new RawTexture(data, d.w, d.h, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 8;
    tex.uScale = uScale;
    tex.vScale = vScale;
    tex.name = `${name}-${kind}`;
    tex.gammaSpace = kind === 'albedo';
    return tex;
  };
  t = { albedo: mk(d.albedo, 'albedo'), normal: mk(d.normal, 'normal'), orm: mk(d.orm, 'orm') };
  m.set(key, t);
  return t;
}

/** Pre-generate the heavy sets during the loading screen */
export async function warmTextures(names: string[], onProgress?: (p: number) => void): Promise<void> {
  for (let i = 0; i < names.length; i++) {
    texData(names[i]);
    onProgress?.((i + 1) / names.length);
    await new Promise((r) => setTimeout(r, 0));
  }
}

export const ALL_TEXTURES = Object.keys(GENERATORS);

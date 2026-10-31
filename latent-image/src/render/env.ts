/**
 * Procedural image-based lighting. We paint an equirectangular HDR panorama
 * in code, encode it as a Radiance .hdr (flat RGBE scanlines), and hand it
 * to Babylon's HDRCubeTexture with prefiltering, giving proper PBR
 * reflections and irradiance without any downloaded assets.
 */
import { HDRCubeTexture, Scene } from '@babylonjs/core';
import { fbm } from './noise';

type Rgb = [number, number, number];
type Painter = (dir: [number, number, number], u: number, v: number) => Rgb;

function encodeHDR(w: number, h: number, paint: Painter): ArrayBuffer {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`;
  const hb = new TextEncoder().encode(header);
  const out = new Uint8Array(hb.length + w * h * 4);
  out.set(hb, 0);
  let o = hb.length;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const theta = v * Math.PI; // 0 = up
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const phi = u * Math.PI * 2 - Math.PI;
      const dir: [number, number, number] = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)];
      const [r, g, b] = paint(dir, u, v);
      const m = Math.max(r, g, b);
      if (m < 1e-32) {
        out[o++] = 0;
        out[o++] = 0;
        out[o++] = 0;
        out[o++] = 0;
      } else {
        const e = Math.ceil(Math.log2(m));
        const scale = 256 / Math.pow(2, e);
        out[o++] = Math.min(255, Math.floor(r * scale));
        out[o++] = Math.min(255, Math.floor(g * scale));
        out[o++] = Math.min(255, Math.floor(b * scale));
        out[o++] = e + 128;
      }
    }
  }
  return out.buffer;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (x: number) => Math.max(0, Math.min(1, x));
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface SkyParams {
  sunDir: number[];
  zenith: Rgb;
  horizon: Rgb;
  ground: Rgb;
  sun: Rgb;
  cloudiness: number;
}

export function skyPainter(p: SkyParams, scale = 1): Painter {
  const sd = norm(p.sunDir);
  const inner = skyPainterRaw(p, sd);
  return (dir, u, v) => {
    const c = inner(dir, u, v);
    return [c[0] * scale, c[1] * scale, c[2] * scale];
  };
}

function skyPainterRaw(p: SkyParams, sd: number[]): Painter {
  return (dir, _u, _v) => {
    const up = dir[1];
    let c: Rgb;
    if (up > 0) {
      c = mix(p.horizon, p.zenith, Math.pow(sat(up), 0.45));
      // clouds on a flat layer overhead (no pole pinching)
      const k = 1 / (up + 0.12);
      const cx = dir[0] * k * 0.18;
      const cz = dir[2] * k * 0.18;
      const clouds = fbm(((cx % 1) + 1) % 1, ((cz % 1) + 1) % 1, 4, 5, 3);
      const cl = sat((clouds - (0.62 - p.cloudiness * 0.4)) * 3) * sat(up * 4);
      const cloudCol: Rgb = mix(p.horizon, [p.horizon[0] * 1.2, p.horizon[1] * 1.2, p.horizon[2] * 1.2], 0.5);
      c = mix(c, cloudCol, cl * 0.8);
    } else {
      c = mix(p.horizon, p.ground, sat(-up * 6));
    }
    const cosA = dot(dir, sd);
    const halo = Math.pow(sat(cosA), 32) * 0.6 + Math.pow(sat(cosA), 6) * 0.15;
    c = [c[0] + p.sun[0] * halo * 0.05, c[1] + p.sun[1] * halo * 0.05, c[2] + p.sun[2] * halo * 0.05];
    if (cosA > 0.9995) c = [p.sun[0], p.sun[1], p.sun[2]];
    return c;
  };
}

/** Warm interior with a big north window and a ceiling lamp */
export function studioPainter(windowDir: number[], lampDir: number[], dim = 1): Painter {
  const wd = norm(windowDir);
  const ld = norm(lampDir);
  return (dir) => {
    const up = dir[1];
    let c: Rgb = up > 0.6 ? [0.32, 0.29, 0.25] : up < -0.4 ? [0.07, 0.045, 0.03] : [0.22, 0.17, 0.12];
    c = [c[0] * dim, c[1] * dim, c[2] * dim];
    // window: a soft rectangle
    const cw = dot(dir, wd);
    if (cw > 0.82) {
      const side = Math.abs(dir[1] - wd[1]);
      const t = sat((cw - 0.82) * 20) * sat((0.35 - side) * 8);
      c = mix(c, [6 * dim, 6.6 * dim, 7.4 * dim], t);
    }
    const cl = dot(dir, ld);
    if (cl > 0.985) c = mix(c, [9, 6.8, 4], sat((cl - 0.985) * 120));
    return c;
  };
}

export function darkroomPainter(): Painter {
  return (dir) => {
    const up = dir[1];
    let c: Rgb = up > 0 ? [0.03, 0.006, 0.004] : [0.012, 0.004, 0.003];
    const sd = norm([0.4, 0.7, -0.6]);
    const cs = dot(dir, sd);
    if (cs > 0.97) c = mix(c, [2.6, 0.18, 0.04], sat((cs - 0.97) * 60));
    return c;
  };
}

/** Build a prefiltered environment cube from a painter. */
export function makeEnvironment(scene: Scene, paint: Painter, w = 512, h = 256): Promise<HDRCubeTexture> {
  const buf = encodeHDR(w, h, paint);
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(tex);
    };
    const tex = new HDRCubeTexture(url, scene, 128, false, true, false, true, finish, (m) => {
      console.warn('env failed', m);
      finish();
    });
    tex.name = 'procEnv';
  });
}

export function skyFor(lighting: string, sunDir: number[]): SkyParams {
  switch (lighting) {
    case 'overcast':
      return { sunDir, zenith: [0.9, 0.95, 1.05], horizon: [1.3, 1.32, 1.36], ground: [0.18, 0.18, 0.17], sun: [2, 2, 2], cloudiness: 1 };
    case 'golden':
      return { sunDir, zenith: [0.35, 0.5, 0.9], horizon: [2.2, 1.4, 0.7], ground: [0.2, 0.14, 0.09], sun: [60, 35, 14], cloudiness: 0.35 };
    case 'dusk':
      return { sunDir, zenith: [0.04, 0.06, 0.16], horizon: [0.45, 0.22, 0.16], ground: [0.02, 0.018, 0.02], sun: [3, 1.2, 0.5], cloudiness: 0.3 };
    case 'hazy':
      return { sunDir, zenith: [0.6, 0.8, 1.2], horizon: [1.6, 1.6, 1.6], ground: [0.2, 0.18, 0.15], sun: [80, 75, 65], cloudiness: 0.45 };
    default:
      return { sunDir, zenith: [0.25, 0.48, 1.1], horizon: [1.1, 1.25, 1.45], ground: [0.22, 0.19, 0.15], sun: [120, 110, 95], cloudiness: 0.25 };
  }
}

/** Sky radiance scale that balances the painted sky against the sun light */
export function skyScale(lighting: string): number {
  return ({ sun: 1.9, hazy: 1.7, golden: 1.4, overcast: 1.5, shade: 1.9, dusk: 0.8 } as Record<string, number>)[lighting] ?? 1.6;
}

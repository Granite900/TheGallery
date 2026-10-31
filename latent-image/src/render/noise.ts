/** Tileable value / cellular noise used by the procedural texture generators. */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, p: number) => ((a % p) + p) % p;

/** Value noise in [0,1], tiling with integer period p (in cells). */
export function vnoise(x: number, y: number, p: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const x0 = mod(xi, p);
  const y0 = mod(yi, p);
  const x1 = mod(xi + 1, p);
  const y1 = mod(yi + 1, p);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** fBm over tileable value noise. u,v in [0,1). */
export function fbm(u: number, v: number, baseCells: number, octaves = 5, seed = 0, gain = 0.5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * cells, v * cells, cells, seed + o * 17);
    norm += amp;
    amp *= gain;
    cells *= 2;
  }
  return sum / norm;
}

/** Tileable anisotropic fBm: cellsX ≠ cellsY */
export function fbm2(u: number, v: number, cx: number, cy: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const m = 1 << o;
    const px = cx * m;
    const py = cy * m;
    const xi = u * px;
    const yi = v * py;
    // reuse vnoise with separate periods by scaling coordinates
    sum += amp * vnoiseXY(xi, yi, px, py, seed + o * 31);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function vnoiseXY(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const x0 = mod(xi, px);
  const y0 = mod(yi, py);
  const x1 = mod(xi + 1, px);
  const y1 = mod(yi + 1, py);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/**
 * Tileable Worley (cellular) noise. Returns [F1, F2, cellId] with distances
 * in cell units.
 */
export function worley(u: number, v: number, cells: number, seed = 0): [number, number, number] {
  const x = u * cells;
  const y = v * cells;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = mod(cx, cells);
      const wy = mod(cy, cells);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 101);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, seed + 7);
      } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2, id];
}

export function rand2(x: number, y: number, seed = 0): number {
  return hash2(x | 0, y | 0, seed);
}

/** Geometry helpers: rounded boxes, lathes, engraved text decals. */
import { DynamicTexture, Mesh, MeshBuilder, Scene, Texture, Vector3, VertexData, Vector4, Color3 } from '@babylonjs/core';

/**
 * Box with rounded edges and corners (radius r). Built from six subdivided
 * faces whose vertices are projected onto a rounded shell so normals are
 * smooth. UVs are planar per face in world units × uvScale.
 */
export function roundedBox(name: string, scene: Scene, w: number, h: number, d: number, r: number, seg = 5, uvScale = 1): Mesh {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  r = Math.min(r, hx * 0.999, hy * 0.999, hz * 0.999);
  const ix = hx - r;
  const iy = hy - r;
  const iz = hz - r;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // parameter samples along an axis of half-extent hh with inner ii
  const samples = (hh: number, ii: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * (Math.PI / 2);
      out.push(-ii - r * Math.cos(a));
    }
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * (Math.PI / 2);
      out.push(ii + r * Math.sin(a));
    }
    void hh;
    return out;
  };
  const sx = samples(hx, ix);
  const sy = samples(hy, iy);
  const sz = samples(hz, iz);
  const face = (axis: 0 | 1 | 2, sign: 1 | -1) => {
    const ua = axis === 0 ? 2 : 0;
    const va = axis === 1 ? 2 : 1;
    const us = [sx, sy, sz][ua];
    const vs = [sx, sy, sz][va];
    const half = [hx, hy, hz];
    const inner = [ix, iy, iz];
    const base = positions.length / 3;
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[ua] = us[i];
        p[va] = vs[j];
        // project onto rounded shell
        const c = [Math.max(-inner[0], Math.min(inner[0], p[0])), Math.max(-inner[1], Math.min(inner[1], p[1])), Math.max(-inner[2], Math.min(inner[2], p[2]))];
        let n = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const len = Math.hypot(n[0], n[1], n[2]);
        if (len < 1e-6) {
          n = [0, 0, 0];
          n[axis] = sign;
        } else n = [n[0] / len, n[1] / len, n[2] / len];
        positions.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r);
        normals.push(n[0], n[1], n[2]);
        const uu = (us[i] + half[ua]) * uvScale;
        const vv = (vs[j] + half[va]) * uvScale;
        uvs.push(sign > 0 ? uu : -uu, vv);
      }
    }
    const cols = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = base + j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const dd = c + 1;
        // winding so normal points outward (Babylon left-handed, CW front faces)
        const flip = (axis === 1 ? -sign : sign) > 0;
        if (flip) indices.push(a, c, b, b, c, dd);
        else indices.push(a, b, c, b, dd, c);
      }
    }
  };
  face(0, 1);
  face(0, -1);
  face(1, 1);
  face(1, -1);
  face(2, 1);
  face(2, -1);
  // orient every triangle so Babylon's face normal ((p1-p2)×(p3-p2)) agrees with the shell normal
  for (let i = 0; i < indices.length; i += 3) {
    const [i1, i2, i3] = [indices[i], indices[i + 1], indices[i + 2]];
    const ax = positions[i1 * 3] - positions[i2 * 3];
    const ay = positions[i1 * 3 + 1] - positions[i2 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i2 * 3 + 2];
    const bx = positions[i3 * 3] - positions[i2 * 3];
    const by = positions[i3 * 3 + 1] - positions[i2 * 3 + 1];
    const bz = positions[i3 * 3 + 2] - positions[i2 * 3 + 2];
    const fx = ay * bz - az * by;
    const fy = az * bx - ax * bz;
    const fz = ax * by - ay * bx;
    const nx = normals[i1 * 3] + normals[i2 * 3] + normals[i3 * 3];
    const ny = normals[i1 * 3 + 1] + normals[i2 * 3 + 1] + normals[i3 * 3 + 1];
    const nz = normals[i1 * 3 + 2] + normals[i2 * 3 + 2] + normals[i3 * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      indices[i + 1] = i3;
      indices[i + 2] = i2;
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

/** Lathe around the Y axis from [radius, y] profile pairs */
export function lathe(name: string, scene: Scene, profile: [number, number][], tess = 64, cap = Mesh.NO_CAP, arc = 1): Mesh {
  const shape = profile.map(([rr, y]) => new Vector3(rr, y, 0));
  return MeshBuilder.CreateLathe(name, { shape, tessellation: tess, cap, arc, sideOrientation: Mesh.DOUBLESIDE, closed: arc >= 1 }, scene);
}

export function cyl(name: string, scene: Scene, diameter: number, height: number, tess = 48, faceUV?: Vector4[]): Mesh {
  return MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: tess, faceUV }, scene);
}

/** Tube (ring) with inner and outer radius */
export function ring(name: string, scene: Scene, outer: number, inner: number, height: number, tess = 64): Mesh {
  const h = height / 2;
  return lathe(name, scene, [[inner, -h], [outer, -h], [outer, h], [inner, h], [inner, -h]], tess);
}

export interface TextOpts {
  font?: string;
  color?: string;
  bg?: string;
  align?: CanvasTextAlign;
  w?: number;
  h?: number;
}

/** Canvas texture with text, e.g. engraved names. */
export function textTexture(scene: Scene, lines: string[], o: TextOpts = {}): DynamicTexture {
  const w = o.w ?? 1024;
  const h = o.h ?? 256;
  const t = new DynamicTexture(`txt-${lines.join('|').slice(0, 20)}`, { width: w, height: h }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, w, h);
  } else ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = o.color ?? '#e8e4da';
  ctx.font = o.font ?? `600 ${Math.round(h * 0.6)}px Jost`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  const lh = h / lines.length;
  lines.forEach((l, i) => ctx.fillText(l, o.align === 'left' ? 8 : w / 2, lh * (i + 0.5)));
  t.hasAlpha = !o.bg;
  t.update(true);
  t.wrapU = Texture.CLAMP_ADDRESSMODE;
  t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}

/** Strip texture for a ring scale: labels spaced evenly around [startU..endU] */
export function scaleTexture(scene: Scene, labels: string[], o: { start?: number; end?: number; color?: string; bg?: string; ticks?: boolean; font?: string; highlight?: number; highlightColor?: string; w?: number; h?: number; mirror?: boolean } = {}): DynamicTexture {
  const w = o.w ?? 2048;
  const h = o.h ?? 128;
  const t = new DynamicTexture('scale', { width: w, height: h }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = o.bg ?? '#060606';
  ctx.fillRect(0, 0, w, h);
  const start = o.start ?? 0.05;
  const end = o.end ?? 0.45;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = o.font ?? `500 ${Math.round(h * 0.42)}px Jost`;
  labels.forEach((l, i) => {
    const u = labels.length === 1 ? start : start + ((end - start) * i) / (labels.length - 1);
    const x = u * w;
    ctx.fillStyle = i === o.highlight ? o.highlightColor ?? '#e2a13a' : o.color ?? '#e7e3d8';
    ctx.save();
    ctx.translate(x, h * 0.42);
    if (o.mirror) ctx.scale(-1, 1);
    ctx.fillText(l, 0, 0);
    ctx.restore();
    if (o.ticks !== false) ctx.fillRect(x - 1.5, h * 0.78, 3, h * 0.18);
  });
  t.update(true);
  return t;
}

export function color(hex: string): Color3 {
  return Color3.FromHexString(hex).toLinearSpace();
}

/** Merge child meshes sharing a material for fewer draw calls */
export function tag(mesh: Mesh, meta: Record<string, unknown>): Mesh {
  mesh.metadata = { ...(mesh.metadata ?? {}), ...meta };
  return mesh;
}

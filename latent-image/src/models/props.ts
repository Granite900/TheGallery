/** Furniture and props shared by the interior scenes. */
import { Color3, Mesh, MeshBuilder, Scene, TransformNode, Vector3, PBRMaterial, DynamicTexture } from '@babylonjs/core';
import { Mats } from '../render/materials';
import { cyl, lathe, ring, roundedBox, textTexture } from './geom';

export interface Built {
  root: TransformNode;
  meshes: Mesh[];
}

function grp(scene: Scene, name: string, parent?: TransformNode): TransformNode {
  const t = new TransformNode(name, scene);
  if (parent) t.parent = parent;
  return t;
}

function put(m: Mesh, parent: TransformNode, mat: PBRMaterial, x = 0, y = 0, z = 0): Mesh {
  m.parent = parent;
  m.material = mat;
  m.position.set(x, y, z);
  m.receiveShadows = true;
  return m;
}

/** Room box with floor, walls and ceiling. Openings are left to the caller. */
export function room(scene: Scene, mats: Mats, w: number, d: number, hgt: number, o: { floor?: string; wall?: string; wallTint?: Color3; ceiling?: Color3 } = {}): Built {
  const root = grp(scene, 'room');
  const meshes: Mesh[] = [];
  const floor = MeshBuilder.CreateGround('floor', { width: w, height: d, subdivisions: 2 }, scene);
  put(floor, root, mats.textured(o.floor ?? 'floorWood', w / 2.4, d / 2.4, undefined, 1.2));
  meshes.push(floor);
  const wallMat = mats.textured(o.wall ?? 'plaster', 3, 1.2, o.wallTint, 0.6);
  const mk = (name: string, ww: number, x: number, z: number, ry: number) => {
    const p = MeshBuilder.CreatePlane(name, { width: ww, height: hgt }, scene);
    put(p, root, wallMat, x, hgt / 2, z);
    p.rotation.y = ry;
    meshes.push(p);
    return p;
  };
  mk('wallN', w, 0, d / 2, 0);
  mk('wallS', w, 0, -d / 2, Math.PI);
  mk('wallE', d, w / 2, 0, Math.PI / 2);
  mk('wallW', d, -w / 2, 0, -Math.PI / 2);
  const ceil = MeshBuilder.CreatePlane('ceiling', { width: w, height: d }, scene);
  put(ceil, root, mats.painted(o.ceiling ?? new Color3(0.55, 0.52, 0.47), 0.9), 0, hgt, 0);
  ceil.rotation.x = -Math.PI / 2;
  meshes.push(ceil);
  // skirting
  const sk = mats.painted(new Color3(0.32, 0.28, 0.22), 0.5, 'skirting');
  for (const [x, z, len, ry] of [[0, d / 2 - 0.01, w, 0], [0, -d / 2 + 0.01, w, 0], [w / 2 - 0.01, 0, d, Math.PI / 2], [-w / 2 + 0.01, 0, d, Math.PI / 2]] as const) {
    const b = MeshBuilder.CreateBox('skirt', { width: len, height: 0.12, depth: 0.02 }, scene);
    put(b, root, sk, x, 0.06, z);
    b.rotation.y = ry;
    meshes.push(b);
  }
  return { root, meshes };
}

export function table(scene: Scene, mats: Mats, w: number, d: number, hgt: number, top = 'deskWood', legs = true): Built {
  const root = grp(scene, 'table');
  const meshes: Mesh[] = [];
  const t = roundedBox('tableTop', scene, w, 0.035, d, 0.006, 3, 1 / Math.max(w, d));
  put(t, root, mats.textured(top, 1, 1, undefined, 0.8), 0, hgt - 0.0175, 0);
  meshes.push(t);
  if (legs) {
    const legMat = mats.textured(top, 0.3, 2, new Color3(0.8, 0.8, 0.8), 0.6);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const l = roundedBox('leg', scene, 0.05, hgt - 0.035, 0.05, 0.006, 2);
        put(l, root, legMat, sx * (w / 2 - 0.06), (hgt - 0.035) / 2, sz * (d / 2 - 0.06));
        meshes.push(l);
      }
    const apron = roundedBox('apron', scene, w - 0.1, 0.09, d - 0.1, 0.004, 2);
    put(apron, root, legMat, 0, hgt - 0.08, 0);
    meshes.push(apron);
  }
  return { root, meshes };
}

/** Anglepoise-style desk lamp; returns the head node for placing a light */
export function deskLamp(scene: Scene, mats: Mats): Built & { head: TransformNode } {
  const root = grp(scene, 'lamp');
  const meshes: Mesh[] = [];
  const paint = mats.painted(new Color3(0.13, 0.2, 0.17), 0.35, 'lamp');
  const base = cyl('lampBase', scene, 0.16, 0.03, 48);
  put(base, root, paint, 0, 0.015, 0);
  const arm1 = cyl('arm1', scene, 0.014, 0.36, 12);
  put(arm1, root, mats.chrome(0.2), 0.0, 0.2, 0.04);
  arm1.rotation.x = -0.35;
  const arm2 = cyl('arm2', scene, 0.014, 0.34, 12);
  put(arm2, root, mats.chrome(0.2), 0, 0.42, 0.18);
  arm2.rotation.x = 1.1;
  const head = grp(scene, 'lampHead', root);
  head.position.set(0, 0.45, 0.33);
  head.rotation.x = 0.9;
  const shade = lathe('shade', scene, [[0.012, 0.06], [0.03, 0.05], [0.06, 0.0], [0.085, -0.06], [0.083, -0.062]], 48);
  put(shade, head, paint);
  const bulb = MeshBuilder.CreateSphere('bulb', { diameter: 0.05, segments: 16 }, scene);
  put(bulb, head, mats.emissive(new Color3(1, 0.82, 0.55), 6), 0, -0.02, 0);
  meshes.push(base, arm1, arm2, shade, bulb);
  return { root, meshes, head };
}

/** Glass-fronted display cabinet with N shelves; returns shelf anchor points */
export function cabinet(scene: Scene, mats: Mats, w: number, hgt: number, d: number, shelves: number): Built & { anchors: Vector3[] } {
  const root = grp(scene, 'cabinet');
  const meshes: Mesh[] = [];
  const wood = mats.textured('deskWood', 1, 2, new Color3(0.75, 0.7, 0.65), 0.7);
  const side = (x: number) => {
    const s = MeshBuilder.CreateBox('cabSide', { width: 0.03, height: hgt, depth: d }, scene);
    put(s, root, wood, x, hgt / 2, 0);
    meshes.push(s);
  };
  side(-w / 2);
  side(w / 2);
  const back = MeshBuilder.CreateBox('cabBack', { width: w, height: hgt, depth: 0.015 }, scene);
  put(back, root, mats.textured('wallpaper', 1, 2, new Color3(0.55, 0.45, 0.35)), 0, hgt / 2, d / 2);
  meshes.push(back);
  const anchors: Vector3[] = [];
  for (let i = 0; i <= shelves; i++) {
    const y = 0.12 + (i * (hgt - 0.2)) / shelves;
    const sh = MeshBuilder.CreateBox('shelf', { width: w - 0.03, height: 0.02, depth: d - 0.02 }, scene);
    put(sh, root, wood, 0, y, 0);
    meshes.push(sh);
    if (i < shelves) anchors.push(new Vector3(0, y + 0.012, -0.02));
  }
  const top = MeshBuilder.CreateBox('cabTop', { width: w + 0.06, height: 0.04, depth: d + 0.04 }, scene);
  put(top, root, wood, 0, hgt + 0.02, 0);
  meshes.push(top);
  // glass doors
  for (const sx of [-1, 1]) {
    const door = MeshBuilder.CreatePlane('cabGlass', { width: w / 2 - 0.02, height: hgt - 0.08 }, scene);
    put(door, root, mats.glass(new Color3(0.85, 0.9, 0.9), 0.08, 0.02), (sx * w) / 4, hgt / 2, -d / 2 - 0.005);
    door.isPickable = false;
    const frame = MeshBuilder.CreateBox('cabFrame', { width: 0.025, height: hgt - 0.06, depth: 0.025 }, scene);
    put(frame, root, wood, sx * 0.012, hgt / 2, -d / 2 - 0.005);
    meshes.push(frame);
  }
  return { root, meshes, anchors };
}

export function windowFrame(scene: Scene, mats: Mats, w: number, hgt: number): Built {
  const root = grp(scene, 'window');
  const meshes: Mesh[] = [];
  const paint = mats.painted(new Color3(0.78, 0.76, 0.7), 0.45, 'windowpaint');
  const bar = (bw: number, bh: number, x: number, y: number) => {
    const b = roundedBox('wbar', scene, bw, bh, 0.06, 0.006, 2);
    put(b, root, paint, x, y, 0);
    meshes.push(b);
  };
  bar(w + 0.1, 0.07, 0, -hgt / 2);
  bar(w + 0.1, 0.07, 0, hgt / 2);
  bar(0.07, hgt, -w / 2, 0);
  bar(0.07, hgt, w / 2, 0);
  bar(0.04, hgt, 0, 0);
  bar(w, 0.035, 0, hgt * 0.12);
  for (const fx of [-0.25, 0.25])
    for (const fy of [-0.25, 0.25 + 0.06]) {
      const g = MeshBuilder.CreatePlane('pane', { width: w / 2 - 0.04, height: hgt / 2 - 0.05 }, scene);
      put(g, root, mats.glass(new Color3(0.9, 0.95, 1), 0.07, 0.01), fx * w, fy * hgt * 0.95, 0);
      g.isPickable = false;
    }
  const sill = roundedBox('sill', scene, w + 0.25, 0.04, 0.24, 0.008, 2);
  put(sill, root, paint, 0, -hgt / 2 - 0.04, -0.1);
  meshes.push(sill);
  return { root, meshes };
}

export function door(scene: Scene, mats: Mats, color: Color3, label?: string): Built & { panel: Mesh } {
  const root = grp(scene, 'door');
  const meshes: Mesh[] = [];
  const paint = mats.painted(color, 0.4, `door-${color.toHexString()}`);
  const panel = roundedBox('doorPanel', scene, 0.86, 2.02, 0.045, 0.006, 2);
  put(panel, root, paint, 0, 1.01, 0);
  meshes.push(panel);
  for (const y of [0.55, 1.45]) {
    const inset = roundedBox('doorInset', scene, 0.62, 0.62, 0.02, 0.01, 2);
    put(inset, root, paint, 0, y, -0.03);
    meshes.push(inset);
  }
  const knob = MeshBuilder.CreateSphere('doorKnob', { diameter: 0.06, segments: 16 }, scene);
  put(knob, root, mats.brass(), 0.34, 1.0, -0.06);
  meshes.push(knob);
  const frame = MeshBuilder.CreateBox('doorFrame', { width: 1.0, height: 2.12, depth: 0.03 }, scene);
  put(frame, root, mats.painted(new Color3(0.75, 0.72, 0.66), 0.45, 'frame'), 0, 1.06, 0.03);
  meshes.push(frame);
  if (label) {
    const tex = textTexture(scene, [label], { w: 512, h: 128, bg: '#1b1b1b', color: '#e7e1d1', font: '600 64px Jost' });
    const sign = MeshBuilder.CreatePlane('doorSign', { width: 0.36, height: 0.09 }, scene);
    put(sign, root, mats.decal(tex, 0.5), 0, 1.75, -0.026);
    meshes.push(sign);
  }
  return { root, meshes, panel };
}

export function plant(scene: Scene, mats: Mats): Built {
  const root = grp(scene, 'plant');
  const pot = lathe('pot', scene, [[0, 0], [0.09, 0], [0.12, 0.2], [0.125, 0.21], [0, 0.21]], 32);
  put(pot, root, mats.painted(new Color3(0.42, 0.18, 0.1), 0.85, 'terracotta'));
  const leaves: Mesh[] = [pot];
  const leafMat = mats.textured('leaves', 1, 1, new Color3(0.9, 1.1, 0.9), 0.8);
  for (let i = 0; i < 14; i++) {
    const l = MeshBuilder.CreateSphere('leaf', { diameterX: 0.08, diameterY: 0.012, diameterZ: 0.26, segments: 8 }, scene);
    const a = (i / 14) * Math.PI * 2;
    put(l, root, leafMat, Math.cos(a) * 0.1, 0.3 + (i % 3) * 0.08, Math.sin(a) * 0.1);
    l.rotation.y = -a + Math.PI / 2;
    l.rotation.x = -0.6 - (i % 3) * 0.2;
    leaves.push(l);
  }
  return { root, meshes: leaves };
}

export function chair(scene: Scene, mats: Mats): Built {
  const root = grp(scene, 'chair');
  const wood = mats.textured('deskWood', 0.5, 0.5, new Color3(0.7, 0.6, 0.55), 0.6);
  const meshes: Mesh[] = [];
  const seat = roundedBox('seat', scene, 0.44, 0.04, 0.42, 0.01, 2);
  put(seat, root, wood, 0, 0.45, 0);
  meshes.push(seat);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const l = cyl('chairLeg', scene, 0.035, sz > 0 ? 0.92 : 0.45, 12);
      put(l, root, wood, sx * 0.19, (sz > 0 ? 0.92 : 0.45) / 2, sz * 0.18);
      meshes.push(l);
    }
  for (const y of [0.65, 0.78, 0.88]) {
    const r = roundedBox('rail', scene, 0.4, 0.04, 0.02, 0.008, 2);
    put(r, root, wood, 0, y, 0.18);
    meshes.push(r);
  }
  return { root, meshes };
}

/** Rug with a woven texture */
export function rug(scene: Scene, mats: Mats, w: number, d: number, tint: Color3): Mesh {
  const r = MeshBuilder.CreateGround('rug', { width: w, height: d }, scene);
  r.material = mats.textured('cloth', w * 3, d * 3, tint, 0.8);
  r.position.y = 0.004;
  r.receiveShadows = true;
  return r;
}

/** Corkboard with pinned paper notes (DynamicTexture drawn by caller) */
export function corkboard(scene: Scene, mats: Mats, w: number, hgt: number): Built & { tex: DynamicTexture } {
  const root = grp(scene, 'cork');
  const frame = roundedBox('corkFrame', scene, w + 0.06, hgt + 0.06, 0.03, 0.006, 2);
  put(frame, root, mats.textured('deskWood', 1, 1), 0, 0, 0);
  const tex = new DynamicTexture('corkTex', { width: 1024, height: Math.round((1024 * hgt) / w) }, scene, true);
  const board = MeshBuilder.CreatePlane('corkBoard', { width: w, height: hgt }, scene);
  const m = mats.decal(tex, 0.9);
  put(board, root, m, 0, 0, -0.017);
  return { root, meshes: [frame, board], tex };
}

export function lightTable(scene: Scene, mats: Mats): Built & { surface: Mesh } {
  const root = grp(scene, 'lighttable');
  const box = roundedBox('ltBox', scene, 0.5, 0.06, 0.36, 0.008, 2);
  put(box, root, mats.painted(new Color3(0.72, 0.7, 0.64), 0.5, 'ltbox'), 0, 0.03, 0);
  const surface = MeshBuilder.CreatePlane('ltSurface', { width: 0.44, height: 0.3 }, scene);
  put(surface, root, mats.emissive(new Color3(0.95, 0.96, 1.0), 2.2), 0, 0.061, 0);
  surface.rotation.x = Math.PI / 2;
  return { root, meshes: [box, surface], surface };
}

export function filmFridge(scene: Scene, mats: Mats): Built {
  const root = grp(scene, 'fridge');
  const body = roundedBox('fridgeBody', scene, 0.52, 0.85, 0.55, 0.05, 4);
  put(body, root, mats.painted(new Color3(0.72, 0.68, 0.58), 0.3, 'fridge'), 0, 0.425, 0);
  const handle = roundedBox('fridgeHandle', scene, 0.03, 0.22, 0.04, 0.012, 2);
  put(handle, root, mats.chrome(0.15), 0.2, 0.62, -0.29);
  const badge = textTexture(scene, ['FILM — KEEP COLD'], { w: 512, h: 96, bg: '#efe6cf', color: '#1b1813', font: '600 44px Jost' });
  const lbl = MeshBuilder.CreatePlane('fridgeLabel', { width: 0.26, height: 0.05 }, scene);
  put(lbl, root, mats.decal(badge, 0.8), 0, 0.72, -0.278);
  return { root, meshes: [body, handle, lbl] };
}

export function projector(scene: Scene, mats: Mats): Built & { lensFront: TransformNode } {
  const root = grp(scene, 'projector');
  const body = roundedBox('projBody', scene, 0.16, 0.2, 0.32, 0.02, 4);
  put(body, root, mats.painted(new Color3(0.42, 0.44, 0.42), 0.4, 'projector'), 0, 0.12, 0);
  const meshes = [body];
  for (const z of [-0.09, 0.09]) {
    const arm = roundedBox('reelArm', scene, 0.02, 0.18, 0.02, 0.006, 2);
    put(arm, root, mats.satinBlack(), 0.0, 0.3, z);
    const reel = cyl('reel', scene, 0.2, 0.012, 48);
    put(reel, root, mats.aluminium(), 0.0, 0.4, z);
    reel.rotation.z = Math.PI / 2;
    meshes.push(arm, reel);
  }
  const lensFront = grp(scene, 'projLens', root);
  lensFront.position.set(0, 0.13, -0.2);
  const lens = ring('projLensBarrel', scene, 0.028, 0.02, 0.07, 48);
  put(lens, lensFront, mats.satinBlack());
  lens.rotation.x = Math.PI / 2;
  const glass = MeshBuilder.CreateDisc('projGlass', { radius: 0.02, tessellation: 32 }, scene);
  put(glass, lensFront, mats.coatedGlass(0), 0, 0, -0.035);
  glass.rotation.y = Math.PI;
  meshes.push(lens, glass);
  return { root, meshes, lensFront };
}

/** A stack of books / boxes for set dressing */
export function books(scene: Scene, mats: Mats, n: number, seed = 1): Built {
  const root = grp(scene, 'books');
  const meshes: Mesh[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let x = 0;
  const cols = [new Color3(0.35, 0.08, 0.06), new Color3(0.1, 0.16, 0.25), new Color3(0.12, 0.2, 0.12), new Color3(0.45, 0.38, 0.22), new Color3(0.1, 0.1, 0.1)];
  for (let i = 0; i < n; i++) {
    const tw = 0.025 + rnd() * 0.035;
    const th = 0.18 + rnd() * 0.08;
    const b = roundedBox('book', scene, tw, th, 0.15 + rnd() * 0.04, 0.003, 2);
    put(b, root, mats.painted(cols[Math.floor(rnd() * cols.length)], 0.7, `book${i % 5}`), x + tw / 2, th / 2, 0);
    if (rnd() < 0.15) b.rotation.z = 0.12;
    x += tw + 0.002;
    meshes.push(b);
  }
  return { root, meshes };
}

export function freeze(b: { meshes: Mesh[] }) {
  for (const m of b.meshes) {
    m.freezeWorldMatrix();
  }
}

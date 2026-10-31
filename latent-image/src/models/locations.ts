/**
 * Procedural shooting locations. Each builder returns subjects (tagged
 * meshes for assignment grading), the player spawn, simple colliders and
 * animated bits.
 */
import { Color3, Mesh, MeshBuilder, Scene, TransformNode, Vector3, DynamicTexture, PBRMaterial, ParticleSystem, Texture, Color4, VertexData, Material } from '@babylonjs/core';
import { Mats } from '../render/materials';
import { cyl, lathe, roundedBox, textTexture } from './geom';
import { door as doorProp, windowFrame, chair as chairProp, plant as plantProp, rug as rugProp, room as roomProp, table as tableProp } from './props';
import { makeRng, range as rrange } from '../sim/rng';

export interface Collider {
  min: [number, number];
  max: [number, number];
}

export interface LocationBuild {
  root: TransformNode;
  spawn: Vector3;
  spawnYaw: number;
  colliders: Collider[];
  bounds: Collider;
  /** per-frame animation */
  tick: (t: number, dt: number) => void;
  /** lights to switch on at dusk */
  practicals: Mesh[];
  /** good camera poses for staged story frames */
  storyPoses: { pos: Vector3; target: Vector3; subject: string }[];
  grayCardPos: Vector3;
}

export interface LocOpts {
  lighting: string;
  past?: boolean;
  sunDir: Vector3;
}

function tagSubject(meshes: Mesh[], subject: string) {
  for (const m of meshes) m.metadata = { ...(m.metadata ?? {}), subject };
}

function box(scene: Scene, name: string, w: number, h: number, d: number, mat: Material, x: number, y: number, z: number, parent?: TransformNode): Mesh {
  const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.material = mat;
  b.position.set(x, y, z);
  if (parent) b.parent = parent;
  b.receiveShadows = true;
  return b;
}

/** Gabled house with windows; front faces −Z */
function house(scene: Scene, mats: Mats, w: number, h: number, d: number, color: Color3, seed: number, parent: TransformNode, dusk: boolean): Mesh[] {
  const r = makeRng(seed);
  const out: Mesh[] = [];
  const wall = mats.textured('plaster', w / 3, h / 3, color, 0.8);
  const body = box(scene, 'house', w, h, d, wall, 0, h / 2, 0, parent);
  out.push(body);
  // roof prism
  const roofH = 1.6 + r() * 1.2;
  const shape = [new Vector3(-w / 2 - 0.25, 0, 0), new Vector3(w / 2 + 0.25, 0, 0), new Vector3(0, roofH, 0)];
  const roof = MeshBuilder.ExtrudePolygon('roof', { shape: shape.map((p) => new Vector3(p.x, p.z, p.y)), depth: d + 0.5, sideOrientation: Mesh.DOUBLESIDE }, scene);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, h, -d / 2 - 0.25);
  roof.parent = parent;
  roof.material = mats.textured('roofTiles', w / 2, d / 2, undefined, 1);
  roof.receiveShadows = true;
  out.push(roof);
  const chim = box(scene, 'chimney', 0.6, 1.6, 0.6, mats.textured('brick', 0.5, 0.8), w * (r() - 0.5) * 0.6, h + roofH * 0.6, d * 0.2, parent);
  out.push(chim);
  // windows
  const floors = Math.max(1, Math.floor(h / 3));
  const cols = Math.max(1, Math.floor(w / 2.2));
  const frame = mats.painted(new Color3(0.85, 0.84, 0.8), 0.5, 'winframe');
  const glass = mats.base('winglass', new Color3(0.02, 0.025, 0.03), 0, 0.08);
  const lit = mats.emissive(new Color3(1, 0.72, 0.4), 1.6);
  for (let f = 0; f < floors; f++)
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5);
      const y = 1.4 + f * 3;
      if (f === 0 && c === Math.floor(cols / 2)) {
        const dr = box(scene, 'hdoor', 1.0, 2.1, 0.1, mats.painted(new Color3(0.15 + r() * 0.3, 0.12, 0.1 + r() * 0.2), 0.4, `hd${seed % 4}`), x, 1.05, -d / 2 - 0.02, parent);
        out.push(dr);
        continue;
      }
      const fr = box(scene, 'wframe', 1.0, 1.4, 0.12, frame, x, y, -d / 2 - 0.03, parent);
      const gl = box(scene, 'wglass', 0.86, 1.26, 0.04, dusk && r() < 0.45 ? lit : glass, x, y, -d / 2 - 0.08, parent);
      const bar = box(scene, 'wbar', 0.05, 1.26, 0.06, frame, x, y, -d / 2 - 0.1, parent);
      out.push(fr, gl, bar);
    }
  return out;
}

/** Clock tower; front clock face toward −Z */
function clockTower(scene: Scene, mats: Mats, parent: TransformNode, hour: number, past: boolean): Mesh[] {
  const out: Mesh[] = [];
  const brick = mats.textured('brick', 1.2, 6, new Color3(0.95, 0.9, 0.85), 1);
  const shaft = box(scene, 'towerShaft', 3.2, 17, 3.2, brick, 0, 8.5, 0, parent);
  const stone = mats.textured('quayStone', 1, 0.3, new Color3(1.2, 1.15, 1.05));
  const cap = box(scene, 'towerCap', 3.8, 0.5, 3.8, stone, 0, 17.25, 0, parent);
  const base = box(scene, 'towerBase', 3.8, 1.2, 3.8, stone, 0, 0.6, 0, parent);
  const belfry = box(scene, 'belfry', 3.0, 3.0, 3.0, brick, 0, 19, 0, parent);
  const roof = lathe('towerRoof', scene, [[0, 4.2], [2.45, 0], [0, 0]], 4);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 20.5;
  roof.parent = parent;
  roof.material = mats.painted(new Color3(0.12, 0.22, 0.2), 0.45, 'verdigris');
  out.push(shaft, cap, base, belfry, roof);
  // belfry openings
  for (const [dx, dz, ry] of [[0, -1.51, 0], [0, 1.51, 0], [-1.51, 0, Math.PI / 2], [1.51, 0, Math.PI / 2]] as const) {
    const o = box(scene, 'opening', 1.2, 1.8, 0.05, mats.base('dark', new Color3(0.01, 0.01, 0.01), 0, 1), dx, 19, dz, parent);
    o.rotation.y = ry;
    out.push(o);
  }
  // clock faces
  const tex = new DynamicTexture('clockface', { width: 512, height: 512 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = past ? '#1b2a44' : '#efe9da';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = past ? '#d9b65b' : '#151515';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 256, 236, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = past ? '#d9b65b' : '#151515';
  ctx.font = '600 52px Jost';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  numerals.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(n, 256 + Math.cos(a) * 180, 256 + Math.sin(a) * 180);
  });
  const hand = (frac: number, len: number, wdt: number) => {
    const a = frac * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = wdt;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * len, 256 + Math.sin(a) * len);
    ctx.stroke();
  };
  hand((hour % 12) / 12, 120, 16);
  hand((hour % 1), 190, 9);
  tex.update(true);
  const faceMat = mats.decal(tex, 0.5);
  for (const [dx, dz, ry] of [[0, -1.62, 0], [0, 1.62, Math.PI], [-1.62, 0, Math.PI / 2], [1.62, 0, -Math.PI / 2]] as const) {
    const f = MeshBuilder.CreateDisc('clock', { radius: 1.25, tessellation: 64 }, scene);
    f.position.set(dx, 14.5, dz);
    f.rotation.y = ry;
    f.parent = parent;
    f.material = faceMat;
    const rim = lathe('clockRim', scene, [[1.25, 0], [1.38, 0], [1.38, 0.12], [1.25, 0.12]], 64);
    rim.rotation.x = -Math.PI / 2;
    rim.rotation.y = ry;
    rim.position.set(dx, 14.5, dz);
    rim.parent = parent;
    rim.material = mats.brass();
    out.push(f, rim);
  }
  tagSubject(out, 'clocktower');
  return out;
}

function lighthouse(scene: Scene, mats: Mats, parent: TransformNode, dusk: boolean): { meshes: Mesh[]; lamp: Mesh } {
  const prof: [number, number][] = [[0, 0], [2.4, 0], [2.4, 0.6], [2.0, 0.6], [1.4, 13], [1.6, 13], [1.6, 13.4], [0, 13.4]];
  const tower = lathe('lighthouse', scene, prof, 48);
  tower.parent = parent;
  const tex = new DynamicTexture('lhStripes', { width: 64, height: 512 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#b42a1f' : '#ece8de';
    ctx.fillRect(0, i * 64, 64, 64);
  }
  tex.update(true);
  const m = new PBRMaterial('lhMat', scene);
  m.albedoTexture = tex;
  m.roughness = 0.6;
  m.metallic = 0;
  tower.material = m;
  const lantern = cyl('lantern', scene, 2.2, 2.0, 24);
  lantern.position.y = 14.4;
  lantern.parent = parent;
  lantern.material = mats.glass(new Color3(0.8, 0.9, 0.9), 0.35, 0.05);
  const lamp = MeshBuilder.CreateSphere('lamp', { diameter: 1.0, segments: 16 }, scene);
  lamp.position.y = 14.4;
  lamp.parent = parent;
  lamp.material = dusk ? mats.emissive(new Color3(1, 0.85, 0.55), 18) : mats.base('lampOff', new Color3(0.8, 0.8, 0.75), 0, 0.2);
  const cap = lathe('lhCap', scene, [[0, 1.4], [1.5, 0], [0, 0]], 24);
  cap.position.y = 15.4;
  cap.parent = parent;
  cap.material = mats.painted(new Color3(0.08, 0.08, 0.08), 0.4, 'lhcap');
  const rail = lathe('rail', scene, [[1.7, 0], [1.75, 0], [1.75, 0.9], [1.7, 0.9]], 32);
  rail.position.y = 13.4;
  rail.parent = parent;
  rail.material = mats.painted(new Color3(0.05, 0.05, 0.05), 0.5, 'rail');
  const meshes = [tower, lantern, lamp, cap, rail];
  tagSubject(meshes, 'lighthouse');
  return { meshes, lamp };
}

/** Lofted fishing boat hull, bow toward +X */
function boat(scene: Scene, mats: Mats, color: Color3, name: string, parent: TransformNode): Mesh[] {
  const L = 8;
  const sections = 14;
  const paths: Vector3[][] = [];
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const x = (t - 0.5) * L;
    const bowT = Math.max(0, (t - 0.65) / 0.35);
    const sternT = Math.max(0, (0.12 - t) / 0.12);
    const beam = 1.35 * (1 - bowT * bowT * 0.95) * (1 - sternT * 0.25);
    const depth = 1.3 * (1 - bowT * 0.3);
    const sheer = 1.0 + bowT * bowT * 0.7;
    const path: Vector3[] = [];
    for (let j = 0; j <= 12; j++) {
      const a = (j / 12) * Math.PI;
      const y = -Math.sin(a) * depth;
      const z = Math.cos(a) * beam;
      path.push(new Vector3(x, y * (Math.abs(Math.cos(a)) * 0.35 + 0.65) + sheer - 1, z));
    }
    paths.push(path);
  }
  const hull = MeshBuilder.CreateRibbon('hull', { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE }, scene);
  hull.parent = parent;
  hull.material = mats.painted(color, 0.45, `hull-${color.toHexString()}`);
  const deck = MeshBuilder.CreateBox('deck', { width: L * 0.82, height: 0.08, depth: 2.2 }, scene);
  deck.position.set(-0.2, 0.0, 0);
  deck.parent = parent;
  deck.material = mats.textured('deskWood', 3, 1, new Color3(0.9, 0.85, 0.75));
  const cabin = roundedBox('cabin', scene, 2.0, 1.6, 1.7, 0.08, 2);
  cabin.position.set(-1.6, 0.85, 0);
  cabin.parent = parent;
  cabin.material = mats.painted(new Color3(0.85, 0.83, 0.78), 0.5, 'cabin');
  const roofC = roundedBox('cabinRoof', scene, 2.2, 0.08, 1.9, 0.03, 2);
  roofC.position.set(-1.6, 1.7, 0);
  roofC.parent = parent;
  roofC.material = mats.painted(new Color3(0.2, 0.25, 0.3), 0.5, 'cabroof');
  const mast = cyl('mast', scene, 0.12, 5, 12);
  mast.position.set(0.8, 2.5, 0);
  mast.parent = parent;
  mast.material = mats.textured('deskWood', 0.2, 2);
  const nameTex = textTexture(scene, [name], { w: 512, h: 96, color: '#f2efe6', font: '600 64px Jost' });
  const plate = MeshBuilder.CreatePlane('boatName', { width: 1.6, height: 0.3 }, scene);
  plate.position.set(-3.3, 0.55, -1.0);
  plate.rotation.y = 0.0;
  plate.parent = parent;
  plate.material = mats.decal(nameTex, 0.6);
  const meshes = [hull, deck, cabin, roofC, mast, plate];
  tagSubject(meshes, 'boat');
  return meshes;
}

function gullMesh(scene: Scene, mats: Mats): { root: TransformNode; wings: Mesh[] } {
  const root = new TransformNode('gull', scene);
  const body = MeshBuilder.CreateSphere('gullBody', { diameterX: 0.45, diameterY: 0.14, diameterZ: 0.14, segments: 8 }, scene);
  body.parent = root;
  body.material = mats.painted(new Color3(0.9, 0.9, 0.88), 0.6, 'gull');
  const wings: Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = MeshBuilder.CreateBox('wing', { width: 0.18, height: 0.015, depth: 0.55 }, scene);
    w.setPivotPoint(new Vector3(0, 0, -s * 0.27));
    w.position.set(0, 0, s * 0.27);
    w.parent = root;
    w.material = mats.painted(new Color3(0.75, 0.76, 0.78), 0.6, 'gullwing');
    wings.push(w);
  }
  tagSubject([body, ...wings], 'gull');
  return { root, wings };
}

function lampPost(scene: Scene, mats: Mats, parent: TransformNode, x: number, z: number, dusk: boolean): Mesh[] {
  const iron = mats.painted(new Color3(0.04, 0.05, 0.05), 0.5, 'iron');
  const post = cyl('lampPost', scene, 0.14, 4, 12);
  post.position.set(x, 2, z);
  post.parent = parent;
  post.material = iron;
  const head = lathe('lampHead', scene, [[0, 0.5], [0.25, 0.3], [0.18, 0], [0, 0]], 8);
  head.position.set(x, 4.0, z);
  head.parent = parent;
  head.material = iron;
  const bulb = MeshBuilder.CreateSphere('lampGlow', { diameter: 0.28, segments: 8 }, scene);
  bulb.position.set(x, 4.15, z);
  bulb.parent = parent;
  bulb.material = dusk ? mats.emissive(new Color3(1, 0.75, 0.45), 8) : mats.glass(new Color3(0.9, 0.9, 0.85), 0.6, 0.2);
  return [post, head, bulb];
}

function bench(scene: Scene, mats: Mats, parent: TransformNode, x: number, z: number, ry: number): Mesh[] {
  const wood = mats.textured('deskWood', 1, 0.3, new Color3(0.8, 0.7, 0.6));
  const iron = mats.painted(new Color3(0.04, 0.05, 0.05), 0.5, 'iron');
  const g = new TransformNode('bench', scene);
  g.parent = parent;
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const out: Mesh[] = [];
  for (let i = 0; i < 3; i++) out.push(box(scene, 'slat', 1.8, 0.04, 0.12, wood, 0, 0.45, -0.15 + i * 0.15, g));
  for (let i = 0; i < 2; i++) {
    const b = box(scene, 'back', 1.8, 0.12, 0.04, wood, 0, 0.65 + i * 0.18, 0.22, g);
    out.push(b);
  }
  for (const sx of [-0.8, 0.8]) out.push(box(scene, 'benchLeg', 0.06, 0.9, 0.5, iron, sx, 0.4, 0.05, g));
  tagSubject(out, 'bench');
  return out;
}

export function buildHarbour(scene: Scene, mats: Mats, o: LocOpts): LocationBuild {
  const root = new TransformNode('harbour', scene);
  const dusk = o.lighting === 'dusk';
  const r = makeRng(o.past ? 1979 : 2024);
  const colliders: Collider[] = [];
  // quay ground (z from -8 to 30), water beyond z < -8
  const quay = MeshBuilder.CreateGround('quay', { width: 120, height: 40 }, scene);
  quay.position.set(0, 0, 12);
  quay.parent = root;
  quay.material = mats.textured('cobbles', 30, 10, new Color3(1, 0.97, 0.92), 1);
  quay.receiveShadows = true;
  const edge = box(scene, 'quayEdge', 120, 2.6, 1.2, mats.textured('quayStone', 30, 1), 0, -1.2, -8.4, root);
  void edge;
  const water = MeshBuilder.CreateGround('water', { width: 400, height: 300, subdivisions: 4 }, scene);
  water.position.set(0, -1.6, -160);
  water.parent = root;
  const wm = mats.textured('water', 60, 45, new Color3(0.5, 0.75, 0.8), 0.6, 1);
  wm.roughness = 1;
  wm.metallic = 0;
  wm.albedoColor = new Color3(0.06, 0.12, 0.13);
  wm.useRoughnessFromMetallicTextureGreen = true;
  water.material = wm;
  water.receiveShadows = true;
  colliders.push({ min: [-60, -60], max: [60, -7.6] });
  // houses along the back
  const palette = [new Color3(0.93, 0.85, 0.66), new Color3(0.95, 0.95, 0.92), new Color3(0.68, 0.8, 0.86), new Color3(0.94, 0.74, 0.64), new Color3(0.8, 0.84, 0.7), new Color3(0.93, 0.9, 0.82)];
  let x = -48;
  let i = 0;
  while (x < 48) {
    const w = 6 + r() * 3;
    const h = 6 + Math.floor(r() * 3) * 3;
    const g = new TransformNode('houseG', scene);
    g.parent = root;
    g.position.set(x + w / 2, 0, 24);
    if (Math.abs(x + w / 2 - 12) > 4) house(scene, mats, w, h, 8, palette[i % palette.length], i * 13 + 5, g, dusk);
    x += w + 0.05;
    i++;
  }
  colliders.push({ min: [-60, 19.8], max: [60, 40] });
  // clock tower on the quay
  const tower = new TransformNode('towerG', scene);
  tower.parent = root;
  tower.position.set(12, 0, 21);
  const hour = o.lighting === 'dusk' ? 8.6 : o.lighting === 'golden' ? 7.25 : 11.0 + r();
  clockTower(scene, mats, tower, o.past ? 3.6 : hour, !!o.past);
  colliders.push({ min: [10.1, 19.1], max: [13.9, 22.9] });
  // breakwater + lighthouse
  const bw = box(scene, 'breakwater', 5, 2.4, 50, mats.textured('quayStone', 2, 20), -36, -0.4, -32, root);
  void bw;
  const lhG = new TransformNode('lhG', scene);
  lhG.parent = root;
  lhG.position.set(-36, 0.8, -54);
  const lh = lighthouse(scene, mats, lhG, dusk);
  void lh;
  colliders.push({ min: [-60, -60], max: [-38.5, -7.6] }, { min: [-33.5, -60], max: [60, -7.6] });
  // boats
  const names = o.past ? ['MARIGOLD', 'BRIGHT DAWN', 'ST. ANNE'] : ['KITTIWAKE', 'RUTH ANN', 'GOOD HOPE', 'SEA PINK'];
  const cols = [new Color3(0.12, 0.25, 0.45), new Color3(0.55, 0.1, 0.07), new Color3(0.15, 0.35, 0.22), new Color3(0.85, 0.6, 0.1)];
  const boats: TransformNode[] = [];
  names.forEach((n, bi) => {
    const g = new TransformNode('boatG', scene);
    g.parent = root;
    g.position.set(-14 + bi * 9.5, -1.35, -11.5 - (bi % 2) * 2.5);
    g.rotation.y = 0.15 * (bi % 2 ? 1 : -1);
    boat(scene, mats, cols[bi % cols.length], n, g);
    boats.push(g);
  });
  // bollards, crates, nets
  for (let k = 0; k < 9; k++) {
    const b = lathe('bollard', scene, [[0, 0], [0.22, 0], [0.18, 0.5], [0.26, 0.6], [0.26, 0.7], [0, 0.72]], 20);
    b.position.set(-30 + k * 7.5, 0, -7.2);
    b.parent = root;
    b.material = mats.painted(new Color3(0.05, 0.05, 0.05), 0.45, 'bollard');
  }
  for (let k = 0; k < 6; k++) {
    const c = roundedBox('crate', scene, 0.9, 0.6, 0.6, 0.02, 1);
    c.position.set(-6 + rrange(r, -3, 3) + k * 1.0, 0.3 + (k % 3 === 2 ? 0.6 : 0), -2 + rrange(r, -0.4, 0.4));
    c.rotation.y = rrange(r, -0.2, 0.2);
    c.parent = root;
    c.material = mats.textured('deskWood', 1, 1, new Color3(1.1, 0.95, 0.8));
  }
  colliders.push({ min: [-9.6, -2.6], max: [0.4, -1.4] });
  const practicals: Mesh[] = [];
  for (let k = 0; k < 7; k++) practicals.push(...lampPost(scene, mats, root, -27 + k * 9, 2.5, dusk));
  bench(scene, mats, root, 4, 6, Math.PI);
  bench(scene, mats, root, -18, 6, Math.PI);
  // gulls
  const gulls = Array.from({ length: 6 }, (_, gi) => ({ g: gullMesh(scene, mats), phase: gi * 1.7, rad: 6 + gi * 2, h: 7 + gi * 1.3, cx: -10 + gi * 3, cz: -14 + (gi % 3) * 4 }));
  gulls.forEach((g) => (g.g.root.parent = root));
  for (const m of root.getChildMeshes()) m.receiveShadows = true;
  const tick = (t: number) => {
    boats.forEach((b, bi) => {
      b.position.y = -1.35 + Math.sin(t * 0.9 + bi) * 0.06;
      b.rotation.z = Math.sin(t * 0.7 + bi * 2) * 0.025;
    });
    gulls.forEach((g) => {
      const a = t * 0.25 + g.phase;
      g.g.root.position.set(g.cx + Math.cos(a) * g.rad, g.h + Math.sin(t * 0.5 + g.phase) * 0.6, g.cz + Math.sin(a) * g.rad);
      g.g.root.rotation.y = -a;
      const flap = Math.sin(t * 6 + g.phase) * 0.5;
      g.g.wings[0].rotation.x = flap;
      g.g.wings[1].rotation.x = -flap;
    });
    (wm.albedoTexture as Texture).uOffset = t * 0.004;
    (wm.bumpTexture as Texture).uOffset = t * 0.004;
    (wm.bumpTexture as Texture).vOffset = t * 0.002;
  };
  return {
    root,
    spawn: new Vector3(2, 1.62, 4),
    spawnYaw: Math.PI * 0.95,
    colliders,
    bounds: { min: [-45, -7.6], max: [45, 19.5] },
    tick,
    practicals,
    storyPoses: [
      { pos: new Vector3(-6, 1.55, -5), target: new Vector3(-9, -0.5, -12), subject: 'boat' },
      { pos: new Vector3(4, 1.55, 6), target: new Vector3(12, 12, 21), subject: 'clocktower' },
      { pos: new Vector3(-20, 1.55, -5), target: new Vector3(-36, 8, -54), subject: 'lighthouse' },
      { pos: new Vector3(10, 1.6, -4), target: new Vector3(-4, -0.4, -12), subject: 'boat' },
    ],
    grayCardPos: new Vector3(0, 1.0, 2),
  };
}

function tree(scene: Scene, mats: Mats, parent: TransformNode, x: number, z: number, s: number, seed: number): Mesh[] {
  const r = makeRng(seed);
  const g = new TransformNode('tree', scene);
  g.parent = parent;
  g.position.set(x, 0, z);
  g.scaling.setAll(s);
  const trunk = lathe('trunk', scene, [[0.35, 0], [0.22, 2.5], [0.16, 4.5], [0.0, 5]], 12);
  trunk.parent = g;
  trunk.material = mats.textured('bark', 2, 3);
  const leafMat = mats.textured('leaves', 4, 4, new Color3(0.9, 1.0, 0.85), 1.2);
  const out: Mesh[] = [trunk];
  for (let i = 0; i < 7; i++) {
    const c = MeshBuilder.CreateIcoSphere('canopy', { radius: 1.6 + r() * 0.9, subdivisions: 3 }, scene);
    const pos = c.getVerticesData('position')!;
    for (let k = 0; k < pos.length; k += 3) {
      const n = 0.85 + 0.3 * Math.sin(pos[k] * 3.1 + seed) * Math.cos(pos[k + 2] * 2.7 + i);
      pos[k] *= n;
      pos[k + 1] *= n;
      pos[k + 2] *= n;
    }
    c.updateVerticesData('position', pos);
    const nrm: number[] = [];
    VertexData.ComputeNormals(pos, c.getIndices()!, nrm);
    c.updateVerticesData('normal', nrm);
    c.parent = g;
    c.position.set(rrange(r, -1.4, 1.4), 4.6 + rrange(r, -0.6, 1.4), rrange(r, -1.4, 1.4));
    c.material = leafMat;
    out.push(c);
  }
  return out;
}

function tulipBed(scene: Scene, mats: Mats, parent: TransformNode, cx: number, cz: number, w: number, d: number, seed: number): Mesh[] {
  const r = makeRng(seed);
  const soil = MeshBuilder.CreateBox('bed', { width: w, height: 0.12, depth: d }, scene);
  soil.position.set(cx, 0.06, cz);
  soil.parent = parent;
  soil.material = mats.textured('gravel', w, d, new Color3(0.35, 0.25, 0.18));
  const stem = MeshBuilder.CreateCylinder('stem', { diameter: 0.012, height: 0.42, tessellation: 5 }, scene);
  stem.material = mats.painted(new Color3(0.12, 0.3, 0.08), 0.6, 'stem');
  stem.parent = parent;
  stem.isVisible = true;
  const head = lathe('tulip', scene, [[0, 0], [0.028, 0.01], [0.04, 0.045], [0.036, 0.08], [0.024, 0.095]], 6);
  head.parent = parent;
  const colors = [new Color3(0.75, 0.04, 0.05), new Color3(0.95, 0.7, 0.05), new Color3(0.9, 0.35, 0.55), new Color3(0.95, 0.92, 0.85)];
  const heads: Mesh[] = [];
  colors.forEach((c, ci) => {
    const hm = head.clone(`tulipHead${ci}`)!;
    const mat = mats.painted(c, 0.5, `tulip${ci}`);
    (mat as PBRMaterial).subSurface.isTranslucencyEnabled = true;
    (mat as PBRMaterial).subSurface.translucencyIntensity = 0.6;
    hm.material = mat;
    heads.push(hm);
  });
  head.dispose();
  const n = Math.floor(w * d * 30);
  for (let i = 0; i < n; i++) {
    const px = cx + rrange(r, -w / 2 + 0.1, w / 2 - 0.1);
    const pz = cz + rrange(r, -d / 2 + 0.1, d / 2 - 0.1);
    const s = stem.createInstance('stemI');
    s.position.set(px, 0.33, pz);
    s.rotation.z = rrange(r, -0.08, 0.08);
    const hm = heads[Math.floor(r() * heads.length)].createInstance('tulipI');
    hm.position.set(px + s.rotation.z * -0.2, 0.54, pz);
    hm.rotation.y = r() * 6;
    hm.metadata = { subject: 'tulip' };
  }
  stem.isVisible = false;
  heads.forEach((hm) => {
    hm.isVisible = false;
    hm.metadata = { subject: 'tulip' };
  });
  // one hero tulip for close-ups at the front edge
  const hero = heads[0].clone('heroTulip')!;
  hero.isVisible = true;
  hero.parent = parent;
  hero.position.set(cx, 0.5, cz - d / 2 + 0.12);
  hero.scaling.setAll(1.15);
  hero.metadata = { subject: 'tulip' };
  return [soil, hero];
}

export function buildPark(scene: Scene, mats: Mats, o: LocOpts): LocationBuild {
  const root = new TransformNode('park', scene);
  const dusk = o.lighting === 'dusk';
  const grass = MeshBuilder.CreateGround('grass', { width: 140, height: 140 }, scene);
  grass.parent = root;
  grass.material = mats.textured('grass', 50, 50, new Color3(1, 1.05, 0.95), 1);
  grass.receiveShadows = true;
  for (const [x, z, w, d] of [[0, 0, 4, 90], [0, 0, 90, 4]] as const) {
    const p = MeshBuilder.CreateGround('path', { width: w, height: d }, scene);
    p.position.set(x, 0.01, z);
    p.parent = root;
    p.material = mats.textured('gravel', w / 2, d / 2, new Color3(1.1, 1.05, 0.95));
    p.receiveShadows = true;
  }
  // fountain at the crossing
  const fG = new TransformNode('fountain', scene);
  fG.parent = root;
  const stone = mats.textured('quayStone', 2, 0.5, new Color3(1.25, 1.2, 1.1));
  const basin = lathe('basin', scene, [[0, 0.1], [3.2, 0.1], [3.2, 0.7], [3.0, 0.7], [3.0, 0.25], [0, 0.25]], 64);
  basin.parent = fG;
  basin.material = stone;
  const pool = MeshBuilder.CreateDisc('pool', { radius: 3.0, tessellation: 64 }, scene);
  pool.rotation.x = Math.PI / 2;
  pool.position.y = 0.55;
  pool.parent = fG;
  pool.material = mats.base('poolwater', new Color3(0.05, 0.09, 0.09), 0, 0.03);
  const column = lathe('fcol', scene, [[0, 0], [0.5, 0], [0.3, 0.8], [0.25, 1.8], [1.2, 2.0], [1.2, 2.15], [0.15, 2.3], [0.12, 3.0], [0.3, 3.1], [0, 3.2]], 32);
  column.parent = fG;
  column.material = stone;
  const ps = new ParticleSystem('spray', 2500, scene);
  ps.particleTexture = sprayTexture(scene);
  ps.emitter = new Vector3(0, 3.1, 0);
  ps.minEmitBox = new Vector3(-0.05, 0, -0.05);
  ps.maxEmitBox = new Vector3(0.05, 0, 0.05);
  ps.direction1 = new Vector3(-0.6, 4, -0.6);
  ps.direction2 = new Vector3(0.6, 4.5, 0.6);
  ps.gravity = new Vector3(0, -9.8, 0);
  ps.minSize = 0.05;
  ps.maxSize = 0.14;
  ps.minLifeTime = 0.8;
  ps.maxLifeTime = 1.1;
  ps.emitRate = 1600;
  ps.color1 = new Color4(0.85, 0.9, 0.95, 0.5);
  ps.color2 = new Color4(0.75, 0.82, 0.88, 0.35);
  ps.colorDead = new Color4(0.7, 0.8, 0.85, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.start();
  tagSubject([basin, column, pool], 'fountain');
  const colliders: Collider[] = [{ min: [-3.3, -3.3], max: [3.3, 3.3] }];
  // bandstand
  const bs = new TransformNode('bandstand', scene);
  bs.parent = root;
  bs.position.set(-16, 0, 14);
  const plat = cyl('bsPlat', scene, 8, 0.8, 8);
  plat.position.y = 0.4;
  plat.parent = bs;
  plat.material = stone;
  const white = mats.painted(new Color3(0.9, 0.9, 0.86), 0.5, 'bswhite');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const c = cyl('bsCol', scene, 0.18, 3.2, 10);
    c.position.set(Math.cos(a) * 3.6, 2.4, Math.sin(a) * 3.6);
    c.parent = bs;
    c.material = white;
  }
  const bsRoof = lathe('bsRoof', scene, [[0, 2.0], [4.6, 0], [0, 0]], 8);
  bsRoof.position.y = 4.0;
  bsRoof.parent = bs;
  bsRoof.material = mats.painted(new Color3(0.2, 0.32, 0.26), 0.45, 'bsroof');
  tagSubject([plat, bsRoof], 'bandstand');
  colliders.push({ min: [-20.2, 9.8], max: [-11.8, 18.2] });
  // trees
  const tr = makeRng(77);
  for (let k = 0; k < 26; k++) {
    let x = rrange(tr, -50, 50);
    let z = rrange(tr, -50, 50);
    if (Math.abs(x) < 6 || Math.abs(z) < 6) x += 10 * Math.sign(x || 1);
    if (Math.hypot(x + 16, z - 14) < 8) z -= 12;
    tree(scene, mats, root, x, z, rrange(tr, 0.8, 1.3), k);
    colliders.push({ min: [x - 0.4, z - 0.4], max: [x + 0.4, z + 0.4] });
  }
  // tulip beds by the path
  tulipBed(scene, mats, root, 6, -6, 5, 1.4, 1);
  tulipBed(scene, mats, root, -6, -6, 5, 1.4, 2);
  tulipBed(scene, mats, root, 6, 6, 5, 1.4, 3);
  colliders.push({ min: [3.5, -6.7], max: [8.5, -5.3] }, { min: [-8.5, -6.7], max: [-3.5, -5.3] }, { min: [3.5, 5.3], max: [8.5, 6.7] });
  const practicals: Mesh[] = [];
  for (let k = -3; k <= 3; k++) if (k) practicals.push(...lampPost(scene, mats, root, 2.6, k * 9, dusk));
  bench(scene, mats, root, -3.2, 10, Math.PI / 2);
  bench(scene, mats, root, 3.2, -14, -Math.PI / 2);
  // town edge: clock tower in the distance and a row of houses
  const tower = new TransformNode('towerG', scene);
  tower.parent = root;
  tower.position.set(30, 0, 62);
  clockTower(scene, mats, tower, 11.2, !!o.past);
  const palette = [new Color3(0.93, 0.85, 0.66), new Color3(0.95, 0.95, 0.92), new Color3(0.94, 0.74, 0.64)];
  for (let k = 0; k < 12; k++) {
    const g = new TransformNode('houseG', scene);
    g.parent = root;
    g.position.set(-55 + k * 9.5, 0, 70);
    house(scene, mats, 9, 9, 8, palette[k % 3], k * 7 + 3, g, dusk);
  }
  for (const m of root.getChildMeshes()) m.receiveShadows = true;
  return {
    root,
    spawn: new Vector3(0, 1.62, -16),
    spawnYaw: 0,
    colliders,
    bounds: { min: [-60, -60], max: [60, 60] },
    tick: () => undefined,
    practicals,
    storyPoses: [
      { pos: new Vector3(0, 1.5, -9), target: new Vector3(0, 1.5, 0), subject: 'fountain' },
      { pos: new Vector3(-8, 1.6, 4), target: new Vector3(-16, 3, 14), subject: 'bandstand' },
    ],
    grayCardPos: new Vector3(0, 1.0, -12),
  };
}

function sprayTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('spray', { width: 64, height: 64 }, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 32, y - 32) / 32;
      const a = Math.max(0, 1 - d);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * a * 255);
    }
  ctx.putImageData(img, 0, 0);
  t.hasAlpha = true;
  t.update(false);
  return t;
}

/** ISO-style lens test chart: Siemens star, resolution bars, grey steps */
function testChartTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('chart', { width: 1024, height: 768 }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#f2f1ec';
  ctx.fillRect(0, 0, 1024, 768);
  const star = (cx: number, cy: number, r: number) => {
    for (let i = 0; i < 36; i++) {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, (i / 36) * Math.PI * 2, ((i + 0.5) / 36) * Math.PI * 2);
      ctx.fill();
    }
  };
  star(512, 384, 200);
  for (const [cx, cy] of [[110, 100], [914, 100], [110, 668], [914, 668]]) star(cx, cy, 80);
  for (let s = 0; s < 10; s++) {
    ctx.fillStyle = `rgb(${s * 28},${s * 28},${s * 28})`;
    ctx.fillRect(232 + s * 56, 700, 56, 50);
  }
  for (let k = 0; k < 6; k++) {
    const w = 6 - k;
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = '#111';
      ctx.fillRect(30 + k * 26 + b * w * 2, 260, w, 240);
    }
  }
  ctx.fillStyle = '#111';
  ctx.font = '600 22px Jost';
  ctx.fillText('LENS TEST CHART · RUTH M.', 740, 740);
  t.update(true);
  return t;
}

export function buildPortraitRoom(scene: Scene, mats: Mats, o: LocOpts): LocationBuild {
  const root = new TransformNode('portrait', scene);
  const rm = roomProp(scene, mats, 7, 6, 3.2, { wall: 'plaster', wallTint: new Color3(0.95, 0.93, 0.88) });
  rm.root.parent = root;
  // big north window on the east wall: remove wall and add frame + bright backdrop
  const wallE = scene.getMeshByName('wallE');
  wallE?.dispose();
  const wm = mats.textured('plaster', 3, 1.2, new Color3(0.95, 0.93, 0.88), 0.6);
  for (const [z0, z1, y0, y1] of [[-3, -1.2, 0, 3.2], [1.2, 3, 0, 3.2], [-1.2, 1.2, 0, 0.8], [-1.2, 1.2, 2.8, 3.2]] as const) {
    const p = MeshBuilder.CreatePlane('wallEp', { width: z1 - z0, height: y1 - y0 }, scene);
    p.position.set(3.5, (y0 + y1) / 2, (z0 + z1) / 2);
    p.rotation.y = Math.PI / 2;
    p.parent = root;
    p.material = wm;
  }
  const win = windowFrame(scene, mats, 2.4, 2.0);
  win.root.parent = root;
  win.root.position.set(3.52, 1.8, 0);
  win.root.rotation.y = Math.PI / 2;
  const sky = MeshBuilder.CreatePlane('skyCard', { width: 10, height: 6 }, scene);
  sky.position.set(7, 2.5, 0);
  sky.rotation.y = Math.PI / 2;
  sky.parent = root;
  sky.material = mats.emissive(new Color3(0.82, 0.88, 0.95), o.lighting === 'room' ? 0.35 : 3.2);
  // set: chair, table with the milliner's head + cloche
  const ch = chairProp(scene, mats);
  ch.root.parent = root;
  ch.root.position.set(1.2, 0, 1.8);
  const tb = tableProp(scene, mats, 0.7, 0.7, 0.75);
  tb.root.parent = root;
  tb.root.position.set(1.6, 0, 0);
  const headG = new TransformNode('milliner', scene);
  headG.parent = root;
  headG.position.set(1.6, 0.75, 0);
  headG.rotation.y = -Math.PI / 2 - 0.35;
  const stand = lathe('stand', scene, [[0, 0], [0.14, 0], [0.14, 0.02], [0.02, 0.04], [0.02, 0.32], [0, 0.32]], 32);
  stand.parent = headG;
  stand.material = mats.textured('deskWood', 1, 1);
  const neck = cyl('neck', scene, 0.1, 0.14, 24);
  neck.position.y = 0.38;
  neck.parent = headG;
  const skin = mats.painted(new Color3(0.86, 0.8, 0.72), 0.55, 'plasterhead');
  neck.material = skin;
  const head = MeshBuilder.CreateSphere('head', { diameterX: 0.17, diameterY: 0.23, diameterZ: 0.2, segments: 32 }, scene);
  head.position.y = 0.55;
  head.parent = headG;
  head.material = skin;
  const nose = MeshBuilder.CreateSphere('nose', { diameterX: 0.03, diameterY: 0.05, diameterZ: 0.04, segments: 12 }, scene);
  nose.position.set(0, 0.54, -0.1);
  nose.parent = headG;
  nose.material = skin;
  const hat = lathe('cloche', scene, [[0, 0.17], [0.06, 0.165], [0.1, 0.14], [0.115, 0.09], [0.12, 0.03], [0.15, 0.0], [0.155, -0.01], [0.12, 0.0]], 64);
  hat.position.y = 0.58;
  hat.parent = headG;
  hat.rotation.x = 0.12;
  const felt = mats.textured('cloth', 3, 3, new Color3(0.32, 0.06, 0.05), 1);
  hat.material = felt;
  const band = lathe('band', scene, [[0.118, 0.03], [0.121, 0.03], [0.117, 0.06], [0.114, 0.06]], 64);
  band.position.y = 0.58;
  band.rotation.x = 0.12;
  band.parent = headG;
  band.material = mats.painted(new Color3(0.05, 0.05, 0.05), 0.3, 'ribbon');
  tagSubject([head, hat, band, neck, nose], 'hat');
  // vase of tulips on a side table
  const st = tableProp(scene, mats, 0.5, 0.5, 0.65);
  st.root.parent = root;
  st.root.position.set(2.6, 0, -2.0);
  const vase = lathe('vase', scene, [[0, 0], [0.06, 0], [0.09, 0.08], [0.05, 0.22], [0.06, 0.26], [0, 0.26]], 32);
  vase.position.set(2.6, 0.65, -2.0);
  vase.parent = root;
  vase.material = mats.glass(new Color3(0.6, 0.75, 0.7), 0.5, 0.05);
  const tulips: Mesh[] = [];
  for (let k = 0; k < 7; k++) {
    const t = lathe('vTulip', scene, [[0, 0], [0.028, 0.01], [0.04, 0.045], [0.036, 0.08], [0.024, 0.095]], 6);
    const a = (k / 7) * Math.PI * 2;
    t.position.set(2.6 + Math.cos(a) * 0.08, 1.05 + (k % 3) * 0.04, -2.0 + Math.sin(a) * 0.08);
    t.rotation.z = Math.cos(a) * 0.3;
    t.rotation.x = Math.sin(a) * 0.3;
    t.parent = root;
    t.material = mats.painted(k % 2 ? new Color3(0.95, 0.7, 0.05) : new Color3(0.75, 0.04, 0.05), 0.5, `vt${k % 2}`);
    const s = cyl('vStem', scene, 0.01, 0.42, 5);
    s.position.set(2.6 + Math.cos(a) * 0.05, 0.85, -2.0 + Math.sin(a) * 0.05);
    s.parent = root;
    s.material = mats.painted(new Color3(0.12, 0.3, 0.08), 0.6, 'stem');
    tulips.push(t);
  }
  tagSubject(tulips, 'tulip');
  // test chart on the west wall
  const chart = MeshBuilder.CreatePlane('chart', { width: 1.2, height: 0.9 }, scene);
  chart.position.set(-3.48, 1.5, 0.5);
  chart.rotation.y = -Math.PI / 2;
  chart.parent = root;
  chart.material = mats.decal(testChartTexture(scene), 0.8);
  tagSubject([chart], 'chart');
  const pl = plantProp(scene, mats);
  pl.root.parent = root;
  pl.root.position.set(2.9, 0, 2.5);
  rugProp(scene, mats, 2.4, 1.8, new Color3(0.2, 0.25, 0.35)).parent = root;
  const dr = doorProp(scene, mats, new Color3(0.4, 0.38, 0.33));
  dr.root.parent = root;
  dr.root.position.set(-1.5, 0, -2.98);
  // a warm lamp for "room" lighting
  const lampBulb = MeshBuilder.CreateSphere('roomLamp', { diameter: 0.18, segments: 12 }, scene);
  lampBulb.position.set(-2.4, 1.6, -2.3);
  lampBulb.parent = root;
  lampBulb.material = mats.emissive(new Color3(1, 0.75, 0.45), o.lighting === 'room' ? 10 : 0.5);
  const shade = lathe('floorShade', scene, [[0.12, 0.2], [0.25, -0.1], [0.24, -0.11]], 32);
  shade.position.set(-2.4, 1.7, -2.3);
  shade.parent = root;
  shade.material = mats.textured('cloth', 2, 1, new Color3(0.9, 0.82, 0.65));
  const pole = cyl('lampPole', scene, 0.03, 1.6, 8);
  pole.position.set(-2.4, 0.8, -2.3);
  pole.parent = root;
  pole.material = mats.brass();
  for (const m of root.getChildMeshes()) m.receiveShadows = true;
  return {
    root,
    spawn: new Vector3(-1.5, 1.6, 0.2),
    spawnYaw: Math.PI / 2,
    colliders: [{ min: [1.2, -0.4], max: [2.0, 0.4] }, { min: [2.3, -2.3], max: [2.9, -1.7] }, { min: [0.9, 1.5], max: [1.5, 2.1] }],
    bounds: { min: [-3.2, -2.7], max: [3.2, 2.7] },
    tick: () => undefined,
    practicals: [lampBulb],
    storyPoses: [{ pos: new Vector3(0.6, 1.3, 0), target: new Vector3(1.6, 1.3, 0), subject: 'hat' }],
    grayCardPos: new Vector3(1.0, 1.3, 0.0),
  };
}

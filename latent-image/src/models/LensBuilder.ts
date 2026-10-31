/**
 * Procedural lenses. Optical axis is +Z (front of the lens at +Z), mount
 * flange at z = 0.
 */
import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, TransformNode, Vector3, PBRMaterial } from '@babylonjs/core';
import { Mats } from '../render/materials';
import { LensModel, aperturesFor, formatAperture } from '../sim/data';
import { lathe, ring } from './geom';

export interface LensRig {
  root: TransformNode;
  length: number;
  radius: number;
  frontGlass: Mesh;
  focusRing: TransformNode;
  apertureRing: TransformNode;
  setAperture(n: number): void;
  setFocus(dist: number): void;
  setHaze(h: number, lit: boolean): void;
  dispose(): void;
}

export interface LensStyle {
  finish: 'black' | 'chrome' | 'zebra';
  grip: 'rubber' | 'knurl' | 'metal';
  length: number;
  radius: number;
  frontRadius: number;
  nameText: string;
}

export function styleFor(l: LensModel): LensStyle {
  const len = l.macro ? 0.062 : l.focal <= 30 ? 0.044 : l.focal <= 60 ? 0.038 + (l.maxAperture < 1.6 ? 0.006 : 0) : l.focal <= 90 ? 0.062 : 0.088;
  const r = l.focal >= 85 && l.maxAperture < 2.2 ? 0.034 : 0.029;
  const front = Math.min(r * 0.86, Math.max(0.012, l.focal / l.maxAperture / 2000 + 0.006));
  let finish: LensStyle['finish'] = 'black';
  let grip: LensStyle['grip'] = 'rubber';
  if (l.id === 'jupiter9' || l.id === 'summicron50') finish = 'chrome';
  if (l.id === 'helios44') finish = 'zebra';
  if (l.mount === 'm42' || l.mount === 'f') grip = l.mount === 'f' ? 'rubber' : 'knurl';
  if (l.id === 'jupiter9') grip = 'metal';
  const maker = l.mount === 'fd' ? 'CANON LENS FD' : l.mount === 'pk' ? 'SMC PENTAX-M' : l.mount === 'f' ? 'NIKON NIKKOR' : l.name.toUpperCase();
  return { finish, grip, length: len, radius: r, frontRadius: front, nameText: `${maker}  ${l.focal}mm 1:${l.maxAperture}` };
}

/** Ring of text around a flat annulus (front name ring) */
function annulusTexture(scene: Scene, text: string, colorHex: string): DynamicTexture {
  const size = 1024;
  const t = new DynamicTexture('nameRing', { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colorHex;
  ctx.font = '600 44px Jost';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const R = size * 0.42;
  const chars = text.split('');
  const spread = Math.min(Math.PI * 1.5, chars.length * 0.085);
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 - spread / 2 + (spread * (i + 0.5)) / chars.length;
    ctx.save();
    ctx.translate(size / 2 + Math.cos(a) * R, size / 2 + Math.sin(a) * R);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  t.update(true);
  return t;
}

/** Band texture with evenly spaced labels for a ring side (cylinder UV wraps once) */
export function bandTexture(scene: Scene, labels: string[], o: { span?: number; color?: string; bg?: string; colors?: string[]; size?: number } = {}): DynamicTexture {
  const w = 2048;
  const h = 128;
  const t = new DynamicTexture('band', { width: w, height: h }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = o.bg ?? '#070707';
  ctx.fillRect(0, 0, w, h);
  ctx.font = `600 ${o.size ?? 54}px Jost`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const span = o.span ?? 0.32;
  labels.forEach((l, i) => {
    // labels centred around u = 0.25 (faces +Z−X… whichever is "top" after rotation)
    const u = 0.25 - span / 2 + (labels.length === 1 ? span / 2 : (span * i) / (labels.length - 1));
    ctx.fillStyle = o.colors?.[i] ?? o.color ?? '#e9e5da';
    ctx.save();
    ctx.translate(u * w, h / 2);
    ctx.scale(-1, 1);
    ctx.fillText(l, 0, 0);
    ctx.restore();
  });
  t.update(true);
  return t;
}

export function buildLens(scene: Scene, mats: Mats, model: LensModel, opts: { haze?: number; fungus?: number } = {}): LensRig {
  const st = styleFor(model);
  const root = new TransformNode(`lens-${model.id}`, scene);
  const L = st.length;
  const R = st.radius;
  const body = st.finish === 'chrome' ? mats.satinChrome() : mats.satinBlack();
  const meshes: Mesh[] = [];
  const add = (m: Mesh, parent: TransformNode = root) => {
    m.parent = parent;
    meshes.push(m);
    m.rotation.x = m.rotation.x || 0;
    return m;
  };
  // Lathe profiles are around Y; rotate a holder so Y → +Z
  const holder = new TransformNode('lensHolder', scene);
  holder.parent = root;
  holder.rotation.x = Math.PI / 2;
  // Babylon lathe: Y up → after rotation.x = +90°, +Y maps to +Z? (x-rotation by +90 maps Y → Z in left-handed)
  // Mount flange (chrome bayonet)
  add(lathe('mount', scene, [[R * 0.78, 0], [R * 0.92, 0], [R * 0.92, 0.004], [R * 0.86, 0.006]], 64), holder).material = mats.chrome(0.18);
  // Aperture ring
  const apRing = new TransformNode('apertureRing', scene);
  apRing.parent = holder;
  const aps = aperturesFor(model);
  const apTex = bandTexture(scene, aps.map((a) => (a < 10 ? String(a) : String(Math.round(a)))), { span: 0.3, color: '#ebe7dc', colors: aps.map((_, i) => (i === aps.length - 1 ? '#d9862a' : '#ebe7dc')), size: 46 });
  const apMat = new PBRMaterial('apMat', scene);
  apMat.albedoTexture = apTex;
  apMat.metallic = 0.3;
  apMat.roughness = 0.5;
  const apMesh = add(MeshBuilder.CreateCylinder('apRing', { diameter: R * 2, height: 0.008, tessellation: 64 }, scene), apRing);
  apMesh.position.y = 0.0105;
  apMesh.material = apMat;
  // Little ribs on the aperture ring
  const apGrip = add(ring('apGrip', scene, R * 1.012, R * 0.95, 0.003, 64), apRing);
  apGrip.position.y = 0.0075;
  apGrip.material = mats.ribbed(10);
  // DOF scale band
  const dofBand = add(lathe('dof', scene, [[R * 0.96, 0.0145], [R * 0.96, 0.02]], 64), holder);
  dofBand.material = body;
  // Focus ring
  const focusRing = new TransformNode('focusRing', scene);
  focusRing.parent = holder;
  const fz0 = 0.021;
  const fz1 = L - 0.012;
  const gripMat = st.grip === 'rubber' ? mats.ribbed(48) : st.grip === 'knurl' ? mats.knurled(8, 1, st.finish === 'chrome' ? new Color3(0.7, 0.7, 0.72) : new Color3(0.03, 0.03, 0.03), st.finish === 'chrome' ? 1 : 0.4) : mats.satinChrome();
  const grip = add(lathe('focusGrip', scene, [[R * 1.0, fz0], [R * 1.045, fz0 + 0.002], [R * 1.045, fz1 - 0.002], [R * 1.0, fz1]], 96), focusRing);
  grip.material = gripMat;
  const dist = ['∞', '10', '5', '3', '2', '1.5', '1', String(model.minFocus)];
  const distTex = bandTexture(scene, dist, { span: 0.4, size: 40, bg: st.finish === 'chrome' ? '#b9b9bb' : '#060606', color: st.finish === 'chrome' ? '#151515' : '#e9e5da' });
  const distMat = new PBRMaterial('distMat', scene);
  distMat.albedoTexture = distTex;
  distMat.metallic = st.finish === 'chrome' ? 1 : 0.2;
  distMat.roughness = 0.35;
  const distBand = add(MeshBuilder.CreateCylinder('distBand', { diameter: R * 2.0, height: 0.006, tessellation: 64 }, scene), focusRing);
  distBand.position.y = fz0 - 0.0005;
  distBand.material = distMat;
  // Barrel toward front
  const front = add(
    lathe('front', scene, [[R * 0.98, fz1], [R * 0.98, L - 0.004], [R * 0.95, L], [st.frontRadius * 1.18, L], [st.frontRadius * 1.12, L - 0.003], [st.frontRadius * 1.05, L - 0.006]], 64),
    holder,
  );
  front.material = st.finish === 'zebra' ? mats.satinChrome() : body;
  // Name ring (annulus) on the front
  const nameTex = annulusTexture(scene, st.nameText, '#e8e4d8');
  const nameMat = new PBRMaterial('nameMat', scene);
  nameMat.albedoTexture = nameTex;
  nameMat.metallic = 0;
  nameMat.roughness = 0.6;
  const nameDisc = add(MeshBuilder.CreateDisc('nameDisc', { radius: R * 0.94, tessellation: 64 }, scene), holder);
  nameDisc.rotation.x = -Math.PI / 2;
  nameDisc.position.y = L - 0.0035;
  nameDisc.material = nameMat;
  // Inner black tube
  const inner = add(lathe('inner', scene, [[st.frontRadius * 1.05, L - 0.006], [st.frontRadius * 1.0, L - 0.02]], 48), holder);
  inner.material = mats.rubber();
  // Iris (rebuilt on aperture change)
  let iris: Mesh | null = null;
  const blades = Math.max(5, model.blades);
  const setAperture = (n: number) => {
    iris?.dispose();
    const open = Math.min(1, model.maxAperture / n);
    const ir = st.frontRadius * (0.15 + 0.82 * open);
    iris = MeshBuilder.CreateDisc('iris', { radius: st.frontRadius * 1.02, tessellation: 48 }, scene);
    // ring: use a lathe with polygonal hole
    iris.dispose();
    iris = lathe('iris', scene, [[ir, 0], [st.frontRadius * 1.02, 0]], blades);
    iris.parent = holder;
    iris.position.y = L - 0.016;
    iris.material = mats.plastic(new Color3(0.012, 0.012, 0.014), 0.55);
    apRing.rotation.y = (aps.indexOf(n) / Math.max(1, aps.length - 1)) * 0.6;
  };
  setAperture(model.maxAperture);
  // Front glass element: shallow dome
  const dome: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    const rr = st.frontRadius * Math.sin(a);
    dome.push([rr, L - 0.0075 + st.frontRadius * 0.18 * Math.cos(a)]);
  }
  dome.reverse();
  const glass = lathe('frontGlass', scene, dome.map(([a, b]) => [a, b] as [number, number]).reverse(), 64);
  glass.parent = holder;
  glass.material = mats.coatedGlass(opts.haze ?? 0);
  meshes.push(glass);
  // Rear element (visible from the back)
  const rear = MeshBuilder.CreateDisc('rearGlass', { radius: R * 0.55, tessellation: 48 }, scene);
  rear.parent = holder;
  rear.rotation.x = Math.PI / 2;
  rear.position.y = 0.002;
  rear.material = mats.coatedGlass(opts.haze ?? 0);
  meshes.push(rear);

  const setFocus = (d: number) => {
    const t = Math.min(1, Math.max(0, (1 / Math.max(d, model.minFocus) - 0) / (1 / model.minFocus)));
    focusRing.rotation.y = t * 1.6;
  };
  const setHaze = (h: number, lit: boolean) => {
    const m = mats.coatedGlass(h).clone('hazeGlass') as PBRMaterial;
    if (lit && h > 0.05) {
      m.emissiveColor = new Color3(0.9, 0.88, 0.82).scale(h * 0.6);
    }
    glass.material = m;
  };
  return {
    root,
    length: L,
    radius: R,
    frontGlass: glass,
    focusRing,
    apertureRing: apRing,
    setAperture,
    setFocus,
    setHaze,
    dispose: () => root.dispose(false, true),
  };
}

export function apertureLabel(n: number): string {
  return formatAperture(n);
}

export const LENS_AXIS = new Vector3(0, 0, 1);

/**
 * Procedural camera bodies. Coordinate convention: lens points +Z, top +Y,
 * the photographer's right hand is +X. Units are metres.
 *
 * Every unit looks a little different: cosmetic grade drives scuffs,
 * the variant drives the finish, seals/haze/corrosion are visible when the
 * back / battery door is opened or the torch shines through the lens.
 */
import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, AbstractMesh } from '@babylonjs/core';
import { Mats } from '../render/materials';
import { CameraModel, camera as cameraModel, lens as lensModel, film } from '../sim/data';
import { CameraUnit, LensUnit, variantOf } from '../sim/units';
import { buildLens, LensRig, bandTexture } from './LensBuilder';
import { cyl, lathe, ring, roundedBox, textTexture } from './geom';

export type Hotspot = 'back' | 'lens' | 'shutter' | 'advance' | 'battery' | 'serial' | 'counter' | 'body';

export interface CameraRig {
  root: TransformNode;
  model: CameraModel;
  /** bounding size (w, h, d) of the body without lens */
  size: [number, number, number];
  lens?: LensRig;
  backDoor: TransformNode;
  backOpenAngle: number;
  shutterButton: Mesh;
  advance?: TransformNode;
  batteryDoor?: TransformNode;
  counterTex: DynamicTexture;
  film: TransformNode;
  hotspots: Map<Hotspot, AbstractMesh[]>;
  setCounter(n: number | string): void;
  setFilmLoaded(stockId: string | null): void;
  setBackOpen(t: number): void;
  setBatteryOpen(t: number): void;
  fire(): void;
  windAnim(t: number): void;
  setLensLit(lit: boolean): void;
  dispose(): void;
}

interface Ctx {
  scene: Scene;
  mats: Mats;
  root: TransformNode;
  hot: Map<Hotspot, AbstractMesh[]>;
  finish: 'chrome' | 'black';
  wear: number;
}

function hot(c: Ctx, h: Hotspot, m: AbstractMesh) {
  const a = c.hot.get(h) ?? [];
  a.push(m);
  c.hot.set(h, a);
  m.metadata = { ...(m.metadata ?? {}), hotspot: h };
}

function part(c: Ctx, m: Mesh, mat: PBRMaterial, parent: TransformNode = c.root, h?: Hotspot): Mesh {
  m.parent = parent;
  m.material = mat;
  if (h) hot(c, h, m);
  return m;
}

/** Engraved text decal on a face. normal: 'front' (+Z), 'top' (+Y), 'back' (−Z), 'left'(−X), 'right'(+X) */
function engrave(c: Ctx, text: string | string[], w: number, h: number, x: number, y: number, z: number, normal: 'front' | 'top' | 'back' | 'right' | 'left', o: { color?: string; font?: string; parent?: TransformNode; bg?: string } = {}): Mesh {
  const lines = Array.isArray(text) ? text : [text];
  const aspect = w / h;
  const tw = 1024;
  const th = Math.max(32, Math.round(tw / aspect));
  const tex = textTexture(c.scene, lines, { w: tw, h: th, color: o.color ?? (c.finish === 'black' ? '#e7e2d5' : '#141414'), font: o.font ?? `600 ${Math.round((th / lines.length) * 0.72)}px Jost`, bg: o.bg });
  const mat = new PBRMaterial(`eng-${lines[0]}`, c.scene);
  mat.albedoTexture = tex;
  mat.useAlphaFromAlbedoTexture = !o.bg;
  mat.transparencyMode = o.bg ? null : 1;
  mat.alphaCutOff = 0.35;
  mat.metallic = 0;
  mat.roughness = 0.55;
  const p = MeshBuilder.CreatePlane(`eng-${lines[0]}`, { width: w, height: h }, c.scene);
  p.parent = o.parent ?? c.root;
  p.material = mat;
  p.position.set(x, y, z);
  const e = 0.00025;
  switch (normal) {
    case 'front':
      p.rotation.y = Math.PI;
      p.position.z += e;
      break;
    case 'back':
      p.position.z -= e;
      break;
    case 'top':
      p.rotation.x = Math.PI / 2;
      p.position.y += e;
      break;
    case 'right':
      p.rotation.y = -Math.PI / 2;
      p.position.x += e;
      break;
    case 'left':
      p.rotation.y = Math.PI / 2;
      p.position.x -= e;
      break;
  }
  return p;
}

function knob(c: Ctx, r: number, h: number, x: number, y: number, z: number, mat: PBRMaterial, knurl = true): TransformNode {
  const n = new TransformNode('knob', c.scene);
  n.parent = c.root;
  n.position.set(x, y, z);
  const base = cyl('knobBase', c.scene, r * 2, h, 48);
  base.parent = n;
  base.position.y = h / 2;
  base.material = knurl ? c.mats.knurled(4, 0.5, c.finish === 'black' ? new Color3(0.02, 0.02, 0.02) : new Color3(0.75, 0.75, 0.77), c.finish === 'black' ? 0.3 : 1) : mat;
  const top = cyl('knobTop', c.scene, r * 1.9, h * 0.15, 48);
  top.parent = n;
  top.position.y = h;
  top.material = mat;
  return n;
}

/** Body shell: leatherette wrap with a metal top & bottom plate */
function shell(c: Ctx, w: number, h: number, d: number, topH: number, botH: number, r: number, leatherBrown = false) {
  const plate = c.finish === 'black' ? c.mats.blackPaint() : c.mats.satinChrome();
  const mid = roundedBox('body', c.scene, w * 0.995, h - topH - botH + 0.002, d * 0.995, r * 0.95, 5, 18);
  part(c, mid, c.mats.leatherette(1, 1, leatherBrown), c.root, 'body');
  mid.position.y = (botH - topH) / 2;
  const top = roundedBox('topPlate', c.scene, w, topH, d, r, 5);
  part(c, top, plate, c.root, 'body');
  top.position.y = h / 2 - topH / 2;
  const bot = roundedBox('botPlate', c.scene, w, botH, d, r, 5);
  part(c, bot, plate, c.root, 'body');
  bot.position.y = -h / 2 + botH / 2;
  return { top, bot, mid, plate };
}

function wearOverlay(c: Ctx, meshes: Mesh[]) {
  // Scuffed units: rougher, slightly lighter plate (brassing for black finish)
  if (c.wear < 0.35) return;
  for (const m of meshes) {
    const mat = (m.material as PBRMaterial).clone(`${m.name}-worn`) as PBRMaterial;
    mat.roughness = Math.min(1, (mat.roughness ?? 0.3) + c.wear * 0.25);
    if (c.finish === 'black') mat.albedoColor = mat.albedoColor.add(new Color3(0.05, 0.035, 0.015).scale(c.wear));
    m.material = mat;
  }
}

function sealsMaterial(c: Ctx, condition: number): PBRMaterial {
  const m = new PBRMaterial('seals', c.scene);
  if (condition > 0.5) {
    m.albedoColor = new Color3(0.012, 0.012, 0.012);
    m.roughness = 0.95;
  } else {
    // decomposed foam: sticky glossy tar
    m.albedoColor = new Color3(0.02, 0.015, 0.01);
    m.roughness = 0.12 + condition * 0.4;
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 1 - condition;
  }
  m.metallic = 0;
  return m;
}

function filmGroup(c: Ctx, w: number, h: number, d: number, cassetteR: number): { node: TransformNode; label: PBRMaterial } {
  const node = new TransformNode('film', c.scene);
  node.parent = c.root;
  const cas = cyl('cassette', c.scene, cassetteR * 2, h * 0.62, 32);
  cas.parent = node;
  cas.position.set(-w * 0.38, 0, -d * 0.05);
  const label = new PBRMaterial('cassetteLabel', c.scene);
  label.albedoColor = new Color3(0.8, 0.6, 0.05);
  label.roughness = 0.35;
  label.metallic = 0.3;
  cas.material = label;
  const strip = MeshBuilder.CreatePlane('filmStrip', { width: w * 0.66, height: h * 0.5 }, c.scene);
  strip.parent = node;
  strip.position.set(0, 0, -d * 0.18);
  strip.material = c.mats.plastic(new Color3(0.16, 0.11, 0.07), 0.25);
  node.setEnabled(false);
  return { node, label };
}

export function buildCamera(scene: Scene, mats: Mats, unit: CameraUnit, lensUnit?: LensUnit): CameraRig {
  const model = cameraModel(unit.modelId);
  const variant = variantOf(unit);
  const root = new TransformNode(`cam-${unit.id}`, scene);
  const c: Ctx = { scene, mats, root, hot: new Map(), finish: variant.finish, wear: (10 - unit.traits.cosmetic) / 10 };
  switch (model.kind) {
    case 'tlr':
      return buildTLR(c, model, unit);
    case 'super8':
      return buildSuper8(c, model, unit);
    default:
      return buildBox(c, model, unit, lensUnit);
  }
}

function counterTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('counter', { width: 128, height: 128 }, scene, true);
  return t;
}

function drawCounter(t: DynamicTexture, n: number | string) {
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = typeof n === 'number' && n === 0 ? '#d8452a' : '#efeadd';
  ctx.font = '700 70px Jost';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeof n === 'number' ? (n === 0 ? 'S' : String(n)) : n, 64, 68);
  t.update(true);
}

/** 35mm bodies: zone-focus compact, rangefinder, SLR */
function buildBox(c: Ctx, model: CameraModel, unit: CameraUnit, lensUnit?: LensUnit): CameraRig {
  const { scene, mats, root } = c;
  const slr = model.kind === 'slr';
  const leica = model.id === 'leicam3';
  const trip = model.id === 'trip35';
  const w = leica ? 0.138 : slr ? 0.142 : trip ? 0.116 : model.id === 'electro35' ? 0.138 : 0.12;
  const h = leica ? 0.077 : slr ? 0.09 : trip ? 0.072 : model.id === 'electro35' ? 0.083 : 0.074;
  const d = leica ? 0.033 : slr ? 0.05 : trip ? 0.042 : 0.044;
  const r = leica ? d / 2 - 0.0005 : 0.005;
  const topH = slr ? 0.016 : trip ? 0.016 : 0.022;
  const botH = slr ? 0.008 : 0.006;
  const sh = shell(c, w, h, d, topH, botH, r);
  const plate = sh.plate;
  const chromeAccent = mats.chrome(0.12);

  // Viewfinder windows / prism
  if (slr) {
    const ph = 0.03;
    const pr = roundedBox('prismBase', scene, 0.058, ph * 0.55, d * 0.82, 0.004, 4);
    part(c, pr, plate, root, 'body');
    pr.position.set(0, h / 2 + ph * 0.25, -0.002);
    const roof = roundedBox('prismRoof', scene, 0.044, ph * 0.5, d * 0.5, 0.004, 4);
    part(c, roof, plate, root, 'body');
    roof.position.set(0, h / 2 + ph * 0.62, -0.006);
    roof.rotation.x = 0.0;
    const front = roundedBox('prismFront', scene, 0.05, ph * 0.66, 0.012, 0.003, 4);
    part(c, front, plate, root, 'body');
    front.position.set(0, h / 2 + ph * 0.42, d * 0.22);
    front.rotation.x = -0.55;
    engrave(c, model.maker.replace('Asahi ', '').toUpperCase(), 0.04, 0.008, 0, h / 2 + ph * 0.46, d * 0.22 + 0.0045, 'front', { parent: root });
    // eyepiece
    const eye = roundedBox('eyepiece', scene, 0.022, 0.016, 0.008, 0.003, 3);
    part(c, eye, mats.rubber(), root);
    eye.position.set(0, h / 2 + 0.012, -d / 2 - 0.003);
  } else {
    const vfX = trip ? -0.032 : leica ? -0.044 : -0.035;
    const vf = roundedBox('vfWindow', scene, leica ? 0.022 : 0.016, leica ? 0.014 : 0.011, 0.002, 0.0015, 3);
    part(c, vf, mats.glass(new Color3(0.6, 0.65, 0.68), 0.55, 0.01), root, 'body');
    vf.position.set(vfX, h / 2 - topH / 2, d / 2 + 0.0006);
    const vfFrame = roundedBox('vfFrame', scene, (leica ? 0.022 : 0.016) + 0.003, (leica ? 0.014 : 0.011) + 0.003, 0.0016, 0.002, 3);
    part(c, vfFrame, chromeAccent, root);
    vfFrame.position.set(vfX, h / 2 - topH / 2, d / 2 + 0.0002);
    if (model.focus === 'rangefinder') {
      const rfX = vfX + (model.rfBase ?? 0.04);
      const rf = roundedBox('rfWindow', scene, 0.011, 0.009, 0.002, 0.0015, 3);
      part(c, rf, mats.glass(new Color3(0.75, 0.7, 0.4), 0.5, 0.01), root);
      rf.position.set(rfX, h / 2 - topH / 2, d / 2 + 0.0006);
      if (leica) {
        const frost = roundedBox('frost', scene, 0.016, 0.01, 0.002, 0.001, 2);
        part(c, frost, mats.glass(new Color3(0.95, 0.95, 0.95), 0.85, 0.6), root);
        frost.position.set((vfX + rfX) / 2, h / 2 - topH / 2, d / 2 + 0.0006);
      }
    }
    // eyepiece on back
    const eye = roundedBox('eyepiece', scene, 0.012, 0.009, 0.002, 0.001, 2);
    part(c, eye, mats.glass(new Color3(0.2, 0.22, 0.25), 0.8, 0.02), root);
    eye.position.set(vfX, h / 2 - topH / 2, -d / 2 - 0.0006);
    // brand on the top plate front
    engrave(c, model.maker.toUpperCase(), 0.034, 0.0065, trip ? 0.006 : 0.004, h / 2 - topH / 2 + (leica ? 0.003 : 0), d / 2 + 0.0004, 'front');
  }

  // Shutter button, advance lever, rewind knob, counter
  const shutterButton = cyl('shutterBtn', scene, trip ? 0.011 : 0.007, 0.004, 32);
  part(c, shutterButton, trip ? (variant(unit).finish === 'black' || unit.variantId === 'black' ? mats.blackPaint() : chromeAccent) : chromeAccent, root, 'shutter');
  shutterButton.position.set(w * 0.33, h / 2 + 0.002, d * 0.12);
  const collar = ring('collar', scene, 0.0065, 0.0035, 0.003);
  part(c, collar, plate, root);
  collar.position.set(w * 0.33, h / 2 + 0.0015, d * 0.12);

  let advance: TransformNode | undefined;
  if (trip) {
    // thumbwheel on the back
    advance = new TransformNode('thumbwheel', scene);
    advance.parent = root;
    advance.position.set(w * 0.38, h / 2 - 0.004, -d / 2 + 0.002);
    const wheel = cyl('wheel', scene, 0.016, 0.006, 48);
    wheel.parent = advance;
    wheel.rotation.z = Math.PI / 2;
    wheel.material = mats.knurled(6, 1, new Color3(0.02, 0.02, 0.02), 0.2);
    hot(c, 'advance', wheel);
  } else {
    advance = new TransformNode('advanceLever', scene);
    advance.parent = root;
    advance.position.set(w * 0.4, h / 2 + 0.003, -d * 0.1);
    const hub = cyl('advHub', scene, 0.012, 0.004, 32);
    hub.parent = advance;
    hub.material = chromeAccent;
    const arm = roundedBox('advArm', scene, 0.032, 0.0025, 0.007, 0.0012, 2);
    arm.parent = advance;
    arm.position.set(-0.012, 0.002, -0.008);
    arm.rotation.y = -0.45;
    arm.material = chromeAccent;
    const tip = roundedBox('advTip', scene, 0.008, 0.005, 0.008, 0.0024, 2);
    tip.parent = advance;
    tip.position.set(-0.026, 0.002, -0.017);
    tip.material = mats.plastic(new Color3(0.02, 0.02, 0.02), 0.4);
    hot(c, 'advance', arm);
    hot(c, 'advance', tip);
  }
  const rewind = knob(c, 0.008, 0.007, -w * 0.38, h / 2, 0, chromeAccent);
  void rewind;
  // Shutter speed dial (SLR, Leica)
  if (slr || leica) {
    const labels = model.speeds.slice().reverse().filter((_, i) => i % 1 === 0).map((s) => (s >= 1 ? `${s}` : String(Math.round(1 / s)))).slice(0, 8);
    const dialTex = bandTexture(scene, labels, { span: 0.5, size: 34 });
    const dialMat = new PBRMaterial('dialMat', scene);
    dialMat.albedoTexture = dialTex;
    dialMat.metallic = 0.4;
    dialMat.roughness = 0.4;
    const dial = cyl('speedDial', scene, 0.024, 0.0055, 64);
    dial.parent = root;
    dial.position.set(w * 0.2, h / 2 + 0.003, -0.002);
    dial.material = dialMat;
    const dialTop = cyl('dialTop', scene, 0.021, 0.001, 64);
    dialTop.parent = root;
    dialTop.position.set(w * 0.2, h / 2 + 0.006, -0.002);
    dialTop.material = c.finish === 'black' ? mats.blackPaint() : chromeAccent;
  }
  // Frame counter window
  const counterTex = counterTexture(scene);
  drawCounter(counterTex, 0);
  const counterMat = new PBRMaterial('counterMat', scene);
  counterMat.albedoTexture = counterTex;
  counterMat.roughness = 0.2;
  counterMat.metallic = 0;
  counterMat.emissiveTexture = counterTex;
  counterMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
  const counter = MeshBuilder.CreateDisc('counter', { radius: 0.0042, tessellation: 32 }, scene);
  counter.parent = root;
  counter.rotation.x = Math.PI / 2;
  counter.position.set(w * 0.4, h / 2 + 0.0009, d * 0.18);
  counter.material = counterMat;
  hot(c, 'counter', counter);
  const counterBezel = ring('counterBezel', scene, 0.0055, 0.0042, 0.0012);
  part(c, counterBezel, chromeAccent, root);
  counterBezel.position.set(w * 0.4, h / 2 + 0.0004, d * 0.18);

  // Accessory shoe
  if (!trip) {
    const shoe = roundedBox('shoe', scene, 0.018, 0.0035, 0.018, 0.0008, 2);
    part(c, shoe, chromeAccent, root);
    shoe.position.set(slr ? 0 : -0.002, h / 2 + (slr ? 0.031 : 0.0018), slr ? -0.006 : -0.002);
  }

  // Serial number on the top plate
  const serial = engrave(c, `No. ${unit.serial}`, 0.026, 0.0045, -w * 0.18, h / 2 + 0.00005, -d * 0.25, 'top', { color: c.finish === 'black' ? '#d9d4c6' : '#202020' });
  hot(c, 'serial', serial);
  engrave(c, model.name.toUpperCase(), 0.03, 0.0048, w * 0.08, h / 2 + 0.00005, d * 0.3, 'top', { color: c.finish === 'black' ? '#d9d4c6' : '#202020' });

  // Lens
  let lens: LensRig | undefined;
  const lm = model.mount === 'fixed' ? lensModel(model.fixedLens!) : lensUnit ? lensModel(lensUnit.modelId) : undefined;
  const lensX = slr ? 0 : trip ? 0.012 : leica ? 0.0 : 0.012;
  const lensY = slr ? -0.004 : trip ? -0.004 : -0.006;
  if (lm) {
    lens = buildLens(scene, mats, lm, { haze: lensUnit?.haze ?? unit.traits.haze, fungus: lensUnit?.fungus ?? unit.traits.fungus });
    lens.root.parent = root;
    lens.root.position.set(lensX, lensY, d / 2 + (slr ? 0.002 : 0.0));
    const s = slr ? 1 : trip ? 0.78 : leica ? 0.82 : 0.86;
    lens.root.scaling.setAll(s);
    for (const m of lens.root.getChildMeshes()) hot(c, 'lens', m);
    if (!slr && model.mount === 'fixed') {
      // leaf shutter housing / speed ring behind the lens
      const housing = lathe('shutterHousing', scene, [[0.022, 0], [0.024, 0.002], [0.024, 0.01], [0.021, 0.012]], 64);
      housing.parent = root;
      housing.rotation.x = Math.PI / 2;
      housing.position.set(lensX, lensY, d / 2 - 0.001);
      housing.material = trip ? mats.satinBlack() : chromeAccent;
      if (trip) {
        // selenium cell: bubbly ring around the lens
        const cell = ring('seleniumCell', scene, 0.026, 0.0195, 0.003, 64);
        cell.parent = root;
        cell.rotation.x = Math.PI / 2;
        cell.position.set(lensX, lensY, d / 2 + 0.006);
        cell.material = mats.textured('leatherette', 1, 1, new Color3(3.5, 3.5, 3.6), 2.5);
        (cell.material as PBRMaterial).roughness = 0.12;
      }
      if (model.meter === 'cds' && model.id === 'ql17') {
        const eye = cyl('meterEye', scene, 0.008, 0.003, 32);
        eye.parent = root;
        eye.rotation.x = Math.PI / 2;
        eye.position.set(lensX + 0.018, lensY + 0.016, d / 2 + 0.012);
        eye.material = mats.glass(new Color3(0.3, 0.3, 0.32), 0.9, 0.05);
      }
    } else if (slr) {
      const mountRing = ring('mountRing', scene, 0.03, 0.026, 0.004, 64);
      mountRing.parent = root;
      mountRing.rotation.x = Math.PI / 2;
      mountRing.position.set(0, lensY, d / 2 + 0.001);
      mountRing.material = chromeAccent;
    }
  } else if (slr) {
    // body cap
    const capM = cyl('bodyCap', scene, 0.054, 0.008, 48);
    capM.parent = root;
    capM.rotation.x = Math.PI / 2;
    capM.position.set(0, lensY, d / 2 + 0.004);
    capM.material = mats.plastic(new Color3(0.02, 0.02, 0.02), 0.5);
  }

  // Back door (hinged on photographer's left, -X)
  const backDoor = new TransformNode('backDoorPivot', scene);
  backDoor.parent = root;
  backDoor.position.set(-w / 2 + 0.004, 0, -d / 2 + 0.006);
  const doorPanel = roundedBox('backDoor', scene, w - 0.01, h - topH - botH - 0.002, 0.006, 0.002, 3, 18);
  doorPanel.parent = backDoor;
  doorPanel.position.set((w - 0.01) / 2 - 0.0002, (botH - topH) / 2, -0.0035);
  doorPanel.material = mats.leatherette(1, 1);
  hot(c, 'back', doorPanel);
  // pressure plate inside the door
  const pp = MeshBuilder.CreatePlane('pressurePlate', { width: 0.05, height: 0.03 }, scene);
  pp.parent = backDoor;
  pp.position.set((w - 0.01) / 2, (botH - topH) / 2, 0.0005);
  pp.material = mats.chrome(0.2);
  // interior: dark film chamber visible when the door opens
  const interior = MeshBuilder.CreatePlane('interior', { width: w - 0.012, height: h - topH - botH - 0.004 }, scene);
  interior.parent = root;
  interior.position.set(0, (botH - topH) / 2, -d / 2 + 0.008);
  interior.rotation.y = Math.PI;
  interior.material = mats.plastic(new Color3(0.012, 0.012, 0.012), 0.8);
  interior.rotation.y = 0;
  const gate = MeshBuilder.CreatePlane('gate', { width: 0.04, height: 0.028 }, scene);
  gate.parent = root;
  gate.position.set(lensX * 0.3, lensY, -d / 2 + 0.0075);
  gate.material = mats.plastic(new Color3(0.0, 0.0, 0.0), 0.9);
  // Light seals along hinge and latch, plus the top channel
  const sm = sealsMaterial(c, unit.traits.seals);
  const sealStrips: Mesh[] = [];
  const mkSeal = (sx: number, sy: number, sw: number, sh2: number) => {
    const s = MeshBuilder.CreateBox('seal', { width: sw, height: sh2, depth: 0.0012 }, scene);
    s.parent = root;
    s.position.set(sx, sy, -d / 2 + 0.0068);
    s.material = sm;
    if (unit.traits.seals < 0.5) s.scaling.set(1, 1, 0.5 + Math.random() * 0.8);
    sealStrips.push(s);
  };
  mkSeal(-w / 2 + 0.006, (botH - topH) / 2, 0.0025, h - topH - botH - 0.006);
  mkSeal(w / 2 - 0.006, (botH - topH) / 2, 0.0025, h - topH - botH - 0.006);
  mkSeal(0, h / 2 - topH - 0.0015, w - 0.02, 0.002);

  // Battery door (on the bottom plate for metered bodies)
  let batteryDoor: TransformNode | undefined;
  if (model.meter === 'cds' || model.meter === 'ttl' || model.meter === 'auto') {
    batteryDoor = new TransformNode('batteryDoor', scene);
    batteryDoor.parent = root;
    batteryDoor.position.set(w * 0.28, -h / 2 - 0.0002, 0);
    const bd = cyl('batteryCap', scene, 0.016, 0.0018, 40);
    bd.parent = batteryDoor;
    bd.material = c.finish === 'black' ? mats.blackPaint() : mats.chrome(0.18);
    const slot = MeshBuilder.CreateBox('slot', { width: 0.01, height: 0.0006, depth: 0.0012 }, scene);
    slot.parent = batteryDoor;
    slot.position.y = -0.001;
    slot.material = mats.rubber();
    hot(c, 'battery', bd);
    // corroded battery inside
    const batt = cyl('battery', scene, 0.0115, 0.005, 24);
    batt.parent = root;
    batt.position.set(w * 0.28, -h / 2 + 0.003, 0);
    const corr = unit.traits.corrosion;
    const battMat = mats.base('batt', corr > 0.4 ? new Color3(0.25, 0.38, 0.22) : new Color3(0.75, 0.75, 0.77), corr > 0.4 ? 0 : 1, corr > 0.4 ? 0.9 : 0.25);
    batt.material = battMat;
  }

  // Strap lugs
  for (const sx of [-1, 1]) {
    const lug = ring('lug', scene, 0.0028, 0.0016, 0.002, 16);
    lug.parent = root;
    lug.rotation.z = Math.PI / 2;
    lug.position.set(sx * (w / 2 + 0.001), h / 2 - topH - 0.003, 0);
    lug.material = chromeAccent;
  }
  wearOverlay(c, [sh.top, sh.bot]);

  const filmG = filmGroup(c, w, h - topH - botH, d, 0.0125);
  const rig = makeRig(c, model, [w, h, d], lens, backDoor, -1.9, shutterButton, advance, batteryDoor, counterTex, filmG);
  return rig;
}

function variant(unit: CameraUnit) {
  return variantOf(unit);
}

function buildTLR(c: Ctx, model: CameraModel, unit: CameraUnit): CameraRig {
  const { scene, mats, root } = c;
  const rollei = model.id === 'rollei28f';
  const w = 0.1;
  const h = 0.142;
  const d = 0.092;
  const r = 0.006;
  const sh = shell(c, w, h, d, 0.006, 0.006, r);
  const chrome = mats.chrome(0.12);
  const boardMat = rollei ? mats.blackPaint() : mats.satinBlack();
  // Lens board (raised front plate)
  const board = roundedBox('lensBoard', scene, w * 0.82, h * 0.78, 0.022, 0.004, 4);
  part(c, board, boardMat, root, 'body');
  board.position.set(0, -h * 0.02, d / 2 + 0.009);
  const lm = lensModel(model.fixedLens!);
  // Taking lens (bottom) and viewing lens (top)
  const take = buildLens(scene, mats, lm, { haze: unit.traits.haze, fungus: unit.traits.fungus });
  take.root.parent = root;
  take.root.position.set(0, -h * 0.2, d / 2 + 0.019);
  take.root.scaling.setAll(0.9);
  for (const m of take.root.getChildMeshes()) hot(c, 'lens', m);
  const view = lathe('viewLens', scene, [[0.019, 0], [0.02, 0.012], [0.018, 0.016]], 64);
  view.parent = root;
  view.rotation.x = Math.PI / 2;
  view.position.set(0, h * 0.2, d / 2 + 0.019);
  view.material = mats.satinBlack();
  const vg = MeshBuilder.CreateDisc('viewGlass', { radius: 0.0165, tessellation: 48 }, scene);
  vg.parent = root;
  vg.rotation.y = Math.PI;
  vg.position.set(0, h * 0.2, d / 2 + 0.034);
  vg.material = mats.coatedGlass(0);
  // Shutter speed / aperture wheels flanking the taking lens
  const shutterRing = ring('tlrShutter', scene, 0.03, 0.024, 0.008, 64);
  shutterRing.parent = root;
  shutterRing.rotation.x = Math.PI / 2;
  shutterRing.position.set(0, -h * 0.2, d / 2 + 0.022);
  shutterRing.material = rollei ? mats.satinBlack() : chrome;
  // Nameplate between lenses
  const plate = roundedBox('nameplate', scene, 0.06, 0.012, 0.004, 0.002, 3);
  part(c, plate, rollei ? mats.blackPaint() : chrome, root);
  plate.position.set(0, h * 0.02, d / 2 + 0.021);
  engrave(c, rollei ? 'Rolleiflex' : 'YASHICA', 0.05, 0.009, 0, h * 0.02, d / 2 + 0.023, 'front', { color: rollei ? '#e8e3d5' : '#131313', font: rollei ? 'italic 600 150px Jost' : undefined });
  // Waist level finder hood
  const hood = roundedBox('hood', scene, w * 0.86, 0.028, d * 0.8, 0.003, 3);
  part(c, hood, mats.blackPaint(), root, 'body');
  hood.position.set(0, h / 2 + 0.014, -0.004);
  const hoodLid = roundedBox('hoodLid', scene, w * 0.84, 0.002, d * 0.78, 0.001, 2);
  part(c, hoodLid, mats.satinBlack(), root);
  hoodLid.position.set(0, h / 2 + 0.029, -0.004);
  engrave(c, model.name.toUpperCase(), 0.05, 0.007, 0, h / 2 + 0.03, 0, 'top', { color: '#d8d3c5' });
  // Focus knob (left) and crank / wind knob (right)
  const fk = cyl('focusKnob', scene, 0.034, 0.01, 48);
  fk.parent = root;
  fk.rotation.z = Math.PI / 2;
  fk.position.set(-w / 2 - 0.005, h * 0.05, 0);
  fk.material = mats.knurled(6, 1, new Color3(0.02, 0.02, 0.02), 0.2);
  const advance = new TransformNode('crank', scene);
  advance.parent = root;
  advance.position.set(w / 2 + 0.004, h * 0.05, 0);
  const crankHub = cyl('crankHub', scene, 0.026, 0.008, 48);
  crankHub.parent = advance;
  crankHub.rotation.z = Math.PI / 2;
  crankHub.material = chrome;
  hot(c, 'advance', crankHub);
  const crankArm = roundedBox('crankArm', scene, 0.004, 0.03, 0.008, 0.0015, 2);
  crankArm.parent = advance;
  crankArm.position.set(0.006, -0.012, 0);
  crankArm.material = chrome;
  hot(c, 'advance', crankArm);
  const counterTex = counterTexture(scene);
  drawCounter(counterTex, 0);
  const cm = new PBRMaterial('counterMat', scene);
  cm.albedoTexture = counterTex;
  cm.emissiveTexture = counterTex;
  cm.emissiveColor = new Color3(0.15, 0.15, 0.15);
  const counter = MeshBuilder.CreatePlane('counter', { width: 0.008, height: 0.008 }, scene);
  counter.parent = root;
  counter.rotation.y = -Math.PI / 2;
  counter.position.set(w / 2 + 0.0003, h * 0.25, -0.01);
  counter.material = cm;
  hot(c, 'counter', counter);
  // Shutter release on the front lower left
  const shutterButton = cyl('shutterBtn', scene, 0.008, 0.006, 32);
  shutterButton.parent = root;
  shutterButton.rotation.x = Math.PI / 2;
  shutterButton.position.set(-w * 0.32, -h * 0.36, d / 2 + 0.004);
  shutterButton.material = chrome;
  hot(c, 'shutter', shutterButton);
  // Serial on the side
  const serial = engrave(c, `No. ${unit.serial}`, 0.03, 0.005, -w / 2, -h * 0.3, -0.01, 'left', { color: '#d9d4c6' });
  hot(c, 'serial', serial);
  // Back door hinged at the bottom
  const backDoor = new TransformNode('backDoorPivot', scene);
  backDoor.parent = root;
  backDoor.position.set(0, -h / 2 + 0.006, -d / 2 + 0.003);
  const door = roundedBox('backDoor', scene, w - 0.008, h - 0.014, 0.004, 0.002, 3, 18);
  door.parent = backDoor;
  door.position.set(0, (h - 0.014) / 2, -0.002);
  door.material = mats.leatherette(1, 1);
  hot(c, 'back', door);
  const interior = MeshBuilder.CreatePlane('interior', { width: w - 0.01, height: h - 0.016 }, scene);
  interior.parent = root;
  interior.position.set(0, 0, -d / 2 + 0.005);
  interior.material = mats.plastic(new Color3(0.012, 0.012, 0.012), 0.8);
  // Sling lugs
  for (const sx of [-1, 1]) {
    const lug = ring('lug', scene, 0.004, 0.0025, 0.003, 16);
    lug.parent = root;
    lug.rotation.z = Math.PI / 2;
    lug.position.set(sx * (w / 2 + 0.002), h * 0.38, 0);
    lug.material = chrome;
  }
  wearOverlay(c, [sh.top, sh.bot]);
  const filmG = filmGroup(c, w, h * 0.6, d, 0.012);
  return makeRig(c, model, [w, h, d], take, backDoor, 1.7, shutterButton, advance, undefined, counterTex, filmG, true);
}

function buildSuper8(c: Ctx, model: CameraModel, unit: CameraUnit): CameraRig {
  const { scene, mats, root } = c;
  const nizo = model.id === 'nizo560';
  const w = 0.064;
  const h = 0.11;
  const d = 0.2;
  const bodyMat = nizo ? mats.satinBlack() : mats.aluminium();
  const body = roundedBox('s8body', scene, w, h, d, 0.012, 5);
  part(c, body, bodyMat, root, 'body');
  const side = roundedBox('s8side', scene, w + 0.002, h * 0.62, d * 0.62, 0.008, 4, 18);
  part(c, side, mats.leatherette(1, 1), root, 'body');
  side.position.set(0, -h * 0.05, -d * 0.08);
  // pistol grip
  const grip = roundedBox('grip', scene, 0.034, 0.1, 0.045, 0.014, 5, 18);
  part(c, grip, mats.leatherette(1, 1), root, 'body');
  grip.position.set(0, -h / 2 - 0.045, -d * 0.12);
  grip.rotation.x = -0.25;
  const trigger = roundedBox('trigger', scene, 0.012, 0.022, 0.008, 0.003, 3);
  part(c, trigger, mats.chrome(0.15), root, 'shutter');
  trigger.position.set(0, -h / 2 - 0.018, -d * 0.12 + 0.026);
  // zoom lens
  const lm = lensModel(model.fixedLens!);
  const zoom = lathe('zoomLens', scene, [[0.026, 0], [0.028, 0.01], [0.028, 0.07], [0.031, 0.075], [0.031, 0.09], [0.026, 0.092]], 64);
  zoom.parent = root;
  zoom.rotation.x = Math.PI / 2;
  zoom.position.set(0, h * 0.1, d / 2 - 0.005);
  zoom.material = mats.satinBlack();
  hot(c, 'lens', zoom);
  const zr = ring('zoomRing', scene, 0.03, 0.0275, 0.03, 64);
  zr.parent = root;
  zr.rotation.x = Math.PI / 2;
  zr.position.set(0, h * 0.1, d / 2 + 0.03);
  zr.material = mats.ribbed(40);
  const glass = MeshBuilder.CreateDisc('frontGlass', { radius: 0.022, tessellation: 48 }, scene);
  glass.parent = root;
  glass.position.set(0, h * 0.1, d / 2 + 0.084);
  glass.rotation.y = Math.PI;
  glass.material = mats.coatedGlass(unit.traits.haze);
  hot(c, 'lens', glass);
  // eyepiece + cup
  const cup = lathe('eyecup', scene, [[0.012, 0], [0.016, 0.01], [0.02, 0.022], [0.018, 0.024]], 48);
  cup.parent = root;
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(-w * 0.15, h * 0.28, -d / 2);
  cup.material = mats.rubber();
  engrave(c, model.maker.toUpperCase(), 0.05, 0.01, w / 2 + 0.0012, h * 0.3, d * 0.15, 'right', { color: nizo ? '#d7d2c4' : '#111' });
  engrave(c, model.name, 0.05, 0.009, w / 2 + 0.0012, h * 0.2, d * 0.15, 'right', { color: nizo ? '#d7d2c4' : '#111' });
  const serial = engrave(c, `No. ${unit.serial}`, 0.03, 0.005, -w / 2 - 0.0002, -h * 0.35, d * 0.25, 'left', { color: nizo ? '#d7d2c4' : '#202020' });
  hot(c, 'serial', serial);
  // cartridge door on the left side
  const backDoor = new TransformNode('cartDoorPivot', scene);
  backDoor.parent = root;
  backDoor.position.set(-w / 2 - 0.001, 0, d * 0.25);
  const door = roundedBox('cartDoor', scene, 0.004, h * 0.62, d * 0.5, 0.002, 3, 18);
  door.parent = backDoor;
  door.position.set(-0.002, -h * 0.05, -d * 0.25);
  door.material = mats.leatherette(1, 1);
  hot(c, 'back', door);
  const counterTex = counterTexture(scene);
  drawCounter(counterTex, '0');
  const cm = new PBRMaterial('counterMat', scene);
  cm.albedoTexture = counterTex;
  cm.emissiveTexture = counterTex;
  cm.emissiveColor = new Color3(0.15, 0.15, 0.15);
  const counter = MeshBuilder.CreatePlane('counter', { width: 0.01, height: 0.01 }, scene);
  counter.parent = root;
  counter.rotation.y = -Math.PI / 2;
  counter.position.set(w / 2 + 0.0012, h * 0.0, -d * 0.2);
  counter.material = cm;
  hot(c, 'counter', counter);
  const batteryDoor = new TransformNode('batt', scene);
  batteryDoor.parent = root;
  batteryDoor.position.set(0, -h / 2 - 0.095, -d * 0.12 - 0.02);
  const bcap = roundedBox('battCap', scene, 0.028, 0.004, 0.035, 0.002, 2);
  bcap.parent = batteryDoor;
  bcap.material = mats.plastic(new Color3(0.03, 0.03, 0.03));
  hot(c, 'battery', bcap);
  const filmG = filmGroup(c, w * 0.6, h * 0.5, d * 0.3, 0.015);
  filmG.node.position.set(-w * 0.1, -h * 0.05, d * 0.05);
  void lm;
  return makeRig(c, model, [w, h, d], undefined, backDoor, -1.6, trigger, undefined, batteryDoor, counterTex, filmG, false, glass);
}

function makeRig(
  c: Ctx,
  model: CameraModel,
  size: [number, number, number],
  lens: LensRig | undefined,
  backDoor: TransformNode,
  backOpenAngle: number,
  shutterButton: Mesh,
  advance: TransformNode | undefined,
  batteryDoor: TransformNode | undefined,
  counterTex: DynamicTexture,
  filmG: { node: TransformNode; label: PBRMaterial },
  hingeX = false,
  extraGlass?: Mesh,
): CameraRig {
  const baseY = shutterButton.position.y;
  const baseZ = shutterButton.position.z;
  let fireT = 0;
  const obs = c.scene.onBeforeRenderObservable.add(() => {
    if (fireT > 0) {
      fireT = Math.max(0, fireT - c.scene.getEngine().getDeltaTime() / 1000);
      const k = Math.sin((fireT / 0.18) * Math.PI) * 0.0015;
      if (model.kind === 'tlr') shutterButton.position.z = baseZ - k;
      else shutterButton.position.y = baseY - k;
    }
  });
  const rig: CameraRig = {
    root: c.root,
    model,
    size,
    lens,
    backDoor,
    backOpenAngle,
    shutterButton,
    advance,
    batteryDoor,
    counterTex,
    film: filmG.node,
    hotspots: c.hot,
    setCounter: (n) => drawCounter(counterTex, n),
    setFilmLoaded: (stockId) => {
      filmG.node.setEnabled(!!stockId);
      if (stockId) {
        const f = film(stockId);
        const col = f.maker === 'Kodak' ? new Color3(0.85, 0.62, 0.04) : f.maker === 'Ilford' ? new Color3(0.08, 0.08, 0.08) : f.maker === 'Fujifilm' ? new Color3(0.1, 0.45, 0.2) : new Color3(0.6, 0.6, 0.6);
        filmG.label.albedoColor = col;
      }
    },
    setBackOpen: (t) => {
      if (hingeX) backDoor.rotation.x = t * backOpenAngle;
      else backDoor.rotation.y = t * backOpenAngle;
    },
    setBatteryOpen: (t) => {
      if (!batteryDoor) return;
      batteryDoor.position.y = batteryDoor.position.y; // keep
      batteryDoor.getChildMeshes().forEach((m) => (m.position.y = -t * 0.012));
      batteryDoor.rotation.y = t * 1.2;
    },
    fire: () => {
      fireT = 0.18;
    },
    windAnim: (t) => {
      if (!advance) return;
      if (model.kind === 'tlr') advance.rotation.x = -t * Math.PI * 2;
      else if (model.id === 'trip35') advance.rotation.x = t * 3;
      else advance.rotation.y = -Math.sin(t * Math.PI) * 2.2;
    },
    setLensLit: (lit) => {
      const glassMesh = lens?.frontGlass ?? extraGlass;
      if (!glassMesh) return;
      const m = (glassMesh.material as PBRMaterial).clone('lit') as PBRMaterial;
      // haze and fungus scatter the torch beam into a milky glow
      const haze = (c.root.metadata?.haze as number) ?? 0;
      m.emissiveColor = lit ? new Color3(0.85, 0.82, 0.75).scale(0.02 + haze * 0.7) : new Color3(0, 0, 0);
      glassMesh.material = m;
    },
    dispose: () => {
      c.scene.onBeforeRenderObservable.remove(obs);
      c.root.dispose(false, true);
    },
  };
  return rig;
}

export function cameraRigHaze(rig: CameraRig, haze: number, fungus: number) {
  rig.root.metadata = { ...(rig.root.metadata ?? {}), haze: Math.max(haze, fungus * 0.8) };
}

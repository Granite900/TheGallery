/**
 * World owns the scene graph, the static collision list, trigger volumes and
 * FOV zone rectangles, plus all the shared "museum furniture" builders that
 * zone files compose: rooms (floor/ceiling/walls with door gaps), framed
 * procedural paintings, placards, signs, benches and pedestals.
 */
import * as THREE from 'three';
import { CONFIG, type ZoneRect } from '../config';
import type { Aabb } from '../utils/collision';
import { rectContains } from '../utils/collision';
import {
  carpetTexture,
  wallTexture,
  ceilingTexture,
  concreteTexture,
  paintingTexture,
  placardTexture,
} from '../utils/textures';
import type { Interactables } from './systems/Interactables';
import type { PlacardModal } from './ui/PlacardModal';
import type { AudioEngine } from '../audio/AudioEngine';

export type Facing = 'n' | 's' | 'e' | 'w';

export function facingToYaw(f: Facing): number {
  switch (f) {
    case 'n': return Math.PI; // art normal points to -Z
    case 's': return 0; //  +Z
    case 'e': return Math.PI / 2; //  +X
    case 'w': return -Math.PI / 2; // -X
  }
}

export interface DoorGap {
  center: number;
  width: number;
  /** Gap height; defaults to CONFIG.doorHeight. >= room height means no lintel. */
  height?: number;
}
export type SideSpec = 'wall' | 'open' | { doors: DoorGap[] };

export interface RoomSpec {
  rect: ZoneRect;
  height: number;
  sides: { north: SideSpec; south: SideSpec; east: SideSpec; west: SideSpec };
  floor?: 'carpet' | 'concrete' | 'white';
  ceiling?: 'ceiling' | 'white';
  wall?: 'wall' | 'white';
}

export interface Trigger {
  rect: Aabb;
  active: boolean;
  inside: boolean;
  onEnter: () => void;
  onExit?: () => void;
}

export interface FrameHandle {
  group: THREE.Group;
  /** Sticks a little red "cataloged" dot on the frame. */
  addRedDot: () => void;
  /** Swap the painting between its texture and a blank canvas (déjà-vu "wrong detail"). */
  setBlank: (blank: boolean) => void;
}

const T = CONFIG.wallThickness;

export class World {
  readonly scene: THREE.Scene;
  readonly colliders: Aabb[] = [];
  readonly triggers: Trigger[] = [];
  private galleryRects: Aabb[] = [];
  private darkSpotRects: Aabb[] = [];

  private tex: {
    carpet: THREE.CanvasTexture;
    wall: THREE.CanvasTexture;
    ceiling: THREE.CanvasTexture;
    concrete: THREE.CanvasTexture;
  };

  readonly mats: {
    wall: THREE.MeshStandardMaterial;
    white: THREE.MeshStandardMaterial;
    wood: THREE.MeshStandardMaterial;
    gold: THREE.MeshStandardMaterial;
    goldLip: THREE.MeshStandardMaterial;
    blankCanvas: THREE.MeshStandardMaterial;
    plaqueSide: THREE.MeshStandardMaterial;
    benchWood: THREE.MeshStandardMaterial;
    benchLeg: THREE.MeshStandardMaterial;
    pedestal: THREE.MeshStandardMaterial;
    metal: THREE.MeshStandardMaterial;
    darkMetal: THREE.MeshStandardMaterial;
  };

  constructor(
    scene: THREE.Scene,
    private interactables: Interactables,
    private modal: PlacardModal,
    private audio: AudioEngine,
  ) {
    this.scene = scene;
    this.tex = {
      carpet: carpetTexture(CONFIG.seeds.carpet),
      wall: wallTexture(CONFIG.seeds.walls),
      ceiling: ceilingTexture(CONFIG.seeds.walls + 1),
      concrete: concreteTexture(CONFIG.seeds.concrete),
    };
    this.tex.wall.repeat.set(2, 1);

    this.mats = {
      wall: new THREE.MeshStandardMaterial({ map: this.tex.wall, roughness: 0.95, envMapIntensity: 0.2 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.9, envMapIntensity: 0.25 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.72, envMapIntensity: 0.3 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.0 }),
      goldLip: new THREE.MeshStandardMaterial({ color: 0x8a6d1c, metalness: 0.8, roughness: 0.4, envMapIntensity: 0.9 }),
      blankCanvas: new THREE.MeshStandardMaterial({ color: 0xddd8cb, roughness: 0.92 }),
      plaqueSide: new THREE.MeshStandardMaterial({ color: 0xcfc8b2, roughness: 0.7 }),
      benchWood: new THREE.MeshStandardMaterial({ color: 0x4d3a28, roughness: 0.6, envMapIntensity: 0.3 }),
      benchLeg: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.5, roughness: 0.5 }),
      pedestal: new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.65, roughness: 0.45, envMapIntensity: 0.7 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.55, roughness: 0.55 }),
    };
  }

  // -- collision / triggers / zones ----------------------------------------

  addCollider(x1: number, z1: number, x2: number, z2: number): Aabb {
    const box: Aabb = { x1, z1, x2, z2 };
    this.colliders.push(box);
    return box;
  }

  removeCollider(box: Aabb): void {
    const i = this.colliders.indexOf(box);
    if (i !== -1) this.colliders.splice(i, 1);
  }

  addTrigger(rect: Aabb, onEnter: () => void, onExit?: () => void): Trigger {
    const t: Trigger = { rect, active: true, inside: false, onEnter, onExit };
    this.triggers.push(t);
    return t;
  }

  markGallery(rect: ZoneRect): void {
    this.galleryRects.push(rect);
  }

  isGallery(x: number, z: number): boolean {
    return this.galleryRects.some((r) => rectContains(r, x, z));
  }

  /** Registers a rect so Player can apply the subtle footstep dip inside dark spots. */
  addDarkSpotRect(rect: Aabb): void {
    this.darkSpotRects.push(rect);
  }

  isInDarkSpot(x: number, z: number): boolean {
    return this.darkSpotRects.some((r) => rectContains(r, x, z));
  }

  // -- room construction -----------------------------------------------------

  buildRoom(spec: RoomSpec): void {
    const { rect, height } = spec;
    const w = rect.x2 - rect.x1;
    const d = rect.z2 - rect.z1;
    const cx = (rect.x1 + rect.x2) / 2;
    const cz = (rect.z1 + rect.z2) / 2;

    // floor
    const floorTex = (spec.floor === 'concrete' ? this.tex.concrete : this.tex.carpet).clone();
    floorTex.repeat.set(w / 1.6, d / 1.6);
    const floorMat =
      spec.floor === 'white'
        ? new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.85 })
        : new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, envMapIntensity: 0.12 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ceiling
    const ceilTex = this.tex.ceiling.clone();
    ceilTex.repeat.set(w / 1.3, d / 1.3);
    const ceilMat =
      spec.ceiling === 'white'
        ? new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.9 })
        : new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, height, cz);
    this.scene.add(ceil);

    const wallMat = spec.wall === 'white' ? this.mats.white : this.mats.wall;

    // walls (N/S run along X, E/W along Z). N/S walls own the corners; E/W
    // walls are inset a hair to avoid coplanar z-fighting where rooms touch.
    this.buildSide(spec.sides.north, 'x', rect.z1, rect.x1 - T / 2, rect.x2 + T / 2, height, wallMat);
    this.buildSide(spec.sides.south, 'x', rect.z2, rect.x1 - T / 2, rect.x2 + T / 2, height, wallMat);
    this.buildSide(spec.sides.west, 'z', rect.x1, rect.z1 + 0.004, rect.z2 - 0.004, height, wallMat);
    this.buildSide(spec.sides.east, 'z', rect.x2, rect.z1 + 0.004, rect.z2 - 0.004, height, wallMat);
  }

  private buildSide(
    spec: SideSpec,
    axis: 'x' | 'z',
    fixed: number,
    from: number,
    to: number,
    height: number,
    mat: THREE.Material,
  ): void {
    if (spec === 'open') return;
    const gaps = spec === 'wall' ? [] : [...spec.doors].sort((a, b) => a.center - b.center);

    let cur = from;
    for (const g of gaps) {
      const gStart = g.center - g.width / 2;
      const gEnd = g.center + g.width / 2;
      if (gStart > cur + 0.02) this.wallSeg(axis, fixed, cur, gStart, 0, height, mat, true);
      const gh = g.height ?? CONFIG.doorHeight;
      if (gh < height - 0.01) this.wallSeg(axis, fixed, gStart, gEnd, gh, height, mat, false);
      cur = gEnd;
    }
    if (to > cur + 0.02) this.wallSeg(axis, fixed, cur, to, 0, height, mat, true);
  }

  private wallSeg(
    axis: 'x' | 'z',
    fixed: number,
    from: number,
    to: number,
    yBase: number,
    yTop: number,
    mat: THREE.Material,
    collide: boolean,
  ): void {
    const len = to - from;
    const mid = (from + to) / 2;
    const h = yTop - yBase;
    const geo =
      axis === 'x' ? new THREE.BoxGeometry(len, h, T) : new THREE.BoxGeometry(T, h, len);
    const mesh = new THREE.Mesh(geo, mat);
    if (axis === 'x') mesh.position.set(mid, yBase + h / 2, fixed);
    else mesh.position.set(fixed, yBase + h / 2, mid);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) {
      if (axis === 'x') this.addCollider(from, fixed - T / 2, to, fixed + T / 2);
      else this.addCollider(fixed - T / 2, from, fixed + T / 2, to);
    }
  }

  // -- furniture -------------------------------------------------------------

  /**
   * Framed procedural painting. `x/y/z` is a point ON the wall face;
   * `facing` is the direction the artwork looks (its outward normal).
   */
  addFrame(opts: {
    x: number;
    y?: number;
    z: number;
    facing: Facing;
    w: number;
    h: number;
    seed: number;
    gold?: boolean;
    blank?: boolean;
    tiltX?: number;
  }): FrameHandle {
    const { w, h } = opts;
    const group = new THREE.Group();
    group.position.set(opts.x, opts.y ?? 1.5, opts.z);
    group.rotation.y = facingToYaw(opts.facing);
    if (opts.tiltX) group.rotation.x = opts.tiltX;

    const frameMat = opts.gold ? this.mats.gold : this.mats.wood;
    let paintZ: number;
    if (opts.gold) {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.08), frameMat);
      outer.position.z = 0.04;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.09), this.mats.goldLip);
      lip.position.z = 0.045;
      outer.castShadow = true;
      group.add(outer, lip);
      paintZ = 0.093;
    } else {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.06), frameMat);
      frame.position.z = 0.03;
      frame.castShadow = true;
      group.add(frame);
      paintZ = 0.063;
    }

    const paintedMat = opts.blank
      ? this.mats.blankCanvas
      : new THREE.MeshStandardMaterial({
          map: paintingTexture(opts.seed),
          roughness: 0.68,
          envMapIntensity: 0.15,
        });
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paintedMat);
    paint.position.z = paintZ;
    group.add(paint);

    this.scene.add(group);
    return {
      group,
      addRedDot: () => {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.022, 16),
          new THREE.MeshBasicMaterial({ color: 0xb31f1f }),
        );
        dot.position.set(w / 2 - 0.05, -h / 2 + 0.05, paintZ + 0.004);
        group.add(dot);
      },
      setBlank: (blank: boolean) => {
        paint.material = blank ? this.mats.blankCanvas : paintedMat;
      },
    };
  }

  /** Wall placard: readable interactable that opens the modal. */
  addPlacard(opts: {
    x: number;
    y?: number;
    z: number;
    facing: Facing;
    title: string;
    body: string;
  }): THREE.Group {
    const group = new THREE.Group();
    group.position.set(opts.x, opts.y ?? 1.35, opts.z);
    group.rotation.y = facingToYaw(opts.facing);

    const face = new THREE.MeshStandardMaterial({
      map: placardTexture(opts.title, opts.body),
      roughness: 0.6,
    });
    const s = this.mats.plaqueSide;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.02), [s, s, s, s, face, s]);
    plate.position.z = 0.01;
    group.add(plate);
    this.scene.add(group);

    this.interactables.register({
      objects: [group],
      getPrompt: () => (this.modal.isOpen ? null : 'E — Read'),
      onInteract: () => {
        this.audio.tick();
        this.modal.open(opts.title, opts.body);
      },
    });
    return group;
  }

  /** Non-interactive framed sign (STAFF ONLY, wayfinding, ...). */
  addSign(opts: {
    x: number;
    y?: number;
    z: number;
    facing: Facing;
    w: number;
    h: number;
    texture: THREE.Texture;
  }): void {
    const group = new THREE.Group();
    group.position.set(opts.x, opts.y ?? 1.7, opts.z);
    group.rotation.y = facingToYaw(opts.facing);
    const face = new THREE.MeshStandardMaterial({ map: opts.texture, roughness: 0.65 });
    const s = this.mats.plaqueSide;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(opts.w, opts.h, 0.02), [s, s, s, s, face, s]);
    plate.position.z = 0.01;
    group.add(plate);
    this.scene.add(group);
  }

  /** Museum bench aligned along X, with collision. */
  addBench(x: number, z: number): void {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.52), this.mats.benchWood);
    seat.position.y = 0.44;
    seat.castShadow = true;
    const legGeo = new THREE.BoxGeometry(0.08, 0.4, 0.44);
    const l1 = new THREE.Mesh(legGeo, this.mats.benchLeg);
    l1.position.set(-0.78, 0.2, 0);
    const l2 = new THREE.Mesh(legGeo, this.mats.benchLeg);
    l2.position.set(0.78, 0.2, 0);
    g.add(seat, l1, l2);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.addCollider(x - 0.95, z - 0.26, x + 0.95, z + 0.26);
  }

  /** Square pedestal with collision. Returns top-surface height. */
  addPedestal(x: number, z: number, size = 0.55, height = 0.95): number {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), this.mats.pedestal);
    m.position.set(x, height / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    const half = size / 2;
    this.addCollider(x - half, z - half, x + half, z + half);
    return height;
  }
}

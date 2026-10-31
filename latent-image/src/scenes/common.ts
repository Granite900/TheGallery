/** Shared scene plumbing: camera rigs that glide between poses, picking helpers. */
import { AbstractMesh, Node, Scene, UniversalCamera, Vector3, Color4, Engine, AbstractEngine } from '@babylonjs/core';

export interface Pose {
  pos: Vector3;
  target: Vector3;
  fov?: number;
}

export class GlideCamera {
  cam: UniversalCamera;
  private from: Pose;
  private to: Pose;
  private t = 1;
  private dur = 1;
  private curTarget = new Vector3();
  sway = 0;
  private time = 0;
  mouse = { x: 0, y: 0 };
  parallax = 0;
  /** turn-in-place look offsets (radians), eased toward the target values */
  look = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 };

  constructor(public scene: Scene, start: Pose) {
    this.cam = new UniversalCamera('glide', start.pos.clone(), scene);
    this.cam.minZ = 0.02;
    this.cam.maxZ = 400;
    this.cam.fov = start.fov ?? 0.9;
    this.cam.inputs.clear();
    this.from = { ...start };
    this.to = { ...start };
    this.curTarget.copyFrom(start.target);
    this.cam.setTarget(start.target);
    scene.onBeforeRenderObservable.add(() => this.tick(scene.getEngine()));
    scene.activeCamera = this.cam;
  }

  /** Fold the current look offsets into the base target so a following go() starts from what is on screen. */
  bakeLook() {
    const tgt = this.rotated(this.curTarget, this.cam.position, this.look.yaw, this.look.pitch);
    this.curTarget.copyFrom(tgt);
    this.from.target = tgt.clone();
    this.to.target = tgt.clone();
    this.look = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 };
  }

  private rotated(tgt: Vector3, pos: Vector3, yaw: number, pitch: number): Vector3 {
    if (!yaw && !pitch) return tgt.clone();
    const d = tgt.subtract(pos);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const x = d.x * c + d.z * s;
    const z = -d.x * s + d.z * c;
    const hz = Math.hypot(x, z);
    const len = Math.hypot(hz, d.y);
    const elev = Math.max(-1.2, Math.min(1.2, Math.atan2(d.y, hz) + pitch));
    const k = (Math.cos(elev) * len) / Math.max(hz, 1e-6);
    return new Vector3(pos.x + x * k, pos.y + Math.sin(elev) * len, pos.z + z * k);
  }

  go(p: Pose, dur = 1.1) {
    this.from = { pos: this.cam.position.clone(), target: this.curTarget.clone(), fov: this.cam.fov };
    this.to = { pos: p.pos.clone(), target: p.target.clone(), fov: p.fov ?? this.cam.fov };
    this.t = 0;
    this.dur = dur;
  }

  get moving() {
    return this.t < 1;
  }

  private tick(engine: AbstractEngine) {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    this.time += dt;
    if (this.t < 1) this.t = Math.min(1, this.t + dt / this.dur);
    const k = this.t < 1 ? 0.5 - 0.5 * Math.cos(this.t * Math.PI) : 1;
    const pos = Vector3.Lerp(this.from.pos, this.to.pos, k);
    let tgt = Vector3.Lerp(this.from.target, this.to.target, k);
    if (this.sway > 0) {
      pos.x += Math.sin(this.time * 0.13) * this.sway;
      pos.y += Math.sin(this.time * 0.21) * this.sway * 0.4;
    }
    if (this.parallax > 0) {
      tgt.x += this.mouse.x * this.parallax;
      tgt.y -= this.mouse.y * this.parallax * 0.6;
    }
    this.cam.position.copyFrom(pos);
    this.curTarget.copyFrom(tgt);
    const ease = 1 - Math.pow(0.0005, dt);
    this.look.yaw += (this.look.toYaw - this.look.yaw) * ease;
    this.look.pitch += (this.look.toPitch - this.look.pitch) * ease;
    tgt = this.rotated(tgt, pos, this.look.yaw, this.look.pitch);
    this.cam.setTarget(tgt);
    this.cam.fov = this.from.fov! + ((this.to.fov ?? this.from.fov!) - this.from.fov!) * k;
  }
}

/** Walk up the parent chain looking for a metadata key */
export function findMeta<T = unknown>(node: Node | null, key: string): { node: Node; value: T } | null {
  let n: Node | null = node;
  while (n) {
    const md = n.metadata as Record<string, unknown> | undefined;
    if (md && md[key] !== undefined) return { node: n, value: md[key] as T };
    n = n.parent;
  }
  return null;
}

export function setMeta(nodes: (Node | AbstractMesh)[], meta: Record<string, unknown>) {
  for (const n of nodes) n.metadata = { ...(n.metadata ?? {}), ...meta };
}

export function newScene(engine: Engine, clear = new Color4(0.05, 0.045, 0.04, 1)): Scene {
  const s = new Scene(engine);
  s.clearColor = clear;
  s.ambientColor.set(0, 0, 0);
  s.skipPointerMovePicking = false;
  return s;
}

export const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

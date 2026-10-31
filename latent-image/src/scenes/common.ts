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
    const tgt = Vector3.Lerp(this.from.target, this.to.target, k);
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

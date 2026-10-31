/**
 * Hands-on inspection of a camera unit: drag to turn it over, click parts.
 * Used at the studio desk and at market stalls.
 */
import { PointerEventTypes, Scene, TransformNode, Observer, PointerInfo, Vector3 } from '@babylonjs/core';
import { CameraRig, buildCamera, cameraRigHaze, Hotspot } from '../models/CameraBuilder';
import { Mats } from '../render/materials';
import { CameraUnit, LensUnit } from '../sim/units';
import { Check, inspect, Finding, checkLabel } from '../sim/inspection';
import { camera } from '../sim/data';
import type { Audio } from '../app/audio';
import type { Hud } from '../ui/Hud';
import { findMeta } from './common';

export interface InspectorOpts {
  scene: Scene;
  mats: Mats;
  unit: CameraUnit;
  lensUnit?: LensUnit;
  anchor: Vector3;
  audio: Audio;
  hud: Hud;
  /** finding callback (market uses it to unlock haggling points) */
  onFinding?: (check: Check, f: Finding) => void;
  /** asks before opening the back when film is inside */
  confirmOpenBack?: () => Promise<boolean>;
  scale?: number;
  baseYaw?: number;
}

export class Inspector {
  rig: CameraRig;
  pivot: TransformNode;
  private obs: Observer<PointerInfo> | null = null;
  private dragging = false;
  private moved = 0;
  private last = { x: 0, y: 0 };
  yaw: number;
  pitch = 0.25;
  private targetYaw: number;
  private targetPitch = 0.25;
  backOpen = 0;
  private backTarget = 0;
  battOpen = 0;
  private battTarget = 0;
  torch = false;
  shutterSpeed: number;
  private beforeObs: ReturnType<Scene['onBeforeRenderObservable']['add']>;
  findings = new Map<Check, Finding>();
  enabled = true;

  constructor(private o: InspectorOpts) {
    const { scene, mats, unit } = o;
    this.pivot = new TransformNode('inspectPivot', scene);
    this.pivot.position.copyFrom(o.anchor);
    this.rig = buildCamera(scene, mats, unit, o.lensUnit);
    cameraRigHaze(this.rig, unit.traits.haze, unit.traits.fungus);
    this.rig.root.parent = this.pivot;
    const s = o.scale ?? 1;
    this.pivot.scaling.setAll(s);
    // sit the camera on its base
    this.rig.root.position.y = this.rig.size[1] / 2 + 0.002;
    if (camera(unit.modelId).kind === 'super8') this.rig.root.position.y = this.rig.size[1] / 2 + 0.14;
    this.yaw = this.targetYaw = o.baseYaw ?? Math.PI + 0.5;
    this.shutterSpeed = camera(unit.modelId).speeds.includes(1) ? 1 : camera(unit.modelId).speeds[0];
    this.rig.setCounter(unit.foundRoll ? unit.foundRoll.framesShot : 0);
    this.rig.setFilmLoaded(unit.foundRoll ? unit.foundRoll.stockId : null);
    for (const m of this.rig.root.getChildMeshes()) m.receiveShadows = true;
    this.obs = scene.onPointerObservable.add((pi) => this.pointer(pi));
    this.beforeObs = scene.onBeforeRenderObservable.add(() => this.tick());
  }

  private pointer(pi: PointerInfo) {
    if (!this.enabled) return;
    const e = pi.event as PointerEvent;
    if (pi.type === PointerEventTypes.POINTERDOWN && e.button === 0) {
      const pick = pi.pickInfo;
      const isOurs = pick?.hit && pick.pickedMesh && this.isOurMesh(pick.pickedMesh);
      this.dragging = !!isOurs || !pick?.hit;
      this.moved = 0;
      this.last = { x: e.clientX, y: e.clientY };
    } else if (pi.type === PointerEventTypes.POINTERMOVE) {
      if (this.dragging) {
        const dx = e.clientX - this.last.x;
        const dy = e.clientY - this.last.y;
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.targetYaw -= dx * 0.008;
        this.targetPitch = Math.max(-1.3, Math.min(1.3, this.targetPitch + dy * 0.006));
        this.last = { x: e.clientX, y: e.clientY };
      } else {
        const pick = this.o.scene.pick(this.o.scene.pointerX, this.o.scene.pointerY);
        const hs = pick?.hit && pick.pickedMesh && this.isOurMesh(pick.pickedMesh) ? findMeta<Hotspot>(pick.pickedMesh, 'hotspot')?.value : undefined;
        const label = hs && hs !== 'body' ? checkLabel(hs as Check) : null;
        this.o.hud.tooltip(label, e.clientX, e.clientY);
        (this.o.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement).style.cursor = label ? 'pointer' : this.dragging ? 'grabbing' : 'grab';
      }
    } else if (pi.type === PointerEventTypes.POINTERUP) {
      const wasDrag = this.dragging && this.moved > 6;
      this.dragging = false;
      if (!wasDrag && e.button === 0) {
        const pick = this.o.scene.pick(this.o.scene.pointerX, this.o.scene.pointerY);
        if (pick?.hit && pick.pickedMesh && this.isOurMesh(pick.pickedMesh)) {
          const hs = findMeta<Hotspot>(pick.pickedMesh, 'hotspot')?.value;
          if (hs && hs !== 'body') void this.check(hs as Check);
        }
      }
    }
  }

  private isOurMesh(m: { isDescendantOf(n: TransformNode): boolean }): boolean {
    return m.isDescendantOf(this.rig.root);
  }

  /** Point the camera part toward the viewer for a check */
  private face(check: Check) {
    const kind = camera(this.o.unit.modelId).kind;
    const base = this.o.baseYaw ?? Math.PI + 0.5;
    const turn = (yaw: number, pitch: number) => {
      this.targetYaw = base - 0.5 + yaw;
      this.targetPitch = pitch;
    };
    if (check === 'back') turn(kind === 'super8' ? Math.PI / 2 : Math.PI, 0.25);
    else if (check === 'lens') turn(0, 0.05);
    else if (check === 'battery') turn(0.3, -1.2);
    else if (check === 'serial' || check === 'counter') turn(kind === 'tlr' ? -Math.PI / 2 : 0.3, kind === 'tlr' ? 0.1 : 0.9);
  }

  async check(c: Check): Promise<Finding> {
    const unit = this.o.unit;
    this.face(c);
    if (c === 'back') {
      if (this.backTarget > 0) {
        this.backTarget = 0;
        this.o.audio.door();
        return this.findings.get('back') ?? inspect(unit, 'back');
      }
      if ((unit.foundRoll || unit.rollId) && this.o.confirmOpenBack) {
        const ok = await this.o.confirmOpenBack();
        if (!ok) return { text: 'You leave the back closed.' };
      }
      this.backTarget = 1;
      this.o.audio.door();
    } else if (c === 'battery') {
      this.battTarget = this.battTarget > 0 ? 0 : 1;
      this.o.audio.click(0.2, 2000);
    } else if (c === 'lens') {
      this.torch = !this.torch;
      this.rig.setLensLit(this.torch);
      this.o.audio.click(0.15, 5000);
    } else if (c === 'shutter') {
      const m = camera(unit.modelId);
      const f = inspect(unit, 'shutter', this.shutterSpeed);
      const t = unit.traits;
      const actual = this.shutterSpeed * Math.pow(2, this.shutterSpeed >= 1 / 60 ? t.shutterSlow : t.shutterFast);
      this.o.audio.shutter(m.kind === 'slr' ? 'slr' : m.shutter === 'leaf' ? 'leaf' : m.shutter === 'rotary' ? 'rotary' : 'focalplane', actual, t.squeal);
      this.rig.fire();
      this.record(c, f);
      return f;
    } else if (c === 'advance') {
      const m = camera(unit.modelId);
      this.o.audio.advance(m.kind === 'tlr' ? 'crank' : m.id === 'trip35' ? 'wheel' : 'lever');
      let t = 0;
      const step = () => {
        t += 0.06;
        this.rig.windAnim(Math.min(1, t));
        if (t < 1) requestAnimationFrame(step);
        else this.rig.windAnim(0);
      };
      step();
    }
    const f = inspect(unit, c);
    this.record(c, f);
    return f;
  }

  private record(c: Check, f: Finding) {
    this.findings.set(c, f);
    const unit = this.o.unit;
    if (!unit.inspected.includes(c)) unit.inspected.push(c);
    this.o.onFinding?.(c, f);
  }

  private tick() {
    const k = 0.15;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.pivot.rotation.y = this.yaw;
    this.pivot.rotation.x = 0;
    this.rig.root.rotation.x = this.pitch;
    this.backOpen += (this.backTarget - this.backOpen) * 0.12;
    this.battOpen += (this.battTarget - this.battOpen) * 0.15;
    this.rig.setBackOpen(this.backOpen);
    this.rig.setBatteryOpen(this.battOpen);
  }

  dispose() {
    if (this.obs) this.o.scene.onPointerObservable.remove(this.obs);
    this.o.scene.onBeforeRenderObservable.remove(this.beforeObs);
    this.o.hud.tooltip(null);
    this.rig.dispose();
    this.pivot.dispose();
  }
}

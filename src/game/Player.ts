/**
 * First-person controller: pointer-lock mouse look (yaw/pitch, order YXZ),
 * WASD movement with light smoothing, Shift brisk-walk, subtle head bob,
 * and circle-vs-AABB collision against the world's static collider list.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { resolveCircle } from '../utils/collision';
import type { World } from './World';
import type { AudioEngine } from '../audio/AudioEngine';

export class Player {
  x = CONFIG.playerStart.x;
  z = CONFIG.playerStart.z;
  yaw = CONFIG.playerStart.yaw;
  pitch = 0;

  /** Master switch: false while paused, in a modal, or during the ending. */
  inputEnabled = false;

  private vx = 0;
  private vz = 0;
  private keys = new Set<string>();
  private bobPhase = 0;
  private stepDistance = 0;
  private footstepListeners: Array<() => void> = [];

  constructor(
    private camera: THREE.PerspectiveCamera,
    private world: World,
    private audio: AudioEngine,
  ) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.inputEnabled || !document.pointerLockElement) return;
      const sens = 0.0023;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });

    this.syncCamera(0);
  }

  /** Read-only camera access (used by the scripted silhouette glimpses to
   * compute the current edge-of-view direction/FOV). */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /** Subscribe to footstep events (used by DejaVuSystem's delayed echo layer). */
  onFootstep(fn: () => void): void {
    this.footstepListeners.push(fn);
  }

  offFootstep(fn: () => void): void {
    const i = this.footstepListeners.indexOf(fn);
    if (i !== -1) this.footstepListeners.splice(i, 1);
  }

  setPose(x: number, z: number, yaw?: number, pitch?: number): void {
    this.x = x;
    this.z = z;
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.vx = 0;
    this.vz = 0;
    this.syncCamera(0);
  }

  update(dt: number): void {
    const P = CONFIG.player;

    let ix = 0;
    let iz = 0;
    if (this.inputEnabled) {
      if (this.keys.has('KeyW')) iz -= 1;
      if (this.keys.has('KeyS')) iz += 1;
      if (this.keys.has('KeyA')) ix -= 1;
      if (this.keys.has('KeyD')) ix += 1;
    }

    let tx = 0;
    let tz = 0;
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const speed = P.walkSpeed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? P.sprintMult : 1);
      // rotate input by yaw: forward is (-sin(yaw), -cos(yaw)), right is (cos(yaw), -sin(yaw))
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      tx = (ix * cos + iz * sin) * speed;
      tz = (iz * cos - ix * sin) * speed;
    }

    const k = Math.min(1, P.accel * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const resolved = resolveCircle(nx, nz, P.radius, this.world.colliders);
    const movedX = resolved.x - this.x;
    const movedZ = resolved.z - this.z;
    this.x = resolved.x;
    this.z = resolved.z;

    // head bob + footsteps driven by actual displacement
    const moved = Math.hypot(movedX, movedZ);
    if (moved > 0.0008) {
      this.bobPhase += moved * (P.bobFrequency / P.walkSpeed);
      this.stepDistance += moved;
      if (this.stepDistance > 2.05) {
        this.stepDistance = 0;
        const inDark = this.world.isInDarkSpot(this.x, this.z);
        this.audio.footstep(inDark ? CONFIG.darkSpots.footstepVolumeMul : 1);
        for (const fn of this.footstepListeners) fn();
      }
    } else {
      this.bobPhase *= 1 - Math.min(1, dt * 6);
    }

    this.syncCamera(Math.sin(this.bobPhase) * CONFIG.player.bobAmplitude * Math.min(1, moved / dt / P.walkSpeed + 0.2));
  }

  private syncCamera(bob: number): void {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.position.set(this.x, CONFIG.player.eyeHeight + bob, this.z);
  }
}

/**
 * Tracks the déjà vu "repeated room" moments per playthrough (capped at
 * `CONFIG.dejaVu.maxRepeats`) and provides the shared "Echo Passage" pieces
 * they use. Repeats are real, physically duplicated rooms the player walks
 * into on their own two feet — nothing ever teleports them there:
 *   - a frozen, semi-transparent capsule silhouette standing in the room,
 *     which disappears the moment the player gets close or looks straight
 *     at it;
 *   - a second, delayed (1.4s, 40% volume) footstep layer while the player
 *     is inside the repeated room, stopped the moment they walk back out.
 * Never blocks the player and never adds collision.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { Player } from '../Player';

export type DejaVuTemplateId = 'entryCorridorEcho';

export class DejaVuSystem {
  private repeatsUsed = 0;
  private usedTemplates = new Set<DejaVuTemplateId>();

  private ghost: THREE.Group | null = null;
  private ghostAge = 0;
  private ghostLookDwell = 0;

  private footstepListener: (() => void) | null = null;

  constructor(private scene: THREE.Scene, private audio: AudioEngine) {}

  get remainingRepeats(): number {
    return CONFIG.dejaVu.maxRepeats - this.repeatsUsed;
  }

  canRepeat(template: DejaVuTemplateId): boolean {
    return this.repeatsUsed < CONFIG.dejaVu.maxRepeats && !this.usedTemplates.has(template);
  }

  /** Marks a repeat template as used, counting it against the max-2 cap. */
  consumeRepeat(template: DejaVuTemplateId): void {
    if (!this.canRepeat(template)) return;
    this.repeatsUsed++;
    this.usedTemplates.add(template);
  }

  /** The next "one wrong detail" treatment to apply, cycling through config's rotation. */
  nextWrongDetail(): string {
    const rot = CONFIG.dejaVu.wrongDetailRotation;
    return rot[this.repeatsUsed % rot.length];
  }

  /** Freeze a translucent capsule silhouette at the player's exit pose. */
  spawnEchoGhost(x: number, z: number, yaw: number): void {
    this.clearGhost();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1c1a16,
      transparent: true,
      opacity: CONFIG.dejaVu.echoGhostAlpha,
      depthWrite: false,
      fog: false,
    });
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.05, 4, 8), mat);
    body.position.y = 0.93;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat);
    head.position.y = 1.6;
    group.add(body, head);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.ghost = group;
    this.ghostAge = 0;
    this.ghostLookDwell = 0;
  }

  clearGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.ghost = null;
  }

  /** Disappears the moment the player gets within 2m or holds a direct gaze for ~1s. */
  updateGhost(dt: number, px: number, pz: number, camera: THREE.PerspectiveCamera): void {
    if (!this.ghost) return;
    this.ghostAge += dt;
    const gp = this.ghost.position;
    const dist = Math.hypot(px - gp.x, pz - gp.z);

    const toGhost = new THREE.Vector3(gp.x - camera.position.x, 1.2 - camera.position.y, gp.z - camera.position.z);
    const len = toGhost.length();
    toGhost.normalize();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const angle = len > 0.001 ? fwd.angleTo(toGhost) : Math.PI;
    if (angle < 0.1) this.ghostLookDwell += dt;
    else this.ghostLookDwell = Math.max(0, this.ghostLookDwell - dt * 1.5);

    if (dist < CONFIG.dejaVu.echoDisappearDistance || this.ghostLookDwell >= CONFIG.dejaVu.echoLookAtSeconds) {
      this.clearGhost();
    }
  }

  /** Starts the delayed (1.4s, 40% volume) footstep echo layer for a repeated room. */
  attachFootstepEcho(player: Player): void {
    if (this.footstepListener) return;
    const listener = () => {
      window.setTimeout(() => {
        if (this.footstepListener === listener) this.audio.footstep(CONFIG.dejaVu.footstepEchoVolume);
      }, CONFIG.dejaVu.footstepEchoDelaySec * 1000);
    };
    this.footstepListener = listener;
    player.onFootstep(listener);
  }

  /** Stops the echo layer — called when the player leaves the repeated room. */
  detachFootstepEcho(player: Player): void {
    if (!this.footstepListener) return;
    player.offFootstep(this.footstepListener);
    this.footstepListener = null;
  }
}

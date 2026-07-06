/**
 * Global, meterless dread curve. `level` (0..1) is read by audio, lighting
 * and post-processing to blend the atmosphere — never shown as UI.
 *
 * Dread rises primarily from distance travelled through each zone (with a
 * capped, secondary contribution from time spent there), plus small,
 * smoothed bumps on first reading a note or cataloging an anchor. It only
 * ever *rises* while the player is at or past the deepest zone they've
 * reached; when backtracking it slowly decays toward the floor set by that
 * deepest zone — it never drops further, and it never jumps.
 *
 * The "silhouette anomaly" — a still, dark humanoid figure that appears
 * only in the very corner of the player's eye — is also managed from here.
 * It is not random: it is scripted to appear exactly twice per playthrough,
 * each time triggered by a world trigger at a specific spot (see
 * `triggerGlimpse`, called from CorridorMaze.ts and ServiceCorridor.ts). It
 * shows for about a second, at the edge of whatever the player happens to
 * be looking at when it's triggered, then fades on its own — sooner still
 * if the player's gaze swings toward it or they approach. It never moves,
 * never chases, never blocks the path.
 */
import * as THREE from 'three';
import { CONFIG, ZONE_ORDER, ZONE_ID_RECTS, type ZoneId } from '../../config';
import { rectContains } from '../../utils/collision';
import type { World } from '../World';
import type { AudioEngine } from '../../audio/AudioEngine';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function zoneIdAt(x: number, z: number, fallback: ZoneId): ZoneId {
  for (const id of ZONE_ORDER) {
    if (ZONE_ID_RECTS[id].some((r) => rectContains(r, x, z))) return id;
  }
  return fallback;
}

export class DreadSystem {
  level = 0;

  private highestZoneIdx = 0;
  private curZone: ZoneId = 'lobby';
  private timeInZone = 0;
  private distInZone = 0;
  private lastX = CONFIG.playerStart.x;
  private lastZ = CONFIG.playerStart.z;
  private bump = 0;

  // silhouette anomaly — scripted glimpses only, see triggerGlimpse()
  private silhouette: THREE.Group;
  private silhouetteActive = false;
  private silhouetteAge = 0;
  private silhouetteLookDwell = 0;
  private silhouetteLifetime = 1;

  constructor(private scene: THREE.Scene, private world: World, private audio: AudioEngine) {
    this.silhouette = this.buildSilhouette();
  }

  /**
   * A flat-black, unlit humanoid figure — legs, a tapered torso/shoulders,
   * hanging arms, and a head — so at a glance it reads as a still person
   * standing in the dark, not an ambiguous blob. Never lit, never animated.
   */
  private buildSilhouette(): THREE.Group {
    const mat = new THREE.MeshBasicMaterial({ color: 0x040403, transparent: true, opacity: 0.94, depthWrite: false, fog: false });
    const g = new THREE.Group();

    const legGeo = new THREE.CapsuleGeometry(0.075, 0.72, 3, 6);
    const legL = new THREE.Mesh(legGeo, mat);
    legL.position.set(-0.1, 0.46, 0);
    const legR = new THREE.Mesh(legGeo, mat);
    legR.position.set(0.1, 0.46, 0);

    // Tapered torso: wider at the shoulders than the waist, built from two
    // stacked boxes rather than a single smooth capsule, so it reads as
    // shoulders rather than a rounded blob.
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.2), mat);
    hips.position.set(0, 0.95, 0);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.24), mat);
    chest.position.set(0, 1.28, 0);

    const armGeo = new THREE.CapsuleGeometry(0.055, 0.6, 3, 6);
    const armL = new THREE.Mesh(armGeo, mat);
    armL.position.set(-0.29, 1.02, 0);
    armL.rotation.z = 0.06;
    const armR = new THREE.Mesh(armGeo, mat);
    armR.position.set(0.29, 1.02, 0);
    armR.rotation.z = -0.06;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), mat);
    neck.position.set(0, 1.55, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), mat);
    head.scale.set(0.92, 1.08, 0.98);
    head.position.set(0, 1.7, 0.01);

    g.add(legL, legR, hips, chest, armL, armR, neck, head);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  notifyNoteRead(): void {
    this.bump = Math.min(CONFIG.dread.maxBump, this.bump + CONFIG.dread.noteBump);
  }

  notifyAnchorCollected(): void {
    this.bump = Math.min(CONFIG.dread.maxBump, this.bump + CONFIG.dread.anchorBump);
  }

  /** Small dread bump on a catalog misfile (capped at 1.0). */
  applyPenalty(amount: number): void {
    this.level = Math.min(1, this.level + amount);
    this.bump = Math.min(CONFIG.dread.maxBump, this.bump + amount * 0.5);
  }

  /** Small dread reward on a correct catalog filing (floor-clamped). */
  applyReward(amount: number): void {
    const floor = CONFIG.dread.zones[ZONE_ORDER[this.highestZoneIdx]].min;
    this.level = Math.max(floor, this.level - amount);
  }

  update(dt: number, px: number, pz: number, camera: THREE.PerspectiveCamera): void {
    const zoneId = zoneIdAt(px, pz, this.curZone);
    const idx = ZONE_ORDER.indexOf(zoneId);

    if (zoneId !== this.curZone) {
      this.curZone = zoneId;
      this.timeInZone = 0;
      this.distInZone = 0;
      this.lastX = px;
      this.lastZ = pz;
      if (idx > this.highestZoneIdx) {
        this.highestZoneIdx = idx;
        this.bump = Math.min(CONFIG.dread.maxBump, this.bump + CONFIG.dread.zoneEntryBump);
      }
    } else {
      this.timeInZone += dt;
      this.distInZone += Math.hypot(px - this.lastX, pz - this.lastZ);
      this.lastX = px;
      this.lastZ = pz;
    }

    const D = CONFIG.dread;
    const floorZone = ZONE_ORDER[this.highestZoneIdx];
    const floorDread = D.zones[floorZone].min;

    let target = floorDread;
    if (idx >= this.highestZoneIdx) {
      const cfg = D.zones[zoneId];
      const distProgress = clamp01(this.distInZone / cfg.traverseDistance);
      const timeProgress = clamp01(this.timeInZone / D.timeCapSeconds);
      const progress = clamp01(distProgress * (1 - D.timeWeight) + timeProgress * D.timeWeight);
      target = Math.max(floorDread, cfg.min + (cfg.max - cfg.min) * progress);
    }
    target = Math.min(1, target + this.bump);
    this.bump = Math.max(0, this.bump - D.bumpDecayRate * dt);

    if (target > this.level) {
      this.level = Math.min(target, this.level + D.riseRate * dt);
    } else {
      this.level = Math.max(floorDread, this.level - D.decayRate * dt);
    }

    this.updateFog();
    this.updateSilhouette(dt, px, pz, camera);
  }

  private updateFog(): void {
    const cfg = CONFIG.dread.fog;
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(cfg.color, 0);
    const fog = this.scene.fog as THREE.FogExp2;
    const lateness = clamp01((this.level - cfg.startLevel) / (1 - cfg.startLevel));
    fog.density = cfg.maxDensity * lateness;
  }

  /** Per-frame fade/vanish upkeep for whichever glimpse is currently active
   * (if any) — does not spawn anything itself, see `triggerGlimpse`. */
  private updateSilhouette(dt: number, px: number, pz: number, camera: THREE.PerspectiveCamera): void {
    if (!this.silhouetteActive) return;
    const S = CONFIG.dread.silhouette;

    this.silhouetteAge += dt;
    const pos = this.silhouette.position;
    const dist = Math.hypot(px - pos.x, pz - pos.z);

    const toSil = new THREE.Vector3(pos.x - camera.position.x, pos.y + 1.0 - camera.position.y, pos.z - camera.position.z);
    const distToCam = toSil.length();
    toSil.normalize();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const angle = distToCam > 0.001 ? fwd.angleTo(toSil) : Math.PI;
    // Wide cone + short dwell: it starts fading as soon as the player's
    // gaze swings toward it, not only once they're dead-center on it.
    if (angle < S.lookAngle) this.silhouetteLookDwell += dt;
    else this.silhouetteLookDwell = Math.max(0, this.silhouetteLookDwell - dt * 2.5);

    const shouldVanish =
      dist < 2 || this.silhouetteLookDwell >= S.lookAwayDwellSec || this.silhouetteAge > this.silhouetteLifetime;
    if (shouldVanish) {
      this.silhouette.visible = false;
      this.silhouetteActive = false;
    }
  }

  /**
   * Scripted, one-shot glimpse: places the humanoid silhouette right at the
   * edge of the camera's *current* field of view (whatever the player
   * happens to already be looking toward at the moment this fires), a short
   * distance ahead, then lets it fade after about a second on its own.
   * Called from a world trigger the first time the player reaches one of
   * the two scripted spots — never randomly, never more than these two.
   */
  triggerGlimpse(
    camera: THREE.PerspectiveCamera,
    clampRect?: { x1: number; x2: number; z1: number; z2: number },
    distanceRange?: [number, number],
  ): void {
    if (this.silhouetteActive) return;
    const S = CONFIG.dread.silhouette;

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    // A fraction just short of the true edge so it's still on-screen —
    // "the corner of the eye", not off past the frustum.
    const edgeAngle = (hFov / 2) * S.glimpseEdgeFraction;
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = side * edgeAngle;
    const [dMin, dMax] = distanceRange ?? S.glimpseDistance;
    const dist = dMin + Math.random() * (dMax - dMin);

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const dirX = fwd.x * cos - fwd.z * sin;
    const dirZ = fwd.x * sin + fwd.z * cos;

    let x = camera.position.x + dirX * dist;
    let z = camera.position.z + dirZ * dist;
    if (clampRect) {
      x = Math.min(Math.max(x, clampRect.x1 + 0.7), clampRect.x2 - 0.7);
      z = Math.min(Math.max(z, clampRect.z1 + 0.7), clampRect.z2 - 0.7);
    }

    this.silhouette.position.set(x, 0, z);
    this.silhouette.rotation.y = Math.random() * Math.PI * 2;
    this.silhouette.visible = true;
    this.silhouetteActive = true;
    this.silhouetteAge = 0;
    this.silhouetteLookDwell = 0;
    this.silhouetteLifetime = S.glimpseLifetimeSec;
    // A couple of faint, distant footstep-like taps panned toward it —
    // it never moves, but the room briefly sounds like it isn't empty.
    this.audio.ambientPresence(side);
  }
}

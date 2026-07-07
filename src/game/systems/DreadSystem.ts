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
 * The "silhouette anomaly" — a dark humanoid figure — is also managed from
 * here. It is not random: it is scripted to appear exactly twice per
 * playthrough, each time triggered by a world trigger at a fixed position
 * hand-picked to sit at the end of a corridor, half-hidden behind a real
 * wall corner (see `triggerGlimpseAt`, called from CorridorMaze.ts and
 * ServiceCorridor.ts). It appears already half-out and holds still; the
 * moment the player looks toward it a 0.75 s countdown runs, after which it
 * slides off to the player's right and fades. It never chases, never blocks
 * the path. Each appearance plays a faint dissonant sound cue and a brief
 * camera judder/grade pulse — restrained, not a jumpscare.
 */
import * as THREE from 'three';
import { CONFIG, ZONE_ORDER, ZONE_ID_RECTS, type ZoneId } from '../../config';
import { rectContains } from '../../utils/collision';
import type { World } from '../World';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { Player } from '../Player';
import type { PostProcessing } from './PostProcessing';

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

  // silhouette anomaly — scripted glimpses only, see triggerGlimpseAt()
  private silhouette: THREE.Group;
  private silhouetteMat!: THREE.MeshBasicMaterial;  // shared by all parts; opacity-faded on exit
  private silhouetteHeadPivot!: THREE.Group;         // rotates to face the player each frame
  private silhouetteActive = false;                  // true while phase !== 'idle' (external reads)
  // Behaviour phases: appears half-out and holds ('wait'); once the player
  // looks at it, a 0.75 s countdown runs ('countdown'); then it slides to the
  // player's right and fades out ('exit').
  private silhouettePhase: 'idle' | 'wait' | 'countdown' | 'exit' = 'idle';
  private silhouetteLookCountdown = 0;
  private silhouetteExitElapsed = 0;
  private readonly silhouetteExitDir = new THREE.Vector3();
  // Reused per-frame scratch vectors — avoids allocating in the update loop.
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpToSil = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private audio: AudioEngine,
    private player?: Player,
    private post?: PostProcessing,
  ) {
    this.silhouette = this.buildSilhouette();
  }

  /**
   * A 3-D humanoid built from primitives — all parts share one material so
   * the whole figure can be faded by adjusting `silhouetteMat.opacity`.
   * Proportions are slightly elongated (tall, long arms) to read as human
   * but unsettling. A dedicated `silhouetteHeadPivot` group lets the head
   * rotate independently each frame to face the player.
   */
  private buildSilhouette(): THREE.Group {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x030303,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: false,
    });
    this.silhouetteMat = mat;

    const mk = <G extends THREE.BufferGeometry>(geo: G, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      return m;
    };

    const g = new THREE.Group();

    // Legs — slightly longer than anatomically correct (unsettling)
    const legGeo = new THREE.CapsuleGeometry(0.088, 0.88, 4, 8);
    g.add(mk(legGeo, -0.13, 0.55, 0));
    g.add(mk(legGeo,  0.13, 0.55, 0));

    // Hips
    g.add(mk(new THREE.BoxGeometry(0.34, 0.22, 0.26), 0, 1.08, 0));

    // Chest — wider at shoulders
    g.add(mk(new THREE.BoxGeometry(0.50, 0.54, 0.28), 0, 1.46, 0));

    // Arms — long, dropped slightly forward (the "wrong" stance)
    const armGeo = new THREE.CapsuleGeometry(0.065, 0.76, 4, 8);
    g.add(mk(armGeo, -0.34, 1.10, 0.04,  0.08, 0,  0.13));
    g.add(mk(armGeo,  0.34, 1.10, 0.04,  0.08, 0, -0.13));

    // Neck
    g.add(mk(new THREE.CylinderGeometry(0.077, 0.092, 0.18, 8), 0, 1.80, 0));

    // Head pivot — child group so head can rotate independently
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.97, 0);
    // Head: slightly oval (taller than wide), leaning forward a touch
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat);
    headMesh.scale.set(0.91, 1.10, 0.96);
    headMesh.position.set(0, 0, 0.04); // faint forward lean
    headPivot.add(headMesh);
    g.add(headPivot);
    this.silhouetteHeadPivot = headPivot;

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

  /**
   * Per-frame upkeep for the active glimpse. State machine:
   *   'wait'      — figure stands half-out, head tracking the player. As soon
   *                 as the player looks toward it, → 'countdown'.
   *   'countdown' — a 0.75 s timer runs (head still tracking). At zero, the
   *                 player's screen-right direction is captured, → 'exit'.
   *   'exit'      — figure slides along that right direction over ~0.7 s while
   *                 its opacity fades to 0, then deactivates.
   * The player getting within 1.2 m during wait/countdown also jumps to exit.
   */
  private updateSilhouette(dt: number, px: number, pz: number, camera: THREE.PerspectiveCamera): void {
    if (this.silhouettePhase === 'idle') return;
    const cam = this.player?.getCamera() ?? camera;
    const pos = this.silhouette.position;

    const LOOK_CONE = 0.5;      // radians — "the player is looking at it"
    const COUNTDOWN = 0.75;     // seconds after being seen
    const EXIT_DURATION = 0.7;  // slide-out + fade time
    const EXIT_SPEED = 1.8;     // metres/second slide

    const beginExit = () => {
      // Capture the player's flattened screen-right direction and slide along it.
      this.silhouetteExitDir.set(1, 0, 0).applyQuaternion(cam.quaternion);
      this.silhouetteExitDir.y = 0;
      if (this.silhouetteExitDir.lengthSq() < 1e-6) this.silhouetteExitDir.set(1, 0, 0);
      this.silhouetteExitDir.normalize();
      this.silhouetteExitElapsed = 0;
      this.silhouettePhase = 'exit';
    };

    // Head tracks the player while it's still standing there.
    if (this.silhouettePhase === 'wait' || this.silhouettePhase === 'countdown') {
      const localTargetYaw = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z) - this.silhouette.rotation.y;
      this.silhouetteHeadPivot.rotation.y = THREE.MathUtils.lerp(
        this.silhouetteHeadPivot.rotation.y,
        localTargetYaw,
        Math.min(1, dt * 3.5),
      );

      // Proximity fail-safe so the player never walks into it.
      if (Math.hypot(px - pos.x, pz - pos.z) < 1.2) {
        beginExit();
        return;
      }
    }

    if (this.silhouettePhase === 'wait') {
      // Is the player looking toward the figure's upper body?
      this.tmpToSil.set(pos.x - cam.position.x, 1.4 - cam.position.y, pos.z - cam.position.z);
      const d = this.tmpToSil.length();
      if (d > 0.001) {
        this.tmpToSil.multiplyScalar(1 / d);
        cam.getWorldDirection(this.tmpFwd);
        if (this.tmpFwd.angleTo(this.tmpToSil) < LOOK_CONE) {
          this.silhouetteLookCountdown = COUNTDOWN;
          this.silhouettePhase = 'countdown';
        }
      }
    } else if (this.silhouettePhase === 'countdown') {
      this.silhouetteLookCountdown -= dt;
      if (this.silhouetteLookCountdown <= 0) beginExit();
    } else if (this.silhouettePhase === 'exit') {
      this.silhouetteExitElapsed += dt;
      pos.addScaledVector(this.silhouetteExitDir, EXIT_SPEED * dt);
      const p = clamp01(this.silhouetteExitElapsed / EXIT_DURATION);
      this.silhouetteMat.opacity = 0.92 * (1 - p);
      if (p >= 1) {
        this.silhouette.visible = false;
        this.silhouettePhase = 'idle';
        this.silhouetteActive = false;
        this.silhouetteMat.opacity = 0.92;
        this.silhouetteHeadPivot.rotation.y = 0;
      }
    }
  }

  /**
   * Scripted glimpse. The figure is placed at (x, z) — a spot at the end of a
   * corridor where a real wall corner hides roughly half of it — and shown
   * immediately, standing still ('wait' phase). It holds there, head tracking
   * the player, until the player looks toward it; then a 0.75 s countdown runs
   * and it slides off to the player's right and fades (see updateSilhouette).
   *
   * @param x / z  Standing position (half-occluded by a nearby wall corner).
   * @param yaw    Body rotation. Defaults to auto-face the player.
   */
  triggerGlimpseAt(x: number, z: number, yaw?: number): void {
    if (this.silhouettePhase !== 'idle') return;

    this.silhouette.position.set(x, 0, z);

    // Body faces the direction given by yaw, or toward the player if omitted.
    const cam = this.player?.getCamera();
    if (cam && yaw === undefined) {
      this.silhouette.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z);
    } else {
      this.silhouette.rotation.y = yaw ?? 0;
    }

    this.silhouetteHeadPivot.rotation.y = 0;
    this.silhouetteMat.opacity = 0.92;
    this.silhouette.visible = true;
    this.silhouetteActive = true;
    this.silhouettePhase = 'wait';
    this.silhouetteLookCountdown = 0;
    this.silhouetteExitElapsed = 0;

    const camX = cam?.position.x ?? x;
    const side = x < camX ? -1 : 1;
    this.audio.ambientPresence(side);
    this.audio.eerieGlimpse(side);
    this.player?.triggerShake(0.03, 0.6);
    this.post?.triggerPulse(0.72, 1.3);
  }
}

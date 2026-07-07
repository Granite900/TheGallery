/**
 * Global lighting (warm ambient + one low-res shadow-casting directional)
 * plus factories for the recessed fluorescent ceiling panels / tubes and
 * their point lights. Flickering fixtures are driven here as random
 * telegraph noise with a per-light mean rate; DreadSystem nudges the mean
 * rate up (never the >200ms off-cap) as dread rises. Dark spots dim a
 * dedicated point light to a small fraction of normal while the player
 * stands inside their trigger rect.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Aabb } from '../../utils/collision';
import { rectContains } from '../../utils/collision';
import type { World } from '../World';

interface FlickerEntry {
  light: THREE.PointLight | null;
  mat: THREE.MeshStandardMaterial | null;
  baseIntensity: number;
  baseEmissive: number;
  rate: number; // mean toggles per second
  on: boolean;
  timer: number;
}

interface DarkSpotEntry {
  rect: Aabb;
  light: THREE.PointLight;
  base: number;
  factor: number;
  inside: boolean;
}

export class Lighting {
  private flickers: FlickerEntry[] = [];
  private darkSpots: DarkSpotEntry[] = [];
  // Every PointLight ever created, for per-frame distance culling below —
  // three.js re-evaluates every *visible* light for every standard-material
  // fragment in the frame, so with 40+ fixtures spread across a ~90m museum,
  // turning off the ones nowhere near the player meaningfully cuts shading
  // cost without any visible difference (each light's own falloff distance
  // already makes it contribute ~nothing out there).
  private allPointLights: THREE.PointLight[] = [];
  private panelRimMat: THREE.MeshStandardMaterial;
  private sharedPanelMat: THREE.MeshStandardMaterial;
  private dreadFlickerMul = 1;
  /** Remaining seconds of calm-light stabilization (from a correct filing). */
  private stabilizeSec = 0;
  /** Remaining seconds of elevated flicker penalty (from a wrong filing). */
  private penaltySec = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(new THREE.AmbientLight(0xfff1e0, 0.35));

    const dir = new THREE.DirectionalLight(0xfff2df, 0.45);
    dir.position.set(28, 26, -36);
    dir.target.position.set(14, 0, -48);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -58;
    dir.shadow.camera.right = 58;
    dir.shadow.camera.top = 58;
    dir.shadow.camera.bottom = -58;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 90;
    dir.shadow.bias = -0.001;
    dir.shadow.normalBias = 0.06;
    scene.add(dir, dir.target);

    this.panelRimMat = new THREE.MeshStandardMaterial({ color: 0xcfcabe, roughness: 0.9 });
    this.sharedPanelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff6e2,
      emissiveIntensity: 1.7,
      roughness: 0.4,
    });
  }

  /** Recessed fluorescent panel flush with the ceiling. */
  addPanel(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    opts: { flicker?: number; emissive?: number; color?: number; unique?: boolean } = {},
  ): THREE.MeshStandardMaterial {
    let mat = this.sharedPanelMat;
    if (opts.flicker !== undefined || opts.emissive !== undefined || opts.color !== undefined || opts.unique) {
      mat = this.sharedPanelMat.clone();
      if (opts.emissive !== undefined) mat.emissiveIntensity = opts.emissive;
      if (opts.color !== undefined) mat.emissive = new THREE.Color(opts.color);
    }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.03, d + 0.1), this.panelRimMat);
    rim.position.set(x, y + 0.015, z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, d), mat);
    panel.position.set(x, y, z);
    this.scene.add(rim, panel);
    if (opts.flicker !== undefined) {
      this.flickers.push({
        light: null,
        mat,
        baseIntensity: 0,
        baseEmissive: mat.emissiveIntensity,
        rate: opts.flicker,
        on: true,
        timer: Math.random(),
      });
    }
    return mat;
  }

  addPoint(
    x: number,
    y: number,
    z: number,
    intensity: number,
    distance: number,
    color = 0xffe6c4,
  ): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.allPointLights.push(l);
    return l;
  }

  /** Tie an existing point light + panel material together as one flickering fixture. */
  addFlicker(light: THREE.PointLight, mat: THREE.MeshStandardMaterial | null, rate: number): void {
    this.flickers.push({
      light,
      mat,
      baseIntensity: light.intensity,
      baseEmissive: mat ? mat.emissiveIntensity : 0,
      rate,
      on: true,
      timer: Math.random() * 0.5,
    });
  }

  /**
   * Register a dark spot: a small dedicated fixture that dims to `factor`
   * of its normal intensity while the player is inside `rect`. Also
   * registers the rect on `world` so Player can apply the footstep dip.
   */
  addDarkSpot(
    world: World,
    rect: Aabb,
    x: number,
    y: number,
    z: number,
    factor = CONFIG.darkSpots.factor,
  ): void {
    const light = this.addPoint(x, y, z, CONFIG.darkSpots.lightIntensity, 6, 0xd8d4c0);
    this.darkSpots.push({ rect, light, base: light.intensity, factor, inside: false });
    world.addDarkSpotRect(rect);
  }

  /** Scales flicker frequency (never the off-duration cap) with global dread. */
  setDread(level: number): void {
    this.dreadFlickerMul = 1 + level * CONFIG.dread.audio.flickerRateMul;
  }

  /** After a correct catalog filing, suppress flicker for `seconds`. */
  stabilize(seconds: number): void {
    this.stabilizeSec = Math.max(this.stabilizeSec, seconds);
  }

  /** After a wrong-slot attempt, boost flicker intensity briefly (~0.4s). */
  flickerPenalty(): void {
    this.penaltySec = 0.4;
    // Force all lights to immediately flicker off then back on
    for (const f of this.flickers) {
      f.on = false;
      f.timer = 0.04 + Math.random() * 0.1;
    }
  }

  update(dt: number, px: number, pz: number): void {
    this.stabilizeSec = Math.max(0, this.stabilizeSec - dt);
    this.penaltySec = Math.max(0, this.penaltySec - dt);

    const flickerMul = this.stabilizeSec > 0 ? 0 : (this.penaltySec > 0 ? 6 : this.dreadFlickerMul);

    for (const f of this.flickers) {
      f.timer -= dt;
      if (f.timer <= 0) {
        f.on = !f.on;
        // asymmetric telegraph noise: mostly on, briefly off (always < 200ms)
        f.timer = f.on
          ? (0.25 + Math.random() * 1.6) / (f.rate * flickerMul)
          : 0.03 + Math.random() * 0.14;
      }
      const buzz = f.on ? 0.9 + Math.random() * 0.1 : 0.04;
      if (f.light) f.light.intensity = f.baseIntensity * buzz;
      if (f.mat) f.mat.emissiveIntensity = f.baseEmissive * buzz;
    }

    for (const d of this.darkSpots) {
      const inside = rectContains(d.rect, px, pz);
      if (inside !== d.inside) {
        d.light.intensity = inside ? d.base * d.factor : d.base;
        d.inside = inside;
      }
    }

    const margin = CONFIG.perf.lightCullMargin;
    for (const l of this.allPointLights) {
      const dx = l.position.x - px;
      const dz = l.position.z - pz;
      const reach = (l.distance || CONFIG.perf.lightCullFallbackDistance) + margin;
      l.visible = dx * dx + dz * dz < reach * reach;
    }
  }
}

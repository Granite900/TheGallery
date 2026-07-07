/**
 * Raycast-driven interaction: every frame a ray is cast from the crosshair;
 * the nearest registered object within CONFIG.interactionDistance becomes the
 * current target (crosshair highlights, prompt appears). Pressing E fires it.
 */
import * as THREE from 'three';
import type { HUD } from '../ui/HUD';

export interface Interactable {
  /** Objects (meshes or groups) the crosshair ray can hit. */
  objects: THREE.Object3D[];
  /** Return the prompt text (e.g. "E — Read"), or null to be inert. */
  getPrompt: () => string | null;
  onInteract: () => void;
}

export class Interactables {
  private list: Interactable[] = [];
  private targets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private current: Interactable | null = null;
  private readonly screenCenter = new THREE.Vector2(0, 0);

  constructor(private maxDistance: number, private hud: HUD) {
    this.raycaster.far = maxDistance;
  }

  register(i: Interactable): void {
    this.list.push(i);
    for (const o of i.objects) {
      o.traverse((c) => {
        c.userData.interactable = i;
      });
      o.userData.interactable = i;
      this.targets.push(o);
    }
  }

  update(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.screenCenter, camera);
    const hits = this.raycaster.intersectObjects(this.targets, true);

    let found: Interactable | null = null;
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.interactable) o = o.parent;
      const i = (o?.userData.interactable as Interactable) ?? null;
      if (i && i.getPrompt() !== null) {
        found = i;
        break;
      }
    }

    if (found !== this.current) this.current = found;
    if (this.current) {
      this.hud.setPrompt(this.current.getPrompt());
      this.hud.setCrosshairActive(true);
    } else {
      this.hud.setPrompt(null);
      this.hud.setCrosshairActive(false);
    }
  }

  tryInteract(): void {
    this.current?.onInteract();
  }

  clearTarget(): void {
    this.current = null;
    this.hud.setPrompt(null);
    this.hud.setCrosshairActive(false);
  }
}

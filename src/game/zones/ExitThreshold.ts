/**
 * Zone 7 — a bare 4×4m white room. One last door. Interacting with it fades
 * to black and ends the tour: "The catalog ends here."
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ZoneContext } from './ZoneContext';

export function buildExitThreshold(ctx: ZoneContext): void {
  const { world, lighting } = ctx;
  const r = CONFIG.zones.exitThreshold;
  const H = 3;

  world.buildRoom({
    rect: r,
    height: H,
    sides: { north: 'wall', south: 'open', east: 'wall', west: 'wall' },
    floor: 'white',
    ceiling: 'white',
    wall: 'white',
  });

  // final door — accessible once the GalleryUnlisted door is opened and
  // the player passes through; no extra win-gate here
  const door = new THREE.Group();
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.06, 0.07),
    new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7 }),
  );
  leaf.position.y = 1.03;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.14, 10),
    world.mats.darkMetal,
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.36, 1.02, 0.055);
  const jamb = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 2.16, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xcfccc2, roughness: 0.8 }),
  );
  jamb.position.y = 1.08;
  door.add(jamb, leaf, handle);
  door.position.set(29, 0, r.z1 + 0.12);
  world.scene.add(door);

  let used = false;
  ctx.interactables.register({
    objects: [door],
    getPrompt: () => (used ? null : 'E — Leave'),
    onInteract: () => {
      if (used) return;
      used = true;
      ctx.endGame();
    },
  });

  lighting.addPanel(29, H - 0.02, -89.1, 1.4, 1.4, { emissive: 2.4, color: 0xffffff });
  lighting.addPoint(29, H - 0.5, -89.1, 12, 8, 0xffffff);
}

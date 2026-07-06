/**
 * Zone 0 — the Lobby: a calm 10×8m entry hall, the one guaranteed-safe
 * space in the game (bright, even light, no dark spots, no dread beyond a
 * light dusting). A reception desk, a wall directory, benches and a coat
 * rack silhouette dress the room; one obvious path leads through double
 * doors into the entry corridor.
 *
 * The correct slot for misfiled work 019-UNLISTED is a wall hook on the east
 * wall behind the reception desk — the player must navigate around the desk
 * to reach it.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { signTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';

export function buildLobby(ctx: ZoneContext): void {
  const { world, lighting, catalog, hud, audio, dread } = ctx;
  const r = CONFIG.zones.lobby;
  const H = CONFIG.lobby.ceilingHeight;
  world.markGallery(r);

  world.buildRoom({
    rect: r,
    height: H,
    sides: {
      north: { doors: [{ center: 0, width: 2.0, height: CONFIG.doorHeight }] },
      south: 'wall',
      east: 'wall',
      west: 'wall',
    },
  });

  // decorative open double doors flanking the corridor opening
  const leafGeo = new THREE.BoxGeometry(0.85, CONFIG.doorHeight, 0.05);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c4530, roughness: 0.6 });
  const leafL = new THREE.Mesh(leafGeo, leafMat);
  leafL.position.set(-1.42, CONFIG.doorHeight / 2, 0.42);
  leafL.rotation.y = Math.PI / 2.4;
  const leafR = new THREE.Mesh(leafGeo, leafMat);
  leafR.position.set(1.42, CONFIG.doorHeight / 2, 0.42);
  leafR.rotation.y = -Math.PI / 2.4;
  world.scene.add(leafL, leafR);

  // reception desk (off-centre so the path to the doors stays clear)
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.55 }),
  );
  deskTop.position.set(1.9, 0.86, 3.6);
  deskTop.castShadow = true;
  const deskBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.82, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x40331f, roughness: 0.7 }),
  );
  deskBody.position.set(1.9, 0.41, 3.6);
  deskBody.castShadow = true;
  world.scene.add(deskTop, deskBody);
  world.addCollider(1.9 - 0.9, 3.6 - 0.35, 1.9 + 0.9, 3.6 + 0.35);

  // coat rack
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, metalness: 0.55, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.75, 10), rackMat);
  pole.position.set(-4.1, 0.875, 1.1);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 16), rackMat);
  base.position.set(-4.1, 0.015, 1.1);
  const hookGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), rackMat);
    hook.rotation.z = Math.PI / 2.6;
    const ang = (i / 5) * Math.PI * 2;
    hook.position.set(Math.cos(ang) * 0.07, 1.72, Math.sin(ang) * 0.07);
    hook.rotation.y = ang;
    hookGroup.add(hook);
  }
  world.scene.add(pole, base, hookGroup);

  // benches
  world.addBench(-3.2, 6.2);
  world.addBench(3.2, 6.2);

  // wall directory sign
  world.addSign({
    x: -2.7, y: 1.7, z: 0.08, facing: 's', w: 1.5, h: 0.85,
    texture: signTexture(
      ['MODERN WING →', 'CLASSICAL SALON →', 'UNLISTED — CLOSED'],
      { bg: '#efece2', fg: '#3a362c', border: '#3a362c', fontSize: 34 },
    ),
  });

  // small introductory painting near the doors
  world.addFrame({
    x: 2.6, y: 1.55, z: 0.08, facing: 's', w: 0.7, h: 0.55,
    seed: CONFIG.seeds.lobbyPainting,
  });

  // ── Correct slot for 019-UNLISTED ─────────────────────────────────────────
  // Wall hook on the east wall, behind the reception desk — player needs
  // to walk around the north or east side of the desk to reach it.
  // x ≈ r.x2-0.1 = 4.9, z ≈ 3.0 (north of the desk collider at z=3.25)

  const slotX = r.x2 - 0.08;
  const slotZ = 3.0;

  // Hook bracket on east wall
  const slotHook = new THREE.Group();
  const bracket019 = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.22),
    world.mats.darkMetal,
  );
  bracket019.position.set(0, 0, 0.11);
  const shelfMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.03, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x3a3020, roughness: 0.7 }),
  );
  shelfMesh.position.set(0, -0.06, 0.09);
  slotHook.add(bracket019, shelfMesh);
  slotHook.position.set(slotX, 1.06, slotZ);
  slotHook.rotation.y = -Math.PI / 2;
  world.scene.add(slotHook);

  // "Expected: 019-UNLISTED" label
  world.addSign({
    x: slotX, y: 0.72, z: slotZ, facing: 'w', w: 0.68, h: 0.2,
    texture: signTexture(['Expected: 019-UNLISTED'], { bg: '#efece2', fg: '#5a4030', border: '#a09080', fontSize: 24 }),
  });

  // Filed sculpture visual (initially invisible)
  const filedSculptMat = new THREE.MeshStandardMaterial({ color: 0x9a9282, roughness: 0.55, metalness: 0.15 });
  const filedSculpt = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), filedSculptMat);
  fb.position.y = 0.03;
  const ft = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.038, 10, 20), filedSculptMat);
  ft.rotation.x = Math.PI / 2;
  ft.position.y = 0.17;
  const fsp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), filedSculptMat);
  fsp.position.y = 0.32;
  fsp.rotation.z = 0.2;
  filedSculpt.add(fb, ft, fsp);
  filedSculpt.position.set(slotX - 0.07, 1.12, slotZ);
  filedSculpt.rotation.y = -Math.PI / 2;
  filedSculpt.visible = false;
  world.scene.add(filedSculpt);

  // Slot interactable
  ctx.interactables.register({
    objects: [slotHook],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('019-UNLISTED')) return null;
      if (catalog.carriedSlip === '019-UNLISTED') return 'E — File correctly';
      if (catalog.carriedSlip !== null) return 'E — File here';
      return null;
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('019-UNLISTED')) return;
      const result = catalog.fileAt('019-UNLISTED', hud, audio, lighting, dread);
      if (result === 'correct') {
        filedSculpt.visible = true;
      }
    },
  });

  catalog.onRestore('019-UNLISTED', () => { filedSculpt.visible = false; });

  // bright, calm, even fluorescent light
  lighting.addPanel(-2, H - 0.02, 3, 1.1, 1.6);
  lighting.addPanel(2, H - 0.02, 3, 1.1, 1.6);
  lighting.addPanel(0, H - 0.02, 6, 1.1, 1.6);
  lighting.addPoint(0, H - 0.4, 3.5, 14, 11);
  lighting.addPoint(0, H - 0.4, 6.5, 10, 9);
}

/**
 * Zone 6 — Gallery C ("unlisted"): 20×16m, dimmer than the public wings,
 * empty frames on the walls, and the sealed exit door that unlocks once all
 * three catalog corrections are complete.
 *
 * The central pedestal is the correct slot for misfiled work 1847-B (the
 * classical portrait silhouette from Gallery B). File it here to complete
 * that correction.
 *
 * Direct-address note #4 is near the exit door, visible only when 2/3
 * corrections are done (it's a bait note — filing the last piece is
 * still correct despite what it says).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { paintingTexture, signTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildGalleryUnlisted(ctx: ZoneContext): void {
  const { world, lighting, catalog, audio, hud, dread } = ctx;
  const r = CONFIG.zones.galleryUnlisted;
  const H = CONFIG.gallery.ceilingHeight;
  world.markGallery(r);

  world.buildRoom({
    rect: r,
    height: H,
    sides: {
      north: { doors: [{ center: 29, width: 1.6 }] },
      south: { doors: [{ center: 29, width: 1.4 }] },
      east: 'wall',
      west: 'wall',
    },
  });

  // empty frames — the works have been "removed for study"
  world.addFrame({ x: r.x1 + 0.08, y: 1.7, z: -76, facing: 'e', w: 1.6, h: 1.2, seed: 0, blank: true });
  world.addFrame({ x: r.x1 + 0.08, y: 1.7, z: -80, facing: 'e', w: 1.2, h: 1.5, seed: 0, blank: true });
  world.addFrame({ x: r.x1 + 0.08, y: 1.7, z: -84, facing: 'e', w: 1.6, h: 1.2, seed: 0, blank: true });
  world.addFrame({ x: r.x2 - 0.08, y: 1.7, z: -79, facing: 'w', w: 1.4, h: 1.1, seed: 0, blank: true, gold: true });
  // one remaining painting, slightly crooked
  const last = world.addFrame({
    x: r.x2 - 0.08, y: 1.7, z: -83.5, facing: 'w', w: 1.2, h: 0.95,
    seed: CONFIG.seeds.unlistedPaintings,
  });
  last.group.rotation.z = 0.03;

  addArtistNote(ctx, {
    id: 'unlisted-gallery-c',
    x: 27.4, z: r.z2 - 0.08, facing: 'n',
    workTitle: 'Gallery C',
    tiers: [
      'Gallery C is not listed on the map.',
      'Gallery C is not listed on the map. You are in Gallery C.',
      'Gallery C is not listed on the map. It has never needed to be found.',
    ],
  });

  // dark spot near the pedestal — on the approach
  const dark = CONFIG.darkSpots.galleryUnlisted[0];
  lighting.addDarkSpot(world, dark, 29, H - 0.6, -76.5);

  // ── Correct slot for 1847-B ───────────────────────────────────────────────
  // Central pedestal — where the classical portrait silhouette belongs.

  const px = 29;
  const pz = -79.1;
  const top = world.addPedestal(px, pz, 0.9, 1.02);

  // "Expected: 1847-B" label on the pedestal
  world.addSign({
    x: px + 0.46, y: top - 0.3, z: pz, facing: 'w', w: 0.55, h: 0.18,
    texture: signTexture(['Expected: 1847-B'], { bg: '#efece2', fg: '#5a4030', border: '#a09080', fontSize: 26 }),
  });

  // Filed painting (portrait, initially invisible, appears when filed)
  const filedPortraitMat = new THREE.MeshStandardMaterial({
    map: paintingTexture(CONFIG.seeds.misfiled1847B),
    roughness: 0.65,
  });
  const filedPortrait = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.74), filedPortraitMat);
  filedPortrait.position.set(px, top + 0.38, pz + 0.05);
  filedPortrait.visible = false;
  world.scene.add(filedPortrait);

  // Pedestal group for raycasting (the pedestal mesh isn't directly accessible,
  // so we create a small invisible trigger volume)
  const slotProxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.02, 0.9),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  slotProxy.position.set(px, top / 2, pz);
  world.scene.add(slotProxy);

  ctx.interactables.register({
    objects: [slotProxy],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('1847-B')) return null;
      if (catalog.carriedSlip === '1847-B') return 'E — File correctly';
      if (catalog.carriedSlip !== null) return 'E — File here';
      return null;
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('1847-B')) return;
      const result = catalog.fileAt('1847-B', hud, audio, lighting, dread);
      if (result === 'correct') {
        filedPortrait.visible = true;
        slotProxy.visible = false;
      }
    },
  });

  catalog.onRestore('1847-B', () => {
    filedPortrait.visible = false;
    slotProxy.visible = true;
  });

  const spot = new THREE.SpotLight(0xffe2b0, 55, 10, 0.5, 0.55, 1.6);
  spot.position.set(px, H - 0.15, pz + 0.6);
  spot.target.position.set(px, top, pz);
  world.scene.add(spot, spot.target);

  addArtistNote(ctx, {
    id: 'unlisted-pedestal-note',
    x: px - 0.65, y: 1.05, z: pz + 0.46, facing: 's',
    workTitle: 'Acquisition Record — Pedestal C',
    tiers: [
      'Pedestal reserved for incoming loan. Work expected from Classical Salon.',
      'Pedestal reserved for incoming loan. Work expected from Classical Salon. Transfer date: not recorded.',
      'Pedestal reserved for incoming loan. The pedestal has been empty for longer than the museum has been open.',
    ],
  });

  // dim, half-dead ceiling grid
  for (const x of [24, 34]) {
    for (const z of [-75, -83]) lighting.addPanel(x, H - 0.02, z, 1.2, 2.4, { emissive: 0.55 });
  }
  lighting.addPanel(29, H - 0.02, -75, 1.2, 2.4, { emissive: 0.04 }); // dead panel
  lighting.addPanel(29, H - 0.02, -83, 1.2, 2.4, { emissive: 0.04 }); // dead panel
  lighting.addPoint(24, H - 0.6, -77, 8, 12);
  lighting.addPoint(34, H - 0.6, -81, 8, 12);
  lighting.addPoint(29, H - 0.6, -85.3, 6, 9);

  // ── the sealed exit door ──────────────────────────────────────────────────

  const doorZ = r.z1;
  const doorMat = world.mats.metal;

  // Exit panel light — starts red (locked), turns green when catalog is complete
  const exitLightMat = new THREE.MeshStandardMaterial({
    color: 0x300000, emissive: new THREE.Color(0x8a0505), emissiveIntensity: 1.2, roughness: 0.5,
  });
  const exitLight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.04), exitLightMat);
  exitLight.position.set(29, 2.2, doorZ + 0.06);
  world.scene.add(exitLight);

  const leaf = new THREE.BoxGeometry(0.78, 2.06, 0.1);
  const left = new THREE.Mesh(leaf, doorMat);
  left.position.set(28.6, 1.03, doorZ);
  const right = new THREE.Mesh(leaf, doorMat);
  right.position.set(29.4, 1.03, doorZ);
  left.castShadow = right.castShadow = true;
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 2.06, 0.11),
    new THREE.MeshStandardMaterial({ color: 0x1c1d1e }),
  );
  seam.position.set(29, 1.03, doorZ);
  world.scene.add(left, right, seam);

  const doorCollider = world.addCollider(28.18, doorZ - 0.09, 29.82, doorZ + 0.09);

  let doorState: 'locked' | 'unlocked' | 'opening' | 'open' = 'locked';

  // When catalog completes, turn light green and unlock
  catalog.onComplete(() => {
    if (doorState === 'locked') {
      doorState = 'unlocked';
      exitLightMat.color.set(0x003000);
      exitLightMat.emissive.set(0x0a5a0a);
    }
  });

  let t = 0;
  ctx.addUpdatable((dt) => {
    if (doorState !== 'opening') return;
    t = Math.min(1, t + dt / 1.3);
    const ease = 1 - Math.pow(1 - t, 3);
    left.position.x = 28.6 - 0.82 * ease;
    right.position.x = 29.4 + 0.82 * ease;
    if (t >= 1) doorState = 'open';
  });

  ctx.interactables.register({
    objects: [left, right, seam],
    getPrompt: () => {
      if (doorState === 'locked') return `Sealed — catalog corrected: ${catalog.correctionsCompleted}/${CONFIG.catalog.correctionsRequired}`;
      if (doorState === 'unlocked') return 'E — Submit catalog';
      return null;
    },
    onInteract: () => {
      if (doorState === 'locked') {
        audio.lockedThud();
        hud.toast('The door does not move.');
      } else if (doorState === 'unlocked') {
        doorState = 'opening';
        audio.doorSlide();
        world.removeCollider(doorCollider);
        seam.visible = false;
      }
    },
  });

  // ── Direct-address note #4 ────────────────────────────────────────────────
  // Near the exit door — only readable as a "direct" note; tiers[0] serves as
  // the institutional fallback when dread is too low. The text is a bait —
  // filing the last piece is still the correct move.
  addArtistNote(ctx, {
    id: 'unlisted-direct-exit',
    x: 25.8, y: 1.35, z: r.z1 + 0.12, facing: 's',
    workTitle: 'Exit Notice',
    noteType: 'direct',
    directText: "Leave the last one wrong. They want you to keep walking.",
    tiers: [
      'Exit through Gallery C door once catalog review is complete.',
      'Exit through Gallery C door. The review is never complete.',
      'Exit through Gallery C door. The door has been waiting for a specific catalogue entry. It does not specify which.',
    ],
  });
}

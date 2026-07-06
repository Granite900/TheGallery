/**
 * Zone 2 — Gallery A, the Modern Wing: 16×14m, four geometric sculptures on
 * pedestals, six large framed works, two benches. Exit north-east into the maze.
 *
 * Misfiled work 772-M (small landscape) hangs on the east wall here — it
 * belongs in the service-corridor alcove. The player can remove its loan slip
 * (E — Remove loan slip) and carry it to the correct slot.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { paintingTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildGalleryModern(ctx: ZoneContext): void {
  const { world, lighting, catalog, hud } = ctx;
  const r = CONFIG.zones.galleryModern;
  const H = CONFIG.gallery.ceilingHeight;
  world.markGallery(r);

  world.buildRoom({
    rect: r,
    height: H,
    sides: {
      north: { doors: [{ center: 5, width: 1.6 }] },
      south: { doors: [{ center: 0, width: 1.6 }] },
      east: 'wall',
      west: 'wall',
    },
  });

  // six large frames, three per side wall
  const zs = [-15.5, -19, -22.5];
  zs.forEach((z, i) => {
    world.addFrame({
      x: r.x1 + 0.08, y: 1.75, z, facing: 'e', w: 2.0, h: 1.5,
      seed: CONFIG.seeds.modernPaintings + i,
    });
    world.addFrame({
      x: r.x2 - 0.08, y: 1.75, z, facing: 'w', w: 2.0, h: 1.5,
      seed: CONFIG.seeds.modernPaintings + 3 + i,
    });
  });

  // four geometric sculptures
  const sculptMats = [
    new THREE.MeshStandardMaterial({ color: 0x8c2f2f, roughness: 0.42, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.35, metalness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: 0x3d5166, roughness: 0.4, metalness: 0.3 }),
  ];

  const addSculpture = (x: number, z: number, make: (m: THREE.Material) => THREE.Object3D, mat: THREE.Material) => {
    const top = world.addPedestal(x, z, 0.7, 0.85);
    const s = make(mat);
    s.position.set(x, top, z);
    s.traverse((c) => {
      if (c instanceof THREE.Mesh) c.castShadow = true;
    });
    world.scene.add(s);
  };

  addSculpture(-4.5, -15.5, (m) => {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), m);
    g.position.y = 0.4;
    const holder = new THREE.Group();
    holder.add(g);
    return holder;
  }, sculptMats[0]);

  addSculpture(4.5, -15.5, (m) => {
    const g = new THREE.Mesh(new THREE.TorusKnotGeometry(0.24, 0.075, 96, 12), m);
    g.position.y = 0.42;
    g.rotation.x = 0.4;
    const holder = new THREE.Group();
    holder.add(g);
    return holder;
  }, sculptMats[1]);

  addSculpture(-4.5, -22.5, (m) => {
    const holder = new THREE.Group();
    const sizes = [0.5, 0.36, 0.24];
    let y = 0;
    sizes.forEach((s, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.55, s), m);
      b.position.y = y + s * 0.275;
      b.rotation.y = i * 0.5;
      y += s * 0.55;
      holder.add(b);
    });
    return holder;
  }, sculptMats[2]);

  addSculpture(4.5, -22.5, (m) => {
    const holder = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.62, 5), m);
    cone.position.y = 0.31;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), m);
    ball.position.y = 0.72;
    holder.add(cone, ball);
    return holder;
  }, sculptMats[3]);

  // benches
  world.addBench(0, -17.5);
  world.addBench(0, -20.5);

  // artist notes
  addArtistNote(ctx, {
    id: 'modern-form-without-audience',
    x: r.x2 - 0.08, z: -14.2, facing: 'w',
    workTitle: 'Form Without Audience (1969)',
    tiers: [
      'Steel, painted. The artist requested this work face away from the entrance.',
      'Steel, painted. The artist requested this work face away from the entrance. Curators have been unable to determine which side is the front.',
      'Steel, painted. The artist requested this work face away from the entrance. It is currently facing you.',
    ],
  });
  addArtistNote(ctx, {
    id: 'modern-bench',
    x: r.x1 + 0.08, z: -20.6, facing: 'e',
    workTitle: 'Bench (functional)',
    tiers: [
      'Not part of the collection. Please feel free to sit.',
      'Not part of the collection. Please do not interpret.',
      'Not part of the collection. It was here before the room was built around it.',
    ],
  });

  // ── Misfiled work 772-M ───────────────────────────────────────────────────
  // Small landscape painting on the east wall — belongs in the service
  // corridor alcove, not here. The player can remove its loan slip.

  catalog.register('772-M');

  const misfiled772 = world.addFrame({
    x: r.x2 - 0.08, y: 1.55, z: -17, facing: 'w', w: 1.0, h: 0.72,
    seed: CONFIG.seeds.misfiled772M,
  });

  // Artist note for 772-M (tiers hint at the wrong placement)
  addArtistNote(ctx, {
    id: 'modern-772m-note',
    x: r.x2 - 0.08, y: 1.05, z: -17, facing: 'w',
    workTitle: 'Untitled Landscape (772-M)',
    tiers: [
      'Oil on board, c. 1953. On long-term display in the Modern Wing since 2011. Catalog ref: 772-M.',
      'Oil on board, c. 1953. On long-term display in the Modern Wing since 2011. Verification of placement: pending. Catalog ref: 772-M.',
      'Oil on board, c. 1953. The hook in the corridor below this floor expects this work. Catalog ref: 772-M.',
    ],
  });

  // Slip-pickup interactable on the frame itself
  ctx.interactables.register({
    objects: [misfiled772.group],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('772-M')) return null;
      if (catalog.carriedSlip !== null) return null; // already carrying
      return 'E — Remove loan slip';
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('772-M')) return;
      if (catalog.carriedSlip !== null) {
        hud.toast('You are already carrying a loan slip.');
        return;
      }
      catalog.pickUp('772-M', hud);
    },
  });

  // When 772-M is picked up, show the frame as empty
  catalog.onPickUp('772-M', () => misfiled772.setBlank(true));
  // When 772-M is restored (deja vu reversal), show the painting again
  catalog.onRestore('772-M', () => misfiled772.setBlank(false));

  // lighting: six recessed panels, three warm area lights
  for (const x of [-4, 4]) {
    for (const z of [-15, -19, -23]) {
      lighting.addPanel(x, H - 0.02, z, 1.2, 2.4);
    }
  }
  lighting.addPoint(0, H - 0.5, -15, 20, 14);
  lighting.addPoint(-4, H - 0.5, -21, 16, 12);
  lighting.addPoint(4, H - 0.5, -21, 16, 12);

  // Warm accent on the misfiled work
  lighting.addPoint(r.x2 - 0.5, 2.2, -17, 4, 5, 0xfff0d0);
}

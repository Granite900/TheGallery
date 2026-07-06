/**
 * Zone 1 — a 12m corridor lined with small framed works every 1.8m, leading
 * from the lobby's double doors into Gallery A. One ~2m stretch has dead
 * ceiling panels — a deliberate dark patch the player must walk through.
 *
 * Misfiled work 019-UNLISTED (abstract sculpture on a small pedestal) sits
 * mid-corridor against the west wall. It belongs in the lobby behind the
 * reception desk. The player can remove its loan slip and carry it there.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildEntryCorridor(ctx: ZoneContext): void {
  const { world, lighting, hud, catalog } = ctx;
  const r = CONFIG.zones.entryCorridor;
  const H = CONFIG.corridor.height;

  world.buildRoom({
    rect: r,
    height: H,
    sides: { north: 'open', south: 'open', east: 'wall', west: 'wall' },
  });

  // framed works every 1.8m on both walls
  const frameZs = [-1.6, -3.4, -5.2, -7.0, -8.8, -10.6];
  frameZs.forEach((z, i) => {
    world.addFrame({
      x: r.x1 + 0.08, z, facing: 'e', w: 0.8, h: 0.62,
      seed: CONFIG.seeds.entryPaintings + i,
    });
    world.addFrame({
      x: r.x2 - 0.08, z, facing: 'w', w: 0.8, h: 0.62,
      seed: CONFIG.seeds.entryPaintings + 6 + i,
    });
  });

  // sprint-tutorial artist note
  addArtistNote(ctx, {
    id: 'entry-welcome',
    x: r.x1 + 0.08, z: -2.5, facing: 'e',
    workTitle: 'Welcome',
    tiers: [
      'Welcome to the lower collection. Visitors often move quickly between wings — hold Shift to walk faster. The floor is more level than it appears. Please retain your ticket.',
      'Welcome to the lower collection. Visitors often move quickly between wings — hold Shift to walk faster. The floor is more level than it appears. Please retain your ticket, in case you are asked for it.',
      'Welcome to the lower collection. Visitors often move quickly between wings — hold Shift to walk faster. The floor is more level than it appears. No one has asked to see a ticket in some time.',
    ],
    onFirstRead: () => hud.showSprintHint(),
  });

  addArtistNote(ctx, {
    id: 'entry-arrangement-grey',
    x: r.x1 + 0.08, z: -6.1, facing: 'e',
    workTitle: 'Untitled (Arrangement in Grey)',
    tiers: [
      'Oil on canvas, 1962. On loan from the Hartwell Foundation. Please do not touch the frame.',
      'Oil on canvas, 1962. On loan from the Hartwell Foundation. The foundation has not confirmed receipt of this work.',
      'Oil on canvas, 1962. The artist signed the back twice. The second signature is yours.',
    ],
  });
  addArtistNote(ctx, {
    id: 'entry-corridor-studies',
    x: r.x2 - 0.08, z: -7.9, facing: 'w',
    workTitle: 'Corridor Studies I–XII',
    tiers: [
      'Mixed media, undated. The collection continues in the next hall.',
      'Mixed media, undated. The collection continues in the next hall. Visitors are reminded that the collection continues.',
      'Mixed media, undated. Study VII has been recatalogued as Study I. No other changes were made.',
    ],
  });

  // ── Misfiled work 019-UNLISTED ────────────────────────────────────────────
  // Abstract sculpture on a small pedestal, west-wall side of the corridor.
  // Belongs in the lobby behind the reception desk.

  catalog.register('019-UNLISTED');

  const pedestalX = -0.52;
  const pedestalZ = -6.2;
  const pedestalTop = world.addPedestal(pedestalX, pedestalZ, 0.38, 0.72);

  // Abstract sculpture geometry
  const sculptMat = new THREE.MeshStandardMaterial({ color: 0x9a9282, roughness: 0.55, metalness: 0.15 });
  const sculptGroup = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 10), sculptMat);
  base.position.y = 0.04;
  const body = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 10, 24), sculptMat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.22;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 6), sculptMat);
  spike.position.y = 0.42;
  spike.rotation.z = 0.2;
  sculptGroup.add(base, body, spike);
  sculptGroup.position.set(pedestalX, pedestalTop, pedestalZ);
  sculptGroup.castShadow = true;
  world.scene.add(sculptGroup);

  // Artist note for 019-UNLISTED
  addArtistNote(ctx, {
    id: 'entry-019-unlisted-note',
    x: r.x2 - 0.08, z: -6.2, facing: 'w',
    workTitle: 'Untitled (019-UNLISTED)',
    tiers: [
      'Mixed media, undated. Temporary placement. Not for public viewing. Catalog ref: 019-UNLISTED.',
      'Mixed media, undated. Temporary placement. Not for public viewing. Placement date: not recorded. Catalog ref: 019-UNLISTED.',
      'Mixed media, undated. Temporary placement. The reception desk in the lobby shows a mounting bracket that matches the base of this piece. Catalog ref: 019-UNLISTED.',
    ],
  });

  // Slip-pickup interactable (the sculpture + pedestal region)
  ctx.interactables.register({
    objects: [sculptGroup],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('019-UNLISTED')) return null;
      if (catalog.carriedSlip !== null) return null;
      return 'E — Remove loan slip';
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('019-UNLISTED')) return;
      if (catalog.carriedSlip !== null) {
        hud.toast('You are already carrying a loan slip.');
        return;
      }
      catalog.pickUp('019-UNLISTED', hud);
    },
  });

  catalog.onPickUp('019-UNLISTED', () => { sculptGroup.visible = false; });
  catalog.onRestore('019-UNLISTED', () => { sculptGroup.visible = true; });

  // fluorescent panels + lights
  for (const z of [-1.8, -4.6, -10.2]) {
    lighting.addPanel(0, H - 0.02, z, 0.6, 1.2);
    lighting.addPoint(0, H - 0.4, z, 4.5, 5);
  }
  lighting.addPanel(0, H - 0.02, -7.4, 0.6, 1.2, { emissive: 0.05, unique: true }); // dead panel

  const dark = CONFIG.darkSpots.entryCorridor[0];
  lighting.addDarkSpot(world, dark, 0, H - 0.4, -7.4);
}

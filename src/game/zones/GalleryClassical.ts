/**
 * Zone 4 — Gallery B, the Classical Wing: 18×12m, gold-framed works,
 * a full mirror wall on the south side.
 * Exit north into the service corridor.
 *
 * Misfiled work 1847-B (classical portrait silhouette) hangs near the mirror
 * on the south wall. It belongs in the Gallery C pedestal slot. The player
 * can remove its loan slip and carry it there.
 *
 * Direct-address note #2 is near the mirror.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { MirrorWall } from './MirrorWall';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildGalleryClassical(ctx: ZoneContext): void {
  const { world, lighting, catalog, hud } = ctx;
  const r = CONFIG.zones.galleryClassical;
  const H = CONFIG.gallery.ceilingHeight;
  world.markGallery(r);

  world.buildRoom({
    rect: r,
    height: H,
    sides: {
      north: { doors: [{ center: 29, width: 1.4 }] },
      south: 'wall',
      east: 'wall',
      west: { doors: [{ center: -45.1, width: 1.6 }] },
    },
  });

  // The Long Intermission — formerly anchor1, now a regular framed work
  const longIntermission = world.addFrame({
    x: r.x2 - 0.08, y: 1.7, z: -45.1, facing: 'w', w: 1.6, h: 1.2,
    seed: CONFIG.seeds.misfiled772M + 3, // repurposed seed slot
    gold: true,
  });
  void longIntermission; // decorative only
  addArtistNote(ctx, {
    id: 'classical-long-intermission',
    x: r.x2 - 0.08, y: 1.25, z: -43.7, facing: 'w',
    workTitle: 'The Long Intermission',
    tiers: [
      'Oil on panel. One of three works the museum is required to keep on permanent view.',
      'Oil on panel. One of three works the museum is required to keep on permanent view. Cataloging staff: verify presence and continue.',
      'Oil on panel. One of three works the museum is required to keep on permanent view. It was already here when you counted it.',
    ],
  });

  // supporting gold-framed works
  world.addFrame({ x: 25, y: 1.7, z: r.z1 + 0.08, facing: 's', w: 1.4, h: 1.1, seed: CONFIG.seeds.classicalPaintings, gold: true });
  world.addFrame({ x: 33, y: 1.7, z: r.z1 + 0.08, facing: 's', w: 1.4, h: 1.1, seed: CONFIG.seeds.classicalPaintings + 1, gold: true });
  world.addFrame({ x: r.x1 + 0.08, y: 1.7, z: -49, facing: 'e', w: 1.0, h: 1.3, seed: CONFIG.seeds.classicalPaintings + 2, gold: true });

  addArtistNote(ctx, {
    id: 'classical-portrait-docent',
    x: r.x1 + 0.08, z: -47.9, facing: 'e',
    workTitle: 'Portrait of a Docent',
    tiers: [
      'Oil on canvas. The sitter was employed here for forty-one years.',
      'Oil on canvas. The sitter was employed here for forty-one years. No record of the hiring exists.',
      'Oil on canvas. The sitter was employed here for forty-one years. The employment record ends the year the painting was acquired, not before.',
    ],
  });

  // mirror wall (south)
  const mirror = new MirrorWall(13, 2.9, {
    textureSize: 512,
    color: 0xb8b4aa,
    clipBias: 0.01,
  });
  mirror.position.set(29.1, 1.55, r.z2 - 0.16);
  mirror.rotation.y = Math.PI;
  world.scene.add(mirror);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3.1, 0.05), world.mats.darkMetal);
  trim.position.set(29.1, 1.55, r.z2 - 0.13);
  world.scene.add(trim);

  addArtistNote(ctx, {
    id: 'classical-mirror-wall',
    x: 22.4, z: r.z2 - 0.1, facing: 'n',
    workTitle: 'Mirror Wall (installed 1981)',
    tiers: [
      'Installed to make the room feel larger.',
      'Installed to make the room feel larger. The room is larger.',
      'Installed to make the room feel larger. Count the benches in the reflection before you count the room.',
    ],
  });

  world.addBench(29.1, -43.2);

  // ── Misfiled work 1847-B ─────────────────────────────────────────────────
  // Classical portrait silhouette near the mirror wall — belongs on the
  // empty pedestal in Gallery C (galleryUnlisted). Loan slip removable.

  catalog.register('1847-B');

  // Portrait frame on south wall, to the west of the mirror (x≈22, facing north)
  const misfiled1847 = world.addFrame({
    x: 22.2, y: 1.65, z: r.z2 - 0.08, facing: 'n', w: 0.85, h: 1.15,
    seed: CONFIG.seeds.misfiled1847B, gold: true,
  });

  addArtistNote(ctx, {
    id: 'classical-1847b-note',
    x: 21.5, z: r.z2 - 0.08, y: 1.05, facing: 'n',
    workTitle: 'Portrait (Silhouette) 1847-B',
    tiers: [
      'Oil on canvas. Listed under Classical Salon inventory. Verification pending. Catalog ref: 1847-B.',
      'Oil on canvas. Listed under Classical Salon inventory. Verification pending. The record shows a different room. Catalog ref: 1847-B.',
      'Oil on canvas. The subject faces away in every known reproduction. It does not face away here. Catalog ref: 1847-B.',
    ],
  });

  ctx.interactables.register({
    objects: [misfiled1847.group],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('1847-B')) return null;
      if (catalog.carriedSlip !== null) return null;
      return 'E — Remove loan slip';
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('1847-B')) return;
      if (catalog.carriedSlip !== null) {
        hud.toast('You are already carrying a loan slip.');
        return;
      }
      catalog.pickUp('1847-B', hud);
    },
  });

  catalog.onPickUp('1847-B', () => misfiled1847.setBlank(true));
  catalog.onRestore('1847-B', () => misfiled1847.setBlank(false));

  // ── Direct-address note #2 ────────────────────────────────────────────────
  // Near the mirror — "Don't turn around to check. You already did."
  addArtistNote(ctx, {
    id: 'classical-direct-mirror',
    x: 35.5, z: r.z2 - 0.08, y: 1.35, facing: 'n',
    workTitle: 'Notice',
    noteType: 'direct',
    directText: "Don't turn around to check. You already did.",
    tiers: [
      'Gallery survey note. Reflection calibration in progress. Please face the mirror.',
      'Gallery survey note. Reflection calibration in progress. The mirror is behind you.',
      'Gallery survey note. Reflection calibration in progress. The mirror has been behind you this whole time.',
    ],
  });

  // lighting
  for (const x of [24, 29, 34]) {
    for (const z of [-42.5, -47.5]) {
      lighting.addPanel(x, H - 0.02, z, 1.2, 2.4);
    }
  }
  lighting.addPoint(24, H - 0.6, -45, 18, 13);
  lighting.addPoint(34, H - 0.6, -45, 18, 13);
  lighting.addPoint(29, H - 0.6, -48.5, 12, 11);
  // accent on 1847-B
  lighting.addPoint(22.2, 2.5, r.z2 - 0.5, 4, 5, 0xffd9a0);
}

/**
 * Zone 5 — 12m service corridor: 2.3m ceiling, concrete floor, four
 * fluorescent tubes of which two flicker, ceiling pipes, a STAFF ONLY sign,
 * and a shallow alcove where 772-M belongs (the correct slot for that
 * misfiled landscape from the Modern Wing).
 *
 * The corridor now begins where the Lobby Echo ends — the game's second déjà
 * vu beat is a full-size copy of the lobby (see zones/Lobby.ts's
 * `buildLobbyEcho`) that the player walks through on the only path forward,
 * right after the mirror room and before this corridor. It can't be missed or
 * skipped like the maze's optional west-wing repeat.
 *
 * Direct-address note #3 is adjacent to the first dark spot.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { signTexture, paintingTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildServiceCorridor(ctx: ZoneContext): void {
  const { world, lighting, catalog, hud, audio, dread } = ctx;
  const r = CONFIG.zones.serviceCorridor;
  const a = CONFIG.zones.serviceAlcove;
  const H = CONFIG.serviceCorridor.height;

  world.buildRoom({
    rect: r,
    height: H,
    sides: {
      north: 'open',
      south: 'open',
      east: { doors: [{ center: -61, width: 2.0, height: H + 0.5 }] },
      west: 'wall',
    },
    floor: 'concrete',
  });
  world.buildRoom({
    rect: a,
    height: H,
    sides: { north: 'wall', south: 'wall', east: 'wall', west: 'open' },
    floor: 'concrete',
  });

  // STAFF ONLY at the corridor mouth — the first thing seen on stepping out
  // of the Lobby Echo and into the concrete service run.
  world.addSign({
    x: r.x2 - 0.08, y: 1.75, z: -59.7, facing: 'w', w: 0.85, h: 0.45,
    texture: signTexture(['STAFF ONLY']),
  });

  // -- silhouette glimpse #2: peering out of the alcove --------------------
  // The corridor's own east wall hides the figure almost entirely — it stands
  // just inside the alcove mouth, so only a sliver leans into view for the
  // couple of steps where the opening lines up, then the wall corner hides it
  // again. Fires just before the alcove so it's already there as it lines up.
  // Trigger fires just past the painting/note area of the corridor (~z=-65).
  // The figure stands at the very end of the service corridor, tucked against
  // the east wall so the wall corner hides roughly half of it. It holds there,
  // head tracking the player, until the player looks at it, then a 0.75 s timer
  // runs and it slides off to the player's right and fades.
  const glimpse2 = world.addTrigger({ x1: r.x1, z1: -65.5, x2: r.x2, z2: -64.5 }, () => {
    glimpse2.active = false;
    // (30.0, -70.6): against the east wall (x=30.1) near the south end,
    // ~half-occluded by the wall; auto-faces the player.
    ctx.dread.triggerGlimpseAt(30.0, -70.6);
  });

  // ceiling pipes along the west edge
  const pipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 20, 10);
  const p1 = new THREE.Mesh(pipeGeo, world.mats.darkMetal);
  p1.rotation.x = Math.PI / 2;
  p1.position.set(r.x1 + 0.22, H - 0.16, -61.1);
  const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 20, 10), world.mats.metal);
  p2.rotation.x = Math.PI / 2;
  p2.position.set(r.x1 + 0.38, H - 0.26, -61.1);
  world.scene.add(p1, p2);

  addArtistNote(ctx, {
    id: 'service-inventory-44c',
    x: r.x1 + 0.08, z: -64, facing: 'e',
    workTitle: 'Inventory Note 44-C',
    tiers: [
      'Works in this corridor are in transit.',
      'Works in this corridor are in transit. They have been in transit since acquisition.',
      'Works in this corridor are in transit. So, according to the log, are you.',
    ],
  });

  // ── Direct-address note #3 ────────────────────────────────────────────────
  // Adjacent to the second dark patch — "He's right behind you."
  // On re-reads, shows the longer subtext.
  addArtistNote(ctx, {
    id: 'service-direct-behind',
    x: r.x2 - 0.08, z: -62, y: 1.35, facing: 'w',
    workTitle: 'Maintenance Note',
    noteType: 'direct',
    directText: "He's right behind you.",
    directTextReread: "He's right behind you.\n\nHe has been behind you since the lobby.",
    tiers: [
      'Corridor note: light maintenance in progress. Please continue through.',
      'Corridor note: light maintenance. The maintenance log shows no active work orders.',
      'Corridor note: light maintenance. The last entry reads: something followed the cataloger in.',
    ],
  });

  // four tubes; two flicker (indices + rates from config)
  const tubeZs = [-60.5, -63.5, -66.5, -69.5];
  const flickerSet = new Map<number, number>();
  CONFIG.flicker.tubeIndices.forEach((idx, i) => flickerSet.set(idx, CONFIG.flicker.rates[i]));

  tubeZs.forEach((z, i) => {
    const rate = flickerSet.get(i);
    const mat = lighting.addPanel(29, H - 0.02, z, 0.15, 1.3, {
      emissive: 2.0,
      color: 0xf2f7e6,
    });
    if (rate !== undefined) {
      const light = lighting.addPoint(29, H - 0.32, z, 4, 6, 0xe8f0d8);
      lighting.addFlicker(light, mat, rate);
    }
  });

  const ds = CONFIG.darkSpots.serviceCorridor;
  lighting.addDarkSpot(world, ds[0], 29, H - 0.32, -60.8);
  lighting.addDarkSpot(world, ds[1], 29, H - 0.32, -68.2);

  // ── Correct slot for 772-M ────────────────────────────────────────────────
  // An empty hook on the alcove's east wall with "Expected: 772-M" label.
  // When the matching slip is filed, the landscape painting appears here.

  // Hook bracket visual
  const hookGroup = new THREE.Group();
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.03, 0.12),
    world.mats.darkMetal,
  );
  bracket.position.set(0, 0, 0.06);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8),
    world.mats.darkMetal,
  );
  pin.rotation.z = Math.PI / 2;
  pin.position.set(0.12, 0, 0.13);
  hookGroup.add(bracket, pin);
  hookGroup.position.set(a.x2 - 0.08, 1.52, -61);
  hookGroup.rotation.y = -Math.PI / 2; // face west (into corridor)
  world.scene.add(hookGroup);

  // "Expected: 772-M" label
  world.addSign({
    x: a.x2 - 0.08, y: 1.12, z: -61, facing: 'w', w: 0.55, h: 0.2,
    texture: signTexture(['Expected: 772-M'], { bg: '#efece2', fg: '#5a4030', border: '#a09080', fontSize: 28 }),
  });

  // Filed painting (initially invisible)
  const filedPaintMat = new THREE.MeshStandardMaterial({
    map: paintingTexture(CONFIG.seeds.misfiled772M),
    roughness: 0.7,
  });
  const filedPaint = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.58), filedPaintMat);
  filedPaint.position.set(a.x2 - 0.1, 1.52, -61);
  filedPaint.rotation.y = -Math.PI / 2;
  filedPaint.visible = false;
  world.scene.add(filedPaint);

  // Generous invisible hit-box — the visible hook/bracket geometry is tiny
  // (a few cm) and very hard to aim the crosshair at precisely; this proxy
  // covers the hook, the label, and the space the painting appears in so
  // the interaction reliably registers.
  const slotProxy772 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.9),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  slotProxy772.position.set(a.x2 - 0.25, 1.3, -61);
  world.scene.add(slotProxy772);

  // Slot interactable
  ctx.interactables.register({
    objects: [hookGroup, slotProxy772],
    getPrompt: () => {
      if (catalog.isCorrectlyFiled('772-M')) return null;
      if (catalog.carriedSlip === '772-M') return 'E — File correctly';
      if (catalog.carriedSlip !== null) return 'E — File here';
      return null;
    },
    onInteract: () => {
      if (catalog.isCorrectlyFiled('772-M')) return;
      const result = catalog.fileAt('772-M', hud, audio, lighting, dread);
      if (result === 'correct') {
        filedPaint.visible = true;
      }
    },
  });

  // If 772-M is restored by deja vu, hide the filed painting again
  catalog.onRestore('772-M', () => { filedPaint.visible = false; });

  lighting.addPoint(30.9, H - 0.35, -61, 3, 4.5, 0xffe0b8);
}

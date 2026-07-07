/**
 * Zone 3 — corridor maze between the two wings.
 *   Segment A: 10m straight run.
 *   Segment B: L-turn, 8m east then 8m north.
 *   Segment C: T-junction. RIGHT (east) leads to Gallery B (Classical Wing) —
 *   the only way forward. LEFT (west) is a self-contained dead-end pocket
 *   that hosts the game's déjà vu repeat — reached and left entirely on
 *   foot, with no teleporting or fades of any kind:
 *
 *     The player can walk all the way down the "closed" west wing. Past an
 *     ordinary renovation notice, the corridor's far end turns out to reuse
 *     the exact painting seeds from the entry corridor they already walked
 *     through at the start of the game — same pictures, same layout — with
 *     one deliberately wrong detail permanently baked in (the near frame is
 *     empty). Entering that pocket leaves a frozen, translucent figure
 *     standing in it and starts a delayed second footstep layer; both stop
 *     the moment the player turns around and walks back out. The dead end's
 *     own wall is what turns them back — never a scripted redirect.
 */
import { CONFIG } from '../../config';
import { signTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

export function buildCorridorMaze(ctx: ZoneContext): void {
  const { world, lighting, player, dejaVu, catalog, hud } = ctx;
  const Z = CONFIG.zones;
  const H = CONFIG.corridor.height;
  const full = { height: H + 0.5 }; // door gaps with no lintel (open junction)

  // Segment A — straight
  world.buildRoom({
    rect: Z.mazeA,
    height: H,
    sides: { north: 'open', south: 'open', east: 'wall', west: 'wall' },
  });
  // Segment B — east run, then north run
  world.buildRoom({
    rect: Z.mazeB1,
    height: H,
    sides: {
      north: { doors: [{ center: 13, width: 2.2, ...full }] },
      south: { doors: [{ center: 5, width: 2.2, ...full }] },
      east: 'wall',
      west: 'wall',
    },
  });
  world.buildRoom({
    rect: Z.mazeB2,
    height: H,
    sides: { north: 'open', south: 'open', east: 'wall', west: 'wall' },
  });
  // Segment C — T-junction bar (west branch dead-ends, east goes to Gallery B)
  world.buildRoom({
    rect: Z.mazeC,
    height: H,
    sides: {
      north: 'wall',
      south: { doors: [{ center: 13, width: 2.2, ...full }] },
      east: 'open',
      west: 'wall',
    },
  });

  // -- décor ---------------------------------------------------------------

  // Segment A frames
  world.addFrame({ x: Z.mazeA.x2 - 0.08, z: -29, facing: 'w', w: 0.8, h: 0.62, seed: CONFIG.seeds.mazePaintings });
  world.addFrame({ x: Z.mazeA.x2 - 0.08, z: -33, facing: 'w', w: 0.8, h: 0.62, seed: CONFIG.seeds.mazePaintings + 1 });
  world.addFrame({ x: Z.mazeA.x1 + 0.08, z: -31, facing: 'e', w: 0.8, h: 0.62, seed: CONFIG.seeds.mazePaintings + 2 });

  // ── Direct-address note #1 ────────────────────────────────────────────────
  // Mid segment A, on a generic frame — "You slowed down here last time too."
  addArtistNote(ctx, {
    id: 'maze-direct-slowed-down',
    x: Z.mazeA.x1 + 0.08, z: -29, y: 1.35, facing: 'e',
    workTitle: 'Survey Note',
    noteType: 'direct',
    directText: 'You slowed down here last time too.',
    tiers: [
      'Visitor traffic survey. Movement logging in progress.',
      'Visitor traffic survey. Movement logging in progress. This segment shows unusual dwell times.',
      'Visitor traffic survey. The log shows you have been here before. The date is blank.',
    ],
  });

  // Segment B frame
  world.addFrame({ x: 9, z: Z.mazeB1.z1 + 0.08, facing: 's', w: 0.8, h: 0.62, seed: CONFIG.seeds.mazePaintings + 3 });

  // Junction wayfinding sign
  world.addSign({
    x: 13, y: 1.75, z: Z.mazeC.z1 + 0.08, facing: 's', w: 1.3, h: 0.5,
    texture: signTexture(['GALLERY B →', '← WEST WING'], {
      bg: '#efece2', fg: '#3a362c', border: '#3a362c',
    }),
  });

  // -- dark spots (2 patches, dead panels + dedicated dimmable lights) ------

  lighting.addPanel(5, H - 0.02, -28, 0.6, 1.2);
  lighting.addPoint(5, H - 0.4, -28, 4.5, 6);
  lighting.addPanel(5, H - 0.02, -31.2, 0.6, 1.2, { emissive: 0.05, unique: true }); // dead
  lighting.addPanel(5, H - 0.02, -34.4, 0.6, 1.2);
  lighting.addPoint(5, H - 0.4, -34.4, 4.5, 6);
  lighting.addDarkSpot(world, CONFIG.darkSpots.corridorMaze[0], 5, H - 0.4, -31.2);

  lighting.addPanel(8, H - 0.02, -37.1, 1.2, 0.6);
  lighting.addPanel(11.5, H - 0.02, -37.1, 1.2, 0.6);
  lighting.addPoint(9.5, H - 0.4, -37.1, 4.5, 8);
  lighting.addPanel(13, H - 0.02, -41, 0.6, 1.2, { emissive: 0.05, unique: true }); // dead
  lighting.addDarkSpot(world, CONFIG.darkSpots.corridorMaze[1], 13, H - 0.4, -41);

  for (const x of [3, 7.5, 12.5, 17]) lighting.addPanel(x, H - 0.02, -45.1, 1.2, 0.6);
  lighting.addPoint(5, H - 0.4, -45.1, 4, 8);
  lighting.addPoint(13, H - 0.4, -45.1, 4.5, 8);
  lighting.addPoint(17.8, H - 0.4, -45.1, 4, 7);

  // -- west branch: the déjà vu repeat lives here (see file header) --------
  // Entirely walkable, no teleporting — the player goes in and comes back
  // out under their own steam, stopped only by the dead end's own wall.

  // Ordinary decor on the way in — plain atmosphere, no déjà vu attached.
  world.addFrame({
    x: 10.3, z: Z.mazeC.z1 + 0.08, facing: 's', w: 0.8, h: 0.62, seed: CONFIG.seeds.dejaVuPainting,
  });
  addArtistNote(ctx, {
    id: 'maze-notice-renovation',
    x: 9.5, z: Z.mazeC.z1 + 0.08, facing: 's',
    workTitle: 'Notice of Renovation',
    tiers: [
      'Wing renovation scheduled 1987. Please pardon our appearance.',
      'Wing renovation scheduled 1987. Wing renovation scheduled 1987.',
      'Wing renovation scheduled 1987. You may have read this already.',
    ],
  });

  // The déjà vu pocket at the very end — the exact painting seeds from the
  // real entry corridor, reused here, with one frame permanently empty.
  world.addFrame({ x: 3.2, z: Z.mazeC.z1 + 0.08, facing: 's', w: 0.8, h: 0.62, seed: CONFIG.seeds.entryPaintings });
  world.addFrame({
    x: 1.8, z: Z.mazeC.z1 + 0.08, facing: 's', w: 0.8, h: 0.62, seed: CONFIG.seeds.entryPaintings + 1, blank: true,
  });
  addArtistNote(ctx, {
    id: 'maze-echo-arrangement-grey',
    x: 2.5, z: Z.mazeC.z1 + 0.08 + 1.05, facing: 's',
    workTitle: 'Untitled (Arrangement in Grey)',
    tiers: [
      'Oil on canvas, 1962. On loan from the Hartwell Foundation.',
      'Oil on canvas, 1962. This appears to be a duplicate of a work already catalogued.',
      'Oil on canvas, 1962. There is only one of these. You have seen it twice.',
    ],
  });
  lighting.addPanel(2.5, H - 0.02, -45.1, 1.6, 0.6);
  lighting.addPoint(2.5, H - 0.4, -45.1, 4, 6);

  // Dead-end sign
  world.addSign({
    x: Z.mazeC.x1 + 0.08, y: 1.7, z: -45.1, facing: 'e', w: 0.95, h: 0.5,
    texture: signTexture(['WEST WING', 'CLOSED'], { bg: '#efece2' }),
  });

  // East branch frame
  world.addFrame({ x: 17, z: Z.mazeC.z2 - 0.08, facing: 'n', w: 0.8, h: 0.62, seed: CONFIG.seeds.mazePaintings + 4 });

  // -- silhouette glimpse #1: around the Segment B L-turn ------------------
  // Segment B is a genuine 90° corner (8m east along mazeB1, then 8m north
  // up mazeB2) — the actual wall at that corner hides mazeB2 completely
  // while walking mazeB1, so the figure standing just past the turn is only
  // revealed the moment the player turns to head north, then gone again
  // within about a second.
  // Trigger fires as the player enters the north leg of the L-turn (mazeB2),
  // just after rounding the corner. The figure stands at the FAR (south) end
  // of this corridor, tucked against the east wall so the wall corner hides
  // roughly half of it — the player sees it peering back at them from the end
  // of the hallway. It holds until looked at, then slides right and fades.
  const glimpse1 = world.addTrigger({ x1: Z.mazeB2.x1, z1: -39.6, x2: Z.mazeB2.x2, z2: -38.4 }, () => {
    glimpse1.active = false;
    // (14.0, -43.4): against the east wall (x=14.1) near the south end,
    // ~half-occluded by the wall; auto-faces the player.
    ctx.dread.triggerGlimpseAt(14.0, -43.4);
  });

  // -- déjà vu: whole pocket is the trigger zone, entered/left on foot -----
  // (Stays `active` for the whole game so the exit side still fires even
  // after the repeat is consumed — only the ghost/footstep-echo spawn is
  // one-time, gated by `canRepeat` below.)
  const echoZone = { x1: Z.mazeC.x1, z1: Z.mazeC.z1, x2: 4.0, z2: Z.mazeC.z2 };
  world.addTrigger(
    echoZone,
    () => {
      if (!dejaVu.canRepeat('entryCorridorEcho')) return;
      dejaVu.consumeRepeat('entryCorridorEcho');
      dejaVu.spawnEchoGhost(1.3, -45.1, Math.PI / 2);
      dejaVu.attachFootstepEcho(player);
      // 50% chance: if 019-UNLISTED was already corrected, restore it here
      // (catalog reversal — "The catalog fights back once")
      if (catalog.isCorrectlyFiled('019-UNLISTED') && Math.random() < 0.5) {
        catalog.restore('019-UNLISTED', hud);
        hud.toast('Something has moved.', 3000);
      }
    },
    () => dejaVu.detachFootstepEcho(player),
  );
}

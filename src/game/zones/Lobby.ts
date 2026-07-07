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
 *
 * The lobby geometry is built by the shared `buildLobbyShell` helper below so
 * that it can be reproduced verbatim as the **Lobby Echo** (`buildLobbyEcho`):
 * an identical, full-size copy of this room dropped onto the mandatory path
 * just after the mirror room, deep underground — same desk, same coat rack,
 * same benches, same directory — so the player walks in and feels, wrongly,
 * that they have looped back to the start. The only differences are the
 * directory's last line ("UNLISTED — OPEN" instead of "CLOSED"), a frozen
 * echo of themselves standing in it, and a delayed second footstep layer.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { signTexture } from '../../utils/textures';
import type { ZoneContext } from './ZoneContext';
import { addArtistNote } from './ArtistNote';

interface LobbyShellOpts {
  /** World-space translation applied to every piece of the lobby. */
  ox: number;
  oz: number;
  /** true for the deep-underground déjà-vu copy. */
  echo: boolean;
}

/** The real lobby at the start of the tour. */
export function buildLobby(ctx: ZoneContext): void {
  buildLobbyShell(ctx, { ox: 0, oz: 0, echo: false });
}

/**
 * The Lobby Echo — a verbatim, full-size copy of the lobby inserted between
 * the mirror room and the exit. Translated by (+29, -59.1) so its forward
 * (double-door) end opens north into the service corridor, exactly as the
 * real lobby's doors open into the entry corridor.
 */
export function buildLobbyEcho(ctx: ZoneContext): void {
  buildLobbyShell(ctx, { ox: 29, oz: -59.1, echo: true });
}

function buildLobbyShell(ctx: ZoneContext, opts: LobbyShellOpts): void {
  const { world, lighting, catalog, hud, audio, dread, dejaVu, player } = ctx;
  const { ox, oz, echo } = opts;
  const X = (v: number) => v + ox;
  const Z = (v: number) => v + oz;
  const rect = echo ? CONFIG.zones.lobbyEcho : CONFIG.zones.lobby;
  const H = CONFIG.lobby.ceilingHeight;
  world.markGallery(rect);

  world.buildRoom({
    rect,
    height: H,
    sides: {
      north: { doors: [{ center: X(0), width: 2.0, height: CONFIG.doorHeight }] },
      // The echo's south side is the mirror room's existing north wall (with
      // its door) — leaving it open avoids a doubled wall over that doorway.
      south: echo ? 'open' : 'wall',
      east: 'wall',
      west: 'wall',
    },
  });

  // decorative open double doors flanking the corridor opening
  const leafGeo = new THREE.BoxGeometry(0.85, CONFIG.doorHeight, 0.05);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c4530, roughness: 0.6 });
  const leafL = new THREE.Mesh(leafGeo, leafMat);
  leafL.position.set(X(-1.42), CONFIG.doorHeight / 2, Z(0.42));
  leafL.rotation.y = Math.PI / 2.4;
  const leafR = new THREE.Mesh(leafGeo, leafMat);
  leafR.position.set(X(1.42), CONFIG.doorHeight / 2, Z(0.42));
  leafR.rotation.y = -Math.PI / 2.4;
  world.scene.add(leafL, leafR);

  // reception desk (off-centre so the path to the doors stays clear)
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.55 }),
  );
  deskTop.position.set(X(1.9), 0.86, Z(3.6));
  deskTop.castShadow = true;
  const deskBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.82, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x40331f, roughness: 0.7 }),
  );
  deskBody.position.set(X(1.9), 0.41, Z(3.6));
  deskBody.castShadow = true;
  world.scene.add(deskTop, deskBody);
  world.addCollider(X(1.9 - 0.9), Z(3.6 - 0.35), X(1.9 + 0.9), Z(3.6 + 0.35));

  // coat rack
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, metalness: 0.55, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.75, 10), rackMat);
  pole.position.set(X(-4.1), 0.875, Z(1.1));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 16), rackMat);
  base.position.set(X(-4.1), 0.015, Z(1.1));
  const hookGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), rackMat);
    hook.rotation.z = Math.PI / 2.6;
    const ang = (i / 5) * Math.PI * 2;
    hook.position.set(Math.cos(ang) * 0.07, 1.72, Math.sin(ang) * 0.07);
    hook.rotation.y = ang;
    hookGroup.add(hook);
  }
  hookGroup.position.set(X(-4.1), 0, Z(1.1));
  world.scene.add(pole, base, hookGroup);

  // benches
  world.addBench(X(-3.2), Z(6.2));
  world.addBench(X(3.2), Z(6.2));

  // wall directory sign — the echo's "wrong detail": UNLISTED now reads OPEN
  world.addSign({
    x: X(-2.7), y: 1.7, z: Z(0.08), facing: 's', w: 1.5, h: 0.85,
    texture: signTexture(
      ['MODERN WING →', 'CLASSICAL SALON →', echo ? 'UNLISTED — OPEN' : 'UNLISTED — CLOSED'],
      { bg: '#efece2', fg: '#3a362c', border: '#3a362c', fontSize: 34 },
    ),
  });

  // small introductory painting near the doors
  world.addFrame({
    x: X(2.6), y: 1.55, z: Z(0.08), facing: 's', w: 0.7, h: 0.55,
    seed: CONFIG.seeds.lobbyPainting,
  });

  // bright, calm, even fluorescent light — identical in both copies
  lighting.addPanel(X(-2), H - 0.02, Z(3), 1.1, 1.6);
  lighting.addPanel(X(2), H - 0.02, Z(3), 1.1, 1.6);
  lighting.addPanel(X(0), H - 0.02, Z(6), 1.1, 1.6);
  lighting.addPoint(X(0), H - 0.4, Z(3.5), 14, 11);
  lighting.addPoint(X(0), H - 0.4, Z(6.5), 10, 9);

  if (echo) {
    buildLobbyEchoExtras(ctx, X, Z, rect);
    return;
  }

  // ── Correct slot for 019-UNLISTED (real lobby only) ───────────────────────
  // Wall hook on the east wall, behind the reception desk — player needs
  // to walk around the north or east side of the desk to reach it.
  const slotX = rect.x2 - 0.08;
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

  // Generous invisible hit-box — the hook/shelf geometry is only a few cm
  // tall and easy to miss with the crosshair; this proxy makes the slot
  // reliably clickable from anywhere in front of it.
  const slotProxy019 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.9, 0.7),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  slotProxy019.position.set(slotX - 0.25, 1.0, slotZ);
  world.scene.add(slotProxy019);

  // Slot interactable
  ctx.interactables.register({
    objects: [slotHook, slotProxy019],
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

  void dejaVu;
  void player;
}

/**
 * Echo-only dressing: the déjà-vu "Reception" note and the trigger that drops
 * a frozen echo of the player into the room and starts the delayed footstep
 * layer (see DejaVuSystem). Guarded by `canRepeat` so it fires once.
 */
function buildLobbyEchoExtras(
  ctx: ZoneContext,
  X: (v: number) => number,
  Z: (v: number) => number,
  rect: { x1: number; x2: number; z1: number; z2: number },
): void {
  const { dejaVu, player } = ctx;

  addArtistNote(ctx, {
    id: 'lobbyecho-reception',
    x: X(1.9), y: 1.12, z: Z(3.6 - 0.35), facing: 's',
    workTitle: 'Reception',
    tiers: [
      'Reception has been relocated for renovation. Please disregard the counter upstairs.',
      'Reception has been relocated for renovation. This is not the same counter. It has been measured. It is not.',
      'Reception has been relocated for renovation. You already checked in here once today.',
    ],
  });

  // A frozen echo of the player, standing further into the room facing the
  // exit — visible ahead as they walk in, gone as they approach or look at it.
  // The whole room is the trigger; the footstep echo runs until they leave.
  const roomZone = { x1: rect.x1, z1: rect.z1, x2: rect.x2, z2: rect.z2 };
  ctx.world.addTrigger(
    roomZone,
    () => {
      if (!dejaVu.canRepeat('lobbyEcho')) return;
      dejaVu.consumeRepeat('lobbyEcho');
      dejaVu.spawnEchoGhost(X(0), Z(2.0), Math.PI);
      dejaVu.attachFootstepEcho(player);
    },
    () => dejaVu.detachFootstepEcho(player),
  );
}

/**
 * Artist Note: a wall (or pedestal-side) plaque that reads like a museum
 * placard but has three text tiers. The tier is chosen by the current
 * global dread level the first time it is read, then stays locked for the
 * rest of the playthrough — tiers get calmer→subtly wrong→uneasy as the
 * tour goes on, but a given note never changes its story mid-read.
 */
import * as THREE from 'three';
import { artistNoteTexture } from '../../utils/textures';
import type { Facing } from '../World';
import { facingToYaw } from '../World';
import type { ZoneContext } from './ZoneContext';

export interface ArtistNoteOpts {
  /** Stable id used to lock the tier on first read — must be unique per note. */
  id: string;
  x: number;
  y?: number;
  z: number;
  facing: Facing;
  workTitle: string;
  /** [calm/institutional, subtly wrong, uneasy] — see systems/ArtistNotes.ts. */
  tiers: [string, string, string];
  /**
   * 'direct' — breaks the fourth wall; only shows direct text when dread ≥
   * CONFIG.directNotes.dreadThreshold at first read. `directText` is the
   * intimate text shown in that case; `tiers[0]` is the fallback.
   */
  noteType?: 'standard' | 'direct';
  /** The direct-address text shown when dread is high enough (first read). */
  directText?: string;
  /** Optional alternate direct text shown on second and subsequent reads. */
  directTextReread?: string;
  /** Fired the first time this specific note is read (used for the lobby sprint hint). */
  onFirstRead?: () => void;
}

export function addArtistNote(ctx: ZoneContext, opts: ArtistNoteOpts): THREE.Group {
  const group = new THREE.Group();
  group.position.set(opts.x, opts.y ?? 1.35, opts.z);
  group.rotation.y = facingToYaw(opts.facing);

  const face = new THREE.MeshStandardMaterial({ map: artistNoteTexture(opts.workTitle), roughness: 0.6 });
  const s = ctx.world.mats.plaqueSide;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.02), [s, s, s, s, face, s]);
  plate.position.z = 0.01;
  group.add(plate);
  ctx.world.scene.add(group);

  let firstRead = true;
  ctx.interactables.register({
    objects: [group],
    getPrompt: () => (ctx.modal.isOpen ? null : 'E — Read'),
    onInteract: () => {
      if (opts.noteType === 'direct' && opts.directText) {
        const isDirect = ctx.artistNotes.resolveDirectMode(opts.id, ctx.dread.level);
        if (isDirect) {
          // No tick sound for direct notes — no stinger on open
          const text = (!firstRead && opts.directTextReread) ? opts.directTextReread : opts.directText;
          ctx.modal.open('Artist note —', text, 'direct');
        } else {
          ctx.audio.tick();
          ctx.modal.open(`Artist note — ${opts.workTitle}`, opts.tiers[0]);
          ctx.artistNotes.annotationsRead++;
        }
      } else {
        ctx.audio.tick();
        const tier = ctx.artistNotes.tierFor(opts.id, ctx.dread.level);
        ctx.modal.open(`Artist note — ${opts.workTitle}`, opts.tiers[tier]);
      }
      ctx.dread.notifyNoteRead();
      if (firstRead) {
        firstRead = false;
        if (opts.noteType !== 'direct') ctx.artistNotes.annotationsRead++;
        opts.onFirstRead?.();
      }
    },
  });
  return group;
}

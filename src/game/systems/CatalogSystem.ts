/**
 * CatalogSystem — the new win mechanic.
 *
 * The museum catalog is wrong. Three misfiled works are sitting in the wrong
 * rooms. The player finds each work, "removes" its loan slip (E — Remove loan
 * slip), carries the ref in hand (one at a time), and files it at the correct
 * slot elsewhere (E — File correctly). Fix all three to unlock the exit.
 *
 * Attempting to file at the wrong slot incurs a dread penalty and a brief
 * room flicker — the slip stays in hand and the player must try elsewhere.
 * No game-over, no hard fail.
 *
 * Callbacks (onPickUp, onFile, onRestore) let zone builders update their
 * own visuals without tight coupling into this system.
 */
import { CONFIG } from '../../config';
import type { HUD } from '../ui/HUD';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { Lighting } from './Lighting';
import type { DreadSystem } from './DreadSystem';

export class CatalogSystem {
  /** The catalog ref currently in hand, or null. */
  carriedSlip: string | null = null;

  private corrections = new Map<string, boolean>(); // ref → currently corrected
  private pickUpCbs = new Map<string, () => void>();
  private fileCbs = new Map<string, () => void>();
  private restoreCbs = new Map<string, () => void>();
  private completeCbs: (() => void)[] = [];

  /** How many wrong-slot attempts the player made. */
  misfileCount = 0;
  /** Direct-address notes actually read (updated by ArtistNotes system). */
  directNotesRead = 0;
  /** Standard artist notes read (updated by ArtistNotes system). */
  annotationsRead = 0;
  private startTime = Date.now();

  // -- registration ----------------------------------------------------------

  /** Call once per misfiled work during zone construction. */
  register(ref: string): void {
    this.corrections.set(ref, false);
  }

  /** Called when the work's visual should reappear at wrong location (deja vu). */
  onPickUp(ref: string, fn: () => void): void { this.pickUpCbs.set(ref, fn); }
  /** Called when the work is successfully filed at the correct slot. */
  onFile(ref: string, fn: () => void): void { this.fileCbs.set(ref, fn); }
  /** Called when a previously-filed work is restored to its wrong slot. */
  onRestore(ref: string, fn: () => void): void { this.restoreCbs.set(ref, fn); }
  /** Called once when all three corrections are completed. */
  onComplete(fn: () => void): void {
    this.completeCbs.push(fn);
    if (this.isComplete) fn();
  }

  // -- state queries ---------------------------------------------------------

  get correctionsCompleted(): number {
    let n = 0;
    for (const v of this.corrections.values()) if (v) n++;
    return n;
  }

  get isComplete(): boolean {
    return this.correctionsCompleted >= CONFIG.catalog.correctionsRequired;
  }

  isCorrectlyFiled(ref: string): boolean {
    return this.corrections.get(ref) === true;
  }

  /** MM:SS string since the catalog system was instantiated. */
  elapsedTimeString(): string {
    const s = Math.floor((Date.now() - this.startTime) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // -- interactions ----------------------------------------------------------

  /**
   * Pick up the loan slip for `ref` from its wrong location.
   * Does nothing if the player is already carrying a slip or the work is
   * already correctly filed.
   */
  pickUp(ref: string, hud: HUD): boolean {
    if (this.carriedSlip !== null) return false;
    if (this.isCorrectlyFiled(ref)) return false;
    this.carriedSlip = ref;
    hud.setCarriedSlip(ref);
    this.pickUpCbs.get(ref)?.();
    return true;
  }

  /**
   * Attempt to file the carried slip at a slot that expects `slotRef`.
   * Returns:
   *  'correct'  — match, work filed, dread reward, visual callbacks fire
   *  'wrong'    — mismatch, penalty applied, slip stays in hand
   *  'empty'    — player isn't carrying anything (no-op)
   */
  fileAt(
    slotRef: string,
    hud: HUD,
    audio: AudioEngine,
    lighting: Lighting,
    dread: DreadSystem,
  ): 'correct' | 'wrong' | 'empty' {
    if (!this.carriedSlip) return 'empty';

    if (this.carriedSlip === slotRef) {
      this.corrections.set(slotRef, true);
      this.carriedSlip = null;
      hud.setCarriedSlip(null);
      hud.setCounter(this.correctionsCompleted, CONFIG.catalog.correctionsRequired);
      audio.correctBell();
      lighting.stabilize(CONFIG.catalog.lightStabilizeSeconds);
      dread.applyReward(CONFIG.catalog.correctDreadReward);
      this.fileCbs.get(slotRef)?.();
      if (this.isComplete) {
        hud.toast('Catalog complete. The exit has unlocked.', 4200);
        audio.unlockChime();
        for (const fn of this.completeCbs) fn();
      } else {
        hud.toast(`Filed: ${slotRef}  ·  ${this.correctionsCompleted}/${CONFIG.catalog.correctionsRequired}`);
      }
      return 'correct';
    }

    // wrong slot
    this.misfileCount++;
    audio.misfilePenalty();
    lighting.flickerPenalty();
    dread.applyPenalty(CONFIG.catalog.misfileDreadPenalty);
    hud.toast('Entry rejected.', 3200);
    return 'wrong';
  }

  /**
   * Re-mark `ref` as un-filed (used by the déjà vu reversal).
   * Fires the restore callback so zone builders can show the work reappearing
   * at its wrong location.
   */
  restore(ref: string, hud: HUD): void {
    if (!this.isCorrectlyFiled(ref)) return;
    this.corrections.set(ref, false);
    // If player happens to be carrying nothing, allow them to pick it up again
    hud.setCounter(this.correctionsCompleted, CONFIG.catalog.correctionsRequired);
    this.restoreCbs.get(ref)?.();
  }
}

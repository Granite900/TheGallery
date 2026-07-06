/**
 * Tracks which tier of text each Artist Note has locked in. A note's tier is
 * chosen by the current dread level the *first* time it is read, then stays
 * fixed for the rest of the playthrough — re-reading always shows the same
 * tier, so the wrongness a player noticed stays consistent.
 *
 * Also tracks whether a note is "direct" (breaks the fourth wall) and
 * whether the player's dread was high enough to see the direct text.
 */
import { CONFIG } from '../../config';

export type NoteTier = 0 | 1 | 2;

function tierFromDread(level: number): NoteTier {
  const [a, b] = CONFIG.dread.noteTierThresholds;
  return level < a ? 0 : level < b ? 1 : 2;
}

export class ArtistNotes {
  private locked = new Map<string, NoteTier>();
  private directSeen = new Set<string>(); // note ids that were read in direct mode
  /** Count of standard (non-direct) notes read. */
  annotationsRead = 0;
  /** Count of direct notes read in direct mode (dread was high enough). */
  directNotesRead = 0;

  /** Returns the locked tier for `id`, choosing and locking it on first call. */
  tierFor(id: string, currentDread: number): NoteTier {
    let tier = this.locked.get(id);
    if (tier === undefined) {
      tier = tierFromDread(currentDread);
      this.locked.set(id, tier);
    }
    return tier;
  }

  hasBeenRead(id: string): boolean {
    return this.locked.has(id);
  }

  /**
   * For a direct-address note: returns true if dread ≥ threshold and it
   * should show in direct mode. Increments the appropriate counter.
   */
  resolveDirectMode(id: string, currentDread: number): boolean {
    const firstRead = !this.locked.has(id);
    if (firstRead) {
      const isDirect = currentDread >= CONFIG.directNotes.dreadThreshold;
      if (isDirect) {
        this.directSeen.add(id);
        this.directNotesRead++;
      } else {
        this.annotationsRead++;
      }
      this.locked.set(id, tierFromDread(currentDread));
      return isDirect;
    }
    return this.directSeen.has(id);
  }

  notifyRead(isDirect: boolean): void {
    if (isDirect) {
      // already counted in resolveDirectMode on first read
    } else {
      // re-read — don't double-count
    }
    // increment standard reads only on truly first-time standard reads
    // (resolveDirectMode handles that path; this is for non-direct addArtistNote)
  }
}

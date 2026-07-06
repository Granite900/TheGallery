/**
 * Tracks the three Anchor Works. Collecting one beeps and updates the HUD;
 * completing the set fires listeners (the Unlisted Gallery door subscribes).
 */
import type { HUD } from '../ui/HUD';
import type { AudioEngine } from '../../audio/AudioEngine';

export class Objectives {
  private collected = new Set<string>();
  private completeListeners: (() => void)[] = [];

  constructor(
    private required: number,
    private hud: HUD,
    private audio: AudioEngine,
  ) {}

  get count(): number {
    return this.collected.size;
  }

  get isComplete(): boolean {
    return this.collected.size >= this.required;
  }

  has(id: string): boolean {
    return this.collected.has(id);
  }

  collect(id: string): void {
    if (this.collected.has(id)) return;
    this.collected.add(id);
    this.audio.beep();
    this.hud.setCounter(this.count, this.required);
    if (this.isComplete) {
      this.hud.toast('Catalog complete. Something ahead has unlocked.', 3800);
      this.audio.unlockChime();
      for (const l of this.completeListeners) l();
    } else {
      this.hud.toast(`Work cataloged — ${this.count}/${this.required}`);
    }
  }

  onComplete(fn: () => void): void {
    this.completeListeners.push(fn);
    if (this.isComplete) fn();
  }
}

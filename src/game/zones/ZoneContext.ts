/**
 * Everything a zone builder needs to assemble its slice of the museum.
 */
import type { World } from '../World';
import type { Lighting } from '../systems/Lighting';
import type { Interactables } from '../systems/Interactables';
import type { HUD } from '../ui/HUD';
import type { PlacardModal } from '../ui/PlacardModal';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { Player } from '../Player';
import type { DreadSystem } from '../systems/DreadSystem';
import type { DejaVuSystem } from '../systems/DejaVuSystem';
import type { ArtistNotes } from '../systems/ArtistNotes';
import type { CatalogSystem } from '../systems/CatalogSystem';

export interface ZoneContext {
  world: World;
  lighting: Lighting;
  interactables: Interactables;
  hud: HUD;
  modal: PlacardModal;
  audio: AudioEngine;
  player: Player;
  dread: DreadSystem;
  dejaVu: DejaVuSystem;
  artistNotes: ArtistNotes;
  catalog: CatalogSystem;
  /** Quick black fade around a mid-fade action (teleports). */
  softFade: (action: () => void, ms?: number) => Promise<void>;
  /** Per-frame update hooks (door animations etc.). */
  addUpdatable: (fn: (dt: number) => void) => void;
  endGame: () => void;
}

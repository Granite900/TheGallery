/**
 * GALLERY BELOW — architecture overview
 * =====================================
 *
 * Game (this file) is the composition root and owns the frame loop. It wires
 * together a deliberately flat set of collaborators — no ECS, no events bus:
 *
 *   Renderer / Camera      three.js WebGL renderer; a single perspective
 *                          camera whose FOV eases between 75° (corridors)
 *                          and 85° (galleries) based on the player position.
 *
 *   World                  Owns the scene graph, static collider list
 *                          (AABBs in the XZ plane), trigger volumes, and the
 *                          shared "museum furniture" builders (rooms with
 *                          door gaps, framed procedural paintings, artist
 *                          notes, signs, benches, pedestals). The eight zone
 *                          files in ./zones (lobby first) each build one
 *                          area of the floor plan defined in config.ts and
 *                          register their own interactables/triggers
 *                          through a ZoneContext.
 *
 *   Player                 Pointer-lock look + WASD movement. Collision is
 *                          a 2D circle-vs-AABB resolve (flat floors, full
 *                          height walls) — cheap and tunnel-proof.
 *
 *   Systems
 *     Interactables        Crosshair raycast (max 2.5m) → prompt + E key.
 *     CatalogSystem        The three misfiled works; tracks carried slip,
 *                          correct filings, misfile count, and unlocks the
 *                          exit when all three are corrected.
 *     Lighting             Ambient/directional + fluorescent fixtures with
 *                          random-telegraph flicker, plus dark-spot patches
 *                          that dim a dedicated light while the player
 *                          stands inside them.
 *     DreadSystem          Global, meterless 0..1 dread curve (distance +
 *                          time per zone, small note/anchor bumps, a floor
 *                          that never drops on backtrack) that everything
 *                          else blends against — see its own header.
 *     DejaVuSystem         The two allowed per-run room "repeats" and their
 *                          shared Echo Passage pieces (frozen ghost, delayed
 *                          footstep layer).
 *     ArtistNotes          Locks each note's dread-scaled text tier on the
 *                          player's first read of it.
 *     PostProcessing       Composer: render → output → vignette/grain/warm
 *                          grade shader, blended toward a sicklier, grainier
 *                          look as dread rises.
 *
 *   UI (DOM, not WebGL)    HUD (crosshair, counter, prompt, toasts, fade
 *                          overlay, sprint hint, start/pause/end screens,
 *                          and the catalog submission modal).
 *                          PlacardModal for reading notes (standard +
 *                          direct-address mode with typewriter effect).
 *
 *   AudioEngine            100% synthesized WebAudio (hum, beeps, steps,
 *                          and a dread-driven detune/PA-static/distant-
 *                          event blend). No jumpscares, no stingers.
 *
 * Frame loop: player physics → dread/déjà-vu/audio dread blend → trigger
 * volumes → interact raycast → light flicker/dark-spots → door/updatable
 * hooks → FOV ease → composer render (dread-blended grade).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { rectContains } from '../utils/collision';
import { AudioEngine } from '../audio/AudioEngine';
import { World } from './World';
import { Player } from './Player';
import { HUD } from './ui/HUD';
import { PlacardModal } from './ui/PlacardModal';
import { Interactables } from './systems/Interactables';
import { CatalogSystem } from './systems/CatalogSystem';
import { Lighting } from './systems/Lighting';
import { PostProcessing } from './systems/PostProcessing';
import { DreadSystem } from './systems/DreadSystem';
import { DejaVuSystem } from './systems/DejaVuSystem';
import { ArtistNotes } from './systems/ArtistNotes';
import type { ZoneContext } from './zones/ZoneContext';
import { buildLobby, buildLobbyEcho } from './zones/Lobby';
import { buildEntryCorridor } from './zones/EntryCorridor';
import { buildGalleryModern } from './zones/GalleryModern';
import { buildCorridorMaze } from './zones/CorridorMaze';
import { buildGalleryClassical } from './zones/GalleryClassical';
import { buildServiceCorridor } from './zones/ServiceCorridor';
import { buildGalleryUnlisted } from './zones/GalleryUnlisted';
import { buildExitThreshold } from './zones/ExitThreshold';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private audio = new AudioEngine();
  private hud = new HUD();
  private modal = new PlacardModal();
  private interactables: Interactables;
  private catalog: CatalogSystem;
  private lighting: Lighting;
  private world: World;
  private player: Player;
  private post: PostProcessing;
  private dread: DreadSystem;
  private dejaVu: DejaVuSystem;
  private artistNotes = new ArtistNotes();

  private updatables: ((dt: number) => void)[] = [];
  private started = false;
  private ended = false;
  private fading = false;
  private maxDread = 0;

  constructor(container: HTMLElement) {
    // antialias:false — the EffectComposer renders through its own
    // WebGLRenderTarget (with `samples: 4` MSAA, see PostProcessing.ts) and
    // blits a full-screen quad to the canvas, so the context's own default-
    // framebuffer MSAA is never actually used and only costs memory/bandwidth.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050403);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.fov.corridor,
      window.innerWidth / window.innerHeight,
      0.05,
      150,
    );

    this.interactables = new Interactables(CONFIG.interactionDistance, this.hud);
    this.catalog = new CatalogSystem();
    this.lighting = new Lighting(this.scene);
    this.world = new World(this.scene, this.interactables, this.modal, this.audio);
    this.player = new Player(this.camera, this.world, this.audio);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.dread = new DreadSystem(this.scene, this.world, this.audio, this.player, this.post);
    this.dejaVu = new DejaVuSystem(this.scene, this.audio);

    const ctx: ZoneContext = {
      world: this.world,
      lighting: this.lighting,
      interactables: this.interactables,
      catalog: this.catalog,
      hud: this.hud,
      modal: this.modal,
      audio: this.audio,
      player: this.player,
      dread: this.dread,
      dejaVu: this.dejaVu,
      artistNotes: this.artistNotes,
      softFade: (action, ms) => this.softFade(action, ms),
      addUpdatable: (fn) => this.updatables.push(fn),
      endGame: () => void this.triggerEndGame(),
    };
    buildLobby(ctx);
    buildEntryCorridor(ctx);
    buildGalleryModern(ctx);
    buildCorridorMaze(ctx);
    buildGalleryClassical(ctx);
    buildLobbyEcho(ctx); // full lobby copy on the path, right after the mirror room
    buildServiceCorridor(ctx);
    buildGalleryUnlisted(ctx);
    buildExitThreshold(ctx);

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = this;
    }
  }

  start(): void {
    this.hud.showStart(() => this.enter());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private enter(): void {
    this.hud.hideStart();
    this.hud.hidePause();
    this.audio.startAmbience();
    this.renderer.domElement.requestPointerLock();
    if (!this.started) {
      this.started = true;
      void this.hud.fadeTo(0, 900);
    }
  }

  private onLockChange(): void {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (this.ended) return;
    if (locked) {
      this.hud.hidePause();
      this.player.inputEnabled = true;
    } else {
      this.player.inputEnabled = false;
      this.modal.close();
      if (this.started) this.hud.showPause(() => this.enter());
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code !== 'KeyE' || this.ended || !this.started) return;
    if (this.modal.isOpen) {
      this.modal.close();
      this.audio.tick();
      this.player.inputEnabled = document.pointerLockElement === this.renderer.domElement;
      return;
    }
    if (document.pointerLockElement === this.renderer.domElement) {
      this.interactables.tryInteract();
      if (this.modal.isOpen) this.player.inputEnabled = false;
    }
  }

  private async softFade(action: () => void, ms = 260): Promise<void> {
    if (this.fading) return;
    this.fading = true;
    await this.hud.fadeTo(1, ms);
    action();
    await this.hud.fadeTo(0, ms + 100);
    this.fading = false;
  }

  /** Called by ExitThreshold / GalleryUnlisted door. */
  private async triggerEndGame(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.player.inputEnabled = false;
    this.hud.setPrompt(null);
    this.hud.setCrosshairActive(false);
    this.audio.endTone();
    await this.hud.fadeTo(1, 1500);
    document.exitPointerLock();

    this.hud.showSubmissionModal({
      corrections: this.catalog.correctionsCompleted,
      misfiles: this.catalog.misfileCount,
      annotationsRead: this.artistNotes.annotationsRead,
      directNotesRead: this.artistNotes.directNotesRead,
      elapsed: this.catalog.elapsedTimeString(),
      highDread: this.maxDread >= CONFIG.win.optionalDreadForFlavor,
      onAccept: () => {
        this.hud.showEnding({ good: true, onReplay: () => window.location.reload() });
      },
      onRevision: () => {
        this.hud.showEnding({ good: false, onReplay: () => window.location.reload() });
      },
    });
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.player.update(dt);

    if (this.started && !this.ended) {
      this.dread.update(dt, this.player.x, this.player.z, this.camera);
      if (this.dread.level > this.maxDread) this.maxDread = this.dread.level;
      this.dejaVu.updateGhost(dt, this.player.x, this.player.z, this.camera);
      this.audio.updateDread(this.dread.level, dt);
      this.lighting.setDread(this.dread.level);
    }

    for (const t of this.world.triggers) {
      const inside = rectContains(t.rect, this.player.x, this.player.z);
      if (inside && !t.inside && t.active && !this.fading) t.onEnter();
      if (!inside && t.inside && t.active && !this.fading) t.onExit?.();
      t.inside = inside;
    }

    if (!this.ended && this.started && !this.modal.isOpen) {
      this.interactables.update(this.camera);
    } else if (this.modal.isOpen) {
      this.hud.setPrompt(null);
    }

    this.lighting.update(dt, this.player.x, this.player.z);
    for (const u of this.updatables) u(dt);

    const targetFov = this.world.isGallery(this.player.x, this.player.z)
      ? CONFIG.fov.gallery
      : CONFIG.fov.corridor;
    const diff = targetFov - this.camera.fov;
    if (Math.abs(diff) > 0.01) {
      this.camera.fov += diff * Math.min(1, CONFIG.fov.lerpSpeed * dt);
      this.camera.updateProjectionMatrix();
    }

    this.post.render(dt, this.dread.level);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
  }
}

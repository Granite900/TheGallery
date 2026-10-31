/**
 * LATENT IMAGE — composition root.
 *
 * Game owns the Babylon engine, the HUD, audio, the image store and the
 * GameState. Scenes are separate Babylon scenes built on demand:
 *   studio   – home hub (desk/inspection, cabinet, corkboard, light table)
 *              and the main menu backdrop
 *   market   – flea market / estate sale stalls with haggling
 *   shoot    – shooting locations (harbour, park, portrait room)
 *   darkroom – film processing and enlarger printing
 * Simulation lives in ../sim (pure, unit-tested); rendering helpers in
 * ../render and ../models; DOM UI in ../ui.
 */
import { Engine, Scene } from '@babylonjs/core';
import { Hud } from '../ui/Hud';
import { Audio } from './audio';
import { ImageStore, loadState, saveState } from './save';
import { GameState, addLetter, newGame, setFlag } from '../sim/state';
import { CHAPTERS, chapterComplete, currentChapter } from '../sim/career';
import { makeUnit } from '../sim/units';

export type SceneId = 'menu' | 'studio' | 'market' | 'shoot' | 'darkroom';

export interface SceneHost {
  scene: Scene;
  dispose(): void;
  onKey?(e: KeyboardEvent, down: boolean): void;
}

type SceneFactory = (game: Game, args: Record<string, unknown>) => Promise<SceneHost>;

export class Game {
  engine: Engine;
  hud: Hud;
  audio = new Audio();
  images = new ImageStore();
  state: GameState;
  current: SceneHost | null = null;
  currentId: SceneId | null = null;
  private factories = new Map<SceneId, SceneFactory>();
  private busy = false;

  constructor(public canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: true, antialias: false, powerPreference: 'high-performance' }, true);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    this.hud = new Hud();
    this.state = loadState() ?? newGame();
    window.addEventListener('resize', () => this.engine.resize());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('pointerdown', () => this.audio.ensure(), { once: true });
    this.engine.runRenderLoop(() => {
      if (this.current) this.current.scene.render();
    });
  }

  register(id: SceneId, f: SceneFactory) {
    this.factories.set(id, f);
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (down && e.key === 'F11' && !navigator.userAgent.includes('Electron')) {
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
      return;
    }
    this.current?.onKey?.(e, down);
  }

  async goto(id: SceneId, args: Record<string, unknown> = {}): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.hud.fade(true);
      this.audio.stopAll();
      this.hud.clearScene();
      document.body.classList.remove('darkroom-red', 'lights-out');
      const old = this.current;
      this.current = null;
      old?.dispose();
      const f = this.factories.get(id);
      if (!f) throw new Error(`no scene ${id}`);
      const t0 = performance.now();
      const host = await f(this, args);
      const t1 = performance.now();
      await Promise.race([host.scene.whenReadyAsync(), new Promise((r) => setTimeout(r, 12000))]);
      if (!host.scene.isReady()) {
        const bad = host.scene.meshes.filter((m) => !m.isReady(true)).map((m) => m.name);
        console.warn('[scene] not ready after 12s:', bad.slice(0, 20).join(', '));
      }
      console.log(`[scene] ${id} built ${Math.round(t1 - t0)}ms ready ${Math.round(performance.now() - t1)}ms`);
      this.current = host;
      this.currentId = id;
      this.hud.update(this.state);
      // let a couple of frames settle (shadow maps, probes) before fading in
      await new Promise((r) => setTimeout(r, 120));
      await this.hud.fade(false);
    } finally {
      this.busy = false;
    }
  }

  newCareer() {
    this.state = newGame(false);
    this.save();
  }

  startSandbox() {
    this.state = loadState(true) ?? newGame(true);
    this.save();
  }

  continueCareer() {
    this.state = loadState(false) ?? newGame(false);
  }

  save() {
    saveState(this.state);
  }

  /** Call after anything that may advance objectives. */
  progress() {
    const s = this.state;
    this.hud.update(s);
    if (!s.sandbox) {
      let guard = 0;
      while (chapterComplete(s) && guard++ < 3) {
        const ch = currentChapter(s)!;
        s.money += ch.reward;
        s.rep += ch.rep;
        this.audio.coin();
        this.hud.toast(`Chapter complete: ${ch.title}. +$${ch.reward}`, 'good', 6000);
        s.chapter++;
        this.onChapterStart(s.chapter);
      }
    }
    this.save();
    this.hud.update(s);
  }

  onChapterStart(idx: number) {
    const s = this.state;
    const ch = CHAPTERS[idx];
    if (!ch) {
      addLetter(s, 'Field Test magazine', 'Thank you', 'Eight chapters, one collection, and a town that remembers Ruth\'s name a little better because of yours. The market still runs every Saturday. Keep testing, keep shooting. — D.');
      return;
    }
    addLetter(s, ch.letter.from, ch.letter.title, ch.letter.body);
    if (idx === 2) {
      if (!s.tools.includes('meter')) s.tools.push('meter');
      const electro = makeUnit('electro35', 7311, 0.4, s.day);
      electro.clientJob = 'adeyemi';
      s.cameras.push(electro);
      s.fridge.hp5 = (s.fridge.hp5 ?? 0) + 2;
      s.fridge.trix = (s.fridge.trix ?? 0) + 2;
    }
    if (idx === 3) s.fridge.trix = (s.fridge.trix ?? 0) + 2;
    if (idx === 6) {
      s.chem.c41Kits += 2;
      s.chem.e6Kits += 1;
      s.fridge.portra400 = (s.fridge.portra400 ?? 0) + 2;
      s.fridge.provia = (s.fridge.provia ?? 0) + 1;
    }
    if (idx === 7) {
      s.chem.revKits += 1;
      s.fridge.trix8 = (s.fridge.trix8 ?? 0) + 1;
    }
    setFlag(s, `chapter-${idx}`);
  }
}

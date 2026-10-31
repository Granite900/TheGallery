/**
 * The studio: Ruth's flat above the harbour. Hub for everything, and the
 * main-menu backdrop. Stations: desk (inspect / load), cabinet (collection),
 * corkboard (letters & assignments), light table, projector, doors.
 */
import { Color3, DirectionalLight, HemisphericLight, MeshBuilder, PointerEventTypes, ShadowGenerator, SpotLight, Vector3, Mesh, TransformNode, DynamicTexture, AbstractMesh, VolumetricLightScatteringPostProcess, Texture, PBRMaterial } from '@babylonjs/core';
import type { Game, SceneHost } from '../app/Game';
import { Mats } from '../render/materials';
import { makeEnvironment, studioPainter } from '../render/env';
import { makePipeline, SHADOW_SIZE } from '../render/quality';
import { GlideCamera, Pose, V, findMeta, newScene, setMeta } from './common';
import { cabinet, chair, corkboard, deskLamp, door, filmFridge, lightTable, plant, projector, room, rug, table, windowFrame, books } from '../models/props';
import { roundedBox, textTexture } from '../models/geom';
import { buildCamera, CameraRig } from '../models/CameraBuilder';
import { Inspector } from './Inspector';
import { h, btn } from '../ui/dom';
import { boardPanel, cataloguePanel, collectionPanel, deskPanel, outingPanel, settingsPanel, unitTitle } from '../ui/panels';
import { camera } from '../sim/data';
import { unitById } from '../sim/state';
import { hasSave } from '../app/save';
import { openLightTable } from '../ui/LightTable';
import { openProjector } from '../ui/Projector';
import { CHAPTERS } from '../sim/career';

type Station = 'overview' | 'desk' | 'cabinet' | 'board' | 'lighttable' | 'menu' | 'projector';

const POSES: Record<Station, Pose> = {
  overview: { pos: V(0.2, 1.62, -1.5), target: V(0.4, 1.15, 1.6), fov: 1.0 },
  menu: { pos: V(-0.9, 1.38, 0.7), target: V(0.75, 0.95, 2.1), fov: 0.8 },
  desk: { pos: V(0.62, 1.12, 1.52), target: V(0.62, 0.84, 2.02), fov: 0.62 },
  cabinet: { pos: V(-1.45, 1.3, 0.5), target: V(-2.8, 1.12, 0.5), fov: 0.85 },
  board: { pos: V(1.7, 1.55, 0.8), target: V(2.98, 1.5, 0.8), fov: 0.8 },
  lighttable: { pos: V(2.2, 1.45, 1.35), target: V(2.4, 0.86, 2.05), fov: 0.8 },
  projector: { pos: V(0.6, 1.4, 0.4), target: V(0.6, 1.4, -2.5), fov: 0.9 },
};

const DESK_ANCHOR = V(0.62, 0.795, 2.04);

export async function createStudio(game: Game, args: Record<string, unknown>): Promise<SceneHost> {
  const scene = newScene(game.engine);
  const mats = new Mats(scene);
  const s = game.state;
  const menu = !!args.menu;
  const q = s.settings.quality;

  // ---------- lighting ----------
  const env = await makeEnvironment(scene, studioPainter([0.15, 0.25, 1], [0, 1, 0.1], 1));
  scene.environmentTexture = env;
  scene.environmentIntensity = 0.85;
  const sun = new DirectionalLight('window', new Vector3(-0.25, -0.55, -1).normalize(), scene);
  sun.position = V(1.8, 3.8, 6);
  sun.intensity = 3.4;
  sun.diffuse = new Color3(0.95, 0.97, 1.0);
  sun.shadowMinZ = 0.5;
  sun.shadowMaxZ = 14;
  const shadows = new ShadowGenerator(SHADOW_SIZE[q], sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.0006;
  shadows.normalBias = 0.01;
  const fill = new HemisphericLight('fill', V(0, 1, 0), scene);
  fill.intensity = 0.12;
  fill.diffuse = new Color3(1, 0.92, 0.82);
  fill.groundColor = new Color3(0.2, 0.15, 0.1);

  // ---------- room ----------
  const rm = room(scene, mats, 6, 5, 2.85, { wall: 'wallpaper', wallTint: new Color3(1.05, 1, 0.92) });
  rug(scene, mats, 2.6, 1.8, new Color3(0.55, 0.22, 0.14)).position.set(0, 0.004, 0.4);
  // window in the north wall: cut by placing the frame + bright backdrop outside
  const win = windowFrame(scene, mats, 1.5, 1.35);
  win.root.position.set(0.62, 1.72, 2.47);
  const outside = MeshBuilder.CreatePlane('outside', { width: 34, height: 17 }, scene);
  outside.position.set(0.62, 3.2, 14);
  const skyTex = paintOutside(scene);
  const om = mats.decal(skyTex, 1);
  om.emissiveTexture = skyTex;
  om.emissiveColor = new Color3(1, 1, 1);
  om.emissiveIntensity = 1.5;
  om.disableLighting = true;
  outside.material = om;
  // cut the wall: replace the north wall with 4 pieces around the window
  const wallN = scene.getMeshByName('wallN');
  if (wallN) {
    wallN.dispose();
    const wm = mats.textured('wallpaper', 3, 1.2, new Color3(1.05, 1, 0.92), 0.6);
    const pieces: [number, number, number, number][] = [
      [-3, -0.13, 0, 2.85], // left of window: x from -3 to -0.13
      [1.37, 3, 0, 2.85],
      [-0.13, 1.37, 0, 1.0],
      [-0.13, 1.37, 2.44, 2.85],
    ];
    for (const [x0, x1, y0, y1] of pieces) {
      const p = MeshBuilder.CreatePlane('wallNpiece', { width: x1 - x0, height: y1 - y0 }, scene);
      p.position.set((x0 + x1) / 2, (y0 + y1) / 2, 2.5);
      p.material = wm;
      p.receiveShadows = true;
    }
    // window reveal
    const reveal = mats.painted(new Color3(0.78, 0.76, 0.7), 0.6, 'reveal');
    for (const [w, hh, x, y, rx, ry] of [[1.5, 0.3, 0.62, 1.0, Math.PI / 2, 0], [1.5, 0.3, 0.62, 2.44, -Math.PI / 2, 0], [0.3, 1.44, -0.13, 1.72, 0, Math.PI / 2], [0.3, 1.44, 1.37, 1.72, 0, -Math.PI / 2]] as const) {
      const p = MeshBuilder.CreatePlane('reveal', { width: w, height: hh }, scene);
      p.position.set(x, y, 2.62);
      p.rotation.set(rx, ry, 0);
      p.material = reveal;
    }
  }
  // desk under the window
  const desk = table(scene, mats, 1.6, 0.75, 0.78);
  desk.root.position.set(0.62, 0, 2.05);
  const mat = roundedBox('deskMat', scene, 0.62, 0.004, 0.42, 0.002, 2);
  mat.position.set(0.62, 0.782, 2.02);
  mat.material = mats.painted(new Color3(0.08, 0.16, 0.11), 0.85, 'deskmat');
  mat.receiveShadows = true;
  const lamp = deskLamp(scene, mats);
  lamp.root.position.set(1.2, 0.78, 2.25);
  lamp.root.rotation.y = Math.PI + 0.6;
  const lampLight = new SpotLight('lampLight', V(0, 0, 0), V(0, -1, 0), 1.1, 2, scene);
  lampLight.parent = lamp.head;
  lampLight.position.set(0, -0.02, 0);
  lampLight.direction = V(0, -1, 0);
  lampLight.intensity = 3.2;
  lampLight.diffuse = new Color3(1, 0.78, 0.5);
  lampLight.range = 3;
  const lampShadow = new ShadowGenerator(q === 'low' ? 512 : 1024, lampLight);
  lampShadow.usePercentageCloserFiltering = true;
  lampShadow.bias = 0.0008;
  const ch = chair(scene, mats);
  ch.root.position.set(0.5, 0, 1.45);
  ch.root.rotation.y = 0.2;
  const notebook = roundedBox('notebook', scene, 0.16, 0.012, 0.22, 0.004, 2);
  notebook.position.set(0.08, 0.792, 2.0);
  notebook.rotation.y = 0.25;
  notebook.material = mats.painted(new Color3(0.32, 0.08, 0.05), 0.7, 'notebook');
  const catalogue = roundedBox('catalogue', scene, 0.15, 0.006, 0.21, 0.002, 2);
  catalogue.position.set(1.05, 0.788, 1.92);
  catalogue.rotation.y = -0.3;
  catalogue.material = mats.decal(textTexture(scene, ['KOWALSKI', 'PHOTOGRAPHIC'], { w: 512, h: 720, bg: '#d9c9a2', color: '#5a1d14', font: '700 80px Jost' }), 0.8);
  const fridge = filmFridge(scene, mats);
  fridge.root.position.set(-0.75, 0, 2.15);
  const pl = plant(scene, mats);
  pl.root.position.set(-1.45, 0, 2.2);
  // cabinet on the west wall
  const cab = cabinet(scene, mats, 1.5, 1.9, 0.38, 4);
  cab.root.position.set(-2.78, 0, 0.5);
  cab.root.rotation.y = -Math.PI / 2;
  const cabPlaque = MeshBuilder.CreatePlane('cabPlaque', { width: 0.4, height: 0.08 }, scene);
  cabPlaque.position.set(-2.55, 1.98, 0.5);
  cabPlaque.rotation.y = -Math.PI / 2;
  cabPlaque.material = mats.decal(textTexture(scene, ['THE COLLECTION'], { w: 512, h: 100, bg: '#1b1813', color: '#d8c79c', font: '600 52px Jost' }), 0.5);
  // corkboard and light table on the east wall
  const cork = corkboard(scene, mats, 1.1, 0.8);
  cork.root.position.set(2.97, 1.55, 0.8);
  cork.root.rotation.y = Math.PI / 2;
  drawBoard(cork.tex, game);
  const ltDesk = table(scene, mats, 0.9, 0.6, 0.8);
  ltDesk.root.position.set(2.45, 0, 2.05);
  const lt = lightTable(scene, mats);
  lt.root.position.set(2.42, 0.8, 2.05);
  const bk = books(scene, mats, 9, 3);
  bk.root.position.set(2.05, 0.8, 2.25);
  // doors
  const outDoor = door(scene, mats, new Color3(0.12, 0.2, 0.18), 'OUT');
  outDoor.root.position.set(2.97, 0, -1.3);
  outDoor.root.rotation.y = Math.PI / 2;
  const darkDoor = door(scene, mats, new Color3(0.08, 0.08, 0.08), 'DARKROOM');
  darkDoor.root.position.set(-1.4, 0, -2.47);
  darkDoor.root.rotation.y = Math.PI;
  const redLamp = MeshBuilder.CreateBox('inUse', { width: 0.24, height: 0.08, depth: 0.03 }, scene);
  redLamp.position.set(-1.4, 2.25, -2.45);
  redLamp.rotation.y = Math.PI;
  redLamp.material = mats.decal(textTexture(scene, ['IN USE'], { w: 256, h: 80, bg: '#3a0d07', color: '#ff5a3a', font: '700 52px Jost' }), 0.4, 0, 0.6);
  // projector + screen on the south wall
  const proj = projector(scene, mats);
  const projTable = table(scene, mats, 0.5, 0.45, 0.72);
  projTable.root.position.set(0.9, 0, -0.6);
  proj.root.position.set(0.9, 0.72, -0.6);
  proj.root.rotation.y = 0;
  const screen = MeshBuilder.CreatePlane('screen', { width: 1.5, height: 1.1 }, scene);
  screen.position.set(0.9, 1.55, -2.46);
  screen.rotation.y = Math.PI;
  screen.material = mats.painted(new Color3(0.82, 0.82, 0.8), 0.95, 'screen');
  // framed prints on the walls (Ruth's)
  framedPrints(scene, mats, game);

  // tag hotspots
  setMeta([...desk.meshes, mat, notebook], { station: 'desk' });
  setMeta([catalogue], { station: 'catalogue' });
  setMeta([...fridge.meshes], { station: 'catalogue' });
  setMeta([...cab.meshes, cabPlaque], { station: 'cabinet' });
  setMeta([...cork.meshes], { station: 'board' });
  setMeta([...lt.meshes, ...ltDesk.meshes], { station: 'lighttable' });
  setMeta([...outDoor.meshes], { station: 'out' });
  setMeta([...darkDoor.meshes, redLamp], { station: 'darkroom' });
  setMeta([...proj.meshes, screen], { station: 'projector' });

  // shadow casters
  for (const m of scene.meshes) {
    if (m.name.startsWith('wall') || m.name === 'floor' || m.name === 'ceiling' || m.name === 'outside' || m.name === 'rug') {
      m.receiveShadows = true;
      continue;
    }
    shadows.addShadowCaster(m, false);
    if (m.position && Vector3.Distance(m.getAbsolutePosition(), DESK_ANCHOR) < 1.2) lampShadow.addShadowCaster(m, false);
    m.receiveShadows = true;
  }
  for (const m of rm.meshes) m.receiveShadows = true;

  // ---------- camera & post ----------
  const glide = new GlideCamera(scene, menu ? POSES.menu : POSES.overview);
  glide.sway = menu ? 0.06 : 0;
  glide.parallax = menu ? 0 : 0.18;
  const pipe = makePipeline(scene, [glide.cam], q, { exposure: 1.05, contrast: 1.1, bloom: 0.12, bloomThreshold: 1.4, ssaoRadius: 0.35, ssaoStrength: 1.0, vignette: 0.32, grain: 5 });
  if (q === 'high' || q === 'ultra') {
    const vls = new VolumetricLightScatteringPostProcess('godrays', 1.0, glide.cam, outside, q === 'ultra' ? 90 : 60, Texture.BILINEAR_SAMPLINGMODE, game.engine, false);
    vls.exposure = 0.12;
    vls.decay = 0.965;
    vls.weight = 0.45;
    vls.density = 0.9;
  }

  // ---------- cameras on display ----------
  const displayRigs: CameraRig[] = [];
  const placeCabinet = () => {
    displayRigs.forEach((r) => r.dispose());
    displayRigs.length = 0;
    const owned = s.cameras.filter((c) => c.id !== s.activeCameraId || mode !== 'desk');
    owned.forEach((u, i) => {
      if (mode === 'desk' && u.id === s.activeCameraId) return;
      const shelf = Math.floor(i / 4);
      if (shelf >= cab.anchors.length) return;
      const slot = i % 4;
      const lensU = s.lenses.find((l) => l.id === u.lensId);
      const rig = buildCamera(scene, mats, u, lensU);
      const a = cab.anchors[cab.anchors.length - 1 - shelf];
      // cabinet local → world: cabinet rotated -90° around Y at (-2.78, 0, 0.5)
      const localX = -0.54 + slot * 0.36;
      rig.root.position.set(-2.78 + 0.02, a.y + rig.size[1] / 2 + 0.002, 0.5 - localX);
      if (camera(u.modelId).kind === 'super8') rig.root.position.y += 0.0;
      rig.root.rotation.y = -Math.PI / 2 + 0.25;
      const sc = camera(u.modelId).kind === 'super8' ? 0.8 : 1.15;
      rig.root.scaling.setAll(sc);
      rig.root.metadata = { unitId: u.id };
      for (const m of rig.root.getChildMeshes()) shadows.addShadowCaster(m, false);
      displayRigs.push(rig);
    });
  };

  // ---------- interaction ----------
  let mode: Station = menu ? 'menu' : 'overview';
  let inspector: Inspector | null = null;
  let deskSheet: HTMLElement | null = null;
  const layer = game.hud.sceneLayer;

  const setHints = () => {
    const hints: Record<Station, [string, string][]> = {
      overview: [['Click', 'walk to'], ['Esc', 'settings'], ['C', 'collection book']],
      desk: [['Drag', 'turn camera'], ['Click part', 'inspect'], ['Esc', 'step back']],
      cabinet: [['Click camera', 'take to desk'], ['Esc', 'step back']],
      board: [['Esc', 'step back']],
      lighttable: [['Esc', 'step back']],
      projector: [['Esc', 'step back']],
      menu: [],
    };
    game.hud.hints(hints[mode]);
  };

  const refreshDesk = () => {
    deskSheet?.remove();
    deskSheet = null;
    if (mode !== 'desk' || !inspector) return;
    const unit = unitById(s, s.activeCameraId);
    if (!unit) return;
    deskSheet = deskPanel(
      game,
      unit,
      {
        check: (c) => void inspector?.check(c).then(() => refreshDesk()),
        setSpeed: (t) => {
          if (inspector) inspector.shutterSpeed = t;
        },
        refresh: () => {
          openDesk();
        },
        putAway: () => {
          goto('cabinet');
        },
        loaded: () => {
          inspector?.rig.setFilmLoaded('x');
        },
      },
      inspector.findings,
      inspector.shutterSpeed,
    );
    layer.append(deskSheet);
  };

  const openDesk = () => {
    inspector?.dispose();
    inspector = null;
    const unit = unitById(s, s.activeCameraId);
    if (!unit) {
      game.hud.toast('No camera on the desk. Pick one from the cabinet.');
      return;
    }
    const lensU = s.lenses.find((l) => l.id === unit.lensId);
    inspector = new Inspector({
      scene,
      mats,
      unit,
      lensUnit: lensU,
      anchor: DESK_ANCHOR,
      audio: game.audio,
      hud: game.hud,
      scale: 1.6,
      baseYaw: Math.PI + 0.45,
      confirmOpenBack: async () => {
        if (unit.foundRoll) return game.hud.confirm('Film inside!', 'The counter says this camera still has exposed film in it. Opening the back in daylight will ruin those frames.', 'Open it anyway', 'Leave it closed');
        if (unit.rollId) return game.hud.confirm('Film inside!', 'There is film loaded and it has not been rewound. Opening the back now fogs it.', 'Open it anyway', 'Leave it closed');
        return true;
      },
      onFinding: (c, f) => {
        if (c === 'back' && (unit.foundRoll || unit.rollId) && inspector && inspector.backOpen < 0.5) {
          // opened with film: fog
          if (unit.foundRoll) {
            unit.foundRoll = undefined;
            game.hud.toast('Daylight floods the film. Whatever was on that roll is gone.', 'bad', 6000);
          } else if (unit.rollId) {
            const roll = s.rolls.find((r) => r.id === unit.rollId);
            if (roll) roll.openedBackFrames = Math.min(roll.frames.length, roll.format === '135' ? 4 : 12);
          }
        }
        void f;
        game.save();
      },
    });
    for (const m of inspector.rig.root.getChildMeshes()) {
      shadows.addShadowCaster(m, false);
      lampShadow.addShadowCaster(m, false);
    }
    inspector.rig.setFilmLoaded(unit.rollId ? s.rolls.find((r) => r.id === unit.rollId)?.stockId ?? null : unit.foundRoll?.stockId ?? null);
    const roll = s.rolls.find((r) => r.id === unit.rollId);
    inspector.rig.setCounter(roll ? roll.frames.length : unit.foundRoll?.framesShot ?? 0);
    refreshDesk();
  };

  const goto = (st: Station) => {
    if (st === mode && st !== 'desk') return;
    const leavingDesk = mode === 'desk' && st !== 'desk';
    mode = st;
    if (leavingDesk) {
      inspector?.dispose();
      inspector = null;
      deskSheet?.remove();
      deskSheet = null;
      placeCabinet();
    }
    glide.go(POSES[st]);
    glide.parallax = st === 'overview' ? 0.18 : 0;
    setHints();
    if (st === 'desk') {
      placeCabinet();
      setTimeout(openDesk, 500);
    } else if (st === 'board') {
      setTimeout(() => {
        const close = game.hud.modal(boardPanel(game, (i) => {
          const l = s.letters[i];
          l.read = true;
          game.save();
          game.hud.letter(l.from, l.title, l.body);
        }), { onClose: () => goto('overview') });
        void close;
      }, 700);
    } else if (st === 'lighttable') {
      setTimeout(() => openLightTable(game, () => goto('overview')), 600);
    } else if (st === 'projector') {
      setTimeout(() => openProjector(game, scene, mats, screen, proj.lensFront, () => goto('overview')), 700);
    }
  };

  const showLetterIfNew = () => {
    if (s.sandbox) return;
    if (s.chapterIntroSeen < s.chapter) {
      if (s.chapter === 0 && !s.letters.length) game.onChapterStart(0);
      s.chapterIntroSeen = s.chapter;
      const l = s.letters[0];
      if (l) {
        l.read = true;
        game.save();
        setTimeout(() => game.hud.letter(l.from, l.title, l.body), 900);
      }
    }
  };

  scene.onPointerObservable.add((pi) => {
    if (mode === 'menu' || game.hud.modalOpen) return;
    const e = pi.event as PointerEvent;
    if (pi.type === PointerEventTypes.POINTERMOVE) {
      glide.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      glide.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (mode === 'desk') return;
      const pick = scene.pick(scene.pointerX, scene.pointerY);
      const st = pick?.pickedMesh ? findMeta<string>(pick.pickedMesh, 'station')?.value : undefined;
      const unitHit = mode === 'cabinet' && pick?.pickedMesh ? findMeta<string>(pick.pickedMesh, 'unitId')?.value : undefined;
      const labels: Record<string, string> = { desk: 'Desk', catalogue: 'Mail-order catalogue', cabinet: 'Display cabinet', board: 'Corkboard', lighttable: 'Light table', out: 'Go out', darkroom: 'Darkroom', projector: 'Projector' };
      const u = unitHit ? unitById(s, unitHit) : undefined;
      game.hud.tooltip(u ? unitTitle(u) + (u.clientJob ? ' (client)' : '') : st ? labels[st] : null, e.clientX, e.clientY);
      game.canvas.style.cursor = st || u ? 'pointer' : 'default';
    } else if (pi.type === PointerEventTypes.POINTERUP && e.button === 0) {
      if (mode === 'desk') return;
      const pick = scene.pick(scene.pointerX, scene.pointerY);
      if (!pick?.pickedMesh) return;
      const unitHit = findMeta<string>(pick.pickedMesh, 'unitId')?.value;
      if (unitHit && mode === 'cabinet') {
        s.activeCameraId = unitHit;
        game.save();
        goto('desk');
        return;
      }
      const st = findMeta<string>(pick.pickedMesh, 'station')?.value;
      if (!st) return;
      game.hud.tooltip(null);
      if (st === 'out') {
        game.hud.modal(
          outingPanel(
            game,
            (where, lighting) => void game.goto('shoot', { location: where, lighting }),
            () => void game.goto('market'),
          ),
        );
      } else if (st === 'darkroom') void game.goto('darkroom');
      else if (st === 'catalogue') game.hud.modal(cataloguePanel(game, () => undefined));
      else goto(st as Station);
    }
  });

  const host: SceneHost = {
    scene,
    dispose: () => {
      inspector?.dispose();
      pipe.dispose();
      scene.dispose();
    },
    onKey: (e, down) => {
      if (!down) return;
      if (e.key === 'Escape') {
        if (game.hud.closeTop()) return;
        if (mode === 'menu') return;
        if (mode !== 'overview') goto('overview');
        else game.hud.modal(settingsPanel(game, () => void game.goto('menu')));
      } else if (e.key.toLowerCase() === 'c' && mode !== 'menu' && !game.hud.modalOpen) game.hud.modal(collectionPanel(game));
    },
  };

  placeCabinet();
  game.audio.loop('room', true);
  if (menu) {
    game.hud.setVisible({ ledger: false, clip: false, hint: false });
    // New career / Continue replace game.state, and this scene captured the old
    // state object at creation, so rebuild the studio around the chosen one.
    showMenu(game, () => void game.goto('studio'));
  } else {
    game.hud.setVisible({ ledger: true, clip: true, hint: true });
    setHints();
    showLetterIfNew();
    if (args.station) goto(args.station as Station);
  }
  void displayRigs;
  void (null as unknown as Mesh | TransformNode | AbstractMesh);
  return host;
}

function showMenu(game: Game, start: () => void) {
  const layer = game.hud.sceneLayer;
  const card = h('div', { class: 'sheet card menu-card tape' });
  const go = () => {
    card.remove();
    start();
  };
  card.append(h('div', { class: 'title' }, 'Latent Image'), h('div', { class: 'tagline' }, 'Collect, test and develop old cameras.'));
  if (hasSave()) {
    const st = game.state;
    const ch = CHAPTERS[st.chapter];
    card.append(btn(`Continue${ch ? ` · ${ch.title}` : ''}`, () => (game.continueCareer(), go())));
  }
  card.append(
    btn('New career', async () => {
      if (hasSave() && !(await game.hud.confirm('Start over?', 'This replaces your current career save.', 'Start over', 'Cancel'))) return;
      game.newCareer();
      game.hud.update(game.state);
      go();
    }),
    btn('Free shooting', () => {
      game.startSandbox();
      void game.goto('studio');
    }),
    btn('Settings', () => game.hud.modal(settingsPanel(game))),
  );
  if (navigator.userAgent.includes('Electron')) card.append(btn('Quit', () => window.close(), 'red'));
  card.append(h('div', { class: 'hand', style: 'margin-top:12px;font-size:21px' }, 'for Ruth, who never threw a camera away'));
  layer.append(card);
}

function paintOutside(scene: import('@babylonjs/core').Scene): DynamicTexture {
  const W = 2048;
  const H = 1024;
  const t = new DynamicTexture('outside', { width: W, height: H }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  // soft sky with banded cloud
  const bands = ['#bcd2e4', '#c5d8e6', '#cfdeE8', '#d8e3e9', '#e1e7e8', '#e8eae4'];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, (i * H * 0.55) / bands.length, W, (H * 0.55) / bands.length + 2);
  });
  ctx.fillStyle = '#e8eae4';
  ctx.fillRect(0, H * 0.55, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(rnd() * W, 60 + rnd() * 260, 140 + rnd() * 220, 18 + rnd() * 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // three layers of rooftops: far (pale, small) → near (darker, bigger)
  const layers = [
    { base: 0.66, hmin: 60, hmax: 130, wmin: 40, wmax: 90, col: ['#b9c0c6', '#b3b9bf', '#c0c4c6'], roof: '#a4abb2', win: '#cdd3d6' },
    { base: 0.78, hmin: 110, hmax: 210, wmin: 70, wmax: 140, col: ['#a5a39c', '#9d9a93', '#aba59a', '#98a0a4'], roof: '#7f7d79', win: '#c3c6c2' },
    { base: 0.98, hmin: 200, hmax: 330, wmin: 120, wmax: 230, col: ['#8d887f', '#958e83', '#867f77', '#8b9196'], roof: '#5e5753', win: '#b8bbb6' },
  ];
  for (const L of layers) {
    let x = -20;
    while (x < W) {
      const w = L.wmin + rnd() * (L.wmax - L.wmin);
      const hgt = L.hmin + rnd() * (L.hmax - L.hmin);
      const top = H * L.base - hgt;
      ctx.fillStyle = L.col[Math.floor(rnd() * L.col.length)];
      ctx.fillRect(x, top, w, H - top);
      ctx.fillStyle = L.roof;
      ctx.beginPath();
      ctx.moveTo(x - 4, top);
      ctx.lineTo(x + w * 0.5, top - w * (0.25 + rnd() * 0.2));
      ctx.lineTo(x + w + 4, top);
      ctx.fill();
      if (rnd() < 0.6) ctx.fillRect(x + w * (0.2 + rnd() * 0.5), top - w * 0.3, w * 0.08, w * 0.25);
      ctx.fillStyle = L.win;
      const ww = Math.max(6, w * 0.11);
      for (let wy = top + hgt * 0.15; wy < H * L.base - ww * 1.6; wy += ww * 2.6) for (let wx = x + ww; wx < x + w - ww * 1.5; wx += ww * 2.2) ctx.fillRect(wx, wy, ww, ww * 1.5);
      x += w + 2 + rnd() * 6;
    }
  }
  t.update(true);
  return t;
}

function drawBoard(tex: DynamicTexture, game: Game) {
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const W = tex.getSize().width;
  const H = tex.getSize().height;
  // cork
  ctx.fillStyle = '#9b7348';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(70,45,20,.35)' : 'rgba(200,160,110,.25)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  const notes = game.state.letters.slice(0, 5);
  notes.forEach((l, i) => {
    const x = 60 + (i % 3) * 320;
    const y = 50 + Math.floor(i / 3) * 360;
    ctx.save();
    ctx.translate(x + 120, y + 150);
    ctx.rotate((i % 2 ? 1 : -1) * 0.05 * (1 + (i % 3)));
    ctx.fillStyle = i === 0 ? '#f1e9d6' : '#e8dcc0';
    ctx.fillRect(-120, -150, 250, 300);
    ctx.fillStyle = '#1b1813';
    ctx.font = '600 22px Jost';
    ctx.fillText(l.title.slice(0, 22), -104, -110);
    ctx.font = '16px "Courier Prime"';
    const words = l.body.split(' ');
    let line = '';
    let ly = -80;
    for (const w of words) {
      if ((line + w).length > 26) {
        ctx.fillText(line, -104, ly);
        line = '';
        ly += 20;
        if (ly > 120) break;
      }
      line += w + ' ';
    }
    ctx.fillStyle = '#8e2a1c';
    ctx.beginPath();
    ctx.arc(0, -138, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  tex.update(true);
}

function framedPrints(scene: import('@babylonjs/core').Scene, mats: Mats, game: Game) {
  const spots: [number, number, number, number][] = [
    [-2.97, 1.65, -1.2, -Math.PI / 2],
    [-2.97, 1.55, -0.3, -Math.PI / 2],
    [2.97, 1.6, -0.1, Math.PI / 2],
  ];
  spots.forEach(([x, y, z, ry], i) => {
    const t = new DynamicTexture('printTex', { width: 400, height: 500 }, scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = '#efece4';
    ctx.fillRect(0, 0, 400, 500);
    // abstract "photograph": tonal landscape
    const tones = ['#2a2a2a', '#555', '#8a8a8a', '#bcbcbc'];
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(50, 60, 300, 360);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = tones[(k + i) % 4];
      ctx.beginPath();
      ctx.moveTo(50, 260 + k * 40);
      for (let px = 50; px <= 350; px += 20) ctx.lineTo(px, 240 + k * 45 + Math.sin(px * 0.03 + k + i) * 18);
      ctx.lineTo(350, 420);
      ctx.lineTo(50, 420);
      ctx.fill();
    }
    t.update(true);
    const f = roundedBox('frame', scene, 0.42, 0.52, 0.025, 0.004, 2);
    f.position.set(x, y, z);
    f.rotation.y = ry;
    f.material = mats.painted(new Color3(0.05, 0.05, 0.05), 0.4, 'frame');
    const p = MeshBuilder.CreatePlane('print', { width: 0.38, height: 0.475 }, scene);
    p.parent = f;
    p.position.z = -0.0135;
    p.material = mats.decal(t, 0.7);
    p.rotation.y = 0;
    const gl = MeshBuilder.CreatePlane('frameGlass', { width: 0.38, height: 0.475 }, scene);
    gl.parent = f;
    gl.position.z = -0.0136;
    gl.material = mats.glass(new Color3(1, 1, 1), 0.06, 0.03);
    gl.isPickable = false;
  });
  void game;
}

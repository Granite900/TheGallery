/**
 * The darkroom: film processing (B&W, C-41, E-6, B&W reversal) as hands-on
 * steps, and the enlarger for B&W prints.
 */
import { Color3, HemisphericLight, MeshBuilder, PointLight, ShadowGenerator, SpotLight, Vector3, DynamicTexture, TransformNode, Mesh } from '@babylonjs/core';
import type { Game, SceneHost } from '../app/Game';
import { Mats } from '../render/materials';
import { darkroomPainter, makeEnvironment } from '../render/env';
import { makePipeline } from '../render/quality';
import { FilmLab, DevelopParams } from '../render/filmLook';
import { GlideCamera, Pose, V, newScene } from './common';
import { room, table, door as doorProp } from '../models/props';
import { cyl, lathe, roundedBox, textTexture } from '../models/geom';
import { h, btn } from '../ui/dom';
import { DEVELOPERS, film, developer, frameSize, FILMS, Process, formatAperture } from '../sim/data';
import { DevSetup, StepDef, StepLog, evaluateDevelopment, recipe, recommendedMinutes, tempFactorBW, clearingTime, emptyLog, LoadLog, DevResult } from '../sim/develop';
import { Roll, unitById } from '../sim/state';
import { clamp, makeRng, hashString } from '../sim/rng';
import { scanK } from '../sim/filmcurve';
import { PrintSettings, apertureFactor, evaluatePrint, gradeRange, PAPER_K } from '../sim/print';
import { newId } from '../sim/units';
import { developRollFrames } from '../render/developRoll';

type Station = 'overview' | 'bench' | 'enlarger' | 'trays';
const POSES: Record<Station, Pose> = {
  overview: { pos: V(0, 1.6, -1.6), target: V(0, 1.0, 1.0), fov: 1.0 },
  bench: { pos: V(-0.9, 1.45, 0.25), target: V(-0.9, 0.9, 1.25), fov: 0.75 },
  enlarger: { pos: V(1.05, 1.55, 0.35), target: V(1.05, 0.85, 1.25), fov: 0.85 },
  trays: { pos: V(0.0, 1.5, 0.3), target: V(0.0, 0.9, 1.3), fov: 0.8 },
};

export async function createDarkroom(game: Game, _args: Record<string, unknown>): Promise<SceneHost> {
  const scene = newScene(game.engine);
  const mats = new Mats(scene);
  const s = game.state;
  const q = s.settings.quality;
  const lab = new FilmLab(game.engine);
  const env = await makeEnvironment(scene, darkroomPainter());
  scene.environmentTexture = env;
  scene.environmentIntensity = 0.6;

  // ---------- room & props ----------
  const rm = room(scene, mats, 4, 3.2, 2.5, { wall: 'plaster', wallTint: new Color3(0.32, 0.32, 0.33), floor: 'concrete', ceiling: new Color3(0.15, 0.15, 0.15) });
  void rm;
  // long bench along the back wall
  const bench = table(scene, mats, 3.6, 0.7, 0.9, 'deskWood');
  bench.root.position.set(0, 0, 1.2);
  const sinkMat = mats.plastic(new Color3(0.06, 0.06, 0.065), 0.35);
  const sink = roundedBox('sink', scene, 1.5, 0.12, 0.62, 0.02, 2);
  sink.position.set(0, 0.95, 1.2);
  sink.material = sinkMat;
  // trays
  const trayCols = [new Color3(0.7, 0.68, 0.62), new Color3(0.55, 0.12, 0.08), new Color3(0.15, 0.25, 0.45)];
  const trayLabels = ['DEV', 'STOP', 'FIX'];
  const trays: Mesh[] = [];
  trayCols.forEach((c, i) => {
    const t = roundedBox('tray', scene, 0.34, 0.06, 0.42, 0.015, 3);
    t.position.set(-0.45 + i * 0.45, 1.04, 1.2);
    t.material = mats.plastic(c, 0.4);
    const liquid = MeshBuilder.CreatePlane('liquid', { width: 0.3, height: 0.38 }, scene);
    liquid.rotation.x = Math.PI / 2;
    liquid.position.set(-0.45 + i * 0.45, 1.065, 1.2);
    liquid.material = mats.base('liq', i === 0 ? new Color3(0.4, 0.38, 0.3) : i === 1 ? new Color3(0.5, 0.45, 0.1) : new Color3(0.4, 0.4, 0.4), 0, 0.02);
    const lbl = MeshBuilder.CreatePlane('trayLabel', { width: 0.12, height: 0.035 }, scene);
    lbl.position.set(-0.45 + i * 0.45, 1.08, 0.985);
    lbl.material = mats.decal(textTexture(scene, [trayLabels[i]], { w: 256, h: 80, bg: '#e9e1cc', color: '#1b1813', font: '700 56px Jost' }), 0.7);
    trays.push(t);
  });
  // tank on the left bench
  const tank = new TransformNode('tank', scene);
  tank.position.set(-1.25, 0.9, 1.15);
  const tankBody = lathe('tankBody', scene, [[0, 0], [0.05, 0], [0.052, 0.005], [0.052, 0.17], [0.056, 0.175], [0.056, 0.2], [0.03, 0.21], [0.03, 0.23], [0, 0.23]], 48);
  tankBody.parent = tank;
  tankBody.material = mats.plastic(new Color3(0.03, 0.03, 0.035), 0.45);
  const tankLid = lathe('tankLid', scene, [[0.032, 0.21], [0.058, 0.205], [0.058, 0.215], [0.032, 0.235]], 48);
  tankLid.parent = tank;
  tankLid.material = mats.plastic(new Color3(0.6, 0.1, 0.06), 0.4);
  // graduates (jugs) and bottles
  const jugMat = mats.glass(new Color3(0.85, 0.9, 0.9), 0.35, 0.05);
  for (let i = 0; i < 3; i++) {
    const j = lathe('jug', scene, [[0, 0], [0.04, 0], [0.045, 0.16], [0.047, 0.165]], 32);
    j.position.set(-1.55 + i * 0.12, 0.9, 1.35);
    j.material = jugMat;
    const liq = cyl('jugLiquid', scene, 0.078, 0.1, 24);
    liq.position.set(-1.55 + i * 0.12, 0.95, 1.35);
    liq.material = mats.base('chem', [new Color3(0.6, 0.55, 0.3), new Color3(0.55, 0.5, 0.1), new Color3(0.5, 0.5, 0.52)][i], 0, 0.02);
  }
  for (let i = 0; i < 7; i++) {
    const b = lathe('bottle', scene, [[0, 0], [0.045, 0], [0.047, 0.17], [0.02, 0.21], [0.018, 0.24], [0, 0.24]], 24);
    b.position.set(-1.6 + i * 0.12, 1.6, 1.48);
    b.material = mats.glass(new Color3(0.35, 0.18, 0.06), 0.85, 0.08);
    const lbl = MeshBuilder.CreatePlane('bottleLabel', { width: 0.06, height: 0.07 }, scene);
    lbl.position.set(-1.6 + i * 0.12, 1.69, 1.43);
    lbl.material = mats.decal(textTexture(scene, [['D-76', 'HC-110', 'RODINAL', 'STOP', 'FIXER', 'C-41', 'PHOTO-FLO'][i]], { w: 256, h: 256, bg: '#efe6cf', color: '#1b1813', font: '700 46px Jost' }), 0.7);
  }
  const shelf = roundedBox('shelf', scene, 1.0, 0.025, 0.25, 0.004, 2);
  shelf.position.set(-1.25, 1.585, 1.48);
  shelf.material = mats.textured('deskWood', 1, 1);
  // thermometer + timer
  const thermo = lathe('thermometer', scene, [[0, 0], [0.004, 0.005], [0.004, 0.25], [0, 0.26]], 12);
  thermo.position.set(-1.05, 0.92, 1.1);
  thermo.rotation.z = 0.3;
  thermo.material = mats.glass(new Color3(0.9, 0.9, 0.9), 0.6, 0.02);
  const timerTex = new DynamicTexture('timerFace', { width: 512, height: 512 }, scene, true);
  const timerBody = roundedBox('timer', scene, 0.22, 0.22, 0.08, 0.02, 3);
  timerBody.position.set(-0.6, 1.95, 1.55);
  timerBody.material = mats.plastic(new Color3(0.05, 0.05, 0.05), 0.4);
  const timerFace = MeshBuilder.CreateDisc('timerFaceM', { radius: 0.095, tessellation: 64 }, scene);
  timerFace.position.set(-0.6, 1.95, 1.505);
  timerFace.material = mats.decal(timerTex, 0.4, 0, 1.4);
  const drawTimer = (sec: number, total: number) => {
    const c = timerTex.getContext() as CanvasRenderingContext2D;
    c.fillStyle = '#0c0c0c';
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#5ff08a';
    c.fillStyle = '#5ff08a';
    c.lineWidth = 6;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const r0 = i % 5 ? 220 : 196;
      c.beginPath();
      c.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0);
      c.lineTo(256 + Math.cos(a) * 238, 256 + Math.sin(a) * 238);
      c.stroke();
    }
    c.font = '700 44px Jost';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      c.fillText(String(i * 5), 256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160);
    }
    const hand = (frac: number, len: number, w: number, col: string) => {
      const a = frac * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(256, 256);
      c.lineTo(256 + Math.cos(a) * len, 256 + Math.sin(a) * len);
      c.stroke();
    };
    hand((sec % 60) / 60, 220, 5, '#ff6a4a');
    hand((sec / 60 % 60) / 60, 150, 12, '#5ff08a');
    if (total > 0) hand((total / 60 % 60) / 60, 120, 4, '#f2c94c');
    timerTex.update(true);
  };
  drawTimer(0, 0);
  // enlarger on the right
  const enl = new TransformNode('enlarger', scene);
  enl.position.set(1.15, 0.9, 1.2);
  const base = roundedBox('baseboard', scene, 0.5, 0.025, 0.55, 0.005, 2);
  base.parent = enl;
  base.position.set(0, 0.0125, 0);
  base.material = mats.textured('deskWood', 1, 1, new Color3(0.7, 0.7, 0.7));
  const easel = roundedBox('easel', scene, 0.32, 0.012, 0.26, 0.003, 2);
  easel.parent = enl;
  easel.position.set(0, 0.032, -0.03);
  easel.material = mats.painted(new Color3(0.85, 0.82, 0.3), 0.5, 'easel');
  const column = cyl('column', scene, 0.04, 1.0, 24);
  column.parent = enl;
  column.position.set(0, 0.5, 0.22);
  column.material = mats.chrome(0.2);
  const head = roundedBox('enlHead', scene, 0.2, 0.2, 0.24, 0.03, 3);
  head.parent = enl;
  head.position.set(0, 0.72, 0.06);
  head.material = mats.painted(new Color3(0.82, 0.8, 0.75), 0.4, 'enlhead');
  const bellows = cyl('bellows', scene, 0.12, 0.1, 24);
  bellows.parent = enl;
  bellows.position.set(0, 0.57, 0.06);
  bellows.material = mats.textured('leatherette', 2, 1);
  const enlLens = cyl('enlLens', scene, 0.06, 0.05, 24);
  enlLens.parent = enl;
  enlLens.position.set(0, 0.5, 0.06);
  enlLens.material = mats.satinBlack();
  // drying line with clips
  const line = cyl('line', scene, 0.004, 3.4, 6);
  line.rotation.z = Math.PI / 2;
  line.position.set(0, 2.2, 0.2);
  line.material = mats.plastic(new Color3(0.8, 0.8, 0.8), 0.6);
  const strips: Mesh[] = [];
  // door
  const dr = doorProp(scene, mats, new Color3(0.06, 0.06, 0.06), 'STUDIO');
  dr.root.position.set(-1.0, 0, -1.58);
  dr.root.rotation.y = Math.PI;

  // ---------- lights ----------
  const safelight = new PointLight('safelight', V(0.3, 2.1, 0.9), scene);
  safelight.diffuse = new Color3(1, 0.12, 0.03);
  safelight.intensity = 1.6;
  safelight.range = 6;
  const safeLamp = roundedBox('safelightBox', scene, 0.22, 0.16, 0.08, 0.02, 2);
  safeLamp.position.set(0.3, 2.2, 1.55);
  safeLamp.material = mats.emissive(new Color3(1, 0.1, 0.02), 3);
  const room_ = new HemisphericLight('roomLight', V(0, 1, 0), scene);
  room_.intensity = 0;
  room_.diffuse = new Color3(1, 0.95, 0.88);
  const roomSpot = new SpotLight('roomSpot', V(0, 2.45, 0.3), V(0, -1, 0.3), 2.2, 1, scene);
  roomSpot.intensity = 0;
  const enlBeam = new SpotLight('enlBeam', V(1.15, 1.38, 1.26), V(0, -1, 0), 0.6, 2, scene);
  enlBeam.diffuse = new Color3(1, 0.97, 0.9);
  enlBeam.intensity = 0;
  const shadow = new ShadowGenerator(q === 'low' ? 512 : 1024, roomSpot);
  shadow.usePercentageCloserFiltering = true;
  for (const m of scene.meshes) {
    m.receiveShadows = true;
    shadow.addShadowCaster(m, false);
  }

  // ---------- camera ----------
  const glide = new GlideCamera(scene, POSES.overview);
  const pipe = makePipeline(scene, [glide.cam], q, { exposure: 1.4, contrast: 1.12, bloom: 0.35, bloomThreshold: 0.9, ssaoRadius: 0.3, vignette: 0.5, grain: 9 });
  let lightMode: 'safe' | 'white' | 'dark' = 'safe';
  const setLights = (m: 'safe' | 'white' | 'dark') => {
    lightMode = m;
    safelight.intensity = m === 'safe' ? 1.6 : 0;
    safeLamp.material = m === 'safe' ? mats.emissive(new Color3(1, 0.1, 0.02), 3) : mats.plastic(new Color3(0.2, 0.04, 0.02), 0.5);
    room_.intensity = m === 'white' ? 0.5 : 0;
    roomSpot.intensity = m === 'white' ? 22 : 0;
    scene.environmentIntensity = m === 'white' ? 1.4 : m === 'safe' ? 0.6 : 0.0;
    document.body.classList.toggle('darkroom-red', m === 'safe');
    document.body.classList.toggle('lights-out', m === 'dark');
  };
  setLights('safe');

  // ---------- UI ----------
  const layer = game.hud.sceneLayer;
  const panel = h('div', { class: 'sheet card side-panel', style: 'width:420px' });
  layer.append(panel);
  game.hud.hints([['Esc', 'leave'], ['L', 'room light']]);

  const waiting = () => s.rolls.filter((r) => r.state === 'exposed' && r.frames.length > 0);
  const developedBW = () => s.rolls.filter((r) => r.state === 'developed' && !r.dev?.ruined && film(r.stockId).process === 'bw' && r.format !== 'super8');

  // shared step-run state
  interface RunState {
    roll: Roll;
    setup: DevSetup;
    steps: StepDef[];
    idx: number;
    logs: StepLog[];
    load: LoadLog;
    bathTemp: number;
    tankTemp: number;
    running: boolean;
    elapsed: number;
    speed: number;
    log: StepLog | null;
    lastMinute: number;
  }
  let run: RunState | null = null;
  let tick = 0;
  let animInv = 0;

  const home = () => {
    run = null;
    glide.go(POSES.overview);
    setLights('safe');
    panel.innerHTML = '';
    panel.append(h('h2', null, 'Darkroom'));
    const w = waiting();
    panel.append(h('h3', null, 'Film waiting to be developed'));
    if (!w.length) panel.append(h('p', { class: 'small' }, 'Nothing waiting. Shoot a roll, then rewind and unload it at your desk.'));
    for (const r of w) {
      const f = film(r.stockId);
      const u = unitById(s, r.unitId);
      panel.append(
        h(
          'div',
          { class: 'row', onclick: () => chooseChem(r) },
          h('span', null, r.unknownStock ? `Unknown film, found in ${u ? u.modelId : 'a camera'} (${r.frames.length} frames)` : `${f.maker} ${f.name} @ EI ${r.ei}`),
          h('span', { class: 'r' }, `${r.frames.length} fr`),
        ),
      );
    }
    panel.append(h('hr'), h('h3', null, 'Enlarger'));
    const dbw = developedBW();
    if (!dbw.length) panel.append(h('p', { class: 'small' }, 'Developed black & white negatives can be printed here.'));
    else panel.append(btn('Make prints', () => openEnlarger()));
    panel.append(h('hr'), h('div', { class: 'small' }, `Fixer: used for ${s.chem.fixerUses} rolls. Clearing time now ≈ ${Math.round(clearingTime(s.chem.fixerUses))} s.  Kits: C-41 ×${s.chem.c41Kits}, E-6 ×${s.chem.e6Kits}, reversal ×${s.chem.revKits}.`));
    panel.append(h('div', { style: 'margin-top:10px' }, btn('Back to the studio', () => void game.goto('studio'), 'blue')));
  };

  // ---------- choose chemistry ----------
  const chooseChem = (roll: Roll) => {
    const f = film(roll.stockId);
    const proc: Process = f.process;
    glide.go(POSES.bench);
    panel.innerHTML = '';
    panel.append(h('h2', null, roll.unknownStock ? 'Unknown film' : `${f.maker} ${f.name}`));
    if (roll.unknownStock) panel.append(h('p', { class: 'small' }, `No box, no datasheet. The backing paper says "${f.maker}" and the spool is old. It probably expired ${roll.expiredYears > 20 ? 'decades' : 'years'} ago.`));
    else panel.append(h('p', { class: 'small' }, `Shot at EI ${roll.ei}${roll.ei !== f.iso ? ` (box speed ${f.iso}: ${roll.ei > f.iso ? 'push' : 'pull'} ${Math.abs(Math.log2(roll.ei / f.iso)).toFixed(0)} stop)` : ''}. Process: ${proc === 'bw' ? 'black & white' : proc === 'c41' ? 'C-41 colour' : proc === 'e6' ? 'E-6 slide' : 'B&W reversal'}.`));
    const kits = { c41: s.chem.c41Kits, e6: s.chem.e6Kits, bwrev: s.chem.revKits, bw: 99 };
    if (kits[proc] <= 0) {
      panel.append(h('p', null, 'You have no kit for this process. Order one from the catalogue in the studio.'), btn('Back', home));
      return;
    }
    let devId = 'd76';
    let dil = 'stock';
    let temp = proc === 'bw' ? 20 : proc === 'bwrev' ? 20 : 38;
    const timeEl = h('div', { class: 'thermo', style: 'margin:8px 0' });
    const upd = () => {
      if (proc !== 'bw') {
        timeEl.textContent = proc === 'c41' ? `Colour developer: 3:15 at 37.8 °C. Bath at ${temp.toFixed(1)} °C.` : proc === 'e6' ? `First developer: 6:30 at 38 °C. Bath at ${temp.toFixed(1)} °C.` : `First developer: 6:00 at 20 °C.`;
        return;
      }
      if (roll.unknownStock) {
        timeEl.textContent = dil === '1+100' ? 'Stand development: 60 minutes, whatever the film.' : 'No datasheet for unknown film. You are guessing.';
        return;
      }
      const m = recommendedMinutes(roll.stockId, devId, dil, roll.ei, temp);
      const mm = m == null ? null : Math.floor(m);
      const ss = m == null ? 0 : Math.round((m - Math.floor(m)) * 60);
      timeEl.textContent = m == null ? 'No published time for this combination.' : s.assist === 'purist' ? `Datasheet at 20 °C: ${f.devTimes.find((d) => d.developer === devId && d.dilution === dil)?.minutes ?? '?'} min. (Adjust for temperature & push yourself.)` : `Time at ${temp.toFixed(1)} °C${roll.ei !== f.iso ? `, push/pull included` : ''}: ${mm}:${String(ss).padStart(2, '0')}`;
    };
    if (proc === 'bw') {
      const devSel = h('select', { onchange: (e: Event) => ((devId = (e.target as HTMLSelectElement).value), (dil = developer(devId).dilutions[0]), refreshDil(), upd()) }, ...DEVELOPERS.map((d) => h('option', { value: d.id }, d.name)));
      const dilSel = h('select', { onchange: (e: Event) => ((dil = (e.target as HTMLSelectElement).value), upd()) });
      const refreshDil = () => {
        dilSel.innerHTML = '';
        for (const d of developer(devId).dilutions) dilSel.append(h('option', { value: d, selected: d === dil }, d));
      };
      refreshDil();
      panel.append(h('div', { class: 'grid2' }, h('span', { class: 'label' }, 'Developer'), devSel, h('span', { class: 'label' }, 'Dilution'), dilSel));
      const notes = h('div', { class: 'small', style: 'margin:6px 0' });
      notes.textContent = DEVELOPERS.map((d) => `${d.name}: ${d.notes}`).join(' ');
      panel.append(notes);
    }
    const tempIn = h('input', { type: 'range', min: proc === 'bw' || proc === 'bwrev' ? '16' : '34', max: proc === 'bw' || proc === 'bwrev' ? '26' : '41', step: '0.1', value: String(temp), oninput: (e: Event) => ((temp = Number((e.target as HTMLInputElement).value)), upd()) });
    panel.append(h('div', { class: 'label' }, 'Mix the water bath (hot / cold tap)'), tempIn, timeEl);
    if (proc === 'bw' && s.assist !== 'purist') {
      const chart = h('div', { class: 'small' }, h('b', null, 'Time/temperature chart (pinned by the sink): '), [18, 19, 20, 21, 22, 23, 24].map((t) => `${t}°C ×${(1 / tempFactorBW(t)).toFixed(2)}`).join(' · '));
      panel.append(chart);
    }
    if (proc === 'bw') panel.append(h('div', { class: 'small', style: 'margin-top:6px' }, `Fixer clearing test: a snip of leader goes clear in ${Math.round(clearingTime(s.chem.fixerUses))} s. Fix for at least twice that.`));
    upd();
    panel.append(
      h(
        'div',
        { style: 'margin-top:12px' },
        btn('Lights out: load the tank', () => {
          const setup: DevSetup = { stockId: roll.stockId, process: proc, developerId: proc === 'bw' ? devId : proc, dilution: proc === 'bw' ? dil : 'kit', ei: roll.ei, unknown: roll.unknownStock, expiredYears: roll.expiredYears };
          run = { roll, setup, steps: recipe(setup, temp), idx: 0, logs: [], load: { lightFog: 0, kinks: 0, openedBackFrames: roll.openedBackFrames ?? 0 }, bathTemp: temp, tankTemp: 20.5, running: false, elapsed: 0, speed: 1, log: null, lastMinute: -1 };
          loadMinigame();
        }),
        btn('Back', home, 'red'),
      ),
    );
  };

  // ---------- loading the reel in the dark ----------
  const loadMinigame = () => {
    if (!run) return;
    setLights('dark');
    const total = run.roll.format === '120' ? 14 : run.roll.format === 'super8' ? 10 : 18;
    let progress = 0;
    let lastKey = '';
    let lastT = 0;
    let stage = 0;
    const overlay = h('div', { style: 'position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#6d6457;font-family:var(--font-type);z-index:30' });
    const msg = h('div', { style: 'font-size:16px;max-width:520px;text-align:center;line-height:1.6' });
    const bar = h('div', { style: 'width:300px;height:2px;background:#1a1a1a' }, h('i', { style: 'display:block;height:100%;width:0;background:#4a443a' }));
    overlay.append(msg, bar);
    layer.append(overlay);
    const stages = [
      run.roll.format === '120' ? 'Total darkness. Unroll the backing paper and find the taped end. (Click)' : run.roll.format === 'super8' ? 'Total darkness. Crack the cartridge open. (Click)' : 'Total darkness. Pop the cassette cap with the opener. (Click)',
      'Cut the leader square with the scissors. (Click)',
      `Wind the film onto the reel: rock the two halves, A then D, A then D… Not too fast.`,
      'Drop the reel in the tank and screw the lid on. (Click)',
    ];
    const show = () => (msg.textContent = stages[stage]);
    show();
    const onClick = () => {
      if (stage === 2) return;
      game.audio.click(0.12, stage === 1 ? 4500 : 1400);
      stage++;
      if (stage === 4) finish();
      else show();
    };
    const onKey = (e: KeyboardEvent) => {
      if (stage !== 2) return;
      const k = e.key.toLowerCase();
      if (k !== 'a' && k !== 'd') return;
      const now = performance.now();
      if (k === lastKey) {
        game.audio.click(0.1, 700);
        if (Math.random() < 0.3) run!.load.kinks++;
        return;
      }
      if (now - lastT < 110 && Math.random() < 0.5) run!.load.kinks++;
      lastKey = k;
      lastT = now;
      progress++;
      game.audio.click(0.06, 3800);
      (bar.firstChild as HTMLElement).style.width = `${(progress / total) * 100}%`;
      if (progress >= total) {
        stage = 3;
        show();
      }
    };
    const finish = () => {
      overlay.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (run!.load.kinks > 0 && s.assist !== 'purist') game.hud.toast(`You felt the film buckle ${run!.load.kinks === 1 ? 'once' : run!.load.kinks + ' times'} on the reel.`, 'bad');
      setLights('white');
      game.audio.door();
      startSteps();
    };
    overlay.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey, true);
    // lights-on trap
    dangerLight = () => {
      if (!run) return;
      run.load.lightFog = 1;
      game.hud.toast('You hit the light switch with the film out of the cassette. It is fogged.', 'bad', 6000);
      finish();
    };
  };
  let dangerLight: (() => void) | null = null;

  // ---------- process steps ----------
  const startSteps = () => {
    if (!run) return;
    dangerLight = null;
    run.idx = 1; // step 0 is loading
    glide.go(POSES.bench);
    showStep();
  };

  const showStep = () => {
    if (!run) return;
    const step = run.steps[run.idx];
    panel.innerHTML = '';
    if (!step) return;
    if (step.id === 'dry') {
      finishProcess();
      return;
    }
    const proc = run.setup.process;
    panel.append(h('h3', null, `Step ${run.idx} of ${run.steps.length - 2}`), h('h2', null, step.name), h('div', { class: 'small' }, step.chemical));
    if (s.assist !== 'purist' || !step.timed) panel.append(h('p', { class: 'small' }, step.hint));
    const target = step.seconds;
    const tgt = h('div', { class: 'small' }, s.assist === 'purist' && step.id === 'dev' ? '' : `Target: ${fmtTime(target)}${step.temp ? ` at ${step.temp} °C` : ''}`);
    const timer = h('div', { class: 'process-timer' }, '0:00');
    const tempEl = h('div', { class: 'thermo' });
    const agitEl = h('div', { class: 'small' });
    panel.append(tgt, timer, tempEl, agitEl);
    const ctrl = h('div', { class: 'flex', style: 'margin-top:6px' });
    const speedSel = h('select', { onchange: (e: Event) => run && (run.speed = Number((e.target as HTMLSelectElement).value)) }, ...[1, 4, 10, 30].map((x) => h('option', { value: String(x), selected: x === run!.speed }, x === 1 ? 'real time' : `×${x}`)));
    const pourIn = btn('Pour in & start timer', () => {
      if (!run) return;
      run.running = true;
      run.elapsed = 0;
      run.lastMinute = -1;
      run.log = emptyLog(step.id, run.bathTemp);
      run.log.tempMin = run.log.tempMax = run.tankTemp = step.temp > 30 ? run.bathTemp : run.bathTemp;
      game.audio.pour(1.6);
      pourIn.remove();
      ctrl.prepend(pourOut, agit);
      if (step.id === 'reexpose') setLights('white');
    });
    const agit = btn('Invert (Space)', () => invert());
    const pourOut = btn('Pour out', () => endStep());
    const skip = btn(step.optional ? 'Skip (optional)' : 'Skip', () => {
      if (!run) return;
      const l = emptyLog(step.id, run.bathTemp);
      l.skipped = true;
      run.logs.push(l);
      run.idx++;
      showStep();
    }, 'red');
    const hot = btn('+ hot water', () => {
      if (!run) return;
      run.bathTemp += 0.6;
      game.audio.pour(0.5);
    }, 'mini');
    const cold = btn('+ cold', () => {
      if (!run) return;
      run.bathTemp -= 0.6;
      game.audio.pour(0.5);
    }, 'mini');
    ctrl.append(pourIn, skip);
    panel.append(ctrl, h('div', { class: 'flex', style: 'margin-top:6px' }, h('span', { class: 'label' }, 'Clock'), speedSel, proc === 'c41' || proc === 'e6' ? hot : null, proc === 'c41' || proc === 'e6' ? cold : null));
    stepUi = { timer, tempEl, agitEl, step };
  };
  let stepUi: { timer: HTMLElement; tempEl: HTMLElement; agitEl: HTMLElement; step: StepDef } | null = null;

  const invert = () => {
    if (!run?.running || !run.log) return;
    const sec = run.elapsed;
    const minute = Math.floor(sec / 60);
    if (sec < 30) run.log.initialInversions++;
    run.log.inversionsPerMinute[minute] = (run.log.inversionsPerMinute[minute] ?? 0) + 1;
    animInv = 1;
    game.audio.slosh();
  };

  const endStep = () => {
    if (!run?.running || !run.log) return;
    run.running = false;
    run.log.seconds = run.elapsed;
    run.logs.push(run.log);
    game.audio.pour(1.4);
    const step = run.steps[run.idx];
    const diff = run.elapsed - step.seconds;
    if (step.timed && s.assist === 'guided' && Math.abs(diff) > step.toleranceSec && step.id !== 'wash') game.hud.toast(`${step.name}: ${fmtTime(run.elapsed)} (target ${fmtTime(step.seconds)})`, Math.abs(diff) > step.toleranceSec * 2 ? 'bad' : '');
    if (step.id === 'reexpose') setLights('white');
    run.log = null;
    run.idx++;
    showStep();
  };

  const finishProcess = async () => {
    if (!run) return;
    const r = run.roll;
    const proc = run.setup.process;
    const res = evaluateDevelopment(run.setup, run.steps, run.logs, run.load, s.chem.fixerUses);
    if (proc === 'bw' || proc === 'bwrev') s.chem.fixerUses++;
    if (proc === 'c41') s.chem.c41Kits = Math.max(0, s.chem.c41Kits - 0.125);
    if (proc === 'e6') s.chem.e6Kits = Math.max(0, s.chem.e6Kits - 0.17);
    if (proc === 'bwrev') s.chem.revKits = Math.max(0, s.chem.revKits - 1);
    panel.innerHTML = '';
    const prog = h('div', { class: 'small' }, 'Hanging the film to dry…');
    panel.append(h('h2', null, 'Drying'), prog);
    glide.go(POSES.overview);
    await developRoll(r, res, (i, n) => (prog.textContent = `Drying and cutting into strips… ${i}/${n}`));
    r.dev = res;
    r.devSetup = run.setup;
    r.state = res.ruined ? 'ruined' : 'developed';
    if (r.state === 'ruined') r.state = 'developed';
    run = null;
    game.save();
    game.progress();
    addStrip();
    panel.innerHTML = '';
    panel.append(h('h2', null, res.ruined ? 'Ruined' : 'Developed'), h('div', { class: `stamp ${res.quality >= 80 ? 'green' : res.quality >= 50 ? 'blue' : ''}`, style: 'margin:6px 0 12px' }, `Process ${res.quality}/100`));
    for (const n of res.notes) panel.append(h('p', { class: 'small' }, `· ${n}`));
    panel.append(btn('Done', home));
  };

  const developRoll = (r: Roll, res: DevResult, onProgress: (i: number, n: number) => void) => developRollFrames(game, lab, r, res, onProgress);

  const addStrip = () => {
    const st = MeshBuilder.CreatePlane('drystrip', { width: 0.05, height: 0.8 }, scene);
    st.position.set(-1.4 + strips.length * 0.12, 1.78, 0.2);
    st.material = mats.plastic(new Color3(0.25, 0.18, 0.1), 0.3);
    strips.push(st);
  };
  for (const r of s.rolls.filter((x) => x.state === 'developed').slice(-5)) addStrip();

  // ---------- enlarger ----------
  const openEnlarger = () => {
    glide.go(POSES.enlarger);
    setLights('safe');
    const rolls = developedBW();
    let roll = rolls[0];
    let frameIdx = roll.frames.findIndex((f) => f.starred);
    if (frameIdx < 0) frameIdx = 0;
    const set: PrintSettings = { seconds: 10, enlargerAperture: 8, grade: 2, devSeconds: 90, stop: true, fixSeconds: 120, washSeconds: 300, dodge: 0, burnEdges: 0, focusError: 0.6 + Math.random() * 0.4 };
    let focusKnob = 0;
    const trueFocus = (Math.random() - 0.5) * 2;
    panel.innerHTML = '';
    panel.style.width = '520px';
    const img = h('img', { style: 'width:100%;display:block;background:#111;min-height:200px' });
    const preview = h('div', { class: 'photo', style: 'width:100%;margin:8px 0' }, img);
    const out = h('div', { class: 'small' });
    const frameSel = h('select', { onchange: (e: Event) => ((frameIdx = Number((e.target as HTMLSelectElement).value)), void proj()) });
    const rollSel = h('select', { onchange: (e: Event) => ((roll = rolls[Number((e.target as HTMLSelectElement).value)]), (frameIdx = 0), fillFrames(), void proj()) }, ...rolls.map((r, i) => h('option', { value: String(i) }, `${film(r.stockId).name} · ${r.frames.length} fr · day ${r.frames[0]?.meta.day ?? ''}`)));
    const fillFrames = () => {
      frameSel.innerHTML = '';
      roll.frames.forEach((f, i) => frameSel.append(h('option', { value: String(i), selected: i === frameIdx }, `Frame ${i + 1}${f.starred ? ' ★' : ''}${f.meta.subject ? ' · ' + f.meta.subject : ''}`)));
    };
    fillFrames();
    const num = (label: string, get: () => number, setv: (v: number) => void, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const val = h('span', { style: 'font-family:var(--font-label);min-width:60px;display:inline-block' }, fmt(get()));
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()), oninput: (e: Event) => ((setv(Number((e.target as HTMLInputElement).value)), (val.textContent = fmt(get())))) });
      return h('div', { class: 'flex' }, h('span', { class: 'label', style: 'width:110px' }, label), h('div', { style: 'flex:1' }, inp), val);
    };
    const focusView = h('canvas', { width: '160', height: '90', style: 'width:160px;height:90px;background:#000' });
    const drawGrainFocus = () => {
      const c = focusView.getContext('2d')!;
      const blur = Math.abs(focusKnob - trueFocus);
      set.focusError = blur;
      c.fillStyle = '#000';
      c.fillRect(0, 0, 160, 90);
      c.filter = `blur(${blur * 3}px)`;
      const r2 = makeRng(5);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(230,220,200,${0.3 + r2() * 0.6})`;
        c.fillRect(r2() * 160, r2() * 90, 1.5, 1.5);
      }
      c.filter = 'none';
    };
    drawGrainFocus();
    panel.append(
      h('h2', null, 'Enlarger'),
      h('div', { class: 'grid2' }, h('span', { class: 'label' }, 'Negatives'), rollSel, h('span', { class: 'label' }, 'Frame'), frameSel),
      preview,
      h('div', { class: 'flex' }, h('div', null, h('div', { class: 'label' }, 'Grain focuser'), focusView), h('div', { style: 'flex:1' }, num('Focus knob', () => focusKnob, (v) => ((focusKnob = v), drawGrainFocus()), -1, 1, 0.02, (v) => v.toFixed(2)))),
      num('Lens', () => set.enlargerAperture, (v) => (set.enlargerAperture = v), 2.8, 16, 0.1, (v) => formatAperture(nearestStop(v))),
      num('Time', () => set.seconds, (v) => (set.seconds = v), 2, 60, 0.5, (v) => `${v.toFixed(1)} s`),
      num('Grade', () => set.grade, (v) => (set.grade = v), 0, 5, 0.5, (v) => v.toFixed(1)),
      num('Dodge centre', () => set.dodge ?? 0, (v) => (set.dodge = v), 0, 0.6, 0.05, (v) => `${Math.round(v * 100)}%`),
      num('Burn edges', () => set.burnEdges ?? 0, (v) => (set.burnEdges = v), 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
      h(
        'div',
        { class: 'flex', style: 'margin-top:8px' },
        btn('Focus (lamp on)', () => void proj()),
        btn('Test strip', () => void expose(true)),
        btn('Expose print', () => void expose(false)),
        btn('Back', home, 'red'),
      ),
      out,
    );
    // projection preview: the negative image (dim, reversed tones) under the enlarger lamp
    const proj = async () => {
      enlBeam.intensity = 8;
      setTimeout(() => (enlBeam.intensity = 0), 1500);
      const f = roll.frames[frameIdx];
      const u = f?.negKey ? await game.images.url(f.negKey) : null;
      if (u) img.src = u;
      img.style.filter = `blur(${Math.abs(focusKnob - trueFocus) * 2}px)`;
    };
    void proj();
    const expose = async (strip: boolean) => {
      const f = roll.frames[frameIdx];
      const dens = await game.images.get(`${f.key}-dens`);
      if (!dens) {
        game.hud.toast('This negative has no density scan.');
        return;
      }
      enlBeam.intensity = 10;
      game.audio.click(0.15, 1200);
      const secs = strip ? 0 : set.seconds;
      await new Promise((r) => setTimeout(r, Math.min(1500, secs * 60)));
      enlBeam.intensity = 0;
      glide.go(POSES.trays);
      // paper development in the tray: the image comes up live
      const w = roll.format === '120' ? 600 : 720;
      const hh = roll.format === '120' ? 600 : 480;
      const stripDef = strip ? { count: 5, start: set.seconds * 0.4, step: set.seconds * 0.3 } : undefined;
      let devT = 0;
      let pulled = false;
      let fixed = 0;
      let stopped = false;
      const trayImg = h('img', { style: 'width:100%;display:block;background:#f2efe6' });
      const tclock = h('div', { class: 'process-timer' }, '0:00');
      panel.innerHTML = '';
      panel.append(h('h2', null, strip ? 'Test strip' : 'Print'), h('div', { class: 'small' }, strip ? `Five strips: ${stripDef!.start.toFixed(1)} s + ${stripDef!.step.toFixed(1)} s each.` : `${set.seconds.toFixed(1)} s at ${formatAperture(nearestStop(set.enlargerAperture))}, grade ${set.grade}.`), h('div', { class: 'photo', style: 'width:100%;margin:8px 0' }, trayImg), tclock);
      const ctl = h('div', { class: 'flex' });
      panel.append(ctl, h('p', { class: 'small' }, 'Paper developer: rock the tray. RC paper wants 60–90 s; the image starts to appear after ~10 s.'));
      const render = async (dev: number) => {
        const res = await lab.print(game.engine, dens, w, hh, {
          seconds: set.seconds,
          apFactor: apertureFactor(nearestStop(set.enlargerAperture)),
          range: gradeRange(set.grade),
          dev,
          blur: set.focusError * 6,
          strip: stripDef,
          paperK: PAPER_K,
          dodge: set.dodge ?? 0,
          burn: set.burnEdges ?? 0,
          fixed: fixed > 30,
          seed: 1,
          color: false,
        });
        const u = URL.createObjectURL(res.img);
        trayImg.src = u;
        return res;
      };
      game.audio.pour(1);
      const timerId = window.setInterval(async () => {
        if (pulled) return;
        devT += 1;
        tclock.textContent = fmtTime(devT);
        if (devT % 3 === 0) await render(clamp((devT - 8) / 55, 0, 1));
        drawTimer(devT, 90);
      }, 250);
      const pull = btn('Pull → stop → fix', async () => {
        pulled = true;
        stopped = true;
        clearInterval(timerId);
        pull.remove();
        game.audio.pour(0.8);
        fixed = 0;
        ctl.innerHTML = '';
        ctl.append(h('span', { class: 'small' }, 'In the fixer…'));
        await new Promise((r) => setTimeout(r, 1200));
        fixed = 120;
        const res = await render(clamp((devT - 8) / 55, 0, 1));
        set.devSeconds = devT;
        set.fixSeconds = fixed;
        set.stop = stopped;
        const ev = evaluatePrint(res.densities, set);
        const key = newId('print');
        // store the final fixed print image
        const finalRes = await lab.print(game.engine, dens, w, hh, { seconds: set.seconds, apFactor: apertureFactor(nearestStop(set.enlargerAperture)), range: gradeRange(set.grade), dev: clamp((devT - 8) / 55, 0, 1), blur: set.focusError * 6, strip: stripDef, paperK: PAPER_K, dodge: set.dodge ?? 0, burn: set.burnEdges ?? 0, fixed: true, seed: 1, color: false });
        await game.images.put(key, finalRes.img);
        s.prints.push({ id: key, rollId: roll.id, frameIdx, key, score: strip ? 0 : ev.score, notes: strip ? ['Test strip'] : ev.notes, settings: { ...set }, day: s.day, testStrip: strip });
        game.save();
        game.progress();
        ctl.innerHTML = '';
        if (!strip) {
          panel.append(h('div', { class: `stamp ${ev.score >= 75 ? 'green' : ev.score >= 55 ? 'blue' : ''}` }, `Print ${ev.score}/100`));
          for (const n of ev.notes) panel.append(h('p', { class: 'small' }, `· ${n}`));
        } else panel.append(h('p', { class: 'small' }, 'Read the strips from left to right. Pick the one with the best midtones and real blacks, and set that time.'));
        panel.append(btn('Back to the enlarger', () => openEnlarger()));
      });
      ctl.append(pull);
      await render(0);
    };
  };

  const nearestStop = (v: number) => {
    const stops = [2.8, 4, 5.6, 8, 11, 16];
    return stops.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  };

  // ---------- per frame ----------
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, game.engine.getDeltaTime() / 1000);
    if (animInv > 0) {
      animInv = Math.max(0, animInv - dt * 2.5);
      tank.rotation.z = Math.sin((1 - animInv) * Math.PI) * Math.PI;
    } else tank.rotation.z = 0;
    if (run?.running && run.log && stepUi) {
      const step = stepUi.step;
      const gdt = dt * run.speed;
      run.elapsed += gdt;
      // temperature: bath drifts toward the room, tank follows the bath
      const room = 21;
      if (run.setup.process === 'c41' || run.setup.process === 'e6') run.bathTemp += (room - run.bathTemp) * gdt * 0.0006;
      run.tankTemp += (run.bathTemp - run.tankTemp) * Math.min(1, gdt * 0.05);
      const T = step.temp > 30 ? run.tankTemp : run.bathTemp;
      const l = run.log;
      const n = Math.max(1, run.elapsed);
      l.tempAvg = l.tempAvg + (T - l.tempAvg) * (gdt / n);
      l.tempMin = Math.min(l.tempMin, T);
      l.tempMax = Math.max(l.tempMax, T);
      // guided: auto agitation prompts slow the clock near the minute
      const minute = Math.floor(run.elapsed / 60);
      if (minute !== run.lastMinute) {
        run.lastMinute = minute;
        if (step.agitation === 'inversions') {
          game.audio.tick();
          if (s.assist === 'guided' && run.speed > 4 && minute > 0) run.speed = 4;
        }
      }
      tick += dt;
      if (tick > 0.2) {
        tick = 0;
        stepUi.timer.textContent = fmtTime(run.elapsed);
        stepUi.tempEl.textContent = `${T.toFixed(1)} °C`;
        const inv = l.inversionsPerMinute[minute] ?? 0;
        stepUi.agitEl.textContent = step.agitation === 'inversions' ? `This minute: ${inv} inversion${inv === 1 ? '' : 's'}${s.assist === 'guided' && inv < 4 && run.elapsed % 60 < 15 ? '  ← agitate now' : ''}` : step.agitation === 'stand' ? `Stand: leave it. (inversions so far: ${l.inversionsPerMinute.reduce((a, b) => a + (b ?? 0), 0)})` : '';
        drawTimer(run.elapsed, step.seconds);
        if (s.assist === 'guided' && step.timed && run.elapsed > step.seconds - 15 && run.elapsed < step.seconds - 14 && run.speed > 1) run.speed = 1;
      }
    }
  });

  const host: SceneHost = {
    scene,
    dispose: () => {
      document.body.classList.remove('darkroom-red', 'lights-out');
      lab.dispose();
      pipe.dispose();
      scene.dispose();
    },
    onKey: (e, down) => {
      if (!down) return;
      if (e.key === ' ' && run?.running) {
        e.preventDefault();
        invert();
      }
      if (e.key.toLowerCase() === 'l') {
        if (dangerLight) dangerLight();
        else setLights(lightMode === 'white' ? 'safe' : 'white');
      }
      if (e.key === 'Escape') {
        if (game.hud.closeTop()) return;
        if (run) {
          void game.hud.confirm('Abandon processing?', 'The film is in the chemistry. Leaving now ruins it.', 'Leave anyway', 'Stay').then((y) => {
            if (y && run) {
              run.roll.state = 'developed';
              run.roll.dev = { ...evaluateDevelopment(run.setup, run.steps, [], { lightFog: 1, kinks: 0, openedBackFrames: 0 }) };
              game.save();
              void game.goto('studio');
            }
          });
        } else void game.goto('studio');
      }
    },
  };
  game.audio.loop('darkroom', true);
  home();
  void FILMS;
  void Vector3;
  return host;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

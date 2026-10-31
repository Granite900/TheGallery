/**
 * Shooting locations. Walk in first person; raise the camera (RMB / F) for a
 * viewfinder that matches the camera type; set aperture / shutter / focus;
 * fire; wind on. Every shot renders a latent image through FilmLab.
 */
import { CascadedShadowGenerator, Color3, Color4, DirectionalLight, Effect, HemisphericLight, Matrix, MeshBuilder, PBRMaterial, PostProcess, Ray, RenderTargetTexture, Scene, UniversalCamera, Vector3, Constants, AbstractMesh, Camera, Viewport } from '@babylonjs/core';
import type { Game, SceneHost } from '../app/Game';
import { Mats } from '../render/materials';
import { makeEnvironment, skyPainter, skyFor, studioPainter } from '../render/env';
import { makePipeline, SHADOW_SIZE } from '../render/quality';
import { FilmLab } from '../render/filmLook';
import { newScene } from './common';
import { buildHarbour, buildPark, buildPortraitRoom, LocationBuild } from '../models/locations';
import { camera as camModel, film, frameSize, lens as lensModel, aperturesFor, formatSpeed, formatAperture, CameraModel, LensModel } from '../sim/data';
import { Lighting, LIGHTING_EV, LIGHTING_LABEL, actualShutter, autoExpose, depthOfField, blurCircleMm, ev, exposureError, meterNeedle, reciprocity, shakeRisk } from '../sim/exposure';
import { FrameMeta, rollById, unitById } from '../sim/state';
import { newId } from '../sim/units';
import { h, btn } from '../ui/dom';
import { clamp, makeRng } from '../sim/rng';

export interface ShotSettings {
  aperture: number;
  speed: number;
  focus: number;
  focal: number;
}

const ZONES = [{ d: 1, label: 'portrait 1 m' }, { d: 1.5, label: 'couple 1.5 m' }, { d: 3, label: 'group 3 m' }, { d: 1000, label: 'mountains ∞' }];

function sunDirFor(lighting: Lighting): Vector3 {
  const elev = { sun: 52, hazy: 45, overcast: 60, shade: 50, golden: 7, dusk: -3, window: 30, room: 30 }[lighting];
  const az = lighting === 'golden' || lighting === 'dusk' ? -150 : -120;
  const e = (elev * Math.PI) / 180;
  const a = (az * Math.PI) / 180;
  // vector pointing from scene toward the sun
  return new Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
}

export async function createShoot(game: Game, args: Record<string, unknown>): Promise<SceneHost> {
  const location = String(args.location ?? 'harbour');
  const lighting = (args.lighting as Lighting) ?? 'sun';
  const storyRollId = args.storyRollId as string | undefined;
  const s = game.state;
  const q = s.settings.quality;
  const scene = newScene(game.engine, new Color4(0.6, 0.7, 0.8, 1));
  scene.collisionsEnabled = false;
  const mats = new Mats(scene);
  const lab = new FilmLab(game.engine);
  const toSun = sunDirFor(lighting);
  const outdoor = location !== 'studio';
  const past = !!storyRollId;

  // ---------- light & sky ----------
  let env;
  if (outdoor) {
    env = await makeEnvironment(scene, skyPainter(skyFor(lighting, [toSun.x, toSun.y, toSun.z])));
    const sky = scene.createDefaultSkybox(env, true, 1500, 0, false);
    if (sky) {
      sky.isPickable = false;
      sky.metadata = { noSubject: true };
      sky.infiniteDistance = true;
    }
  } else {
    env = await makeEnvironment(scene, studioPainter([1, 0.2, 0], [0, 1, 0], lighting === 'room' ? 0.3 : 1));
  }
  scene.environmentTexture = env;
  scene.environmentIntensity = outdoor ? (lighting === 'dusk' ? 1.0 : 1.0) : lighting === 'room' ? 0.35 : 1.0;
  const sun = new DirectionalLight('sun', toSun.scale(-1), scene);
  const sunI: Record<string, number> = { sun: 5.5, hazy: 4.2, overcast: 0.5, shade: 5.5, golden: 3.6, dusk: 0.0, window: 4.0, room: 0.6 };
  sun.intensity = sunI[lighting];
  sun.diffuse = lighting === 'golden' ? new Color3(1, 0.68, 0.38) : lighting === 'room' ? new Color3(1, 0.75, 0.45) : new Color3(1, 0.97, 0.92);
  if (!outdoor) {
    sun.direction = new Vector3(-1, -0.45, 0.1).normalize();
    sun.position = new Vector3(8, 5, 0);
  }
  const hemi = new HemisphericLight('skyfill', new Vector3(0, 1, 0), scene);
  hemi.intensity = lighting === 'dusk' ? 0.05 : 0.08;
  let shadowGen: CascadedShadowGenerator | null = null;
  if (sun.intensity > 0.3) {
    shadowGen = new CascadedShadowGenerator(SHADOW_SIZE[q], sun);
    shadowGen.numCascades = q === 'ultra' ? 4 : 3;
    shadowGen.lambda = 0.85;
    shadowGen.shadowMaxZ = outdoor ? 120 : 15;
    shadowGen.stabilizeCascades = true;
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.filteringQuality = q === 'low' ? CascadedShadowGenerator.QUALITY_LOW : CascadedShadowGenerator.QUALITY_HIGH;
    shadowGen.bias = 0.003;
    shadowGen.normalBias = 0.02;
    shadowGen.autoCalcDepthBounds = false;
  }
  if (outdoor) {
    scene.fogMode = Scene.FOGMODE_EXP2;
    const fogCol = skyFor(lighting, [0, 1, 0]).horizon;
    const fs = lighting === 'dusk' ? 0.25 : 0.55;
    scene.fogColor = new Color3(fogCol[0] * fs, fogCol[1] * fs, fogCol[2] * fs);
    scene.fogDensity = lighting === 'overcast' || lighting === 'hazy' ? 0.006 : 0.0025;
  }

  // ---------- location ----------
  const locOpts = { lighting, past, sunDir: toSun };
  const loc: LocationBuild = location === 'park' ? buildPark(scene, mats, locOpts) : location === 'studio' ? buildPortraitRoom(scene, mats, locOpts) : buildHarbour(scene, mats, locOpts);
  if (shadowGen) for (const m of loc.root.getChildMeshes()) if (m.name !== 'water' && m.name !== 'grass' && m.name !== 'quay') shadowGen.addShadowCaster(m, false);
  const keyEV = LIGHTING_EV[lighting];

  // ---------- player camera ----------
  const cam = new UniversalCamera('eye', loc.spawn.clone(), scene);
  cam.rotation.y = loc.spawnYaw;
  cam.minZ = 0.03;
  cam.maxZ = outdoor ? 900 : 60;
  cam.fov = 1.05;
  cam.inputs.clear();
  scene.activeCamera = cam;
  const pipe = makePipeline(scene, [cam], q, { exposure: 1, contrast: 1.05, bloom: 0.15, bloomThreshold: 1.6, ssaoRadius: outdoor ? 1.2 : 0.4, ssaoStrength: 0.9, vignette: 0.25, grain: 4 });

  // ---------- calibration: render an 18% grey card in the key light ----------
  const calibration = await calibrate(scene, lab, loc, toSun, outdoor);
  pipe.main.imageProcessing.exposure = calibration * (lighting === 'dusk' ? 0.8 : 1.0);

  // ---------- gear ----------
  const unit = unitById(s, s.activeCameraId);
  const model: CameraModel | undefined = unit ? camModel(unit.modelId) : undefined;
  const lensUnit = unit?.lensId ? s.lenses.find((l) => l.id === unit.lensId) : undefined;
  const lens: LensModel | undefined = model ? (model.mount === 'fixed' ? lensModel(model.fixedLens!) : lensUnit ? lensModel(lensUnit.modelId) : undefined) : undefined;
  const roll = unit ? rollById(s, unit.rollId) : undefined;
  const fmt = model?.format ?? '135';
  const [frameW, frameH] = frameSize(fmt);
  const aspect = frameW / frameH;
  const apertures = lens ? aperturesFor(lens) : [8];
  const speeds = model ? [...model.speeds].sort((a, b) => b - a) : [1 / 125];
  const st: ShotSettings = {
    aperture: apertures[Math.min(apertures.length - 1, 3)],
    speed: speeds[Math.floor(speeds.length / 2)],
    focus: model?.kind === 'zone' ? 3 : 3,
    focal: lens?.focal ?? 50,
  };
  let zoneIdx = 2;
  let raised = false;
  let cocked = !!roll && roll.frames.length < roll.capacity;
  let tripod = false;
  let busy = false;
  let meterEV = keyEV;
  let filming = false;

  // ---------- viewfinder post effects ----------
  Effect.ShadersStore['vfFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float mode;      // 0 none, 1 rangefinder patch, 2 split prism, 3 ground glass (flip)
uniform float shift;     // in uv units
uniform vec2 patchSize;
uniform float aspect;
uniform float flip;
void main(){
  vec2 uv = vUV;
  if (flip > 0.5) uv.x = 1.0 - uv.x;
  vec3 c = texture2D(textureSampler, uv).rgb;
  vec2 d = (vUV - 0.5) * vec2(aspect, 1.0);
  if (mode > 0.5 && mode < 1.5) {
    if (abs(vUV.x - 0.5) < patchSize.x && abs(vUV.y - 0.5) < patchSize.y) {
      vec3 g = texture2D(textureSampler, uv + vec2(shift, 0.0)).rgb;
      c = mix(c, g * vec3(1.05, 0.95, 0.62), 0.5);
    }
  } else if (mode > 1.5 && mode < 2.5) {
    float r = length(d);
    if (r < 0.06) {
      float s = vUV.y > 0.5 ? shift : -shift;
      c = texture2D(textureSampler, uv + vec2(s, 0.0)).rgb;
      if (abs(vUV.y - 0.5) < 0.0015) c *= 0.3;
    } else if (r < 0.1) {
      // microprism collar: shimmer when out of focus
      float k = sin(vUV.x * 900.0) * sin(vUV.y * 900.0);
      c = texture2D(textureSampler, uv + vec2(k, -k) * abs(shift) * 0.4).rgb;
    }
  }
  if (mode > 2.5) {
    // ground glass texture + brighter centre
    float n = fract(sin(dot(floor(vUV * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
    c *= 0.92 + n * 0.08;
  }
  gl_FragColor = vec4(c, 1.0);
}`;
  const vfPP = new PostProcess('vf', 'vf', ['mode', 'shift', 'patchSize', 'aspect', 'flip'], null, 1, cam);
  let vfMode = 0;
  let vfShift = 0;
  vfPP.onApply = (e) => {
    e.setFloat('mode', raised ? vfMode : 0);
    e.setFloat('shift', vfShift);
    e.setFloat2('patchSize', 0.035, 0.03);
    e.setFloat('aspect', game.engine.getAspectRatio(cam));
    e.setFloat('flip', raised && model?.kind === 'tlr' ? 1 : 0);
  };

  // ---------- HUD ----------
  const layer = game.hud.sceneLayer;
  const vfCanvas = h('canvas', { class: 'passthrough', style: 'position:absolute;inset:0;width:100%;height:100%;display:none' });
  const info = h('div', { class: 'vf' }, h('div', { class: 'info' }));
  const plate = h('div', { class: 'topplate' });
  const card = h('div', { class: 'sheet card', style: 'position:absolute;top:70px;left:16px;width:300px;padding:12px 14px;display:none' });
  layer.append(vfCanvas, info, plate, card);
  const crosshair = h('div', { class: 'crosshair' });
  layer.append(crosshair);
  const infoRow = info.firstChild as HTMLElement;
  game.hud.setVisible({ clip: false });
  const setHints = () => {
    if (raised)
      game.hud.hints(
        model?.kind === 'super8'
          ? [['Hold LMB', 'film'], ['Wheel', 'zoom'], ['RMB/F', 'lower']]
          : [
              ['LMB', 'shutter'],
              ['R', 'wind on'],
              ['Wheel', model?.kind === 'zone' ? 'zone' : 'focus'],
              ...(model?.autoExposure ? [] : ([['Q/E', 'aperture'], ['Z/X', 'shutter']] as [string, string][])),
              ...(s.tools.includes('meter') ? ([['M', 'handheld meter']] as [string, string][]) : []),
              ...(s.tools.includes('tripod') ? ([['T', tripod ? 'fold tripod' : 'tripod']] as [string, string][]) : []),
              ['RMB/F', 'lower'],
            ],
      );
    else game.hud.hints([['WASD', 'walk'], ['Mouse', 'look'], ['RMB/F', 'raise camera'], ['Esc', 'go home']]);
  };
  setHints();
  game.hud.toast(`${loc === undefined ? '' : ''}${LIGHTING_LABEL[lighting]}. ${unit ? `${model!.maker} ${model!.name}` : 'No camera'}${roll ? `, ${film(roll.stockId).name} @ EI ${roll.ei}, ${roll.capacity - roll.frames.length} left` : ' (no film)'}`, '', 6000);

  // ---------- input ----------
  const keys = new Set<string>();
  const canvas = game.canvas;
  const lockPointer = () => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    const sens = 0.0022 * s.settings.mouseSens * (raised ? Math.min(1, cam.fov / 0.9) : 1);
    cam.rotation.y += e.movementX * sens;
    cam.rotation.x = clamp(cam.rotation.x + e.movementY * sens, -1.4, 1.4);
  };
  const onDown = (e: MouseEvent) => {
    if (game.hud.modalOpen) return;
    if (document.pointerLockElement !== canvas) {
      lockPointer();
      return;
    }
    if (e.button === 2) toggleRaise();
    else if (e.button === 0 && raised) {
      if (model?.kind === 'super8') startFilming();
      else void fire();
    }
  };
  const onUp = (e: MouseEvent) => {
    if (e.button === 0 && filming) filming = false;
  };
  const onWheel = (e: WheelEvent) => {
    if (!raised || !model) return;
    const dir = Math.sign(e.deltaY);
    if (model.kind === 'zone') {
      zoneIdx = clamp(zoneIdx - dir, 0, ZONES.length - 1);
      st.focus = ZONES[zoneIdx].d;
    } else if (model.kind === 'super8' && lens?.focalMax) {
      st.focal = clamp(st.focal * Math.pow(1.08, -dir), lens.focal, lens.focalMax);
    } else if (lens) {
      // focus in dioptres for even feel
      const dpt = clamp(1 / st.focus - dir * 0.04, 0, 1 / lens.minFocus);
      st.focus = dpt <= 0.0005 ? 1000 : 1 / dpt;
    }
    game.audio.tick();
  };
  const ctxMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', ctxMenu);

  const toggleRaise = () => {
    if (!unit) {
      game.hud.toast('You came out without a camera.');
      return;
    }
    raised = !raised;
    vfCanvas.style.display = raised ? '' : 'none';
    crosshair.style.display = raised ? 'none' : '';
    game.audio.click(0.08, 1500);
    setHints();
  };

  // ---------- meter ----------
  let meterBusy = false;
  let meterT = 0;
  const updateMeter = async () => {
    if (meterBusy || !raised) return;
    meterBusy = true;
    try {
      const L = await lab.meter(scene, cam, calibration, model?.kind === 'slr' && model.id === 'spotf' ? false : false);
      meterEV = keyEV + Math.log2(Math.max(1e-4, L) / 0.18);
    } catch {
      /* ignore */
    }
    meterBusy = false;
  };

  const actualFocusForPatch = () => {
    // what distance is under the centre of the frame
    const ray = cam.getForwardRay(500);
    const hit = scene.pickWithRay(ray, (m) => m.isPickable && m.isVisible && !(m.metadata as { noSubject?: boolean } | undefined)?.noSubject);
    return hit?.hit ? hit.distance : 500;
  };

  const autoSettings = () => {
    if (!model || !roll) return null;
    const offset = unit!.traits.meterDead ? 4 : unit!.traits.meterOffset;
    return autoExpose(meterEV, roll.ei, model.speeds, apertures, offset, model.id === 'trip35');
  };

  // ---------- firing ----------
  const fire = async (story?: { error: number; subject: string }) => {
    if (!unit || !model || busy) return;
    const r = rollById(s, unit.rollId);
    if (!r) {
      game.hud.toast('No film in the camera. The shutter fires on nothing.');
      game.audio.shutter(model.shutter === 'leaf' ? 'leaf' : model.kind === 'slr' ? 'slr' : 'focalplane', st.speed);
      return;
    }
    if (r.frames.length >= r.capacity) {
      game.hud.toast('End of the roll. The advance will not go any further. Rewind at home.');
      return;
    }
    if (!cocked && !story) {
      game.hud.toast(model.kind === 'zone' ? 'Wind the thumbwheel first (R).' : 'The shutter is not cocked. Wind on (R).');
      game.audio.click(0.1, 900);
      return;
    }
    let N = st.aperture;
    let marked = st.speed;
    let usedMeter = false;
    if (model.autoExposure) {
      const a = autoSettings()!;
      if (a.redFlag && !story) {
        game.hud.toast('Red flag in the viewfinder: too dark. The Trip will not fire.', 'bad');
        return;
      }
      N = a.aperture;
      marked = a.time;
      usedMeter = true;
    }
    busy = true;
    const t = unit.traits;
    const act = reciprocity(actualShutter(marked, t.shutterSlow, t.shutterFast));
    const errEI = story ? story.error : exposureError(keyEV, r.ei, N, act);
    const stock = film(r.stockId);
    const pushStops = Math.log2(r.ei / stock.iso);
    const latentStops = errEI - pushStops;
    // shake
    const focal35 = (st.focal * 43.3) / Math.hypot(frameW, frameH);
    const risk = shakeRisk(act, focal35, tripod || !!story);
    const rng = makeRng(Date.now() & 0xffff);
    const shakePath: [number, number][] = [];
    if (risk > -0.5) {
      const amp = Math.min(0.012, 0.00045 * Math.pow(2, risk + 0.5));
      let x = 0;
      let y = 0;
      for (let i = 0; i < 8; i++) {
        x += (rng() - 0.5) * amp;
        y += (rng() - 0.5) * amp;
        shakePath.push([x, y]);
      }
    }
    const haze = clamp(Math.max(t.haze, lensUnit?.haze ?? 0) + Math.max(t.fungus, lensUnit?.fungus ?? 0) * 0.6, 0, 1);
    const fastest = Math.min(...model.speeds);
    const capping = marked <= fastest * 2.01 ? t.capping * (marked <= fastest * 1.01 ? 1 : 0.5) : 0;
    const leak = t.seals < 0.45 ? (0.45 - t.seals) * 2.4 * (0.6 + rng() * 0.8) : 0;
    const openness = lens ? clamp(1 - Math.log2(N / lens.maxAperture) / 2, 0, 1) : 0;
    const res = fmt === '120' ? [900, 900] : fmt === 'super8' ? [360, 250] : [1080, 720];
    // lens focus actually used for the exposure (oily blades: stays wide open)
    const effN = lensUnit?.oilyBlades && rng() < 0.6 ? lens!.maxAperture : N;
    const prevFov = cam.fov;
    cam.fov = 2 * Math.atan(frameH / 2 / st.focal);
    const meta = analyse(scene, cam, aspect, st.focal, effN, st.focus, frameW, location, lighting, keyEV, marked, act, errEI, risk, usedMeter, lens?.id ?? '', unit.id, s.day);
    if (story) meta.story = 1;
    try {
      const blob = await lab.capture(scene, cam, {
        width: res[0],
        height: res[1],
        focalMm: st.focal,
        fStop: effN,
        focusDist: model.kind === 'zone' ? st.focus : st.focus,
        frameWidthMm: frameW,
        swirl: lens?.character.swirl ?? 0,
        catsEye: lens?.character.catsEye ?? 0.2,
        vignette: lens?.character.vignette ?? 0.3,
        softWideOpen: lens?.character.softWideOpen ?? 0.2,
        haze,
        openness,
        calibration,
        exposureStops: latentStops,
        capping,
        cappingDir: model.kind === 'slr' || model.id === 'leicam3' ? 1 : 1,
        leak,
        leakPos: [rng() < 0.5 ? 0.06 + rng() * 0.15 : 0.8 + rng() * 0.15, 0.2 + rng() * 0.6],
        colorFilm: stock.color,
        sceneBright: clamp((keyEV - 7) / 8, 0.15, 1),
        seed: rng() * 100,
        shakePath: tripod || story ? [] : shakePath,
      });
      const key = newId('latent');
      await game.images.put(key, blob);
      r.frames.push({ idx: r.frames.length, key, meta });
      cocked = false;
      game.audio.shutter(model.kind === 'slr' ? 'slr' : model.shutter === 'leaf' ? 'leaf' : 'focalplane', act, t.squeal);
      if (!story) {
        flash();
        if (r.frames.length >= r.capacity) game.hud.toast('That was the last frame. Rewind and develop it at home.', 'good');
        if (risk > 0.4 && !tripod && s.assist === 'guided') game.hud.toast(`${formatSpeed(marked)} handheld at ${Math.round(st.focal)}mm: that may show camera shake.`);
      }
      game.save();
      game.progress();
    } catch (e) {
      console.error(e);
      game.hud.toast('Something jammed. Try again.', 'bad');
    } finally {
      cam.fov = prevFov;
      busy = false;
    }
  };

  const flash = () => {
    const f = h('div', { class: 'passthrough', style: 'position:absolute;inset:0;background:#000;opacity:.85;transition:opacity .25s' });
    layer.append(f);
    requestAnimationFrame(() => (f.style.opacity = '0'));
    setTimeout(() => f.remove(), 300);
  };

  const advance = () => {
    if (!unit || !model || !raised) return;
    const r = rollById(s, unit.rollId);
    if (cocked) return;
    if (r && r.frames.length >= r.capacity) {
      game.hud.toast('The roll is finished.');
      return;
    }
    cocked = true;
    game.audio.advance(model.kind === 'tlr' ? 'crank' : model.id === 'trip35' ? 'wheel' : 'lever');
  };

  // ---------- Super 8 filming ----------
  const startFilming = async () => {
    if (!unit || !model) return;
    const r = rollById(s, unit.rollId);
    if (!r) {
      game.hud.toast('No cartridge loaded.');
      return;
    }
    if (r.frames.length >= r.capacity) {
      game.hud.toast('The cartridge is finished (the counter reads END).');
      return;
    }
    filming = true;
    game.audio.loop('motor', true);
    const a = autoSettings()!;
    const keys: string[] = [];
    const base = newId('s8');
    const t0 = performance.now();
    const fps = model.fps ?? 18;
    const max = fps * 6;
    const meta = analyse(scene, cam, aspect, st.focal, a.aperture, 3, frameW, location, lighting, keyEV, 1 / 43, 1 / 43, exposureError(meterEV, r.ei, a.aperture, 1 / 43) + (keyEV - meterEV), -2, true, lens?.id ?? '', unit.id, s.day);
    const prevFov = cam.fov;
    while (filming && keys.length < max) {
      const target = t0 + (keys.length * 1000) / fps;
      const wait = target - performance.now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      cam.fov = 2 * Math.atan(frameH / 2 / st.focal);
      const auto = autoSettings()!;
      const err = exposureError(keyEV, r.ei, auto.aperture, 1 / 43);
      const blob = await lab.capture(scene, cam, {
        width: 320,
        height: 222,
        focalMm: st.focal,
        fStop: auto.aperture,
        focusDist: 3,
        frameWidthMm: frameW,
        swirl: 0,
        catsEye: 0.1,
        vignette: 0.35,
        softWideOpen: 0.2,
        haze: unit.traits.haze,
        openness: 0.3,
        calibration,
        exposureStops: err,
        capping: 0,
        cappingDir: 1,
        leak: 0,
        leakPos: [0, 0],
        colorFilm: false,
        sceneBright: 0.5,
        seed: keys.length,
        shakePath: [],
      });
      cam.fov = prevFov;
      const k = `${base}-${keys.length}`;
      await game.images.put(k, blob);
      keys.push(k);
    }
    filming = false;
    game.audio.loop('motor', false);
    if (keys.length < fps) {
      game.hud.toast('Too short. Hold the trigger for a few seconds.');
      return;
    }
    meta.frameCount = keys.length;
    r.frames.push({ idx: r.frames.length, key: base, meta });
    game.hud.toast(`Shot ${r.frames.length}/${r.capacity}: ${(keys.length / fps).toFixed(1)} s`, 'good');
    game.save();
    game.progress();
  };

  // ---------- per-frame ----------
  let time = 0;
  const vctx = vfCanvas.getContext('2d')!;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, game.engine.getDeltaTime() / 1000);
    time += dt;
    loc.tick(time, dt);
    // walking
    if (!raised || !tripod) {
      const speed = (keys.has('shift') ? 3.6 : 1.7) * dt * (raised ? 0.5 : 1);
      const fwd = new Vector3(Math.sin(cam.rotation.y), 0, Math.cos(cam.rotation.y));
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const mv = new Vector3();
      if (keys.has('w')) mv.addInPlace(fwd);
      if (keys.has('s')) mv.subtractInPlace(fwd);
      if (keys.has('d')) mv.addInPlace(right);
      if (keys.has('a')) mv.subtractInPlace(right);
      if (mv.lengthSquared() > 0) {
        mv.normalize().scaleInPlace(speed);
        const nx = cam.position.x + mv.x;
        const nz = cam.position.z + mv.z;
        const b = loc.bounds;
        let px = clamp(nx, b.min[0], b.max[0]);
        let pz = clamp(nz, b.min[1], b.max[1]);
        for (const c of loc.colliders) {
          if (px > c.min[0] - 0.3 && px < c.max[0] + 0.3 && pz > c.min[1] - 0.3 && pz < c.max[1] + 0.3) {
            // push out along the smaller overlap
            const dxs = [c.min[0] - 0.3 - px, c.max[0] + 0.3 - px];
            const dzs = [c.min[1] - 0.3 - pz, c.max[1] + 0.3 - pz];
            const dx = Math.abs(dxs[0]) < Math.abs(dxs[1]) ? dxs[0] : dxs[1];
            const dz = Math.abs(dzs[0]) < Math.abs(dzs[1]) ? dzs[0] : dzs[1];
            if (Math.abs(dx) < Math.abs(dz)) px += dx;
            else pz += dz;
          }
        }
        cam.position.x = px;
        cam.position.z = pz;
        cam.position.y = loc.spawn.y + Math.sin(time * 9) * 0.012;
      }
    }
    // viewfinder geometry
    if (raised && model) {
      const photoFov = 2 * Math.atan(frameH / 2 / st.focal);
      const viewScale = model.kind === 'rangefinder' ? 1.22 : model.kind === 'zone' ? 1.15 : 1.0;
      cam.fov = Math.min(2.4, 2 * Math.atan(Math.tan(photoFov / 2) * viewScale));
      const subjDist = actualFocusForPatch();
      if (model.focus === 'rangefinder') {
        vfMode = 1;
        const base = model.rfBase ?? 0.04;
        const err = 1 / Math.max(st.focus, 0.3) + unit!.traits.rfError - 1 / Math.max(subjDist, 0.3);
        // angle → screen uv shift
        vfShift = (Math.atan(base * err) / (2 * Math.tan(cam.fov / 2))) / game.engine.getAspectRatio(cam);
      } else if (model.focus === 'splitprism') {
        vfMode = 2;
        vfShift = clamp((1 / Math.max(st.focus, 0.3) - 1 / Math.max(subjDist, 0.3)) * 0.01 * (st.focal / 50), -0.05, 0.05);
      } else if (model.kind === 'tlr' || model.kind === 'super8') vfMode = 3;
      else vfMode = 0;
      // live DOF for reflex viewing (wide open)
      const reflex = model.kind === 'slr' || model.kind === 'tlr' || model.kind === 'super8';
      pipe.main.depthOfFieldEnabled = reflex && q !== 'low';
      if (pipe.main.depthOfFieldEnabled && lens) {
        pipe.main.depthOfField.focalLength = st.focal;
        pipe.main.depthOfField.fStop = lens.maxAperture;
        pipe.main.depthOfField.focusDistance = Math.min(st.focus, 500) * 1000;
      }
      meterT += dt;
      if (meterT > 0.35) {
        meterT = 0;
        void updateMeter();
      }
      drawViewfinder();
    } else {
      cam.fov += (1.05 - cam.fov) * 0.2;
      pipe.main.depthOfFieldEnabled = false;
    }
    updatePlate();
  });

  const drawViewfinder = () => {
    const W = (vfCanvas.width = window.innerWidth);
    const H = (vfCanvas.height = window.innerHeight);
    const c = vctx;
    c.clearRect(0, 0, W, H);
    if (!model) return;
    const photoFov = 2 * Math.atan(frameH / 2 / st.focal);
    const frac = Math.tan(photoFov / 2) / Math.tan(cam.fov / 2);
    const fh = H * frac;
    const fw = fh * aspect;
    const x0 = (W - fw) / 2;
    const y0 = (H - fh) / 2;
    c.fillStyle = 'rgba(0,0,0,0.92)';
    const reflex = model.kind === 'slr' || model.kind === 'tlr' || model.kind === 'super8';
    if (reflex) {
      c.fillRect(0, 0, W, y0);
      c.fillRect(0, y0 + fh, W, H - y0 - fh);
      c.fillRect(0, y0, x0, fh);
      c.fillRect(x0 + fw, y0, W - x0 - fw, fh);
      if (model.kind === 'tlr') {
        c.strokeStyle = 'rgba(0,0,0,.35)';
        c.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          c.beginPath();
          c.moveTo(x0 + (fw * i) / 3, y0);
          c.lineTo(x0 + (fw * i) / 3, y0 + fh);
          c.moveTo(x0, y0 + (fh * i) / 3);
          c.lineTo(x0 + fw, y0 + (fh * i) / 3);
          c.stroke();
        }
      }
    } else {
      // rangefinder / compact: dark surround with a bright frame-line
      const m = 0.04 * H;
      c.fillRect(0, 0, W, m);
      c.fillRect(0, H - m, W, m);
      c.fillRect(0, 0, (W - (H - 2 * m) * 1.5) / 2, H);
      c.fillRect(W - (W - (H - 2 * m) * 1.5) / 2, 0, (W - (H - 2 * m) * 1.5) / 2, H);
      c.strokeStyle = 'rgba(255,248,225,0.85)';
      c.lineWidth = 2;
      c.strokeRect(x0, y0, fw, fh);
      if (model.focus === 'rangefinder') {
        c.strokeStyle = 'rgba(255,230,140,0.55)';
        c.strokeRect(W / 2 - 0.035 * W, H / 2 - 0.03 * H, 0.07 * W, 0.06 * H);
      }
    }
    // red flag (Trip)
    const auto = model.autoExposure ? autoSettings() : null;
    if (auto?.redFlag) {
      c.fillStyle = '#d0321e';
      c.fillRect(x0 + fw - 30, y0 + fh / 2 - 20, 16, 40);
    }
    // match-needle meter at the right edge
    if (roll && !model.autoExposure && model.meter !== 'none' && model.meter !== 'selenium') {
      const t = unit!.traits;
      const needle = t.meterDead ? -2.5 : meterNeedle(meterEV, roll.ei, st.aperture, st.speed, t.meterOffset);
      const nx = x0 + fw + 22;
      c.fillStyle = 'rgba(0,0,0,.6)';
      c.fillRect(nx - 6, H / 2 - 90, 20, 180);
      c.strokeStyle = '#e8e1cf';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(nx - 2, H / 2);
      c.lineTo(nx + 10, H / 2);
      c.stroke();
      c.fillStyle = '#e8e1cf';
      c.font = '600 12px Jost';
      c.fillText('+', nx, H / 2 - 74);
      c.fillText('−', nx + 1, H / 2 + 82);
      c.fillStyle = '#f2c94c';
      c.fillRect(nx - 4, H / 2 - needle * 32 - 1.5, 16, 3);
    } else if (roll && model.meter === 'selenium' && !model.autoExposure) {
      c.fillStyle = '#e8e1cf';
      c.font = '500 13px Jost';
      c.fillText(`meter: f/${apertures[0]}…`, x0 + fw + 12, H / 2);
    }
  };

  const updatePlate = () => {
    if (!model) {
      plate.innerHTML = '';
      return;
    }
    const r = rollById(s, unit!.rollId);
    const auto = model.autoExposure ? autoSettings() : null;
    const dial = (v: string, k: string, warn = false) => `<div class="dial"><div class="v" style="${warn ? 'color:#e2552f' : ''}">${v}</div><div class="k">${k}</div></div>`;
    let html = '';
    if (model.kind === 'super8') {
      html += dial(`${Math.round(st.focal)}mm`, 'zoom');
      html += dial(auto ? formatAperture(Math.round(auto.aperture * 10) / 10) : '—', 'auto f');
      html += dial(r ? `${r.frames.length}/${r.capacity}` : 'EMPTY', 'shots');
      html += dial(filming ? '● REC' : 'stby', 'motor', filming);
    } else {
      if (model.kind === 'zone') html += dial(ZONES[zoneIdx].label, 'zone');
      else html += dial(st.focus >= 999 ? '∞' : `${st.focus.toFixed(st.focus < 3 ? 2 : 1)} m`, 'focus');
      html += dial(auto ? formatAperture(Math.round(auto.aperture * 10) / 10) : formatAperture(st.aperture), model.autoExposure ? 'auto' : 'aperture');
      html += dial(formatSpeed(auto ? auto.time : st.speed), 'shutter');
      if (lens && model.mount !== 'fixed') html += dial(`${lens.focal}mm`, 'lens');
      html += dial(r ? `${r.frames.length}/${r.capacity}` : 'S', r ? `${film(r.stockId).name.split(' ')[0]} ${r.ei}` : 'no film', !r);
      html += dial(cocked ? 'ready' : 'wind', 'advance', !cocked);
      if (tripod) html += dial('on', 'tripod');
    }
    if (plate.innerHTML !== html) plate.innerHTML = html;
    plate.style.display = raised ? '' : 'none';
    const dof = lens && raised && model.kind !== 'super8' ? depthOfField(st.focal, st.aperture, Math.min(st.focus, 1e4), 0.03 * (frameW / 36)) : null;
    infoRow.innerHTML = raised && dof && s.assist === 'guided' ? `<span>DOF ${dof.near.toFixed(1)} m – ${dof.far === Infinity ? '∞' : dof.far.toFixed(1) + ' m'}</span>` : '';
  };

  const handMeter = () => {
    if (!s.tools.includes('meter') || !roll) return;
    // incident reading: the true key EV
    const iso = roll.ei;
    const lines = apertures.filter((a) => a >= 2).slice(0, 6).map((a) => {
      const t = (a * a) / Math.pow(2, keyEV + Math.log2(iso / 100));
      return `f/${a}  →  ${formatSpeed(t >= 1 ? Math.round(t) : 1 / Math.max(1, Math.round(1 / t)))}`;
    });
    card.innerHTML = '';
    card.append(h('div', { class: 'label' }, 'Sekonic L-398 · incident'), h('div', { style: 'font-family:var(--font-label);font-size:22px;margin:4px 0' }, `EV ${keyEV.toFixed(1)} @ ISO ${iso}`), ...lines.map((l) => h('div', { class: 'small' }, l)), h('div', { class: 'small', style: 'margin-top:6px' }, 'Incident readings ignore bright skies and dark coats. They measure the light, not the subject.'));
    card.style.display = card.style.display === 'none' ? '' : 'none';
    game.audio.click(0.1, 2000);
  };

  const host: SceneHost = {
    scene,
    dispose: () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', ctxMenu);
      if (document.pointerLockElement) document.exitPointerLock();
      game.hud.setVisible({ clip: true });
      lab.dispose();
      pipe.dispose();
      scene.dispose();
    },
    onKey: (e, down) => {
      const k = e.key.toLowerCase();
      if (down) keys.add(k);
      else keys.delete(k);
      if (!down) return;
      if (k === 'escape') {
        if (game.hud.closeTop()) return;
        void game.hud.confirm('Head home?', 'Go back to the studio. The film stays in the camera.', 'Go home', 'Stay').then((yes) => {
          if (yes) void game.goto('studio');
        });
        return;
      }
      if (k === 'f') toggleRaise();
      if (!raised || !model) return;
      if (k === 'r') advance();
      if (k === 'm') handMeter();
      if (k === 't' && s.tools.includes('tripod')) {
        tripod = !tripod;
        game.hud.toast(tripod ? 'Tripod set up: no shake, but you cannot walk.' : 'Tripod folded.');
        setHints();
      }
      if (!model.autoExposure) {
        const ai = apertures.indexOf(st.aperture);
        const si = speeds.indexOf(st.speed);
        if (k === 'q') st.aperture = apertures[clamp(ai - 1, 0, apertures.length - 1)];
        if (k === 'e') st.aperture = apertures[clamp(ai + 1, 0, apertures.length - 1)];
        if (k === 'z') st.speed = speeds[clamp(si - 1, 0, speeds.length - 1)];
        if (k === 'x') st.speed = speeds[clamp(si + 1, 0, speeds.length - 1)];
        if ('qezx'.includes(k)) game.audio.tick();
      }
    },
  };

  game.audio.loop(location === 'park' ? 'park' : location === 'studio' ? 'room' : 'harbour', true);

  // ---------- staged found-film frames ----------
  if (storyRollId) {
    const r = rollById(s, storyRollId);
    if (r && unit) {
      const n = r.capacity;
      for (let i = r.frames.length; i < n; i++) {
        const pose = loc.storyPoses[i % loc.storyPoses.length];
        cam.position.copyFrom(pose.pos);
        cam.setTarget(pose.target);
        cam.computeWorldMatrix();
        st.focus = Vector3.Distance(pose.pos, pose.target) * 0.9;
        st.aperture = 8;
        cocked = true;
        await fire({ error: (makeRng(i * 7 + 1)() - 0.5) * 2, subject: pose.subject });
      }
    }
  }
  void Matrix;
  void Ray;
  void RenderTargetTexture;
  void Constants;
  void MeshBuilder;
  void PBRMaterial;
  void Viewport;
  void ev;
  void blurCircleMm;
  void btn;
  return host;
}

/** Subject analysis for grading: which tagged subject dominates the frame, coverage, focus */
function analyse(
  scene: Scene,
  cam: Camera,
  aspect: number,
  focal: number,
  N: number,
  focusDist: number,
  frameW: number,
  location: string,
  lighting: Lighting,
  keyEV: number,
  marked: number,
  actual: number,
  error: number,
  risk: number,
  usedMeter: boolean,
  lensId: string,
  unitId: string,
  day: number,
): FrameMeta {
  cam.computeWorldMatrix();
  const view = cam.getViewMatrix(true);
  const proj = Matrix.PerspectiveFovLH(cam.fov, aspect, cam.minZ, cam.maxZ);
  const vp = view.multiply(proj);
  const groups = new Map<string, AbstractMesh[]>();
  const camPos = cam.globalPosition;
  for (const m of scene.meshes) {
    const subj = (m.metadata as { subject?: string } | null)?.subject;
    if (!subj || !m.isEnabled()) continue;
    if (!m.isVisible && !(m as unknown as { sourceMesh?: unknown }).sourceMesh) continue;
    if (subj === 'tulip' && Vector3.Distance(m.getAbsolutePosition(), camPos) > 4) continue;
    const arr = groups.get(subj) ?? [];
    arr.push(m);
    groups.set(subj, arr);
  }
  let best: { subject: string; coverage: number; dist: number } | null = null;
  for (const [subj, meshes] of groups) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let n = 0;
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      for (const p of bb.vectorsWorld) {
        const v = Vector3.TransformCoordinates(p, view);
        if (v.z <= cam.minZ) continue;
        const c = Vector3.TransformCoordinates(p, vp);
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
        any = true;
      }
      const c = bb.centerWorld;
      cx += c.x;
      cy += c.y;
      cz += c.z;
      n++;
    }
    if (!any || n === 0) continue;
    const x0 = Math.max(-1, minX);
    const x1 = Math.min(1, maxX);
    const y0 = Math.max(-1, minY);
    const y1 = Math.min(1, maxY);
    if (x1 <= x0 || y1 <= y0) continue;
    const coverage = ((x1 - x0) * (y1 - y0)) / 4;
    // visibility: ray to the visible part's centre
    const centre = new Vector3(cx / n, cy / n, cz / n);
    const dir = centre.subtract(camPos);
    const dist = dir.length();
    const hit = scene.pickWithRay(new Ray(camPos, dir.normalize(), dist + 1), (m) => m.isPickable && m.isVisible && !(m.metadata as { noSubject?: boolean } | null)?.noSubject);
    const hs = (hit?.pickedMesh?.metadata as { subject?: string } | null)?.subject;
    const visible = !hit?.hit || hs === subj || (hit.distance ?? 0) > dist - 1.5;
    if (!visible) continue;
    if (!best || coverage > best.coverage) best = { subject: subj, coverage, dist };
  }
  const subjectDist = best?.dist ?? Math.min(focusDist, 50);
  const coc = 0.03 * (frameW / 36);
  const dof = depthOfField(focal, N, Math.min(focusDist, 1e4), coc);
  const inFocus = subjectDist >= dof.near * 0.97 && subjectDist <= dof.far * 1.03;
  const bg = blurCircleMm(focal, N, Math.min(focusDist, 1e4), Math.max(subjectDist * 4, subjectDist + 5)) / frameW;
  return {
    location,
    lighting,
    sceneEV: keyEV,
    marked,
    actual,
    aperture: N,
    focal,
    focusDist,
    subjectDist,
    subject: best?.subject,
    coverage: best?.coverage ?? 0,
    inFocus,
    backgroundBlur: bg,
    error,
    shake: clamp(risk / 2.5, 0, 1),
    usedMeter,
    independent: !usedMeter,
    lensId,
    unitId,
    day,
  };
}

/** Render an 18% grey card in the key light to find the render→scene scale. */
async function calibrate(scene: Scene, lab: FilmLab, loc: LocationBuild, toSun: Vector3, outdoor: boolean): Promise<number> {
  const card = MeshBuilder.CreatePlane('greyCard', { size: 0.4 }, scene);
  const m = new PBRMaterial('grey18', scene);
  m.albedoColor = new Color3(0.18, 0.18, 0.18);
  m.metallic = 0;
  m.roughness = 1;
  card.material = m;
  const n = outdoor ? new Vector3(0, 1, 0).add(toSun.y > 0 ? toSun.scale(0.8) : Vector3.Zero()).normalize() : new Vector3(1, 0.35, 0).normalize();
  const pos = loc.grayCardPos.clone();
  card.position.copyFrom(pos);
  // plane faces -Z by default: orient its front toward n
  card.lookAt(pos.subtract(n));
  const c = new UniversalCamera('calib', pos.add(n.scale(0.35)), scene);
  c.setTarget(pos);
  c.fov = 0.3;
  c.minZ = 0.01;
  const others = scene.meshes.filter((x) => x !== card);
  const vis = others.map((x) => x.isVisible);
  // the card alone in the frame, lit by the scene's lights and environment
  others.forEach((x) => (x.isVisible = false));
  await scene.whenReadyAsync();
  let L = 0;
  try {
    L = await lab.meter(scene, c, 1, true);
  } catch {
    L = 0.18;
  }
  others.forEach((x, i) => (x.isVisible = vis[i]));
  card.dispose();
  m.dispose();
  c.dispose();
  return L > 1e-5 ? 0.18 / L : 1;
}

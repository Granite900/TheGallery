/**
 * Desktop half of the phone companion: keeps the phone's view of the
 * collection up to date and turns incoming rolls of real photographs into
 * latent images waiting in the darkroom.
 */
import type { Game } from './Game';
import { FilmLab } from '../render/filmLook';
import { buildCollection, PhoneRoll } from '../sim/phoneLink';
import { camera, film, lens as lensModel } from '../sim/data';
import { FrameMeta, Roll, addLetter, unitById } from '../sim/state';
import { Lighting, LIGHTING_EV } from '../sim/exposure';
import { clamp, makeRng, hashString } from '../sim/rng';

export interface LinkInfo {
  token: string;
  port: number;
  url: string;
  addresses: string[];
}

interface Bridge {
  info(): Promise<LinkInfo>;
  setCollection(json: unknown): void;
  onRoll(cb: (roll: PhoneRoll) => void): void;
  rollDone(id: string, ok: boolean, message: string): void;
  onSeen(cb: (info: { at: number; ip: string }) => void): void;
}

export function bridge(): Bridge | null {
  return ((window as unknown as { latentLink?: Bridge }).latentLink ?? null) as Bridge | null;
}

export let lastSeen: { at: number; ip: string } | null = null;

export function initPhoneLink(game: Game): void {
  const b = bridge();
  if (!b) return;
  const push = () => {
    try {
      b.setCollection(buildCollection(game.state));
    } catch (e) {
      console.warn('collection push failed', e);
    }
  };
  push();
  const origSave = game.save.bind(game);
  game.save = () => {
    origSave();
    push();
  };
  b.onSeen((info) => (lastSeen = info));
  b.onRoll((roll) => {
    void importRoll(game, roll)
      .then((msg) => b.rollDone(roll.id, true, msg))
      .catch((e: unknown) => {
        console.error(e);
        b.rollDone(roll.id, false, e instanceof Error ? e.message : String(e));
      });
  });
}

function nearestLighting(ev: number): Lighting {
  let best: Lighting = 'sun';
  let bd = Infinity;
  for (const [k, v] of Object.entries(LIGHTING_EV) as [Lighting, number][]) {
    if (k === 'shade' || k === 'golden') continue;
    const d = Math.abs(v - ev);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

function b64ToBlob(b64: string, type = 'image/jpeg'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function importRoll(game: Game, pr: PhoneRoll): Promise<string> {
  const s = game.state;
  if (s.rolls.some((r) => r.id === pr.id)) return 'Already in the darkroom.';
  const unit = unitById(s, pr.unitId);
  if (!unit) throw new Error('That camera is no longer in your collection.');
  if (!pr.shots.length) throw new Error('The roll is empty.');
  const m = camera(unit.modelId);
  const stock = film(pr.stockId);
  // the film came out of the fridge
  if (pr.expiredYears > 0) {
    const e = s.expiredFilm.find((x) => x.stockId === pr.stockId && x.expiredYears === pr.expiredYears);
    if (e && e.count > 0) e.count--;
  } else if ((s.fridge[pr.stockId] ?? 0) > 0) s.fridge[pr.stockId]--;
  const lensId = m.mount === 'fixed' ? m.fixedLens! : s.lenses.find((l) => l.id === unit.lensId)?.modelId;
  const lens = lensId ? lensModel(lensId) : undefined;
  const lensUnit = s.lenses.find((l) => l.id === unit.lensId);
  const t = unit.traits;
  const lab = new FilmLab(game.engine);
  const roll: Roll = {
    id: pr.id,
    stockId: pr.stockId,
    format: m.format,
    ei: pr.ei,
    capacity: pr.capacity,
    frames: [],
    state: 'exposed',
    unitId: unit.id,
    expiredYears: pr.expiredYears,
    rewound: true,
    phone: true,
  };
  const push = Math.log2(pr.ei / stock.iso);
  const fastest = Math.min(...m.speeds);
  try {
    for (const shot of pr.shots) {
      const rng = makeRng(hashString(`${pr.id}-${shot.idx}`));
      const meta = shot.meta;
      const openness = lens ? clamp(1 - Math.log2(meta.aperture / lens.maxAperture) / 2, 0, 1) : 0;
      const capping = meta.marked <= fastest * 2.01 ? t.capping : 0;
      const leak = t.seals < 0.45 ? (0.45 - t.seals) * 2.4 * (0.6 + rng() * 0.8) : 0;
      const { blob } = await lab.latentFromPhoto(b64ToBlob(shot.jpeg), {
        vignette: lens?.character.vignette ?? 0.3,
        softWideOpen: lens?.character.softWideOpen ?? 0.2,
        haze: clamp(Math.max(t.haze, lensUnit?.haze ?? 0) + Math.max(t.fungus, lensUnit?.fungus ?? 0) * 0.6, 0, 1),
        openness,
        exposureStops: meta.error - push,
        capping,
        cappingDir: 1,
        leak,
        leakPos: [rng() < 0.5 ? 0.06 + rng() * 0.15 : 0.8 + rng() * 0.15, 0.2 + rng() * 0.6],
        colorFilm: stock.color,
        sceneBright: clamp((meta.sceneEV - 7) / 8, 0.15, 1),
        seed: rng() * 100,
      });
      const key = `phone-${pr.id}-${shot.idx}`;
      await game.images.put(key, blob);
      const fm: FrameMeta = {
        location: 'the real world',
        lighting: meta.lighting ?? nearestLighting(meta.sceneEV),
        sceneEV: meta.sceneEV,
        marked: meta.marked,
        actual: meta.actual,
        aperture: meta.aperture,
        focal: meta.focal,
        focusDist: meta.focus,
        subjectDist: meta.focus,
        coverage: 0,
        inFocus: true,
        backgroundBlur: 0,
        error: meta.error,
        shake: 0,
        usedMeter: meta.usedMeter,
        independent: !meta.usedMeter,
        lensId: lensId ?? '',
        unitId: unit.id,
        day: s.day,
      };
      roll.frames.push({ idx: roll.frames.length, key, meta: fm });
    }
  } finally {
    lab.dispose();
  }
  s.rolls.push(roll);
  addLetter(s, 'Your phone', 'A roll from the real world', `${roll.frames.length} frames of ${stock.maker} ${stock.name} shot with the ${m.maker} ${m.name}. Nobody has seen them yet, not even you. They are waiting in the darkroom.`);
  game.save();
  game.hud.toast(`A roll arrived from your phone: ${roll.frames.length} frames on ${stock.name}. It's in the darkroom.`, 'good', 7000);
  game.audio.rewind();
  game.progress();
  return `Unloaded in the darkroom: ${roll.frames.length} frames.`;
}

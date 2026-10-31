/**
 * Individual camera / lens units. Every physical item in the game has hidden
 * traits that only inspection and a test roll reveal.
 */
import { CAMERAS, CameraModel, camera, lens, LENSES, LensModel, Variant } from './data';
import { Rng, chance, clamp, gauss, int, makeRng, pick, range, weighted } from './rng';

export interface CameraTraits {
  /** stop error at slow speeds (≥1/60); + = slower than marked → overexposes */
  shutterSlow: number;
  /** stop error at fast speeds */
  shutterFast: number;
  /** 0..1 – focal-plane capping at the fastest speeds (dark band) */
  capping: number;
  /** light seal condition 1 = perfect, 0 = goo */
  seals: number;
  /** lens haze 0..1 */
  haze: number;
  /** lens fungus 0..1 */
  fungus: number;
  /** meter error in stops, + reads high (underexposes) */
  meterOffset: number;
  meterDead: boolean;
  /** rangefinder misalignment: error in dioptres (1/m) */
  rfError: number;
  /** battery compartment corrosion 0..1 */
  corrosion: number;
  /** cosmetic grade 1..10 */
  cosmetic: number;
  /** AE-1 squeal etc */
  squeal: boolean;
}

export interface CameraUnit {
  id: string;
  modelId: string;
  variantId: string;
  serial: string;
  traits: CameraTraits;
  /** attached lens unit for interchangeable bodies */
  lensId?: string;
  /** lens that came with the body at the market (moved to state.lenses on purchase) */
  bundledLens?: LensUnit;
  /** currently loaded roll id */
  rollId?: string;
  /** roll found inside when bought */
  foundRoll?: { stockId: string; framesShot: number; expiredYears: number; storySeed: number };
  /** what the player has learned */
  inspected: string[];
  report?: TestReport;
  paid: number;
  acquiredDay: number;
  /** owned by a client: test job, must be returned */
  clientJob?: string;
  seed: number;
}

export interface LensUnit {
  id: string;
  modelId: string;
  serial: string;
  haze: number;
  fungus: number;
  /** oily aperture blades: lens sometimes doesn't stop down */
  oilyBlades: boolean;
  cosmetic: number;
  paid: number;
  inspected: string[];
}

export type DefectId = 'leaks' | 'slowShutter' | 'fastShutter' | 'capping' | 'haze' | 'fungus' | 'meter' | 'rangefinder';

export const DEFECT_LABEL: Record<DefectId, string> = {
  leaks: 'Light leaks (seals)',
  slowShutter: 'Slow speeds inaccurate',
  fastShutter: 'Fast speeds inaccurate',
  capping: 'Shutter capping',
  haze: 'Lens haze',
  fungus: 'Lens fungus',
  meter: 'Meter inaccurate / dead',
  rangefinder: 'Rangefinder misaligned',
};

export interface TestReport {
  grade: 'working' | 'quirky' | 'faulty';
  defects: DefectId[];
  day: number;
  accuracy: number;
}

let counter = 0;
export function newId(prefix: string): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function serialFor(model: CameraModel, r: Rng, variant: Variant): string {
  switch (model.id) {
    case 'leicam3':
      return String(variant.id === 'ds' ? int(r, 700000, 915000) : int(r, 915001, 1158999));
    case 'trip35':
      return String(int(r, 100000, 999999));
    case 'ql17':
      return String(int(r, 210000, 660000));
    case 'k1000':
      return String(variant.id === 'asahi' ? int(r, 7000000, 7499999) : int(r, 7500000, 8999999));
    case 'fm2':
      return `N${int(r, 7000000, 8999999)}`;
    default:
      return String(int(r, 10000, 999999));
  }
}

/** How condition depends on the model's typical issue */
export function rollTraits(model: CameraModel, r: Rng, quality = 0.5): CameraTraits {
  // quality 0 = junk shop, 1 = dealer serviced
  const q = clamp(quality + gauss(r, 0, 0.18));
  const knownBoost = (issue: string) => (model.knownIssue === issue ? 0.35 : 0);
  const seals = clamp(range(r, 0.2, 1) * (0.6 + q * 0.5) - knownBoost('seals') * r());
  const leaf = model.shutter === 'leaf';
  const shutterSlow = chance(r, 0.35 - q * 0.25 + knownBoost('shutter')) ? range(r, 0.6, 2.2) * (chance(r, 0.8) ? 1 : -1) : gauss(r, 0, 0.18);
  const shutterFast = chance(r, 0.25 - q * 0.2 + knownBoost('shutter') * 0.5) ? range(r, 0.6, 1.4) * (chance(r, 0.5) ? 1 : -1) : gauss(r, 0, 0.15);
  const capping = !leaf && chance(r, 0.18 - q * 0.12 + knownBoost('shutter') * 0.4) ? range(r, 0.35, 0.9) : 0;
  const haze = chance(r, 0.3 - q * 0.2 + knownBoost('haze')) ? range(r, 0.35, 0.9) : range(r, 0, 0.15);
  const fungus = chance(r, 0.12 - q * 0.08) ? range(r, 0.3, 0.8) : 0;
  const metered = model.meter !== 'none';
  const meterDead = metered && chance(r, 0.12 - q * 0.08 + knownBoost('meter') * 0.4);
  const meterOffset = metered && !meterDead ? (chance(r, 0.3 + knownBoost('meter')) ? range(r, 0.8, 2.2) * (chance(r, 0.5) ? 1 : -1) : gauss(r, 0, 0.2)) : 0;
  const rfError = model.focus === 'rangefinder' && chance(r, 0.25 - q * 0.15) ? range(r, 0.25, 0.6) * (chance(r, 0.5) ? 1 : -1) : 0;
  const corrosion = metered && chance(r, 0.25 - q * 0.15) ? range(r, 0.3, 1) : 0;
  const cosmetic = clamp(Math.round(range(r, 3, 9) + q * 2), 1, 10);
  const squeal = model.knownIssue === 'squeal' && chance(r, 0.5 - q * 0.3);
  return { shutterSlow, shutterFast, capping, seals, haze, fungus, meterOffset, meterDead, rfError, corrosion, cosmetic, squeal };
}

export function makeUnit(modelId: string, seed: number, quality = 0.5, day = 0, forceVariant?: string): CameraUnit {
  const r = makeRng(seed);
  const model = camera(modelId);
  const variant = forceVariant ? model.variants.find((v) => v.id === forceVariant) ?? model.variants[0] : weighted(r, model.variants, (v) => v.weight);
  const traits = rollTraits(model, r, quality);
  return {
    id: newId('cam'),
    modelId,
    variantId: variant.id,
    serial: serialFor(model, r, variant),
    traits,
    inspected: [],
    paid: 0,
    acquiredDay: day,
    seed,
  };
}

export function makeLensUnit(modelId: string, seed: number, quality = 0.5): LensUnit {
  const r = makeRng(seed);
  const q = clamp(quality + gauss(r, 0, 0.2));
  return {
    id: newId('lens'),
    modelId,
    serial: String(int(r, 100000, 9999999)),
    haze: chance(r, 0.3 - q * 0.2) ? range(r, 0.3, 0.8) : range(r, 0, 0.12),
    fungus: chance(r, 0.1 - q * 0.06) ? range(r, 0.3, 0.7) : 0,
    oilyBlades: chance(r, 0.1 - q * 0.06),
    cosmetic: clamp(Math.round(range(r, 3, 9) + q * 2), 1, 10),
    paid: 0,
    inspected: [],
  };
}

/** True defect list (thresholds the test roll can actually show) */
export function trueDefects(unit: CameraUnit): DefectId[] {
  const t = unit.traits;
  const m = camera(unit.modelId);
  const out: DefectId[] = [];
  if (t.seals < 0.45) out.push('leaks');
  if (!m.autoExposure || m.kind === 'rangefinder') {
    if (Math.abs(t.shutterSlow) >= 0.55) out.push('slowShutter');
    if (Math.abs(t.shutterFast) >= 0.55) out.push('fastShutter');
  }
  if (t.capping > 0.3) out.push('capping');
  if (t.haze > 0.3) out.push('haze');
  if (t.fungus > 0.25) out.push('fungus');
  if (m.meter !== 'none' && (t.meterDead || Math.abs(t.meterOffset) >= 0.7)) out.push('meter');
  if (m.focus === 'rangefinder' && Math.abs(t.rfError) >= 0.2) out.push('rangefinder');
  return out;
}

export function defectsFor(modelId: string): DefectId[] {
  const m = camera(modelId);
  const list: DefectId[] = ['leaks'];
  if (!m.autoExposure) list.push('slowShutter', 'fastShutter');
  if (m.shutter === 'focalplane') list.push('capping');
  list.push('haze', 'fungus');
  if (m.meter !== 'none') list.push('meter');
  if (m.focus === 'rangefinder') list.push('rangefinder');
  return list;
}

export function trueGrade(unit: CameraUnit): TestReport['grade'] {
  const d = trueDefects(unit);
  const severe = d.filter((x) => x === 'leaks' || x === 'capping' || x === 'fungus' || (x === 'slowShutter' && Math.abs(unit.traits.shutterSlow) > 1.2) || (x === 'fastShutter' && Math.abs(unit.traits.shutterFast) > 1.2));
  if (severe.length) return 'faulty';
  if (d.length) return 'quirky';
  return 'working';
}

export function variantOf(unit: CameraUnit): Variant {
  const m = camera(unit.modelId);
  return m.variants.find((v) => v.id === unit.variantId) ?? m.variants[0];
}

/** Market value of a unit given what is publicly known about it */
export function unitValue(unit: CameraUnit, knownGrade?: TestReport['grade']): number {
  const m = camera(unit.modelId);
  const v = variantOf(unit);
  const cos = 0.6 + unit.traits.cosmetic * 0.06;
  const gradeMult = knownGrade === 'working' ? 1.25 : knownGrade === 'quirky' ? 0.9 : knownGrade === 'faulty' ? 0.45 : 0.75;
  return Math.round(m.value * v.mult * cos * gradeMult);
}

export function lensValue(l: LensUnit): number {
  const m = lens(l.modelId);
  const cond = 1 - l.haze * 0.5 - l.fungus * 0.6 - (l.oilyBlades ? 0.3 : 0);
  return Math.max(5, Math.round(m.value * (0.6 + l.cosmetic * 0.05) * cond));
}

export function randomModel(r: Rng, allowed: CameraModel[]): CameraModel {
  return weighted(r, allowed, (m) => 1 / m.rarity ** 1.3);
}

export function randomLensModel(r: Rng, mounts: string[]): LensModel {
  const pool = LENSES.filter((l) => l.mount !== 'fixed' && mounts.includes(l.mount));
  return weighted(r, pool.length ? pool : LENSES.filter((l) => l.mount !== 'fixed'), (l) => 1 / l.rarity ** 1.2);
}

export function modelsUpTo(kinds: string[]): CameraModel[] {
  return CAMERAS.filter((c) => kinds.includes(c.kind));
}

export const pickOne = pick;

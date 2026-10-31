/** Game state shape + pure helpers. Persistence lives in app/save.ts. */
import { DevResult, DevSetup } from './develop';
import { camera, exposuresPerRoll, film, Format, FILMS } from './data';
import { CameraUnit, DefectId, LensUnit, makeLensUnit, makeUnit, newId } from './units';
import { PrintSettings } from './print';
import { Lighting } from './exposure';

export type Assist = 'guided' | 'standard' | 'purist';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface FrameMeta {
  location: string;
  lighting: Lighting;
  sceneEV: number;
  marked: number;
  actual: number;
  aperture: number;
  focal: number;
  focusDist: number;
  subjectDist: number;
  subject?: string;
  /** fraction of the frame the subject covers (0..1) */
  coverage: number;
  /** subject inside the depth of field */
  inFocus: boolean;
  /** background blur circle relative to frame width (for portrait briefs) */
  backgroundBlur: number;
  /** exposure error in stops (vs. EI the roll is shot at) */
  error: number;
  shake: number;
  usedMeter: boolean;
  independent: boolean;
  lensId: string;
  unitId: string;
  day: number;
  /** super 8 shot: number of frames */
  frameCount?: number;
  /** found-film frame staged by the story system */
  story?: number;
}

export interface FrameRecord {
  idx: number;
  key: string;
  meta: FrameMeta;
  starred?: boolean;
  /** keys of developed images */
  negKey?: string;
  posKey?: string;
  submitted?: string;
}

export interface Roll {
  id: string;
  stockId: string;
  format: Format;
  ei: number;
  capacity: number;
  frames: FrameRecord[];
  state: 'loaded' | 'exposed' | 'developed' | 'ruined';
  unitId?: string;
  expiredYears: number;
  found?: { storySeed: number };
  unknownStock?: boolean;
  /** frames fogged by opening the back without rewinding */
  openedBackFrames?: number;
  rewound?: boolean;
  dev?: DevResult;
  devSetup?: DevSetup;
  /** report filed for the unit this roll tested */
  reportFiled?: boolean;
}

export interface PrintRecord {
  id: string;
  rollId: string;
  frameIdx: number;
  key: string;
  score: number;
  notes: string[];
  settings: PrintSettings;
  day: number;
  testStrip?: boolean;
  exhibited?: boolean;
}

export interface AssignmentState {
  id: string;
  done: boolean;
  stars?: number;
  critique?: string[];
}

export interface Letter {
  id: string;
  from: string;
  title: string;
  body: string;
  day: number;
  read: boolean;
}

export interface GameState {
  version: 1;
  sandbox: boolean;
  money: number;
  rep: number;
  day: number;
  chapter: number;
  chapterIntroSeen: number;
  flags: string[];
  assist: Assist;
  settings: { quality: Quality; rollLength: 12 | 24 | 36; volume: number; mouseSens: number };
  cameras: CameraUnit[];
  lenses: LensUnit[];
  fridge: Record<string, number>;
  expiredFilm: { stockId: string; expiredYears: number; count: number }[];
  chem: { fixerUses: number; c41Kits: number; e6Kits: number; revKits: number };
  rolls: Roll[];
  prints: PrintRecord[];
  assignments: AssignmentState[];
  letters: Letter[];
  catalogSeen: string[];
  tools: string[];
  storiesFound: number[];
  marketDay: number;
  /** id of camera in hand */
  activeCameraId?: string;
}

export function newGame(sandbox = false): GameState {
  const s: GameState = {
    version: 1,
    sandbox,
    money: sandbox ? 20000 : 450,
    rep: 0,
    day: 1,
    chapter: 0,
    chapterIntroSeen: -1,
    flags: [],
    assist: 'guided',
    settings: { quality: 'high', rollLength: 12, volume: 0.8, mouseSens: 1 },
    cameras: [],
    lenses: [],
    fridge: { hp5: 2 },
    expiredFilm: [],
    chem: { fixerUses: 0, c41Kits: 0, e6Kits: 0, revKits: 0 },
    rolls: [],
    prints: [],
    assignments: [],
    letters: [],
    catalogSeen: [],
    tools: ['loupe', 'flashlight'],
    storiesFound: [],
    marketDay: 0,
  };
  const trip = makeUnit('trip35', 1967, 0.85, 1, 'silver');
  // Aunt Ruth kept her Trip in good order – except a slightly lazy meter.
  trip.traits = { ...trip.traits, seals: 0.9, haze: 0.05, fungus: 0, shutterSlow: 0.05, shutterFast: 0, meterOffset: 0.2, meterDead: false, capping: 0, rfError: 0, corrosion: 0, cosmetic: 7 };
  trip.paid = 0;
  trip.inspected = [];
  s.cameras.push(trip);
  s.catalogSeen.push('trip35');
  s.activeCameraId = trip.id;
  if (sandbox) {
    s.chapter = 99;
    s.tools.push('meter', 'tripod');
    for (const id of ['ql17', 'leicam3', 'mat124g', 'rollei28f', 'ae1p', 'k1000', 'fm2', 'spotf', 'c514xl']) {
      const u = makeUnit(id, id.length * 991 + 7, 0.95, 1);
      u.traits = { ...u.traits, seals: 0.95, haze: 0.02, fungus: 0, shutterSlow: 0, shutterFast: 0, capping: 0, meterOffset: 0, meterDead: false, rfError: 0 };
      s.cameras.push(u);
      s.catalogSeen.push(id);
    }
    for (const lid of ['fd28', 'fd50', 'fd85', 'fd135', 'fd50macro', 'smcm50', 'smcm28', 'smcm135', 'smcm100macro', 'ais50', 'ais105', 'ais24', 'helios44', 'takumar55', 'jupiter9']) {
      const l = makeLensUnit(lid, lid.length * 37, 1);
      l.haze = 0;
      l.fungus = 0;
      l.oilyBlades = false;
      s.lenses.push(l);
    }
    for (const f of FILMS) s.fridge[f.id] = 10;
    s.chem = { fixerUses: 0, c41Kits: 5, e6Kits: 5, revKits: 5 };
    attachDefaultLenses(s);
  }
  return s;
}

export function attachDefaultLenses(s: GameState): void {
  for (const c of s.cameras) {
    const m = camera(c.modelId);
    if (m.mount === 'fixed' || c.lensId) continue;
    const free = s.lenses.find((l) => lensMountOf(l) === m.mount && !s.cameras.some((o) => o.lensId === l.id));
    if (free) c.lensId = free.id;
  }
}

import { lens as lensModel } from './data';
export function lensMountOf(l: LensUnit): string {
  return lensModel(l.modelId).mount;
}

export function unitById(s: GameState, id?: string): CameraUnit | undefined {
  return id ? s.cameras.find((c) => c.id === id) : undefined;
}

export function rollById(s: GameState, id?: string): Roll | undefined {
  return id ? s.rolls.find((r) => r.id === id) : undefined;
}

export function loadFilm(s: GameState, unitId: string, stockId: string, ei?: number, expired?: { expiredYears: number }): Roll {
  const unit = unitById(s, unitId);
  if (!unit) throw new Error('no unit');
  const m = camera(unit.modelId);
  const stock = film(stockId);
  if (!stock.formats.includes(m.format)) throw new Error(`${stock.name} does not come in ${m.format}`);
  const roll: Roll = {
    id: newId('roll'),
    stockId,
    format: m.format,
    ei: ei ?? stock.iso,
    capacity: exposuresPerRoll(m.format, s.settings.rollLength),
    frames: [],
    state: 'loaded',
    unitId,
    expiredYears: expired?.expiredYears ?? 0,
  };
  s.rolls.push(roll);
  unit.rollId = roll.id;
  return roll;
}

/** Remove the roll from the camera. Unrewound 35mm opened in light fogs frames. */
export function unloadFilm(s: GameState, unitId: string, rewound: boolean): Roll | undefined {
  const unit = unitById(s, unitId);
  const roll = rollById(s, unit?.rollId);
  if (!unit || !roll) return undefined;
  unit.rollId = undefined;
  roll.rewound = rewound;
  roll.unitId = unitId;
  if (!rewound && roll.format === '135') roll.openedBackFrames = Math.min(roll.frames.length, 4);
  roll.state = roll.frames.length ? 'exposed' : 'exposed';
  return roll;
}

export function addLetter(s: GameState, from: string, title: string, body: string): void {
  s.letters.unshift({ id: newId('letter'), from, title, body, day: s.day, read: false });
}

export function hasFlag(s: GameState, f: string): boolean {
  return s.flags.includes(f);
}
export function setFlag(s: GameState, f: string): void {
  if (!s.flags.includes(f)) s.flags.push(f);
}

export type { DefectId };

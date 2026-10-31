import { describe, expect, it } from 'vitest';
import { ev, exposureError, reciprocity, actualShutter, meterNeedle, autoExpose, depthOfField, hyperfocal, LIGHTING_EV } from '../src/sim/exposure';
import { recipe, evaluateDevelopment, emptyLog, StepLog, DevSetup, tempFactorBW, recommendedMinutes, pushFactor, clearingTime } from '../src/sim/develop';
import { makeUnit, trueDefects, trueGrade, unitValue } from '../src/sim/units';
import { scoreReport, FrameEvidence, provableDefects } from '../src/sim/testing';
import { generateMarket, haggle, floorPrice } from '../src/sim/market';
import { newGame, loadFilm, unloadFilm } from '../src/sim/state';
import { CHAPTERS, chapterComplete, gradeFrame, ASSIGNMENTS } from '../src/sim/career';
import { paperDensity, evaluatePrint, gradeRange } from '../src/sim/print';
import { negDensity, scanK } from '../src/sim/filmcurve';
import { CAMERAS, FILMS, LENSES, camera, lens } from '../src/sim/data';

describe('data', () => {
  it('every fixed-lens camera references a real lens', () => {
    for (const c of CAMERAS) if (c.mount === 'fixed') expect(() => lens(c.fixedLens!)).not.toThrow();
  });
  it('B&W stocks publish D-76 times close to the datasheets', () => {
    const trix = FILMS.find((f) => f.id === 'trix')!;
    expect(trix.devTimes.find((d) => d.developer === 'd76' && d.dilution === 'stock')!.minutes).toBeCloseTo(6.75);
    const hp5 = FILMS.find((f) => f.id === 'hp5')!;
    expect(hp5.devTimes.find((d) => d.developer === 'd76' && d.dilution === '1+1')!.minutes).toBe(13);
  });
  it('lens list has unique ids', () => {
    expect(new Set(LENSES.map((l) => l.id)).size).toBe(LENSES.length);
  });
});

describe('exposure', () => {
  it('sunny 16: f/16 at 1/100 for ISO 100 in sun is correct', () => {
    expect(Math.abs(exposureError(LIGHTING_EV.sun, 100, 16, 1 / 100))).toBeLessThan(0.5);
  });
  it('EV formula', () => {
    expect(ev(1, 1)).toBe(0);
    expect(ev(2, 1)).toBeCloseTo(2);
    expect(ev(16, 1 / 125)).toBeCloseTo(14.97, 1);
  });
  it('overexposure is positive', () => {
    expect(exposureError(15, 400, 16, 1 / 125)).toBeGreaterThan(1.5);
  });
  it('reciprocity failure shortens long exposures', () => {
    expect(reciprocity(0.5)).toBe(0.5);
    expect(reciprocity(10)).toBeLessThan(10);
  });
  it('slow shutter error applies to slow speeds only', () => {
    expect(actualShutter(1, 1, 0)).toBe(2);
    expect(actualShutter(1 / 500, 1, 0)).toBeCloseTo(1 / 500);
  });
  it('meter offset moves the needle', () => {
    expect(meterNeedle(15, 100, 16, 1 / 125, 0)).toBeCloseTo(0, 0);
    expect(meterNeedle(15, 100, 16, 1 / 125, 1)).toBeGreaterThan(0.5);
  });
  it('Trip 35 shows the red flag in the dark', () => {
    const r = autoExpose(6, 100, [1 / 40, 1 / 200], [2.8, 4, 5.6, 8, 11, 16, 22]);
    expect(r.redFlag).toBe(true);
    const sun = autoExpose(15, 400, [1 / 40, 1 / 200], [2.8, 4, 5.6, 8, 11, 16, 22]);
    expect(sun.redFlag).toBe(false);
    expect(sun.time).toBeCloseTo(1 / 200);
  });
  it('depth of field widens when stopped down', () => {
    const a = depthOfField(50, 2, 3);
    const b = depthOfField(50, 16, 3);
    expect(b.far - b.near).toBeGreaterThan(a.far - a.near);
    expect(hyperfocal(28, 16)).toBeLessThan(2);
  });
});

function runLogs(setup: DevSetup, override: Partial<Record<string, Partial<StepLog>>> = {}, skip: string[] = []) {
  const steps = recipe(setup, 20);
  const logs: StepLog[] = [];
  for (const st of steps.slice(1)) {
    if (st.id === 'dry') continue;
    const l = emptyLog(st.id, st.temp);
    l.seconds = st.seconds;
    const mins = Math.ceil(st.seconds / 60);
    l.initialInversions = 6;
    l.inversionsPerMinute = Array.from({ length: mins }, () => 4);
    Object.assign(l, override[st.id] ?? {});
    l.skipped = skip.includes(st.id);
    logs.push(l);
  }
  return { steps, logs };
}

describe('development', () => {
  const bw: DevSetup = { stockId: 'hp5', process: 'bw', developerId: 'd76', dilution: 'stock', ei: 400 };
  it('a by-the-book run scores well', () => {
    const { steps, logs } = runLogs(bw);
    const r = evaluateDevelopment(bw, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.ruined).toBe(false);
    expect(r.devDegree).toBeCloseTo(1, 1);
    expect(r.quality).toBeGreaterThan(85);
  });
  it('time/temperature compensation: ~8%/°C', () => {
    expect(1 / tempFactorBW(24)).toBeCloseTo(0.72, 1);
    const at24 = recommendedMinutes('hp5', 'd76', 'stock', 400, 24)!;
    expect(at24).toBeLessThan(7.5);
    expect(at24).toBeGreaterThan(4.5);
  });
  it('pushing two stops needs ~2x time', () => {
    expect(pushFactor(2)).toBeCloseTo(1.96, 1);
    expect(recommendedMinutes('trix', 'd76', 'stock', 1600, 20)!).toBeGreaterThan(12);
  });
  it('short development gives low contrast and a note', () => {
    const { steps, logs } = runLogs(bw, { dev: { seconds: 200 } });
    const r = evaluateDevelopment(bw, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.gamma).toBeLessThan(0.5);
    expect(r.notes.join(' ')).toMatch(/Underdeveloped/);
  });
  it('lights on while loading ruins the roll', () => {
    const { steps, logs } = runLogs(bw);
    const r = evaluateDevelopment(bw, steps, logs, { lightFog: 1, kinks: 0, openedBackFrames: 0 });
    expect(r.ruined).toBe(true);
  });
  it('skipping the fixer leaves milky film', () => {
    const { steps, logs } = runLogs(bw, {}, ['fix']);
    const r = evaluateDevelopment(bw, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.underfix).toBe(1);
  });
  it('missing agitation makes uneven development', () => {
    const { steps, logs } = runLogs(bw, { dev: { inversionsPerMinute: [4, 0, 0, 0, 0, 0, 0, 0], initialInversions: 6 } });
    const r = evaluateDevelopment(bw, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.uneven).toBeGreaterThan(0.5);
  });
  it('stand development is forgiving for unknown expired film', () => {
    const setup: DevSetup = { stockId: 'verichrome', process: 'bw', developerId: 'rodinal', dilution: '1+100', ei: 125, unknown: true, expiredYears: 38 };
    const { steps, logs } = runLogs(setup, { dev: { inversionsPerMinute: [6, 0, 0, 0], initialInversions: 6 } });
    const r = evaluateDevelopment(setup, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.ruined).toBe(false);
    expect(r.devDegree).toBeGreaterThan(0.7);
    expect(r.fog).toBeGreaterThan(0.3);
  });
  it('C-41 temperature drift causes crossover', () => {
    const c41: DevSetup = { stockId: 'portra400', process: 'c41', developerId: 'c41', dilution: 'kit', ei: 400 };
    const { steps, logs } = runLogs(c41, { c41dev: { tempAvg: 35.5, tempMin: 35, tempMax: 36.8 } });
    const r = evaluateDevelopment(c41, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.crossover[0]).toBeLessThan(1);
    expect(r.crossover[2]).toBeGreaterThan(1);
    expect(r.notes.join(' ')).toMatch(/crossover/);
  });
  it('reversal without re-exposure is blank', () => {
    const rev: DevSetup = { stockId: 'trix8', process: 'bwrev', developerId: 'rev', dilution: 'kit', ei: 200 };
    const { steps, logs } = runLogs(rev, {}, ['reexpose']);
    const r = evaluateDevelopment(rev, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 });
    expect(r.blank).toBe(true);
  });
  it('fixer slows down as it is used', () => {
    expect(clearingTime(20)).toBeGreaterThan(clearingTime(0));
  });
});

describe('units & testing', () => {
  it('generates deterministic units with traits', () => {
    const a = makeUnit('ql17', 42, 0.5);
    const b = makeUnit('ql17', 42, 0.5);
    expect(a.traits).toEqual(b.traits);
    expect(a.serial).toBe(b.serial);
  });
  it('bad seals are a defect and grade faulty', () => {
    const u = makeUnit('ql17', 1, 0.9);
    u.traits = { ...u.traits, seals: 0.1, haze: 0, fungus: 0, shutterSlow: 0, shutterFast: 0, capping: 0, meterOffset: 0, meterDead: false, rfError: 0 };
    expect(trueDefects(u)).toEqual(['leaks']);
    expect(trueGrade(u)).toBe('faulty');
  });
  it('report scoring rewards accuracy and forgives what the roll could not show', () => {
    const u = makeUnit('ae1p', 3, 0.9);
    u.traits = { ...u.traits, seals: 0.9, haze: 0, fungus: 0, shutterSlow: 0, shutterFast: 0, capping: 0.8, meterOffset: 0, meterDead: false, rfError: 0 };
    const frames: FrameEvidence[] = [{ marked: 1 / 1000, aperture: 8, focusDist: 5, subjectDist: 5, usedMeter: false, independentExposure: true }];
    expect(provableDefects(u, frames)).toContain('capping');
    const good = scoreReport(u, frames, ['capping'], 'faulty');
    const bad = scoreReport(u, frames, [], 'working');
    expect(good.accuracy).toBeGreaterThan(bad.accuracy);
    expect(good.accuracy).toBeGreaterThanOrEqual(90);
  });
  it('tested working cameras are worth more', () => {
    const u = makeUnit('k1000', 9, 0.5);
    expect(unitValue(u, 'working')).toBeGreaterThan(unitValue(u, 'faulty'));
  });
});

describe('market', () => {
  it('chapter two market has rangefinders', () => {
    const s = newGame();
    s.chapter = 1;
    const m = generateMarket(s, 'flea');
    expect(m.listings.filter((l) => l.unit && camera(l.unit.modelId).kind === 'rangefinder').length).toBeGreaterThanOrEqual(3);
  });
  it('estate sale has the Yashica-D with film inside', () => {
    const s = newGame();
    s.chapter = 3;
    const m = generateMarket(s, 'estate');
    const d = m.listings.find((l) => l.unit?.modelId === 'yashicad')!;
    expect(d.unit!.foundRoll?.framesShot).toBe(9);
  });
  it('haggling accepts at or above the floor and loses patience on lowballs', () => {
    const s = newGame();
    s.chapter = 1;
    const m = generateMarket(s, 'flea');
    const l = m.listings.find((x) => x.kind === 'camera')!;
    const seller = m.sellers.find((x) => x.id === l.sellerId)!;
    const floor = floorPrice(l, seller);
    expect(haggle(l, { ...seller }, floor).accepted).toBe(true);
    const sel2 = { ...seller, patience: 1 };
    const r = haggle(l, sel2, 1);
    expect(r.accepted).toBe(false);
    expect(r.walkedAway).toBe(true);
  });
});

describe('career', () => {
  it('chapter one completes after load/shoot/develop/star', () => {
    const s = newGame();
    expect(chapterComplete(s)).toBe(false);
    const roll = loadFilm(s, s.cameras[0].id, 'hp5');
    for (let i = 0; i < 6; i++) roll.frames.push({ idx: i, key: `k${i}`, meta: { location: 'harbour' } as never });
    unloadFilm(s, s.cameras[0].id, true);
    roll.state = 'developed';
    roll.frames[0].starred = true;
    expect(chapterComplete(s)).toBe(true);
    expect(CHAPTERS.length).toBe(8);
  });
  it('opening an unrewound 35mm roll fogs frames', () => {
    const s = newGame();
    const roll = loadFilm(s, s.cameras[0].id, 'hp5');
    for (let i = 0; i < 6; i++) roll.frames.push({ idx: i, key: `k${i}`, meta: {} as never });
    unloadFilm(s, s.cameras[0].id, false);
    expect(roll.openedBackFrames).toBeGreaterThan(0);
  });
  it('push assignment needs matching development', () => {
    const def = ASSIGNMENTS.find((a) => a.id === 'a-portrait-push')!;
    const s = newGame();
    const roll = loadFilm(s, s.cameras[0].id, 'trix', 1600);
    const frame = { idx: 0, key: 'k', meta: { subject: 'hat', coverage: 0.3, inFocus: true, shake: 0, error: 0, lighting: 'window', focal: 40, aperture: 2.8 } as never };
    roll.dev = { devDegree: 1, quality: 90, underfix: 0, lightFog: 0, speedShift: 0 } as never;
    expect(gradeFrame(def, frame, roll).pass).toBe(false);
    roll.dev = { devDegree: 1.96, quality: 90, underfix: 0, lightFog: 0, speedShift: 0 } as never;
    expect(gradeFrame(def, frame, roll).pass).toBe(true);
  });
});

describe('film curve & printing', () => {
  it('negative density rises with exposure', () => {
    expect(negDensity(0.3, 0.6, 2, 4)).toBeGreaterThan(negDensity(0, 0.6, 2, 4));
    expect(negDensity(-2, 0.6, 2, 4)).toBeLessThan(0.1);
  });
  it('scan constant partially corrects exposure errors', () => {
    expect(scanK(2, 0, 0.6, 2, 4)).toBeGreaterThan(scanK(0, 0, 0.6, 2, 4));
  });
  it('harder grades have shorter exposure range', () => {
    expect(gradeRange(5)).toBeLessThan(gradeRange(0));
  });
  it('pulling paper early lowers Dmax', () => {
    expect(paperDensity(3, 2, 20)).toBeLessThan(paperDensity(3, 2, 90));
  });
  it('a flat grey print is criticised', () => {
    const d = new Float32Array(1000).fill(0.8);
    const ev = evaluatePrint(d, { seconds: 10, enlargerAperture: 8, grade: 2, devSeconds: 90, stop: true, fixSeconds: 120, washSeconds: 300, focusError: 0 });
    expect(ev.score).toBeLessThan(80);
    expect(ev.notes.join(' ')).toMatch(/blacks/);
  });
});

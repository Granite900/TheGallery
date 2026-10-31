/**
 * Film processing model.
 *
 * Darkroom gameplay records a StepLog for every bath (time, temperature,
 * agitation). evaluateDevelopment() turns those logs into a DevResult that
 * the GPU film pipeline uses to render the negative / slide / reversal
 * positive.
 *
 * B&W development degree d = Σ(dt · tempFactor · agitationFactor) / t20,
 * where t20 is the datasheet time at 20 °C and tempFactor ≈ e^{0.081(T−20)}
 * (the usual ≈8 %/°C time–temperature chart). Contrast follows the
 * classical γ = γ∞(1 − e^{−k·t}) growth, normalised so d = 1 gives the
 * stock's datasheet gamma.
 */
import { film, developer, FilmStock, Process, FIXER, STOP_BATH } from './data';
import { clamp } from './rng';

export type StepId =
  | 'load'
  | 'presoak'
  | 'dev'
  | 'stop'
  | 'fix'
  | 'wash'
  | 'wetting'
  | 'dry'
  | 'c41dev'
  | 'blix'
  | 'stab'
  | 'fd'
  | 'cd'
  | 'bleach'
  | 'clear'
  | 'reexpose'
  | 'sd';

export type Agitation = 'inversions' | 'stand' | 'continuous' | 'none';

export interface StepDef {
  id: StepId;
  name: string;
  chemical: string;
  /** recommended duration (s) */
  seconds: number;
  /** acceptable band for "on time" feedback */
  toleranceSec: number;
  /** target temperature °C */
  temp: number;
  tempTolerance: number;
  agitation: Agitation;
  optional: boolean;
  /** in the dark? (only loading) */
  dark?: boolean;
  /** step is timed by the player (pour out when they decide) */
  timed: boolean;
  hint: string;
}

export interface StepLog {
  id: StepId;
  seconds: number;
  tempAvg: number;
  tempMin: number;
  tempMax: number;
  /** inversions counted in each started minute */
  inversionsPerMinute: number[];
  /** inversions in the first 30 s */
  initialInversions: number;
  skipped: boolean;
}

export interface DevSetup {
  stockId: string;
  process: Process;
  developerId: string;
  dilution: string;
  /** exposure index the roll was shot at */
  ei: number;
  /** the stock is unknown to the player (found film) */
  unknown?: boolean;
  /** years past expiry */
  expiredYears?: number;
}

export interface DevResult {
  devDegree: number;
  gamma: number;
  /** extra fog density above base */
  fog: number;
  grain: number;
  /** speed change in stops from development (push/pull) */
  speedShift: number;
  uneven: number;
  surge: number;
  underfix: number;
  dryingMarks: number;
  dust: number;
  /** 0..1 light struck during loading / opening the tank */
  lightFog: number;
  kinks: number;
  /** per channel gamma multipliers for colour processes */
  crossover: [number, number, number];
  /** colour process: reversal positive density shift (stops) */
  slideShift: number;
  /** for reversal: whether the second exposure happened */
  reversed: boolean;
  blank: boolean;
  ruined: boolean;
  sharpness: number;
  notes: string[];
  quality: number; // 0..100 how well the process was executed
}

export function tempFactorBW(t: number): number {
  return Math.exp(0.081 * (t - 20));
}

export function tempFactorC41(t: number): number {
  return Math.exp(0.115 * (t - 37.8));
}

/** Time in minutes for a stock at temperature T and exposure index ei */
export function datasheetMinutes(stock: FilmStock, developerId: string, dilution: string): number | null {
  const d = stock.devTimes.find((x) => x.developer === developerId && x.dilution === dilution);
  return d ? d.minutes : null;
}

/** Push/pull adjustment: ~+40 % per stop pushed, −20 % per stop pulled */
export function pushFactor(pushStops: number): number {
  if (pushStops >= 0) return Math.pow(1.4, pushStops);
  return Math.pow(0.8, -pushStops);
}

export function recommendedMinutes(stockId: string, developerId: string, dilution: string, ei: number, tempC: number): number | null {
  const stock = film(stockId);
  const base = datasheetMinutes(stock, developerId, dilution);
  if (base == null) return null;
  if (dilution === '1+100') return 60; // stand: not adjusted for push
  const push = Math.log2(ei / stock.iso);
  return (base * pushFactor(push)) / tempFactorBW(tempC);
}

export function recipe(setup: DevSetup, tempC = 20): StepDef[] {
  const stock = film(setup.stockId);
  const steps: StepDef[] = [];
  const add = (s: StepDef) => steps.push(s);
  const load: StepDef = {
    id: 'load',
    name: 'Load the reel',
    chemical: '',
    seconds: 0,
    toleranceSec: 0,
    temp: 20,
    tempTolerance: 99,
    agitation: 'none',
    optional: false,
    dark: true,
    timed: false,
    hint: 'Lights OFF. Not even the safelight: film is panchromatic. Pop the cassette, cut the leader square, wind the film onto the reel, put it in the tank and close the lid.',
  };
  add(load);
  if (setup.process === 'bw') {
    const stand = setup.dilution === '1+100';
    const mins = recommendedMinutes(setup.stockId, setup.developerId, setup.dilution, setup.ei, tempC);
    add({
      id: 'presoak',
      name: 'Pre-soak (optional)',
      chemical: 'Water',
      seconds: 60,
      toleranceSec: 60,
      temp: 20,
      tempTolerance: 3,
      agitation: 'none',
      optional: true,
      timed: true,
      hint: 'A minute of plain water at working temperature evens out development. The water comes out coloured: that is the anti-halation dye.',
    });
    add({
      id: 'dev',
      name: 'Developer',
      chemical: `${developer(setup.developerId).name} ${setup.dilution}`,
      seconds: Math.round((mins ?? 8) * 60),
      toleranceSec: stand ? 600 : 20,
      temp: 20,
      tempTolerance: stand ? 3 : 1,
      agitation: stand ? 'stand' : 'inversions',
      optional: false,
      timed: true,
      hint: stand
        ? 'Stand development: agitate for the first 30 s, give a few gentle inversions at 30 min, otherwise leave it alone for the full hour.'
        : 'Agitate continuously for the first 30 s, then 4 inversions (about 10 s) at the start of every minute. Start pouring out about 10 s before the time is up.',
    });
    add({ id: 'stop', name: 'Stop bath', chemical: STOP_BATH.name, seconds: STOP_BATH.seconds, toleranceSec: 30, temp: 20, tempTolerance: 4, agitation: 'continuous', optional: true, timed: true, hint: 'Acid stop halts development instantly. Water works too, a little less precisely.' });
    add({ id: 'fix', name: 'Fixer', chemical: FIXER.name, seconds: 300, toleranceSec: 120, temp: 20, tempTolerance: 5, agitation: 'inversions', optional: false, timed: true, hint: 'Fix for at least twice the clearing time. When in doubt, fix longer. Over-fixing is very hard to do.' });
    add({ id: 'wash', name: 'Wash', chemical: 'Running water', seconds: 600, toleranceSec: 300, temp: 20, tempTolerance: 5, agitation: 'none', optional: false, timed: true, hint: 'Ilford method: fill, 5 inversions, dump, fill, 10, dump, fill, 20. Or just run water for 10 minutes.' });
    add({ id: 'wetting', name: 'Wetting agent', chemical: 'Photo-Flo 1+200', seconds: 30, toleranceSec: 60, temp: 20, tempTolerance: 5, agitation: 'none', optional: true, timed: true, hint: 'A drop of surfactant so water sheets off the film instead of drying into spots.' });
    add({ id: 'dry', name: 'Hang to dry', chemical: '', seconds: 0, toleranceSec: 0, temp: 20, tempTolerance: 99, agitation: 'none', optional: false, timed: false, hint: 'Clip the strip, weight the bottom, leave it somewhere dust-free.' });
  } else if (setup.process === 'c41') {
    add({ id: 'presoak', name: 'Pre-heat soak', chemical: 'Water 38 °C', seconds: 60, toleranceSec: 60, temp: 38, tempTolerance: 1, agitation: 'continuous', optional: true, timed: true, hint: 'Warms the tank so the developer does not drop in temperature when it goes in.' });
    add({ id: 'c41dev', name: 'Colour developer', chemical: 'C-41 CD', seconds: 195, toleranceSec: 10, temp: 37.8, tempTolerance: 0.3, agitation: 'inversions', optional: false, timed: true, hint: '3:15 at 37.8 °C ±0.15. Keep the water bath topped up with hot water. A degree too cold and the colour layers stop matching (crossover).' });
    add({ id: 'blix', name: 'Bleach-fix', chemical: 'C-41 Blix', seconds: 390, toleranceSec: 120, temp: 38, tempTolerance: 3, agitation: 'inversions', optional: false, timed: true, hint: 'Removes the silver and fixes. Short blix leaves silver behind and makes muddy colours.' });
    add({ id: 'wash', name: 'Wash', chemical: 'Water', seconds: 180, toleranceSec: 120, temp: 38, tempTolerance: 5, agitation: 'none', optional: false, timed: true, hint: '' });
    add({ id: 'stab', name: 'Stabiliser', chemical: 'C-41 Stabiliser', seconds: 60, toleranceSec: 60, temp: 25, tempTolerance: 10, agitation: 'none', optional: true, timed: true, hint: 'Hardens dyes and works as a wetting agent.' });
    add({ id: 'dry', name: 'Hang to dry', chemical: '', seconds: 0, toleranceSec: 0, temp: 20, tempTolerance: 99, agitation: 'none', optional: false, timed: false, hint: '' });
  } else if (setup.process === 'e6') {
    add({ id: 'fd', name: 'First developer', chemical: 'E-6 First Dev', seconds: 390, toleranceSec: 10, temp: 38, tempTolerance: 0.3, agitation: 'inversions', optional: false, timed: true, hint: 'Critical step: this develops the negative image that sets your slide density. Each extra 2 minutes = +1 stop push.' });
    add({ id: 'cd', name: 'Colour developer', chemical: 'E-6 Colour Dev', seconds: 360, toleranceSec: 90, temp: 38, tempTolerance: 2, agitation: 'inversions', optional: false, timed: true, hint: 'Chemically fogs and develops the remaining silver as the positive dye image.' });
    add({ id: 'blix', name: 'Bleach-fix', chemical: 'E-6 Blix', seconds: 360, toleranceSec: 120, temp: 38, tempTolerance: 3, agitation: 'inversions', optional: false, timed: true, hint: '' });
    add({ id: 'wash', name: 'Wash', chemical: 'Water', seconds: 240, toleranceSec: 120, temp: 38, tempTolerance: 5, agitation: 'none', optional: false, timed: true, hint: '' });
    add({ id: 'stab', name: 'Stabiliser', chemical: 'E-6 Stabiliser', seconds: 60, toleranceSec: 60, temp: 25, tempTolerance: 10, agitation: 'none', optional: true, timed: true, hint: '' });
    add({ id: 'dry', name: 'Hang to dry', chemical: '', seconds: 0, toleranceSec: 0, temp: 20, tempTolerance: 99, agitation: 'none', optional: false, timed: false, hint: '' });
  } else {
    // B&W reversal (Super 8 Tri-X)
    add({ id: 'fd', name: 'First developer', chemical: 'Reversal D-19 + thiocyanate', seconds: 360, toleranceSec: 20, temp: 20, tempTolerance: 1, agitation: 'inversions', optional: false, timed: true, hint: 'Develops a negative image. Its density decides how light the final positive is.' });
    add({ id: 'wash', name: 'Rinse', chemical: 'Water', seconds: 60, toleranceSec: 60, temp: 20, tempTolerance: 5, agitation: 'none', optional: false, timed: true, hint: '' });
    add({ id: 'bleach', name: 'Bleach', chemical: 'Permanganate bleach', seconds: 150, toleranceSec: 60, temp: 20, tempTolerance: 3, agitation: 'inversions', optional: false, timed: true, hint: 'Dissolves the developed negative silver, leaving only the unexposed halide: the positive.' });
    add({ id: 'clear', name: 'Clearing bath', chemical: 'Sodium metabisulphite', seconds: 90, toleranceSec: 60, temp: 20, tempTolerance: 3, agitation: 'inversions', optional: false, timed: true, hint: 'Clears the brown bleach stain.' });
    add({ id: 'reexpose', name: 'Re-exposure', chemical: 'Lights on', seconds: 60, toleranceSec: 60, temp: 20, tempTolerance: 99, agitation: 'none', optional: false, timed: true, hint: 'Open the tank and expose the film to bright light for a minute so the remaining halide can develop.' });
    add({ id: 'sd', name: 'Second developer', chemical: 'Reversal D-19', seconds: 240, toleranceSec: 120, temp: 20, tempTolerance: 3, agitation: 'inversions', optional: false, timed: true, hint: 'Develops the positive image to completion.' });
    add({ id: 'fix', name: 'Fixer', chemical: FIXER.name, seconds: 180, toleranceSec: 120, temp: 20, tempTolerance: 5, agitation: 'inversions', optional: false, timed: true, hint: '' });
    add({ id: 'wash', name: 'Final wash', chemical: 'Water', seconds: 300, toleranceSec: 200, temp: 20, tempTolerance: 5, agitation: 'none', optional: false, timed: true, hint: '' });
    add({ id: 'dry', name: 'Hang to dry', chemical: '', seconds: 0, toleranceSec: 0, temp: 20, tempTolerance: 99, agitation: 'none', optional: false, timed: false, hint: '' });
  }
  void stock;
  return steps;
}

export interface LoadLog {
  /** light hit the film while loading */
  lightFog: number;
  /** crescent kink marks from rough loading */
  kinks: number;
  /** film opened in light before rewinding (fogged frames from the end) */
  openedBackFrames: number;
}

/** Agitation factor and unevenness for a developer bath log */
function agitationScore(log: StepLog, def: StepDef): { factor: number; uneven: number; surge: number } {
  const minutes = Math.max(1, Math.ceil(log.seconds / 60));
  const perMin = log.inversionsPerMinute;
  if (def.agitation === 'stand') {
    // Initial agitation matters; long stands without any agitation → mild drag
    const initial = log.initialInversions;
    const later = perMin.slice(1).reduce((s, x) => s + x, 0);
    const uneven = clamp((initial < 3 ? 0.25 : 0) + (later === 0 && log.seconds > 40 * 60 ? 0.15 : 0) + (later > 30 ? 0.0 : 0));
    const factor = later > minutes * 2 ? 1.15 : 1;
    return { factor, uneven, surge: 0 };
  }
  let missed = 0;
  let excessive = 0;
  for (let m = 0; m < minutes; m++) {
    const n = perMin[m] ?? 0;
    if (m === 0) {
      if (log.initialInversions + n < 3) missed += 1;
    } else if (n === 0) missed += 1;
    if (n > 10) excessive += 1;
  }
  const missedFrac = missed / minutes;
  const uneven = clamp(missedFrac * 1.3);
  const surge = clamp((excessive / minutes) * 1.2);
  // Under-agitation slows development; over-agitation speeds it up.
  const factor = 1 - 0.15 * missedFrac + 0.12 * (excessive / minutes);
  return { factor, uneven, surge };
}

function emptyResult(): DevResult {
  return {
    devDegree: 1,
    gamma: 0.62,
    fog: 0,
    grain: 1,
    speedShift: 0,
    uneven: 0,
    surge: 0,
    underfix: 0,
    dryingMarks: 0,
    dust: 0.05,
    lightFog: 0,
    kinks: 0,
    crossover: [1, 1, 1],
    slideShift: 0,
    reversed: true,
    blank: false,
    ruined: false,
    sharpness: 1,
    notes: [],
    quality: 100,
  };
}

export function evaluateDevelopment(
  setup: DevSetup,
  steps: StepDef[],
  logs: StepLog[],
  load: LoadLog,
  fixerUses = 0,
): DevResult {
  const r = emptyResult();
  const stock = film(setup.stockId);
  r.gamma = stock.gamma;
  r.lightFog = clamp(load.lightFog);
  r.kinks = load.kinks;
  const get = (id: StepId) => logs.find((l) => l.id === id && !l.skipped);
  const def = (id: StepId) => steps.find((s) => s.id === id)!;
  const note = (s: string, penalty: number) => {
    r.notes.push(s);
    r.quality -= penalty;
  };

  if (r.lightFog > 0.9) {
    r.ruined = true;
    note('The film saw light before it was developed. The whole roll is fogged black.', 100);
    return r;
  }
  if (r.lightFog > 0.05) note('Some light reached the film while loading: the edges are fogged.', 25);
  if (r.kinks > 0) note(`${r.kinks} crescent-shaped kink mark${r.kinks > 1 ? 's' : ''}: the film was bent while going onto the reel.`, 5 * r.kinks);

  const expiredYears = setup.expiredYears ?? 0;
  const expiryFog = setup.process === 'bw' ? 0.012 * expiredYears : 0.02 * expiredYears;
  const expirySpeedLoss = expiredYears / 10 / 3; // ⅓ stop per decade
  r.speedShift -= expirySpeedLoss;

  if (setup.process === 'bw') {
    const dlog = get('dev');
    if (!dlog) {
      r.blank = true;
      r.ruined = true;
      note('No developer: the film came out clear. Fixer dissolved the undeveloped image.', 100);
      return r;
    }
    const ddef = def('dev');
    const stand = setup.dilution === '1+100';
    const base = datasheetMinutes(stock, setup.developerId, setup.dilution) ?? 8;
    const ag = agitationScore(dlog, ddef);
    let d: number;
    if (stand) {
      // Stand development self-limits: developer exhausts in highlights.
      const tf = tempFactorBW(dlog.tempAvg);
      d = clamp(((dlog.seconds / 60) * tf * ag.factor) / 60, 0, 1.6);
      d = 0.75 + 0.35 * Math.tanh((d - 0.5) * 2.2); // compensating response
      r.gamma = stock.gamma * 0.92;
      r.fog = 0.015;
    } else {
      const tf = tempFactorBW(dlog.tempAvg);
      d = ((dlog.seconds / 60) * tf * ag.factor) / base;
      r.fog = Math.max(0, d - 1) * 0.06 + Math.max(0, dlog.tempAvg - 24) * 0.02;
    }
    r.devDegree = d;
    const k = 1.25;
    const g = (1 - Math.exp(-k * d)) / (1 - Math.exp(-k));
    r.gamma *= clamp(g, 0.15, 1.7);
    // Development pushes shadow speed modestly (~⅓ stop per push stop)
    r.speedShift += clamp(Math.log2(Math.max(d, 0.05)) / Math.log2(1.4) * 0.33, -1.5, 1);
    r.uneven = ag.uneven;
    r.surge = ag.surge;
    const dev = developer(setup.developerId);
    r.grain = Math.pow(Math.max(d, 0.3), 0.8) * dev.grain * (1 + Math.max(0, dlog.tempAvg - 24) * 0.06);
    r.sharpness = dev.sharpness;

    // Feedback on time vs what the push needed
    const push = Math.log2(setup.ei / stock.iso);
    const want = stand ? 1 : pushFactor(push);
    const ratio = stand ? 1 : d / want;
    if (!setup.unknown && !stand) {
      if (ratio < 0.8) note(`Underdeveloped (${Math.round((1 - ratio) * 100)}% short): flat, thin negatives.`, clamp((0.95 - ratio) * 80, 0, 40));
      else if (ratio > 1.25) note(`Overdeveloped by ${Math.round((ratio - 1) * 100)}%: dense, contrasty, grainier negatives.`, clamp((ratio - 1.05) * 60, 0, 40));
      else note('Development time on target.', 0);
    }
    if (setup.unknown && !stand) note('Unknown film developed by guesswork: results may vary. Stand development is the safe bet next time.', 0);
    if (setup.unknown && stand) note('Stand development: a good call for unknown film.', 0);
    if (Math.abs(dlog.tempMax - dlog.tempMin) > 3) note('The developer temperature wandered by more than 3 °C.', 5);
    if (r.uneven > 0.25) note('Missed agitation: uneven density and bromide drag streaks near the sprocket holes.', r.uneven * 30);
    if (r.surge > 0.3) note('Over-agitation: surge marks (denser edges near the sprockets).', r.surge * 15);
    if (expiredYears > 0) note(`Film expired ~${expiredYears} years ago: base fog is up and it lost about ${(expirySpeedLoss).toFixed(1)} stops of speed.`, 0);
  } else if (setup.process === 'c41') {
    const dlog = get('c41dev');
    if (!dlog) {
      r.ruined = true;
      note('Skipped colour developer: nothing to see.', 100);
      return r;
    }
    const tf = tempFactorC41(dlog.tempAvg);
    const ag = agitationScore(dlog, def('c41dev'));
    const d = (dlog.seconds * tf * ag.factor) / 195;
    r.devDegree = d;
    const g = (1 - Math.exp(-1.25 * d)) / (1 - Math.exp(-1.25));
    r.gamma = stock.gamma * clamp(g, 0.2, 1.6);
    r.speedShift += clamp(Math.log2(Math.max(d, 0.05)) * 0.8, -2, 1.2);
    const dT = dlog.tempAvg - 37.8;
    const drift = dlog.tempMax - dlog.tempMin;
    // Colour layers have different temperature coefficients → crossover
    r.crossover = [1 + 0.045 * dT + 0.01 * drift, 1, 1 - 0.05 * dT - 0.01 * drift];
    r.uneven = ag.uneven;
    r.grain = Math.pow(Math.max(d, 0.3), 0.6);
    r.fog = Math.max(0, d - 1) * 0.05;
    if (Math.abs(dT) > 0.3 || drift > 0.6)
      note(`Developer ran at ${dlog.tempAvg.toFixed(1)} °C (${drift.toFixed(1)}° drift): colour crossover, ${dT > 0 ? 'warm highlights / cyan shadows' : 'cold highlights / magenta-red shadows'}.`, clamp(Math.abs(dT) * 15 + drift * 8, 0, 45));
    else note('Temperature held within tolerance. Clean colour.', 0);
    if (Math.abs(d - 1) > 0.12) note(d < 1 ? 'Colour developer pulled early: thin, grainy negatives.' : 'Colour developer ran long: dense, contrasty negatives.', clamp(Math.abs(d - 1) * 60, 0, 30));
    const blix = get('blix');
    const blixSec = blix?.seconds ?? 0;
    if (blixSec < 390 * 0.7) {
      r.underfix = clamp(1 - blixSec / 390);
      note('Short bleach-fix: retained silver dulls the colours.', r.underfix * 35);
    }
    if (!get('stab')) note('No stabiliser: fine for now, dyes may fade in decades.', 0);
    if (expiredYears > 0) note(`Expired colour film (~${expiredYears} years): expect fog and a colour shift.`, 0);
  } else if (setup.process === 'e6') {
    const fd = get('fd');
    if (!fd) {
      r.ruined = true;
      note('No first developer: the slides came out black.', 100);
      return r;
    }
    const tf = tempFactorC41(fd.tempAvg);
    const d = (fd.seconds * tf) / 390;
    r.devDegree = d;
    // Longer first dev → lighter slides (push). ≈ +1 stop per +30 %
    r.slideShift = Math.log2(Math.max(d, 0.1)) / Math.log2(1.3);
    r.gamma = stock.gamma * (1 + 0.15 * (d - 1));
    const dT = fd.tempAvg - 38;
    r.crossover = [1 + 0.05 * dT, 1, 1 - 0.05 * dT];
    if (Math.abs(r.slideShift) > 0.25) note(`First developer ${d > 1 ? 'long' : 'short'}: slides are ${Math.abs(r.slideShift).toFixed(1)} stops ${d > 1 ? 'lighter' : 'darker'}.`, clamp(Math.abs(r.slideShift) * 25, 0, 40));
    else note('First developer on time.', 0);
    if (Math.abs(dT) > 0.4) note(`First developer at ${fd.tempAvg.toFixed(1)} °C: colour shift.`, clamp(Math.abs(dT) * 12, 0, 30));
    if (!get('cd')) {
      r.ruined = true;
      note('Skipped colour developer: the slides are blank.', 100);
      return r;
    }
    const blix = get('blix');
    if (!blix || blix.seconds < 250) {
      r.underfix = clamp(1 - (blix?.seconds ?? 0) / 360);
      note('Short bleach-fix: slides look dark and muddy.', r.underfix * 35);
    }
  } else {
    // B&W reversal
    const fd = get('fd');
    if (!fd) {
      r.ruined = true;
      note('Skipped first developer.', 100);
      return r;
    }
    const d = (fd.seconds * tempFactorBW(fd.tempAvg)) / 360;
    r.devDegree = d;
    r.slideShift = Math.log2(Math.max(d, 0.1)) / Math.log2(1.35);
    if (!get('bleach')) {
      r.reversed = false;
      note('No bleach: you developed a negative, then fogged and developed everything else. The film is nearly black.', 70);
    }
    if (!get('reexpose') && !get('sd')) {
      r.blank = true;
      note('No re-exposure or second developer: the positive image was fixed away. Clear film.', 100);
    } else if (!get('reexpose')) {
      r.blank = true;
      note('Forgot the re-exposure: the second developer had nothing to develop. Clear film.', 100);
    }
    if (Math.abs(r.slideShift) > 0.3) note(`First developer ${d > 1 ? 'long: brighter, washed-out' : 'short: dark, heavy'} footage.`, clamp(Math.abs(r.slideShift) * 25, 0, 40));
    r.grain = 1.1;
    if (r.blank) r.ruined = true;
  }

  // Common post-development baths
  if (setup.process === 'bw' || setup.process === 'bwrev') {
    if (!get('stop')) note('Skipped the stop bath: water rinse instead. Development carried on a few seconds longer.', 0);
    const fix = get('fix');
    const clearing = FIXER.clearingFresh * (1 + 1.5 * clamp(fixerUses / FIXER.capacityRolls, 0, 1.2));
    if (!fix) {
      r.underfix = 1;
      note('Never fixed! The negatives are milky pink-purple and will darken in light.', 60);
    } else if (fix.seconds < clearing * 2) {
      r.underfix = clamp(1 - fix.seconds / (clearing * 2));
      note(`Under-fixed: ${Math.round(fix.seconds)} s against a clearing time of about ${Math.round(clearing)} s. Milky patches remain.`, r.underfix * 30);
    }
    if (fixerUses >= FIXER.capacityRolls) note('Your fixer is exhausted. Mix a fresh batch.', 5);
  }
  if (!get('wetting') && setup.process === 'bw') {
    r.dryingMarks = 0.5;
    note('No wetting agent: drying marks and water spots.', 6);
  }
  const wash = get('wash');
  if (!wash) note('Skipped the wash: residual fixer will stain the negatives over the years.', 8);
  r.fog += expiryFog;
  r.quality = Math.round(clamp(r.quality, 0, 100));
  return r;
}

/** Fixer clearing test: seconds for a leader snippet to go clear */
export function clearingTime(fixerUses: number): number {
  return FIXER.clearingFresh * (1 + 1.5 * clamp(fixerUses / FIXER.capacityRolls, 0, 1.2));
}

export function emptyLog(id: StepId, temp: number): StepLog {
  return { id, seconds: 0, tempAvg: temp, tempMin: temp, tempMax: temp, inversionsPerMinute: [], initialInversions: 0, skipped: false };
}

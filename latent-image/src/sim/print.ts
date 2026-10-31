/**
 * Enlarger printing model. A negative density D_neg at a pixel lets
 * 10^(−D_neg) of the enlarger light through. Paper log-exposure:
 *   logH = log10(t · aperture factor) − D_neg + K
 * Paper grade sets the log-exposure range that spans paper-white → Dmax.
 */
import { clamp } from './rng';

/** ISO log-exposure ranges for grades 0…5 (approx. Ilford Multigrade filters) */
export const GRADE_RANGE = [1.4, 1.2, 1.05, 0.9, 0.75, 0.6];

export const PAPER_DMAX = 2.05;
export const PAPER_DMIN = 0.06;

export interface PrintSettings {
  seconds: number;
  enlargerAperture: number; // f-number of the enlarging lens
  grade: number; // 0..5, half grades allowed
  /** paper developer time (s) */
  devSeconds: number;
  stop: boolean;
  fixSeconds: number;
  washSeconds: number;
  /** dodge/burn: seconds removed/added in the centre region */
  dodge?: number;
  burnEdges?: number;
  /** focus error 0 = sharp */
  focusError: number;
}

export function gradeRange(grade: number): number {
  const g = clamp(grade, 0, 5);
  const lo = Math.floor(g);
  const hi = Math.min(5, lo + 1);
  const t = g - lo;
  return GRADE_RANGE[lo] * (1 - t) + GRADE_RANGE[hi] * t;
}

/** Enlarger light factor relative to f/8 */
export function apertureFactor(n: number): number {
  return (8 * 8) / (n * n);
}

/** Paper "speed point" so that ~10 s at f/8 prints a normal negative's midtones */
export const PAPER_K = -0.5;

/**
 * Paper density for a log exposure. Logistic S-curve, Dmax reduced by short
 * development (paper starts showing an image after ~10 s and reaches full
 * density at ~60–90 s for RC paper).
 */
export function paperDensity(logH: number, grade: number, devSeconds: number): number {
  const range = gradeRange(grade);
  const devCompletion = clamp((devSeconds - 8) / 55, 0, 1);
  const dmax = PAPER_DMIN + (PAPER_DMAX - PAPER_DMIN) * Math.pow(devCompletion, 0.7);
  // speed point shifts with development (underdeveloped prints are lighter)
  const shift = (1 - devCompletion) * 0.35;
  const x = (logH - shift) / range;
  const s = 1 / (1 + Math.exp(-6 * (x - 0.5)));
  return PAPER_DMIN + (dmax - PAPER_DMIN) * s;
}

export function printLogH(negDensity: number, s: PrintSettings): number {
  return Math.log10(Math.max(0.01, s.seconds) * apertureFactor(s.enlargerAperture)) - negDensity - PAPER_K;
}

/** Test strip: n strips at increments of `step` seconds */
export function testStripTimes(start: number, step: number, n = 5): number[] {
  return Array.from({ length: n }, (_, i) => start + step * i);
}

export interface PrintEvaluation {
  score: number;
  notes: string[];
}

/**
 * Evaluate a print from its density histogram (values in density units).
 */
export function evaluatePrint(densities: Float32Array | number[], s: PrintSettings): PrintEvaluation {
  const n = densities.length;
  let blacks = 0;
  let whites = 0;
  let mids = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const d = densities[i];
    mean += d;
    if (d > PAPER_DMAX * 0.86) blacks++;
    if (d < 0.15) whites++;
    if (d > 0.4 && d < 1.4) mids++;
  }
  mean /= n;
  const notes: string[] = [];
  let score = 100;
  const bf = blacks / n;
  const wf = whites / n;
  if (bf < 0.003) {
    score -= 18;
    notes.push('No true blacks: the print looks grey and flat. Try a harder grade or longer development.');
  }
  if (wf < 0.002) {
    score -= 12;
    notes.push('No clean whites: highlights are muddy. Shorter exposure or harder grade.');
  }
  if (bf > 0.35) {
    score -= 20;
    notes.push('Large areas blocked to black: too much exposure or too hard a grade.');
  }
  if (wf > 0.4) {
    score -= 20;
    notes.push('Highlights blown to paper white: less exposure or a softer grade.');
  }
  if (mean > 1.45) {
    score -= 15;
    notes.push('The print is too dark overall.');
  } else if (mean < 0.35) {
    score -= 15;
    notes.push('The print is too light overall.');
  }
  if (mids / n < 0.25) {
    score -= 8;
    notes.push('Little midtone separation.');
  }
  if (s.devSeconds < 50) {
    score -= 15;
    notes.push('Pulled from the developer too early: weak, uneven blacks.');
  }
  if (!s.stop) notes.push('No stop bath; ok for a work print.');
  if (s.fixSeconds < 30) {
    score -= 20;
    notes.push('Barely fixed: the print will stain and darken.');
  }
  if (s.focusError > 0.25) {
    score -= Math.round(s.focusError * 20);
    notes.push('The enlarger was out of focus: use the grain focuser.');
  }
  if (!notes.length) notes.push('A rich, well balanced print.');
  return { score: Math.round(clamp(score, 0, 100)), notes };
}

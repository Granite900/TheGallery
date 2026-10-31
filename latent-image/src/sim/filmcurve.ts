/**
 * Characteristic-curve maths shared by the CPU (scan auto-exposure,
 * grading) and mirrored in the GLSL develop shader.
 *
 * x = log10 exposure relative to a correctly exposed mid-grey (0 = normal).
 */
export const LOG10_2 = 0.30103;

export function negDensity(x: number, gamma: number, latUnder: number, latOver: number): number {
  const s = 0.2;
  const xt = x + latUnder * LOG10_2 + 0.15;
  const dtoe = gamma * s * Math.log(1 + Math.exp(xt / s));
  const dmax = gamma * (latUnder + latOver + 2) * LOG10_2 + 0.3;
  return dmax * (1 - Math.exp(-dtoe / dmax));
}

/** Density of a correctly exposed mid grey for this stock/development */
export function midDensity(gamma: number, latUnder: number, latOver: number): number {
  return negDensity(0, gamma, latUnder, latOver);
}

/**
 * Lab scan / proof print constant K (log exposure offset). The lab's
 * auto-exposure corrects `auto` (0..1) of the frame's density error.
 */
export function scanK(frameErrStops: number, speedShift: number, gamma: number, latUnder: number, latOver: number, auto = 0.7): number {
  const dn = midDensity(gamma, latUnder, latOver);
  const df = negDensity((frameErrStops + speedShift) * LOG10_2, gamma, latUnder, latOver);
  const used = dn + auto * (df - dn);
  // mid-grey print density 0.75 on a grade-3 scan curve (range 0.88)
  return used + 0.88 * (0.5 + Math.log(0.35 / 0.65) / 6);
}

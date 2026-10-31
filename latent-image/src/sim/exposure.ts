/**
 * Exposure maths. EV = log2(N² / t). Scene brightness is expressed as the
 * EV a correct exposure needs at ISO 100 (EV100), so sunny-16 daylight is
 * EV100 ≈ 15, overcast ≈ 12, open shade ≈ 12–13, a lit room ≈ 7–8.
 */
import { clamp } from './rng';

export type Lighting = 'sun' | 'hazy' | 'overcast' | 'shade' | 'golden' | 'dusk' | 'window' | 'room';

export const LIGHTING_EV: Record<Lighting, number> = {
  sun: 15,
  hazy: 14,
  overcast: 12,
  shade: 12.5,
  golden: 12.5,
  dusk: 9.5,
  window: 9,
  room: 7.5,
};

export const LIGHTING_LABEL: Record<Lighting, string> = {
  sun: 'Bright sun',
  hazy: 'Hazy sun',
  overcast: 'Overcast',
  shade: 'Open shade',
  golden: 'Golden hour',
  dusk: 'Dusk',
  window: 'Window light',
  room: 'Lamp-lit room',
};

export function ev(aperture: number, time: number): number {
  return Math.log2((aperture * aperture) / time);
}

/** EV the camera has to be set to for a given scene at a given film speed */
export function requiredEV(sceneEV100: number, iso: number): number {
  return sceneEV100 + Math.log2(iso / 100);
}

/**
 * Exposure error in stops. Positive = overexposed (more light than needed).
 */
export function exposureError(sceneEV100: number, iso: number, aperture: number, time: number): number {
  return requiredEV(sceneEV100, iso) - ev(aperture, time);
}

/**
 * Schwarzschild reciprocity failure for long exposures (black & white).
 * Returns the effective exposure time. Tc = Tm^p → Teffective = Tm^(1/p).
 */
export function reciprocity(time: number, p = 1.31): number {
  if (time <= 1) return time;
  return Math.pow(time, 1 / p);
}

/**
 * Real shutter time of a unit. errSlow/errFast are stop errors applied to
 * speeds slower / faster than 1/60 (positive = shutter slower than marked,
 * which overexposes).
 */
export function actualShutter(marked: number, errSlow: number, errFast: number): number {
  const e = marked >= 1 / 60 ? errSlow : errFast;
  return marked * Math.pow(2, e);
}

/** Pick the marked speed closest to an exact time */
export function nearestSpeed(speeds: number[], t: number): number {
  let best = speeds[0];
  let bestD = Infinity;
  for (const s of speeds) {
    const d = Math.abs(Math.log2(s) - Math.log2(t));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * Reflected-light meter: reports which shutter time matches a given
 * aperture for the measured scene. meterOffset is the unit's error in
 * stops (positive → meter thinks the scene is brighter → underexposes).
 */
export function meterTime(measuredEV100: number, iso: number, aperture: number, meterOffset = 0): number {
  const evNeeded = requiredEV(measuredEV100 + meterOffset, iso);
  return (aperture * aperture) / Math.pow(2, evNeeded);
}

/**
 * Needle deflection for a match-needle meter, in stops (−2..+2):
 * positive = overexposure with current settings.
 */
export function meterNeedle(measuredEV100: number, iso: number, aperture: number, time: number, meterOffset = 0): number {
  return clamp(requiredEV(measuredEV100 + meterOffset, iso) - ev(aperture, time), -2.5, 2.5);
}

/**
 * Auto-exposure used by Trip 35 / Electro / Super 8. Chooses aperture
 * (and the coarse speed) from the meter. Returns null when the scene is too
 * dark (Trip 35 shows the red flag and locks the shutter).
 */
export function autoExpose(
  measuredEV100: number,
  iso: number,
  speeds: number[],
  apertures: number[],
  meterOffset = 0,
  allowRedFlag = true,
): { aperture: number; time: number; redFlag: boolean } {
  const needed = requiredEV(measuredEV100 + meterOffset, iso);
  const sorted = [...speeds].sort((a, b) => b - a); // slow → fast
  const maxA = Math.min(...apertures);
  const minA = Math.max(...apertures);
  // Prefer the fast speed once there is enough light (Trip 35 logic).
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i];
    const n = Math.sqrt(Math.pow(2, needed) * t);
    if (n >= maxA * 1.4 || i === 0) {
      const a = clamp(n, maxA, minA);
      const redFlag = allowRedFlag && n < maxA * 0.85 && i === 0;
      return { aperture: a, time: t, redFlag };
    }
  }
  return { aperture: maxA, time: sorted[0], redFlag: allowRedFlag };
}

/** Sunny 16 suggestion for the notebook: shutter ≈ 1/ISO at f/16 in sun. */
export function sunny16(lighting: Lighting, iso: number): { aperture: number; time: number } {
  const table: Record<Lighting, number> = {
    sun: 16,
    hazy: 11,
    overcast: 5.6,
    shade: 5.6,
    golden: 5.6,
    dusk: 2,
    window: 2,
    room: 1.4,
  };
  return { aperture: table[lighting], time: 1 / iso };
}

/** Hyperfocal distance (m), CoC in mm */
export function hyperfocal(focalMm: number, aperture: number, cocMm = 0.03): number {
  return (focalMm * focalMm) / (aperture * cocMm) / 1000 + focalMm / 1000;
}

/** Near/far limits of acceptable sharpness for focus distance s (m) */
export function depthOfField(focalMm: number, aperture: number, s: number, cocMm = 0.03): { near: number; far: number } {
  const H = hyperfocal(focalMm, aperture, cocMm);
  const f = focalMm / 1000;
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
  return { near, far };
}

/** Blur circle diameter on film (mm) for an object at distance d when focused at s. */
export function blurCircleMm(focalMm: number, aperture: number, s: number, d: number): number {
  const f = focalMm / 1000;
  const A = f / aperture;
  const c = (A * Math.abs(d - s) * f) / (d * Math.max(s - f, 1e-4));
  return c * 1000;
}

/** Handheld shake blur in stops-of-safety: >0 means risky (1/focal rule). */
export function shakeRisk(time: number, focalEquivMm: number, tripod: boolean): number {
  if (tripod) return -10;
  const safe = 1 / Math.max(focalEquivMm, 30);
  return Math.log2(time / safe);
}

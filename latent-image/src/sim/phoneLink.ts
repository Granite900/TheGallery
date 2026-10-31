/**
 * Phone companion protocol (shared by the desktop game and the Android app).
 *
 * The desktop (Electron) runs a small HTTP server on the local network. The
 * phone pairs by scanning a QR code with { url, token }. The phone pulls the
 * player's collection (owned cameras with their hidden unit traits, film in
 * the fridge) and later pushes finished rolls of *real photographs* with the
 * exposure each frame received. The desktop turns each photo into a latent
 * image and the roll waits in the darkroom like any other.
 */
import { camera, film, lens as lensModel, CameraModel, exposuresPerRoll } from './data';
import { CameraTraits } from './units';
import { actualShutter, autoExpose, exposureError, meterNeedle, reciprocity, Lighting, LIGHTING_EV } from './exposure';
import type { GameState } from './state';

export const PHONE_PORT = 47820;
export const PROTOCOL = 1;

export interface PairInfo {
  url: string;
  token: string;
  v: number;
}

export interface PhoneCamera {
  id: string;
  modelId: string;
  variantId: string;
  serial: string;
  traits: CameraTraits;
  /** lens currently on the body */
  lensModelId?: string;
  lensHaze: number;
  lensOily: boolean;
}

export interface PhoneCollection {
  v: number;
  cameras: PhoneCamera[];
  fridge: Record<string, number>;
  expired: { stockId: string; expiredYears: number; count: number }[];
  rollLength: number;
  assist: string;
  day: number;
}

export interface PhoneFrameMeta {
  aperture: number;
  marked: number;
  /** real time the (faulty) shutter stayed open */
  actual: number;
  focus: number;
  focal: number;
  /** scene brightness as EV100 */
  sceneEV: number;
  /** where sceneEV came from */
  evSource: 'camera' | 'manual';
  lighting?: Lighting;
  /** exposure error in stops relative to the roll's EI */
  error: number;
  usedMeter: boolean;
  takenAt: number;
}

export interface PhoneShot {
  idx: number;
  meta: PhoneFrameMeta;
  /** JPEG, already cropped to the film format and lens field of view */
  jpeg: string; // base64 (no data: prefix)
}

export interface PhoneRoll {
  id: string;
  unitId: string;
  stockId: string;
  ei: number;
  capacity: number;
  expiredYears: number;
  shots: PhoneShot[];
}

export function buildCollection(s: GameState): PhoneCollection {
  return {
    v: PROTOCOL,
    cameras: s.cameras
      .filter((c) => !c.clientJob && camera(c.modelId).kind !== 'super8')
      .map((c) => {
        const l = s.lenses.find((x) => x.id === c.lensId);
        return {
          id: c.id,
          modelId: c.modelId,
          variantId: c.variantId,
          serial: c.serial,
          traits: c.traits,
          lensModelId: camera(c.modelId).mount === 'fixed' ? camera(c.modelId).fixedLens : l?.modelId,
          lensHaze: Math.max(c.traits.haze, l?.haze ?? 0),
          lensOily: !!l?.oilyBlades,
        };
      }),
    fridge: { ...s.fridge },
    expired: s.expiredFilm.map((e) => ({ ...e })),
    rollLength: s.settings.rollLength,
    assist: s.assist,
    day: s.day,
  };
}

/**
 * Scene EV100 from the phone camera's own auto-exposure:
 * EV100 = log2(N² / t) − log2(ISO / 100).
 */
export function sceneEVFromPhone(exposureSeconds: number, iso: number, phoneAperture = 1.8): number {
  return Math.log2((phoneAperture * phoneAperture) / exposureSeconds) - Math.log2(iso / 100);
}

export function sceneEVFromLighting(l: Lighting): number {
  return LIGHTING_EV[l];
}

export interface ExposureResult {
  aperture: number;
  marked: number;
  actual: number;
  error: number;
  usedMeter: boolean;
  redFlag: boolean;
  needle: number;
}

/**
 * Work out what the emulated camera actually did for a real scene. Uses the
 * unit's hidden traits (shutter errors, meter offset / dead meter).
 */
export function emulateExposure(cam: PhoneCamera, sceneEV: number, ei: number, aperture: number, speed: number): ExposureResult {
  const m: CameraModel = camera(cam.modelId);
  const t = cam.traits;
  const lens = cam.lensModelId ? lensModel(cam.lensModelId) : undefined;
  const meterOffset = t.meterDead ? 4 : t.meterOffset;
  let N = aperture;
  let marked = speed;
  let usedMeter = false;
  let redFlag = false;
  if (m.autoExposure) {
    const aps = lens ? [lens.maxAperture, 2.8, 4, 5.6, 8, 11, 16, 22].filter((a) => a >= lens.maxAperture && a <= lens.minAperture) : [8];
    const a = autoExpose(sceneEV, ei, m.speeds, aps, meterOffset, m.id === 'trip35');
    N = a.aperture;
    marked = a.time;
    usedMeter = true;
    redFlag = a.redFlag;
  }
  const actual = reciprocity(actualShutter(marked, t.shutterSlow, t.shutterFast));
  const error = exposureError(sceneEV, ei, N, actual);
  const needle = m.meter === 'none' || m.meter === 'selenium' ? 0 : t.meterDead ? -2.5 : meterNeedle(sceneEV, ei, N, marked, meterOffset);
  return { aperture: N, marked, actual, error, usedMeter, redFlag, needle };
}

/** Phone main cameras are ~26mm equivalent; longer focal lengths crop in. */
export const PHONE_FOCAL_35 = 26;

export function cropFor(modelId: string, focal: number): { zoom: number; aspect: number; mirror: boolean } {
  const m = camera(modelId);
  const fmt = m.format;
  const diag = fmt === '120' ? Math.hypot(56, 56) : Math.hypot(36, 24);
  const eq35 = (focal * 43.27) / diag;
  return { zoom: Math.max(1, eq35 / PHONE_FOCAL_35), aspect: fmt === '120' ? 1 : 1.5, mirror: m.kind === 'tlr' };
}

export function capacityFor(modelId: string, rollLength: number): number {
  return exposuresPerRoll(camera(modelId).format, rollLength);
}

export function stocksFor(modelId: string, c: PhoneCollection): { stockId: string; count: number; expiredYears: number }[] {
  const fmt = camera(modelId).format;
  const out: { stockId: string; count: number; expiredYears: number }[] = [];
  for (const [id, n] of Object.entries(c.fridge)) if (n > 0 && film(id).formats.includes(fmt) && film(id).process !== 'bwrev') out.push({ stockId: id, count: n, expiredYears: 0 });
  for (const e of c.expired) if (e.count > 0 && film(e.stockId).formats.includes(fmt)) out.push({ stockId: e.stockId, count: e.count, expiredYears: e.expiredYears });
  return out;
}

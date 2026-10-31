import { describe, expect, it } from 'vitest';
import { sceneEVFromPhone, emulateExposure, buildCollection, cropFor, PhoneCamera } from '../src/sim/phoneLink';
import { newGame } from '../src/sim/state';
import { makeUnit } from '../src/sim/units';

const perfect = (modelId: string): PhoneCamera => {
  const u = makeUnit(modelId, 5, 1);
  u.traits = { ...u.traits, shutterSlow: 0, shutterFast: 0, meterOffset: 0, meterDead: false, capping: 0, seals: 1, haze: 0, fungus: 0, rfError: 0 };
  return { id: u.id, modelId, variantId: u.variantId, serial: u.serial, traits: u.traits, lensModelId: modelId === 'ql17' ? 'canon40' : 'zuiko40', lensHaze: 0, lensOily: false };
};

describe('phone link', () => {
  it('derives scene EV from the phone camera exposure', () => {
    // sunny day: f/1.8, 1/4000 s, ISO 50 → EV100 ≈ 14.6
    expect(sceneEVFromPhone(1 / 4000, 50, 1.8)).toBeCloseTo(14.6, 0);
    // dim room: f/1.8, 1/30 s, ISO 800 → EV100 ≈ 3.6
    expect(sceneEVFromPhone(1 / 30, 800, 1.8)).toBeLessThan(5);
  });
  it('manual settings give a matching exposure error', () => {
    const r = emulateExposure(perfect('ql17'), 15, 400, 16, 1 / 500);
    expect(Math.abs(r.error)).toBeLessThan(0.5);
    const under = emulateExposure(perfect('ql17'), 12, 400, 16, 1 / 500);
    expect(under.error).toBeLessThan(-2);
  });
  it('a slow shutter overexposes real photos', () => {
    const c = perfect('ql17');
    c.traits = { ...c.traits, shutterSlow: 1.5 };
    expect(emulateExposure(c, 12, 400, 8, 1 / 60).error).toBeGreaterThan(1);
  });
  it('the Trip 35 auto-exposes and red-flags in the dark', () => {
    expect(emulateExposure(perfect('trip35'), 15, 400, 8, 1 / 125).usedMeter).toBe(true);
    expect(emulateExposure(perfect('trip35'), 4, 100, 8, 1 / 125).redFlag).toBe(true);
  });
  it('collection lists owned cameras only', () => {
    const s = newGame();
    const client = makeUnit('electro35', 1, 0.5);
    client.clientJob = 'x';
    s.cameras.push(client);
    const c = buildCollection(s);
    expect(c.cameras.length).toBe(1);
    expect(c.cameras[0].modelId).toBe('trip35');
  });
  it('longer lenses crop the phone image; TLR is square and mirrored', () => {
    expect(cropFor('k1000', 135).zoom).toBeGreaterThan(4);
    expect(cropFor('mat124g', 80)).toMatchObject({ aspect: 1, mirror: true });
  });
});

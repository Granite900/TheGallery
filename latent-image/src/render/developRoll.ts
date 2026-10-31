import type { Game } from '../app/Game';
import { FilmLab, DevelopParams } from './filmLook';
import { film, frameSize } from '../sim/data';
import { DevResult } from '../sim/develop';
import { Roll } from '../sim/state';
import { makeRng, hashString } from '../sim/rng';
import { scanK } from '../sim/filmcurve';

/** Run the GPU develop pass for every frame of a roll and store negative / positive / density images. */
export async function developRollFrames(game: Game, lab: FilmLab, r: Roll, res: DevResult, onProgress: (i: number, n: number) => void): Promise<void> {
    const f = film(r.stockId);
    const proc = f.process;
    const [fw, fh] = frameSize(r.format);
    const w = r.format === '120' ? 900 : r.format === 'super8' ? 320 : 1080;
    const hgt = r.format === '120' ? 900 : r.format === 'super8' ? 222 : 720;
    const push = Math.log2(r.ei / f.iso);
    const rng = makeRng(hashString(r.id));
    const kinkFrames = new Set<number>();
    for (let k = 0; k < res.kinks; k++) kinkFrames.add(Math.floor(rng() * r.frames.length));
    for (let i = 0; i < r.frames.length; i++) {
      const fr = r.frames[i];
      onProgress(i + 1, r.frames.length);
      const latentErr = fr.meta.error - push;
      const kBase = scanK(latentErr, res.speedShift, res.gamma, f.latUnder, f.latOver);
      const backFog = r.openedBackFrames && i >= r.frames.length - r.openedBackFrames ? 1.2 : 0;
      const p: DevelopParams = {
        process: (proc === 'bw' ? 0 : proc === 'c41' ? 1 : proc === 'e6' ? 2 : 3) as 0,
        gamma: proc === 'e6' || proc === 'bwrev' ? res.gamma : res.gamma,
        crossover: res.crossover,
        latUnder: f.latUnder,
        latOver: f.latOver,
        speedShift: res.speedShift,
        baseFog: f.baseFog * 0.3,
        fog: res.fog,
        grain: (0.05 + f.grain * 0.11) * res.grain * (r.format === '120' ? 0.6 : r.format === 'super8' ? 1.6 : 1) * (1 + Math.max(0, push) * 0.25),
        grainScale: r.format === 'super8' ? 1 : 1.25,
        uneven: res.uneven,
        surge: res.surge,
        underfix: res.underfix,
        drying: res.dryingMarks,
        dust: res.dust + (res.dryingMarks > 0 ? 0.3 : 0),
        lightFog: res.lightFog,
        backFog,
        kink: kinkFrames.has(i) ? 1 : 0,
        kinkPos: [0.2 + rng() * 0.6, 0.15 + rng() * 0.7],
        seed: rng() * 100,
        scanK: proc === 'c41' ? [kBase + 0.22, kBase + 0.48, kBase + 0.78] : [kBase, kBase, kBase],
        palette: f.palette ?? [1, 1, 1],
        saturation: (f.saturation ?? 1) * (r.expiredYears > 0 ? 0.8 : 1),
        slideShift: res.slideShift,
        reversed: res.reversed,
        blank: res.blank || (res.ruined && res.lightFog < 0.9),
        halation: f.color ? 0.8 : 0.15,
        colorShift: f.color ? r.expiredYears * 0.06 : 0,
      };
      if (res.lightFog >= 0.9) {
        p.lightFog = 3;
      }
      if (r.format === 'super8') {
        const n = fr.meta.frameCount ?? 0;
        for (let k = 0; k < n; k++) {
          const lb = await game.images.get(`${fr.key}-${k}`);
          if (!lb) continue;
          const out = await lab.develop(game.engine, lb, w, hgt, { ...p, seed: k * 0.37 + 3 });
          await game.images.put(`${fr.key}-${k}-pos`, out.pos);
          if (k === Math.floor(n / 2)) {
            await game.images.put(`${fr.key}-neg`, out.neg);
            await game.images.put(`${fr.key}-posthumb`, out.pos);
          }
        }
        fr.negKey = `${fr.key}-neg`;
        fr.posKey = `${fr.key}-posthumb`;
        continue;
      }
      const lb = await game.images.get(fr.key);
      if (!lb) continue;
      const out = await lab.develop(game.engine, lb, w, hgt, p);
      fr.negKey = `${fr.key}-neg`;
      fr.posKey = `${fr.key}-pos`;
      await game.images.put(fr.negKey, out.neg);
      await game.images.put(fr.posKey, out.pos);
      await game.images.put(`${fr.key}-dens`, out.dens);
      void fw;
      void fh;
    }
  }

/**
 * Debug helpers (only attached with ?debug or in dev): develop exposed rolls
 * with a by-the-book process so the film pipeline can be checked quickly.
 */
import type { Game } from './Game';
import { FilmLab } from '../render/filmLook';
import { developRollFrames } from '../render/developRoll';
import { emptyLog, evaluateDevelopment, recipe, DevSetup, StepLog } from '../sim/develop';
import { film } from '../sim/data';

export async function debugDevelopAll(game: Game): Promise<string[]> {
  const s = game.state;
  const lab = new FilmLab(game.engine);
  const out: string[] = [];
  for (const r of s.rolls.filter((x) => (x.state === 'exposed' || x.state === 'loaded') && x.frames.length)) {
    const f = film(r.stockId);
    const setup: DevSetup = { stockId: r.stockId, process: f.process, developerId: f.process === 'bw' ? 'd76' : f.process, dilution: f.process === 'bw' ? 'stock' : 'kit', ei: r.ei, expiredYears: r.expiredYears, unknown: r.unknownStock };
    const steps = recipe(setup, 20);
    const logs: StepLog[] = steps.slice(1).filter((st) => st.id !== 'dry').map((st) => {
      const l = emptyLog(st.id, st.temp);
      l.seconds = st.seconds;
      l.initialInversions = 6;
      l.inversionsPerMinute = Array.from({ length: Math.ceil(st.seconds / 60) }, () => 4);
      return l;
    });
    const res = evaluateDevelopment(setup, steps, logs, { lightFog: 0, kinks: 0, openedBackFrames: 0 }, s.chem.fixerUses);
    await developRollFrames(game, lab, r, res, () => undefined);
    r.dev = res;
    r.devSetup = setup;
    r.state = 'developed';
    out.push(`${r.id}: ${res.quality} ${res.notes.join(' ')}`);
  }
  lab.dispose();
  game.save();
  return out;
}

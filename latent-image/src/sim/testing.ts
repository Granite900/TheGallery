/**
 * Test-roll evaluation. A defect is only "provable" if the roll actually
 * contains a frame that shows it (a leak shows on any frame, capping only
 * at the fastest speeds, a slow-speed error only on slow-speed frames…).
 * The player is scored on frames they could have seen.
 */
import { camera } from './data';
import { CameraUnit, DefectId, TestReport, trueDefects, trueGrade, defectsFor } from './units';

export interface FrameEvidence {
  marked: number;
  aperture: number;
  /** distance focused vs subject (m) */
  focusDist: number;
  subjectDist: number;
  /** used the meter's suggestion */
  usedMeter: boolean;
  /** frame metered with handheld/sunny-16 (independent of the camera meter) */
  independentExposure: boolean;
}

export function provableDefects(unit: CameraUnit, frames: FrameEvidence[]): DefectId[] {
  const truth = trueDefects(unit);
  const m = camera(unit.modelId);
  const fastest = Math.min(...m.speeds);
  return truth.filter((d) => {
    switch (d) {
      case 'leaks':
      case 'haze':
      case 'fungus':
        return frames.length > 0;
      case 'slowShutter':
        return frames.some((f) => f.marked >= 1 / 60 && f.independentExposure);
      case 'fastShutter':
        return frames.some((f) => f.marked <= 1 / 250 && f.independentExposure);
      case 'capping':
        return frames.some((f) => f.marked <= fastest * 2.01);
      case 'meter':
        return frames.some((f) => f.usedMeter);
      case 'rangefinder':
        return frames.some((f) => f.subjectDist < 3 && f.aperture <= 4);
    }
  });
}

/** Suggested test sequence printed in the notebook */
export function testPlan(modelId: string): string[] {
  const m = camera(modelId);
  const plan: string[] = ['Any frame shows light leaks: look along the frame edges and between frames for orange/grey streaks.'];
  if (!m.autoExposure) {
    plan.push('Shoot one frame at a slow speed (1/30 or slower) and one at 1/500, exposed by sunny-16 rather than the camera meter. Compare their density.');
  }
  if (m.shutter === 'focalplane') plan.push(`Shoot at the fastest speed (${m.speeds.length ? '1/' + Math.round(1 / Math.min(...m.speeds)) : ''}). A dark band at one side = capping.`);
  if (m.meter !== 'none') plan.push('Shoot a frame using the camera meter. If it is a stop or more off, the meter is lying.');
  if (m.focus === 'rangefinder') plan.push('Focus on something 1–2 m away wide open (f/2.8 or wider). A soft subject with a sharp background means the rangefinder is out.');
  plan.push('Haze shows as low contrast and glowing highlights. Shoot into the light once.');
  return plan;
}

export interface ReportScore {
  accuracy: number;
  correct: DefectId[];
  missed: DefectId[];
  wrong: DefectId[];
  gradeCorrect: boolean;
  truthGrade: TestReport['grade'];
  rep: number;
}

export function scoreReport(unit: CameraUnit, frames: FrameEvidence[], claimed: DefectId[], grade: TestReport['grade']): ReportScore {
  const provable = provableDefects(unit, frames);
  const truth = trueDefects(unit);
  const candidates = defectsFor(unit.modelId);
  const correct = claimed.filter((d) => truth.includes(d));
  // Missing a defect the roll couldn't show is not penalised.
  const missed = provable.filter((d) => !claimed.includes(d));
  const wrong = claimed.filter((d) => !truth.includes(d));
  const truthGrade = trueGrade(unit);
  const gradeCorrect = truthGrade === grade;
  let score = 0;
  let total = 0;
  for (const d of candidates) {
    total++;
    const isTrue = truth.includes(d);
    const said = claimed.includes(d);
    if (isTrue === said) score++;
    else if (isTrue && !said && !provable.includes(d)) score += 0.6; // couldn't have known
  }
  const defectAcc = total ? score / total : 1;
  const accuracy = Math.round((defectAcc * 0.75 + (gradeCorrect ? 0.25 : 0)) * 100);
  const rep = Math.round((accuracy - 50) / 5);
  return { accuracy, correct, missed, wrong, gradeCorrect, truthGrade, rep };
}

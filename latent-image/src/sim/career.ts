/**
 * Career: chapters, objectives and photo assignments. Objectives are pure
 * predicates over the GameState so progress can be re-derived at any time.
 */
import { camera, film, Process } from './data';
import { Lighting } from './exposure';
import { FrameRecord, GameState, Roll, hasFlag } from './state';
import { clamp } from './rng';

export interface Objective {
  id: string;
  text: string;
  hint: string;
  check: (s: GameState) => boolean;
}

export interface Chapter {
  title: string;
  subtitle: string;
  letter: { from: string; title: string; body: string };
  objectives: Objective[];
  reward: number;
  rep: number;
  /** venue unlocked for market trips */
  venue?: 'flea' | 'estate';
}

export interface AssignmentDef {
  id: string;
  chapter: number;
  client: string;
  title: string;
  brief: string;
  reward: number;
  rep: number;
  req: {
    location?: string;
    subject?: string;
    lighting?: Lighting[];
    maxError?: number;
    sharp?: boolean;
    process?: Process[];
    minFocal?: number;
    maxFocal?: number;
    maxAperture?: number;
    minCoverage?: number;
    minEI?: number;
    bgBlur?: number;
    format?: string;
  };
}

const rollsOf = (s: GameState, pred: (r: Roll) => boolean) => s.rolls.filter(pred);
const framesOf = (s: GameState) => s.rolls.flatMap((r) => r.frames.map((f) => ({ r, f })));
const devOK = (r: Roll) => r.state === 'developed' && !r.dev?.ruined;
const ownsKind = (s: GameState, kind: string) => s.cameras.some((c) => camera(c.modelId).kind === kind && !c.clientJob);
const assignmentDone = (s: GameState, id: string) => s.assignments.some((a) => a.id === id && a.done);

export const ASSIGNMENTS: AssignmentDef[] = [
  {
    id: 'a-clock-dusk',
    chapter: 2,
    client: 'Field Test magazine',
    title: 'The clock tower at dusk',
    brief: 'For our "Light After Work" page: the harbour clock tower against the evening sky. Correctly exposed (within a stop), tack sharp. Black & white.',
    reward: 140,
    rep: 6,
    req: { subject: 'clocktower', lighting: ['dusk'], maxError: 1, sharp: true, process: ['bw'], minCoverage: 0.04 },
  },
  {
    id: 'a-portrait-push',
    chapter: 3,
    client: 'Marguerite Hat Atelier',
    title: 'The hat, by window light',
    brief: 'Our new cloche on the milliner\'s head upstairs: no flash, it has to be the soft north light. Push your film to at least EI 1600, keep the hat sharp and fill the frame.',
    reward: 180,
    rep: 6,
    req: { subject: 'hat', minEI: 1600, maxError: 1.5, sharp: true, minCoverage: 0.12, process: ['bw'] },
  },
  {
    id: 'a-lighthouse-wide',
    chapter: 5,
    client: 'Harbour Trust',
    title: 'The whole lighthouse',
    brief: 'For the restoration fund poster we need the lighthouse, top to bottom, from the quay. A wide lens: 28mm or wider.',
    reward: 160,
    rep: 5,
    req: { subject: 'lighthouse', maxFocal: 28, maxError: 1.5, sharp: true, minCoverage: 0.05 },
  },
  {
    id: 'a-portrait-tele',
    chapter: 5,
    client: 'Marguerite Hat Atelier',
    title: 'Hat with a melted background',
    brief: 'A tighter portrait for the window display. 85mm or longer, at f/2.8 or wider so the background melts away. Hat sharp.',
    reward: 200,
    rep: 6,
    req: { subject: 'hat', minFocal: 85, maxAperture: 2.8, sharp: true, minCoverage: 0.12, maxError: 1.5, bgBlur: 0.01 },
  },
  {
    id: 'a-macro',
    chapter: 5,
    client: 'Alder Park Society',
    title: 'Tulips, close up',
    brief: 'For the seed catalogue: one tulip, filling the frame. Macro lens please.',
    reward: 170,
    rep: 5,
    req: { subject: 'tulip', minCoverage: 0.3, sharp: true, maxError: 1.5 },
  },
  {
    id: 'a-colour-golden',
    chapter: 6,
    client: 'Field Test magazine',
    title: 'Golden hour, in colour',
    brief: 'Cover shot: the boats at golden hour on colour negative. Warm, correctly exposed, sharp.',
    reward: 260,
    rep: 8,
    req: { subject: 'boat', lighting: ['golden'], process: ['c41'], maxError: 1.5, sharp: true, minCoverage: 0.04 },
  },
  {
    id: 'a-slide-park',
    chapter: 6,
    client: 'Alder Park Society',
    title: 'The fountain on slide film',
    brief: 'We project slides at our annual meeting. The fountain on E-6 film, exposed within half a stop: slide film forgives nothing.',
    reward: 240,
    rep: 8,
    req: { subject: 'fountain', process: ['e6'], maxError: 0.6, sharp: true, minCoverage: 0.04 },
  },
];

export function assignmentDef(id: string): AssignmentDef | undefined {
  return ASSIGNMENTS.find((a) => a.id === id);
}

export interface FrameGrade {
  pass: boolean;
  stars: number;
  critique: string[];
}

export function gradeFrame(def: AssignmentDef, f: FrameRecord, roll: Roll): FrameGrade {
  const m = f.meta;
  const q = def.req;
  const crit: string[] = [];
  let pass = true;
  let stars = 5;
  const stock = film(roll.stockId);
  const fail = (s: string) => {
    pass = false;
    crit.push(s);
  };
  if (roll.dev?.ruined) fail('There is no usable image on this frame.');
  if (q.subject && m.subject !== q.subject) fail(`We asked for the ${subjectName(q.subject)}. This frame is ${m.subject ? 'of the ' + subjectName(m.subject) : 'of something else'}.`);
  if (q.lighting && !q.lighting.includes(m.lighting)) fail(`Wrong light. The brief needs ${q.lighting.join(' or ')}.`);
  if (q.process && !q.process.includes(stock.process)) fail(`Wrong film type: needs ${q.process.map(processName).join(' / ')}.`);
  if (q.minEI && roll.ei < q.minEI) fail(`Shot at EI ${roll.ei}; the brief asked for EI ${q.minEI} or more.`);
  if (q.maxFocal && m.focal > q.maxFocal + 0.5) fail(`A ${m.focal}mm lens is too long. Needs ${q.maxFocal}mm or wider.`);
  if (q.minFocal && m.focal < q.minFocal - 0.5) fail(`A ${m.focal}mm lens is too short. Needs ${q.minFocal}mm or longer.`);
  if (q.maxAperture && m.aperture > q.maxAperture + 0.05) fail(`Shot at f/${m.aperture}; needs f/${q.maxAperture} or wider.`);
  if (q.minCoverage && m.coverage < q.minCoverage) fail('The subject is too small in the frame. Get closer.');
  const errLimit = q.maxError ?? 2;
  // shot at EI; pushed film needs matching development to come out right
  const push = Math.log2(roll.ei / stock.iso);
  let eff = m.error;
  if (push > 0.1 && roll.dev) eff = m.error - push + Math.min(push, Math.max(0, Math.log2(Math.max(roll.dev.devDegree, 0.1)) / Math.log2(1.4)));
  const err = Math.abs(eff);
  if (err > errLimit) fail(`Exposure is ${err.toFixed(1)} stops ${eff > 0 ? 'over' : 'under'}${push > 0.1 && eff < 0 ? ' (was the push development long enough?)' : ''}.`);
  else stars -= clamp(Math.round(err * 1.5), 0, 2);
  if (q.sharp && !m.inFocus) fail('The subject is out of focus.');
  if (q.sharp && m.shake > 0.6) fail('Camera shake blurred the frame. Use a faster speed or a tripod.');
  if (q.bgBlur && m.backgroundBlur < q.bgBlur) {
    stars -= 1;
    crit.push('The background could be softer. Open up or get closer.');
  }
  if (roll.dev) {
    if (roll.dev.quality < 60) {
      stars -= 1;
      crit.push('Processing flaws are visible on the negative.');
    }
    if (roll.dev.underfix > 0.3 || roll.dev.lightFog > 0.1) stars -= 1;
  }
  if (m.coverage > (q.minCoverage ?? 0) * 3 && pass) crit.push('Strong, confident framing.');
  if (pass && err < 0.4) crit.push('Exposure is spot on.');
  stars = pass ? clamp(stars, 1, 5) : 0;
  return { pass, stars, critique: crit };
}

export function subjectName(id: string): string {
  return (
    {
      clocktower: 'clock tower',
      lighthouse: 'lighthouse',
      boat: 'fishing boats',
      hat: 'cloche hat',
      tulip: 'tulips',
      fountain: 'fountain',
      bandstand: 'bandstand',
      gull: 'gulls',
      chart: 'test chart',
      bench: 'bench',
    } as Record<string, string>
  )[id] ?? id;
}

export function processName(p: Process): string {
  return { bw: 'black & white negative', c41: 'C-41 colour negative', e6: 'E-6 slide', bwrev: 'B&W reversal' }[p];
}

export const CHAPTERS: Chapter[] = [
  {
    title: 'First Roll',
    subtitle: 'Chapter one',
    letter: {
      from: 'Ruth',
      title: 'The key is under the geranium',
      body:
        'If you are reading this, the flat and everything in it is yours: the darkroom, the cabinet, the cameras. Don\'t let anyone tell you the Trip is a toy; it took half the pictures in the hall. There are two rolls of HP5 in the fridge. Load one, go down to the harbour on a bright day and just shoot. Then come back and develop it. The datasheet is pinned by the sink. You\'ll be fine. Love, R.',
    },
    objectives: [
      { id: 'c1-load', text: 'Load HP5 Plus into the Olympus Trip 35', hint: 'Desk → pick up the Trip → Load film.', check: (s) => s.rolls.some((r) => r.stockId === 'hp5') },
      { id: 'c1-shoot', text: 'Shoot 6 frames at the harbour', hint: 'Go out the door → The Harbour. Right-click or F to raise the camera, click to shoot, R to advance.', check: (s) => rollsOf(s, (r) => r.frames.filter((f) => f.meta.location === 'harbour').length >= 6).length > 0 },
      { id: 'c1-dev', text: 'Develop the roll in the darkroom', hint: 'Rewind and unload at the desk, then the darkroom door.', check: (s) => rollsOf(s, devOK).length > 0 },
      { id: 'c1-star', text: 'Pick your favourite frame on the light table', hint: 'Light table → click a frame → Star.', check: (s) => framesOf(s).some(({ f }) => f.starred) },
    ],
    reward: 150,
    rep: 5,
  },
  {
    title: 'Market Day',
    subtitle: 'Chapter two',
    letter: {
      from: 'Field Test magazine',
      title: 'Your aunt wrote for us',
      body:
        'Ruth tested cameras for our "Field Test" column for twenty years. Honest reports that buyers could trust. We\'d like to try you. The Saturday market on the square always has a few rangefinders. Buy one (look it over properly first), put a test roll through it, and send us a report. Is it working, quirky or faulty? We pay for accurate reports. — D. Mensah, editor',
    },
    objectives: [
      { id: 'c2-market', text: 'Visit the Saturday flea market', hint: 'Out the door → Market.', check: (s) => hasFlag(s, 'visited-market') },
      { id: 'c2-buy', text: 'Buy a rangefinder', hint: 'Inspect before you buy: open the back, check the lens with the torch, fire the shutter.', check: (s) => ownsKind(s, 'rangefinder') },
      { id: 'c2-test', text: 'Shoot a test roll with it (6+ frames)', hint: 'The notebook has a suggested test sequence.', check: (s) => s.rolls.some((r) => r.frames.length >= 6 && camera(s.cameras.find((c) => c.id === r.unitId)?.modelId ?? 'trip35').kind === 'rangefinder') },
      { id: 'c2-dev', text: 'Develop the test roll', hint: '', check: (s) => s.rolls.some((r) => devOK(r) && camera(s.cameras.find((c) => c.id === r.unitId)?.modelId ?? 'trip35').kind === 'rangefinder') },
      { id: 'c2-report', text: 'File a test report from the light table', hint: 'Light table → Test report.', check: (s) => s.cameras.some((c) => c.report && camera(c.modelId).kind === 'rangefinder') },
    ],
    reward: 120,
    rep: 6,
    venue: 'flea',
  },
  {
    title: 'Reading Light',
    subtitle: 'Chapter three',
    letter: {
      from: 'Field Test magazine',
      title: 'An assignment, and a client',
      body:
        'Good report. Two things. First, we need the clock tower at dusk for the next issue. Ruth\'s handheld meter (a Sekonic L-398) should be in her desk drawer; light gets tricky after sunset. Second, a reader, Mrs. Adeyemi, wants her late husband\'s Yashica Electro tested before she sells it. I\'ve sent it over. Test it, report, and we\'ll return it to her.',
    },
    objectives: [
      { id: 'c3-clock', text: 'Assignment: the clock tower at dusk', hint: 'Harbour at dusk. Meter, tripod or brace yourself, focus carefully.', check: (s) => assignmentDone(s, 'a-clock-dusk') },
      { id: 'c3-client', text: 'Test and report on Mrs. Adeyemi\'s Electro 35', hint: 'It is in the cabinet with a client tag.', check: (s) => s.cameras.some((c) => c.clientJob === 'adeyemi' && c.report) || hasFlag(s, 'adeyemi-returned') },
    ],
    reward: 160,
    rep: 6,
    venue: 'flea',
  },
  {
    title: 'Found Film',
    subtitle: 'Chapter four',
    letter: {
      from: 'Pell & Daughters, auctioneers',
      title: 'Estate sale: 14 Rope Walk',
      body:
        'Contents of the late Mr. A. Hollis, harbourmaster: furniture, books, a quantity of photographic equipment. Viewing from 9. Cash only. (Handwritten in the margin, in Ruth\'s writing on an old copy pinned to the board: "Arthur\'s TLR. Ask about the roll.")',
    },
    objectives: [
      { id: 'c4-buy', text: 'Buy Arthur Hollis\'s Yashica-D at the estate sale', hint: 'Check the frame counter. There may be film inside.', check: (s) => s.cameras.some((c) => c.modelId === 'yashicad' && (c.foundRoll || hasFlag(s, 'found-roll-taken'))) },
      { id: 'c4-found', text: 'Develop the roll found inside', hint: 'Unknown, expired film: what does Ruth\'s notebook say about stand development?', check: (s) => s.rolls.some((r) => r.found && r.state === 'developed') },
      { id: 'c4-portrait', text: 'Assignment: the hat, by window light (push to EI 1600)', hint: 'Set EI 1600 when loading, and add the push time when developing.', check: (s) => assignmentDone(s, 'a-portrait-push') },
    ],
    reward: 200,
    rep: 8,
    venue: 'estate',
  },
  {
    title: 'Paper',
    subtitle: 'Chapter five',
    letter: {
      from: 'The Harbour Café',
      title: 'Would you hang a show?',
      body:
        'Your aunt used to hang prints on our back wall every autumn. People still ask about them. Three prints, your choice, by the end of the month? We\'ll take 30% of anything that sells. — Inês',
    },
    objectives: [
      { id: 'c5-strip', text: 'Make a test strip on the enlarger', hint: 'Darkroom → Enlarger → Test strip.', check: (s) => s.prints.some((p) => p.testStrip) },
      { id: 'c5-prints', text: 'Make three good prints (score 60+)', hint: 'Use the test strip to choose the time; pick a grade that gives real blacks and clean whites.', check: (s) => s.prints.filter((p) => !p.testStrip && p.score >= 60).length >= 3 },
      { id: 'c5-show', text: 'Hang the show at the Harbour Café', hint: 'Light table → Prints → Hang show.', check: (s) => hasFlag(s, 'show-hung') },
    ],
    reward: 250,
    rep: 10,
    venue: 'flea',
  },
  {
    title: 'Glass',
    subtitle: 'Chapter six',
    letter: {
      from: 'Field Test magazine',
      title: 'Lens week',
      body:
        'Readers want lenses. Get yourself an SLR (the market has had a K1000, an AE-1 and a Spotmatic lately) and some glass. Three jobs on the board: a wide lighthouse, a long portrait, a macro tulip. Bonus points if you find a Helios and tell us whether the swirl is worth the fuss.',
    },
    objectives: [
      { id: 'c6-slr', text: 'Own an SLR', hint: 'Market.', check: (s) => ownsKind(s, 'slr') },
      { id: 'c6-wide', text: 'Assignment: the whole lighthouse (≤28mm)', hint: '', check: (s) => assignmentDone(s, 'a-lighthouse-wide') },
      { id: 'c6-tele', text: 'Assignment: hat with a melted background (≥85mm, ≤f/2.8)', hint: '', check: (s) => assignmentDone(s, 'a-portrait-tele') },
      { id: 'c6-macro', text: 'Assignment: tulips, close up', hint: 'A macro lens focuses much closer.', check: (s) => assignmentDone(s, 'a-macro') },
    ],
    reward: 300,
    rep: 10,
    venue: 'flea',
  },
  {
    title: 'Colour',
    subtitle: 'Chapter seven',
    letter: {
      from: 'Field Test magazine',
      title: 'The cover',
      body:
        'The cover needs colour. C-41 at home is easier than people think, but the developer must sit at 37.8 °C, plus or minus a hair. Then the Park Society wants slides. E-6 forgives nothing. I\'ve sent kits for both.',
    },
    objectives: [
      { id: 'c7-golden', text: 'Assignment: golden hour, in colour', hint: 'Harbour, golden hour, colour negative.', check: (s) => assignmentDone(s, 'a-colour-golden') },
      { id: 'c7-slide', text: 'Assignment: the fountain on slide film', hint: 'Park, E-6 film. Meter carefully.', check: (s) => assignmentDone(s, 'a-slide-park') },
      { id: 'c7-cabinet', text: 'Have six cameras of your own in the cabinet', hint: 'Keep hunting the market.', check: (s) => s.cameras.filter((c) => !c.clientJob).length >= 6 },
    ],
    reward: 350,
    rep: 12,
    venue: 'flea',
  },
  {
    title: 'Moving Pictures',
    subtitle: 'Chapter eight',
    letter: {
      from: 'The Harbour Café',
      title: 'Film night?',
      body:
        'Found a box of Ruth\'s home movies, all Super 8. We\'re thinking of a film night on the quay. Could you make something new to show after hers? A cartridge of Tri-X, three shots, the harbour. The projector is yours if you want it. — Inês',
    },
    objectives: [
      { id: 'c8-cam', text: 'Find a Super 8 camera', hint: 'Look for the pistol grip at the market.', check: (s) => ownsKind(s, 'super8') },
      { id: 'c8-shoot', text: 'Shoot a cartridge (three shots)', hint: 'Hold the trigger to film. Each shot is about 6 seconds.', check: (s) => s.rolls.some((r) => r.format === 'super8' && r.frames.length >= 3) },
      { id: 'c8-dev', text: 'Reversal-process the cartridge', hint: 'Don\'t forget the re-exposure.', check: (s) => s.rolls.some((r) => r.format === 'super8' && devOK(r)) },
      { id: 'c8-screen', text: 'Screen it on the projector', hint: 'Studio → projector.', check: (s) => hasFlag(s, 'screened') },
    ],
    reward: 500,
    rep: 15,
    venue: 'flea',
  },
];

export function currentChapter(s: GameState): Chapter | undefined {
  return CHAPTERS[s.chapter];
}

export function chapterProgress(s: GameState): { done: Objective[]; todo: Objective[] } {
  const ch = currentChapter(s);
  if (!ch) return { done: [], todo: [] };
  const done = ch.objectives.filter((o) => o.check(s));
  const todo = ch.objectives.filter((o) => !o.check(s));
  return { done, todo };
}

export function chapterComplete(s: GameState): boolean {
  const ch = currentChapter(s);
  return !!ch && ch.objectives.every((o) => o.check(s));
}

export function openAssignments(s: GameState): AssignmentDef[] {
  if (s.sandbox) return [];
  return ASSIGNMENTS.filter((a) => a.chapter <= s.chapter && !assignmentDone(s, a.id));
}

export function venueFor(s: GameState): 'flea' | 'estate' {
  if (s.chapter === 3 && !s.cameras.some((c) => c.modelId === 'yashicad')) return 'estate';
  return 'flea';
}

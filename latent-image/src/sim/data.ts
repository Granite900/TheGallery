/**
 * Static game data: real cameras, lenses, film stocks and chemistry.
 * Development times follow the manufacturers' published datasheets at
 * 20 °C (rounded to the nearest 15 s where the sheets give ranges).
 * Prices are rough current used-market values in USD.
 */

export type CameraKind = 'zone' | 'rangefinder' | 'tlr' | 'slr' | 'super8';
export type Format = '135' | '120' | 'super8';
export type Mount = 'fixed' | 'fd' | 'pk' | 'm42' | 'f';
export type Process = 'bw' | 'c41' | 'e6' | 'bwrev';
export type MeterType = 'none' | 'selenium' | 'cds' | 'ttl' | 'auto';

export interface Variant {
  id: string;
  name: string;
  /** value multiplier */
  mult: number;
  /** relative spawn weight */
  weight: number;
  /** body finish used by the model builder */
  finish: 'chrome' | 'black';
}

export interface CameraModel {
  id: string;
  maker: string;
  name: string;
  year: number;
  kind: CameraKind;
  format: Format;
  mount: Mount;
  /** for fixed-lens bodies */
  fixedLens?: string;
  /** marked shutter speeds in seconds, slow→fast */
  speeds: number[];
  /** auto-exposure body (no manual speed choice) */
  autoExposure?: boolean;
  meter: MeterType;
  /** focusing aid */
  focus: 'zone' | 'rangefinder' | 'groundglass' | 'splitprism' | 'reflex';
  /** shutter type affects sound and capping */
  shutter: 'leaf' | 'focalplane' | 'rotary';
  value: number;
  rarity: 1 | 2 | 3 | 4 | 5;
  variants: Variant[];
  /** rangefinder base length in metres */
  rfBase?: number;
  /** model specific quirk that its units roll more often */
  knownIssue: 'seals' | 'meter' | 'shutter' | 'haze' | 'squeal' | 'none';
  notes: string;
  /** for Super 8: frames per second */
  fps?: number;
}

export interface LensModel {
  id: string;
  name: string;
  mount: Mount;
  focal: number; // mm (zoom → wide end)
  focalMax?: number;
  maxAperture: number;
  minAperture: number;
  minFocus: number; // metres
  /** optical character, 0..1 */
  character: {
    swirl: number;
    vignette: number;
    softWideOpen: number;
    flare: number;
    catsEye: number;
    warmth: number;
  };
  blades: number;
  value: number;
  rarity: 1 | 2 | 3 | 4 | 5;
  macro?: boolean;
  notes: string;
}

export interface DevTime {
  developer: string;
  dilution: string;
  /** minutes at 20 °C for box speed */
  minutes: number;
}

export interface FilmStock {
  id: string;
  maker: string;
  name: string;
  iso: number;
  process: Process;
  formats: Format[];
  color: boolean;
  /** stops of usable latitude under / over */
  latUnder: number;
  latOver: number;
  /** characteristic curve: gamma at normal development */
  gamma: number;
  /** grain amount 0..1 at box speed in 35mm */
  grain: number;
  /** price per roll / cartridge */
  price: number;
  /** base + fog density at normal development */
  baseFog: number;
  devTimes: DevTime[];
  notes: string;
  /** colour rendering tilt for colour stocks (r,g,b multipliers) */
  palette?: [number, number, number];
  saturation?: number;
  /** discontinued; only appears as expired stock */
  discontinued?: boolean;
}

export interface Developer {
  id: string;
  name: string;
  dilutions: string[];
  /** one-shot when diluted */
  notes: string;
  /** relative grain multiplier (Rodinal is grainy, D-76 1+1 a bit sharper) */
  grain: number;
  /** acutance */
  sharpness: number;
  price: number;
}

const V = (id: string, name: string, mult: number, weight: number, finish: 'chrome' | 'black' = 'chrome'): Variant => ({
  id,
  name,
  mult,
  weight,
  finish,
});

const FULL_SPEEDS_1000 = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500, 1 / 1000];
const LEAF_500 = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500];

export const CAMERAS: CameraModel[] = [
  {
    id: 'trip35',
    maker: 'Olympus',
    name: 'Trip 35',
    year: 1967,
    kind: 'zone',
    format: '135',
    mount: 'fixed',
    fixedLens: 'zuiko40',
    speeds: [1 / 40, 1 / 200],
    autoExposure: true,
    meter: 'selenium',
    focus: 'zone',
    shutter: 'leaf',
    value: 110,
    rarity: 1,
    variants: [V('silver', 'Silver shutter button', 1, 8), V('black', 'Black shutter button (early)', 1.25, 2)],
    knownIssue: 'meter',
    notes:
      'Selenium cell around the lens powers the meter, so no batteries. A sticky meter needle lets the red flag pop up in bright light. Four zone-focus symbols: portrait, group, people, mountains.',
  },
  {
    id: 'ql17',
    maker: 'Canon',
    name: 'Canonet QL17 GIII',
    year: 1972,
    kind: 'rangefinder',
    format: '135',
    mount: 'fixed',
    fixedLens: 'canon40',
    speeds: [1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500],
    meter: 'cds',
    focus: 'rangefinder',
    shutter: 'leaf',
    value: 190,
    rarity: 2,
    variants: [V('chrome', 'Chrome', 1, 8), V('black', 'Black', 1.6, 2, 'black')],
    rfBase: 0.038,
    knownIssue: 'seals',
    notes:
      'Fast 40mm f/1.7 and the Quick Load system. Almost every one has turned-to-goo light seals by now; streaks on the edge of frames give it away. Meter was designed for 1.35 V mercury cells.',
  },
  {
    id: 'electro35',
    maker: 'Yashica',
    name: 'Electro 35 GSN',
    year: 1973,
    kind: 'rangefinder',
    format: '135',
    mount: 'fixed',
    fixedLens: 'yashinon45',
    speeds: [1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500],
    autoExposure: true,
    meter: 'auto',
    focus: 'rangefinder',
    shutter: 'leaf',
    value: 95,
    rarity: 1,
    variants: [V('chrome', 'Chrome', 1, 7), V('black', 'Black', 1.3, 3, 'black')],
    rfBase: 0.042,
    knownIssue: 'meter',
    notes:
      'Aperture-priority electronics that can hold the shutter open for 30 s. The notorious "pad of death" under the lens board causes wildly wrong exposures.',
  },
  {
    id: 'leicam3',
    maker: 'Leica',
    name: 'M3',
    year: 1954,
    kind: 'rangefinder',
    format: '135',
    mount: 'fixed',
    fixedLens: 'summicron50',
    speeds: FULL_SPEEDS_1000,
    meter: 'none',
    focus: 'rangefinder',
    shutter: 'focalplane',
    value: 1500,
    rarity: 4,
    variants: [V('ds', 'Double stroke', 1.15, 3), V('ss', 'Single stroke', 1, 6), V('olive', 'Olive (military)', 4, 0.15)],
    rfBase: 0.069,
    knownIssue: 'shutter',
    notes:
      'The brightest, most accurate rangefinder ever made. Cloth shutter curtains can develop pinholes if left pointing at the sun. Early double-stroke bodies are sought after.',
  },
  {
    id: 'mat124g',
    maker: 'Yashica',
    name: 'Mat-124G',
    year: 1970,
    kind: 'tlr',
    format: '120',
    mount: 'fixed',
    fixedLens: 'yashinon80',
    speeds: [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500],
    meter: 'cds',
    focus: 'reflex',
    shutter: 'leaf',
    value: 320,
    rarity: 2,
    variants: [V('std', 'Standard', 1, 1)],
    knownIssue: 'haze',
    notes:
      'Twin lens reflex shooting 12 square frames on 120. Waist-level finder shows the image reversed left to right. Watch the taking lens for haze.',
  },
  {
    id: 'yashicad',
    maker: 'Yashica',
    name: 'Yashica-D',
    year: 1958,
    kind: 'tlr',
    format: '120',
    mount: 'fixed',
    fixedLens: 'yashikor80',
    speeds: [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500],
    meter: 'none',
    focus: 'reflex',
    shutter: 'leaf',
    value: 170,
    rarity: 2,
    variants: [V('std', 'Standard', 1, 1)],
    knownIssue: 'shutter',
    notes:
      'Simple, meterless TLR with a knob wind. Copal shutters get lazy on the slow speeds when the old grease migrates.',
  },
  {
    id: 'rollei28f',
    maker: 'Rollei',
    name: 'Rolleiflex 2.8F',
    year: 1960,
    kind: 'tlr',
    format: '120',
    mount: 'fixed',
    fixedLens: 'planar80',
    speeds: [1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500],
    meter: 'selenium',
    focus: 'reflex',
    shutter: 'leaf',
    value: 1900,
    rarity: 4,
    variants: [V('planar', 'Planar 80mm f/2.8', 1, 6), V('xenotar', 'Xenotar 80mm f/2.8', 1.05, 4)],
    knownIssue: 'none',
    notes: 'Crank wind, superb 80mm f/2.8. The camera of a thousand wedding albums and street photographers.',
  },
  {
    id: 'k1000',
    maker: 'Pentax',
    name: 'K1000',
    year: 1976,
    kind: 'slr',
    format: '135',
    mount: 'pk',
    speeds: FULL_SPEEDS_1000,
    meter: 'ttl',
    focus: 'splitprism',
    shutter: 'focalplane',
    value: 160,
    rarity: 1,
    variants: [V('std', 'Standard', 1, 9), V('asahi', 'Early "Asahi" badge', 1.25, 2)],
    knownIssue: 'meter',
    notes:
      'All-mechanical student camera. The meter needs a battery and a needle-centring match. It works at every speed without one.',
  },
  {
    id: 'ae1p',
    maker: 'Canon',
    name: 'AE-1 Program',
    year: 1981,
    kind: 'slr',
    format: '135',
    mount: 'fd',
    speeds: FULL_SPEEDS_1000,
    meter: 'ttl',
    focus: 'splitprism',
    shutter: 'focalplane',
    value: 210,
    rarity: 2,
    variants: [V('chrome', 'Chrome', 1, 7), V('black', 'Black', 1.2, 3, 'black')],
    knownIssue: 'squeal',
    notes:
      'Electronic shutter, program mode, bright split-prism screen. Listen for the "shutter squeal" when you fire it. That is the mirror damper running dry.',
  },
  {
    id: 'fm2',
    maker: 'Nikon',
    name: 'FM2n',
    year: 1984,
    kind: 'slr',
    format: '135',
    mount: 'f',
    speeds: [...FULL_SPEEDS_1000, 1 / 2000, 1 / 4000],
    meter: 'ttl',
    focus: 'splitprism',
    shutter: 'focalplane',
    value: 420,
    rarity: 3,
    variants: [V('chrome', 'Chrome', 1, 6), V('black', 'Black', 1.1, 4, 'black')],
    knownIssue: 'none',
    notes: 'Titanium honeycomb shutter to 1/4000. Mechanical, tough, the meter is three little LEDs.',
  },
  {
    id: 'spotf',
    maker: 'Asahi Pentax',
    name: 'Spotmatic F',
    year: 1973,
    kind: 'slr',
    format: '135',
    mount: 'm42',
    speeds: FULL_SPEEDS_1000,
    meter: 'ttl',
    focus: 'splitprism',
    shutter: 'focalplane',
    value: 150,
    rarity: 2,
    variants: [V('chrome', 'Chrome', 1, 7), V('black', 'Black', 1.4, 3, 'black')],
    knownIssue: 'seals',
    notes:
      'M42 screw mount, so it takes Takumars, Helios and Jupiters. The mirror-bumper foam rots into sticky tar and leaks light.',
  },
  {
    id: 'c514xl',
    maker: 'Canon',
    name: '514XL',
    year: 1975,
    kind: 'super8',
    format: 'super8',
    mount: 'fixed',
    fixedLens: 'canonzoom9',
    speeds: [1 / 43],
    autoExposure: true,
    meter: 'auto',
    focus: 'reflex',
    shutter: 'rotary',
    fps: 18,
    value: 90,
    rarity: 2,
    variants: [V('std', 'Standard', 1, 1)],
    knownIssue: 'none',
    notes: 'XL means "existing light": wide shutter angle and fast f/1.4 zoom. Runs on 4 AA cells. Auto exposure reads the cartridge notch.',
  },
  {
    id: 'nizo560',
    maker: 'Braun',
    name: 'Nizo S560',
    year: 1973,
    kind: 'super8',
    format: 'super8',
    mount: 'fixed',
    fixedLens: 'schneider7',
    speeds: [1 / 43],
    autoExposure: true,
    meter: 'auto',
    focus: 'reflex',
    shutter: 'rotary',
    fps: 18,
    value: 220,
    rarity: 3,
    variants: [V('std', 'Standard', 1, 1)],
    knownIssue: 'meter',
    notes: 'Hefty German machine with a superb Schneider Variogon zoom. A favourite of music-video directors.',
  },
];

const C = (swirl = 0, vignette = 0.3, softWideOpen = 0.2, flare = 0.2, catsEye = 0.3, warmth = 0) => ({
  swirl,
  vignette,
  softWideOpen,
  flare,
  catsEye,
  warmth,
});

export const LENSES: LensModel[] = [
  // Fixed lenses
  { id: 'zuiko40', name: 'D.Zuiko 40mm f/2.8', mount: 'fixed', focal: 40, maxAperture: 2.8, minAperture: 22, minFocus: 1, character: C(0, 0.35, 0.2, 0.3, 0.2, 0.05), blades: 2, value: 0, rarity: 1, notes: 'Sharp little Tessar.' },
  { id: 'canon40', name: 'Canon 40mm f/1.7', mount: 'fixed', focal: 40, maxAperture: 1.7, minAperture: 16, minFocus: 0.8, character: C(0.05, 0.4, 0.35, 0.3, 0.35, 0.05), blades: 5, value: 0, rarity: 1, notes: 'Glows a little wide open.' },
  { id: 'yashinon45', name: 'Color-Yashinon DX 45mm f/1.7', mount: 'fixed', focal: 45, maxAperture: 1.7, minAperture: 16, minFocus: 0.8, character: C(0.05, 0.4, 0.35, 0.35, 0.4, 0.08), blades: 5, value: 0, rarity: 1, notes: 'Warm rendering, soft corners wide open.' },
  { id: 'summicron50', name: 'Summicron 50mm f/2 (collapsible)', mount: 'fixed', focal: 50, maxAperture: 2, minAperture: 16, minFocus: 1, character: C(0.02, 0.3, 0.15, 0.4, 0.25, 0.04), blades: 10, value: 0, rarity: 4, notes: 'Soft front element coating scratches easily; the image glows.' },
  { id: 'yashinon80', name: 'Yashinon 80mm f/3.5', mount: 'fixed', focal: 80, maxAperture: 3.5, minAperture: 32, minFocus: 1, character: C(0, 0.25, 0.2, 0.3, 0.2, 0.03), blades: 5, value: 0, rarity: 2, notes: 'Four-element Tessar copy, crisp stopped down.' },
  { id: 'yashikor80', name: 'Yashikor 80mm f/3.5', mount: 'fixed', focal: 80, maxAperture: 3.5, minAperture: 22, minFocus: 1, character: C(0.1, 0.35, 0.4, 0.4, 0.2, 0.05), blades: 5, value: 0, rarity: 2, notes: 'Triplet: soft edges, lovely tonality.' },
  { id: 'planar80', name: 'Planar 80mm f/2.8', mount: 'fixed', focal: 80, maxAperture: 2.8, minAperture: 22, minFocus: 0.9, character: C(0, 0.25, 0.1, 0.25, 0.15, 0.02), blades: 5, value: 0, rarity: 4, notes: 'Legendary sharpness and smooth fall-off.' },
  { id: 'canonzoom9', name: 'Canon Zoom 9-45mm f/1.4', mount: 'fixed', focal: 9, focalMax: 45, maxAperture: 1.4, minAperture: 16, minFocus: 1.2, character: C(0, 0.3, 0.3, 0.3, 0.2, 0.03), blades: 6, value: 0, rarity: 2, notes: '' },
  { id: 'schneider7', name: 'Schneider Variogon 7-56mm f/1.8', mount: 'fixed', focal: 7, focalMax: 56, maxAperture: 1.8, minAperture: 22, minFocus: 1.5, character: C(0, 0.25, 0.2, 0.25, 0.15, 0.02), blades: 6, value: 0, rarity: 3, notes: '' },
  // Pentax K
  { id: 'smcm50', name: 'SMC Pentax-M 50mm f/1.7', mount: 'pk', focal: 50, maxAperture: 1.7, minAperture: 22, minFocus: 0.45, character: C(0, 0.35, 0.25, 0.2, 0.3, 0.02), blades: 6, value: 45, rarity: 1, notes: 'The standard lens. Super Multi-Coating resists flare.' },
  { id: 'smcm28', name: 'SMC Pentax-M 28mm f/2.8', mount: 'pk', focal: 28, maxAperture: 2.8, minAperture: 22, minFocus: 0.3, character: C(0, 0.45, 0.25, 0.25, 0.3, 0.02), blades: 6, value: 60, rarity: 2, notes: 'Small, contrasty wide-angle for streets and harbours.' },
  { id: 'smcm135', name: 'SMC Pentax-M 135mm f/3.5', mount: 'pk', focal: 135, maxAperture: 3.5, minAperture: 32, minFocus: 1.5, character: C(0, 0.2, 0.15, 0.2, 0.1, 0.02), blades: 6, value: 50, rarity: 1, notes: 'Compresses distance. Hold it steady.' },
  { id: 'smcm100macro', name: 'SMC Pentax-M 100mm f/4 Macro', mount: 'pk', focal: 100, maxAperture: 4, minAperture: 32, minFocus: 0.45, macro: true, character: C(0, 0.2, 0.1, 0.2, 0.1, 0.02), blades: 8, value: 140, rarity: 3, notes: 'Half life-size close-ups, flat field.' },
  // Canon FD
  { id: 'fd50', name: 'Canon FD 50mm f/1.8', mount: 'fd', focal: 50, maxAperture: 1.8, minAperture: 22, minFocus: 0.6, character: C(0, 0.35, 0.25, 0.25, 0.3, 0.03), blades: 6, value: 40, rarity: 1, notes: 'Plasticky, light and sharp enough.' },
  { id: 'fd28', name: 'Canon FD 28mm f/2.8', mount: 'fd', focal: 28, maxAperture: 2.8, minAperture: 22, minFocus: 0.3, character: C(0, 0.45, 0.3, 0.3, 0.3, 0.03), blades: 6, value: 55, rarity: 1, notes: 'Classic street wide.' },
  { id: 'fd85', name: 'Canon FD 85mm f/1.8', mount: 'fd', focal: 85, maxAperture: 1.8, minAperture: 22, minFocus: 0.85, character: C(0.02, 0.35, 0.3, 0.25, 0.45, 0.04), blades: 8, value: 190, rarity: 3, notes: 'Portrait lens with creamy, cat\'s-eye bokeh in the corners.' },
  { id: 'fd135', name: 'Canon FD 135mm f/2.8', mount: 'fd', focal: 135, maxAperture: 2.8, minAperture: 22, minFocus: 1.3, character: C(0, 0.25, 0.2, 0.2, 0.2, 0.02), blades: 6, value: 50, rarity: 1, notes: '' },
  { id: 'fd50macro', name: 'Canon FD 50mm f/3.5 Macro', mount: 'fd', focal: 50, maxAperture: 3.5, minAperture: 22, minFocus: 0.23, macro: true, character: C(0, 0.2, 0.1, 0.2, 0.1, 0.02), blades: 6, value: 90, rarity: 2, notes: 'Focuses down to half life-size.' },
  // Nikon F
  { id: 'ais50', name: 'Nikkor 50mm f/1.4 AI-S', mount: 'f', focal: 50, maxAperture: 1.4, minAperture: 16, minFocus: 0.45, character: C(0, 0.45, 0.4, 0.25, 0.35, 0.02), blades: 7, value: 130, rarity: 2, notes: 'Dreamy at f/1.4, razor at f/5.6.' },
  { id: 'ais105', name: 'Nikkor 105mm f/2.5 AI-S', mount: 'f', focal: 105, maxAperture: 2.5, minAperture: 22, minFocus: 1, character: C(0, 0.25, 0.15, 0.2, 0.25, 0.03), blades: 7, value: 220, rarity: 3, notes: 'The portrait lens from "Afghan Girl".' },
  { id: 'ais24', name: 'Nikkor 24mm f/2.8 AI-S', mount: 'f', focal: 24, maxAperture: 2.8, minAperture: 22, minFocus: 0.3, character: C(0, 0.45, 0.2, 0.3, 0.3, 0.02), blades: 7, value: 150, rarity: 2, notes: '' },
  // M42 screw mount
  { id: 'helios44', name: 'Helios 44-2 58mm f/2', mount: 'm42', focal: 58, maxAperture: 2, minAperture: 16, minFocus: 0.5, character: C(0.85, 0.4, 0.35, 0.6, 0.6, 0.04), blades: 8, value: 40, rarity: 1, notes: 'Soviet Biotar copy famous for its swirly bokeh.' },
  { id: 'takumar55', name: 'Super-Takumar 55mm f/1.8', mount: 'm42', focal: 55, maxAperture: 1.8, minAperture: 16, minFocus: 0.45, character: C(0.05, 0.35, 0.25, 0.3, 0.3, 0.12), blades: 6, value: 60, rarity: 2, notes: 'Thorium glass: radioactive and yellowed, so it renders warm.' },
  { id: 'jupiter9', name: 'Jupiter-9 85mm f/2', mount: 'm42', focal: 85, maxAperture: 2, minAperture: 16, minFocus: 0.8, character: C(0.2, 0.3, 0.45, 0.45, 0.3, 0.03), blades: 15, value: 90, rarity: 2, notes: 'Sonnar copy with round 15-blade bokeh and a soft glow wide open.' },
];

export const FILMS: FilmStock[] = [
  {
    id: 'trix', maker: 'Kodak', name: 'Tri-X 400', iso: 400, process: 'bw', formats: ['135', '120'], color: false,
    latUnder: 2, latOver: 4, gamma: 0.62, grain: 0.55, price: 12, baseFog: 0.28,
    devTimes: [
      { developer: 'd76', dilution: 'stock', minutes: 6.75 },
      { developer: 'd76', dilution: '1+1', minutes: 9.75 },
      { developer: 'hc110', dilution: 'B', minutes: 6 },
      { developer: 'rodinal', dilution: '1+50', minutes: 13 },
      { developer: 'rodinal', dilution: '1+100', minutes: 60 },
    ],
    notes: 'The classic. Pushes beautifully to 1600. Gritty, forgiving.',
  },
  {
    id: 'hp5', maker: 'Ilford', name: 'HP5 Plus', iso: 400, process: 'bw', formats: ['135', '120'], color: false,
    latUnder: 2, latOver: 4, gamma: 0.6, grain: 0.5, price: 10, baseFog: 0.26,
    devTimes: [
      { developer: 'd76', dilution: 'stock', minutes: 7.5 },
      { developer: 'd76', dilution: '1+1', minutes: 13 },
      { developer: 'hc110', dilution: 'B', minutes: 5 },
      { developer: 'rodinal', dilution: '1+50', minutes: 11 },
      { developer: 'rodinal', dilution: '1+100', minutes: 60 },
    ],
    notes: 'Soft, wide latitude, very forgiving of mistakes. Great first roll.',
  },
  {
    id: 'fp4', maker: 'Ilford', name: 'FP4 Plus', iso: 125, process: 'bw', formats: ['135', '120'], color: false,
    latUnder: 1.5, latOver: 3, gamma: 0.62, grain: 0.25, price: 10, baseFog: 0.24,
    devTimes: [
      { developer: 'd76', dilution: 'stock', minutes: 8.5 },
      { developer: 'd76', dilution: '1+1', minutes: 11 },
      { developer: 'hc110', dilution: 'B', minutes: 9 },
      { developer: 'rodinal', dilution: '1+50', minutes: 11 },
      { developer: 'rodinal', dilution: '1+100', minutes: 60 },
    ],
    notes: 'Fine grain, lovely mid-tones. Needs more light.',
  },
  {
    id: 'verichrome', maker: 'Kodak', name: 'Verichrome Pan', iso: 125, process: 'bw', formats: ['120', '135'], color: false,
    latUnder: 1.5, latOver: 3, gamma: 0.6, grain: 0.35, price: 0, baseFog: 0.3, discontinued: true,
    devTimes: [
      { developer: 'd76', dilution: 'stock', minutes: 7 },
      { developer: 'hc110', dilution: 'B', minutes: 6 },
      { developer: 'rodinal', dilution: '1+100', minutes: 60 },
    ],
    notes: 'Discontinued in 2000. Shows up still inside old cameras. Handles decades of storage better than most.',
  },
  {
    id: 'gold200', maker: 'Kodak', name: 'Gold 200', iso: 200, process: 'c41', formats: ['135'], color: true,
    latUnder: 1.5, latOver: 3, gamma: 0.6, grain: 0.35, price: 11, baseFog: 0.2,
    devTimes: [{ developer: 'c41', dilution: 'kit', minutes: 3.25 }],
    notes: 'Warm, saturated, holiday-snapshot colour.', palette: [1.06, 1.0, 0.9], saturation: 1.15,
  },
  {
    id: 'portra400', maker: 'Kodak', name: 'Portra 400', iso: 400, process: 'c41', formats: ['135', '120'], color: true,
    latUnder: 2, latOver: 5, gamma: 0.55, grain: 0.3, price: 18, baseFog: 0.2,
    devTimes: [{ developer: 'c41', dilution: 'kit', minutes: 3.25 }],
    notes: 'Gentle skin tones and huge overexposure latitude. Rate it at 200 and it glows.', palette: [1.03, 1.0, 0.96], saturation: 0.95,
  },
  {
    id: 'ektar', maker: 'Kodak', name: 'Ektar 100', iso: 100, process: 'c41', formats: ['135', '120'], color: true,
    latUnder: 1, latOver: 2.5, gamma: 0.66, grain: 0.15, price: 16, baseFog: 0.2,
    devTimes: [{ developer: 'c41', dilution: 'kit', minutes: 3.25 }],
    notes: 'Finest-grain colour negative, punchy and saturated. Less forgiving.', palette: [1.02, 0.99, 1.0], saturation: 1.3,
  },
  {
    id: 'provia', maker: 'Fujifilm', name: 'Provia 100F', iso: 100, process: 'e6', formats: ['135', '120'], color: true,
    latUnder: 0.5, latOver: 0.5, gamma: 1.6, grain: 0.1, price: 22, baseFog: 0.15,
    devTimes: [{ developer: 'e6', dilution: 'kit', minutes: 6.5 }],
    notes: 'Slide film: a positive straight from the tank. Only half a stop of latitude either way.', palette: [0.98, 1.0, 1.03], saturation: 1.1,
  },
  {
    id: 'velvia', maker: 'Fujifilm', name: 'Velvia 50', iso: 50, process: 'e6', formats: ['135', '120'], color: true,
    latUnder: 0.5, latOver: 0.3, gamma: 1.8, grain: 0.08, price: 26, baseFog: 0.15,
    devTimes: [{ developer: 'e6', dilution: 'kit', minutes: 6.5 }],
    notes: 'Outrageous greens and blues. Landscape photographers\' slide film.', palette: [1.0, 1.04, 1.04], saturation: 1.45,
  },
  {
    id: 'trix8', maker: 'Kodak', name: 'Tri-X Reversal 7266', iso: 200, process: 'bwrev', formats: ['super8'], color: false,
    latUnder: 1, latOver: 1, gamma: 1.5, grain: 0.6, price: 45, baseFog: 0.1,
    devTimes: [{ developer: 'rev', dilution: 'kit', minutes: 6 }],
    notes: 'Black & white reversal Super 8: comes out of the tank as a positive you can project.',
  },
];

export const DEVELOPERS: Developer[] = [
  { id: 'd76', name: 'Kodak D-76', dilutions: ['stock', '1+1'], grain: 1, sharpness: 1, price: 12, notes: 'The reference developer. Reusable as stock; one-shot at 1+1.' },
  { id: 'hc110', name: 'Kodak HC-110', dilutions: ['B'], grain: 1.05, sharpness: 1.05, price: 18, notes: 'Syrup concentrate; dilution B is 1+31.' },
  { id: 'rodinal', name: 'Rodinal', dilutions: ['1+50', '1+100'], grain: 1.3, sharpness: 1.25, price: 16, notes: 'Over a century old. Crisp grain. 1+100 for an hour is "stand development", forgiving of unknown and expired film.' },
];

export const STOP_BATH = { name: 'Ilfostop', seconds: 30 };
export const FIXER = { name: 'Ilford Rapid Fixer 1+4', clearingFresh: 30, capacityRolls: 24 };

export interface Location {
  id: string;
  name: string;
  blurb: string;
  outdoor: boolean;
}

export const LOCATIONS: Location[] = [
  { id: 'harbour', name: 'The Harbour', blurb: 'Fishing boats, the lighthouse, the old clock tower over the quay.', outdoor: true },
  { id: 'park', name: 'Alder Park', blurb: 'Trees, the fountain, flower beds and the bandstand.', outdoor: true },
  { id: 'studio', name: 'Portrait Room', blurb: 'North-light room upstairs. The milliner\'s head is a patient sitter.', outdoor: false },
];

export const camera = (id: string): CameraModel => {
  const c = CAMERAS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown camera ${id}`);
  return c;
};
export const lens = (id: string): LensModel => {
  const l = LENSES.find((x) => x.id === id);
  if (!l) throw new Error(`unknown lens ${id}`);
  return l;
};
export const film = (id: string): FilmStock => {
  const f = FILMS.find((x) => x.id === id);
  if (!f) throw new Error(`unknown film ${id}`);
  return f;
};
export const developer = (id: string): Developer => {
  const d = DEVELOPERS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown developer ${id}`);
  return d;
};

/** Lenses a body accepts. */
export function lensesForBody(model: CameraModel): LensModel[] {
  if (model.mount === 'fixed') return model.fixedLens ? [lens(model.fixedLens)] : [];
  return LENSES.filter((l) => l.mount === model.mount);
}

/** Frame sizes in mm (width, height) */
export function frameSize(format: Format): [number, number] {
  if (format === '120') return [56, 56];
  if (format === 'super8') return [5.79, 4.01];
  return [36, 24];
}

export function exposuresPerRoll(format: Format, rollLength: number): number {
  if (format === '120') return 12;
  if (format === 'super8') return 3; // three 6-second shots per cartridge (game pacing)
  return rollLength;
}

export function formatSpeed(t: number): string {
  if (t >= 1) return `${t}s`;
  return `1/${Math.round(1 / t)}`;
}

export function formatAperture(n: number): string {
  return `f/${n < 10 ? n.toFixed(1).replace('.0', '') : Math.round(n)}`;
}

/** Standard full-stop aperture series */
export const APERTURES = [1.4, 1.7, 1.8, 2, 2.8, 3.5, 4, 5.6, 8, 11, 16, 22, 32];

export function aperturesFor(l: LensModel): number[] {
  const list = APERTURES.filter((a) => a > l.maxAperture + 0.01 && a <= l.minAperture + 0.01 && ![1.7, 1.8, 3.5].includes(a));
  return [l.maxAperture, ...list];
}

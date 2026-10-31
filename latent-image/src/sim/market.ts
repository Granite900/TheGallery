/**
 * Markets: stalls, sellers and haggling.
 */
import { CAMERAS, camera, FILMS, lens } from './data';
import { CameraUnit, LensUnit, lensValue, makeLensUnit, makeUnit, randomLensModel, trueDefects, unitValue } from './units';
import { Rng, chance, clamp, int, makeRng, pick, range } from './rng';
import type { GameState } from './state';

export type SellerStyle = 'chatty' | 'stubborn' | 'clueless' | 'dealer';

export interface Seller {
  id: string;
  name: string;
  style: SellerStyle;
  patience: number;
  /** remembers the lowest acceptable price per listing */
  greeting: string;
}

export type ListingKind = 'camera' | 'lens' | 'film' | 'box' | 'accessory';

export interface Listing {
  id: string;
  kind: ListingKind;
  sellerId: string;
  ask: number;
  unit?: CameraUnit;
  lens?: LensUnit;
  stockId?: string;
  expiredYears?: number;
  qty?: number;
  accessory?: 'tripod' | 'meter' | 'loupe';
  boxSeed?: number;
  sold?: boolean;
  /** flaws the player has pointed out */
  pointed: string[];
  /** price after haggling the seller already agreed to */
  agreed?: number;
  lastCounter?: number;
  label: string;
}

export interface Market {
  day: number;
  venue: 'flea' | 'estate';
  sellers: Seller[];
  listings: Listing[];
}

const NAMES: [string, SellerStyle, string][] = [
  ['Dot', 'chatty', 'Oh, that one? Belonged to my brother-in-law. Took it to Portugal, I think. Or was it Wales.'],
  ['Mr. Farrow', 'stubborn', 'Price is on the tag.'],
  ['Kev', 'clueless', 'Cleared out a loft. No idea if any of it works, mate. Make me an offer.'],
  ['Halvorsen Cameras', 'dealer', 'All tested, all guaranteed for thirty days. Mostly.'],
  ['Bridget', 'chatty', 'Lovely things, aren\'t they? They don\'t make them like this anymore.'],
  ['Sid', 'clueless', 'Fiver for the lot in that box. Cameras are cameras.'],
];

const ESTATE_SELLER: Seller = { id: 's-pell', name: 'Mrs. Pell (auctioneer)', style: 'stubborn', patience: 3, greeting: 'Everything is priced. The family would like it gone by Sunday.' };

/** Valid flaws discoverable by inspection */
export function inspectableFlaws(u: CameraUnit): string[] {
  const t = u.traits;
  const out: string[] = [];
  if (t.seals < 0.5) out.push('seals');
  if (t.haze > 0.3) out.push('haze');
  if (t.fungus > 0.25) out.push('fungus');
  if (t.corrosion > 0.4) out.push('corrosion');
  if (Math.abs(t.shutterSlow) > 0.9) out.push('slowshutter');
  if (t.squeal) out.push('squeal');
  if (t.cosmetic <= 4) out.push('dents');
  if (t.meterDead) out.push('deadmeter');
  return out;
}

export const FLAW_LINES: Record<string, string> = {
  seals: 'The light seals have turned to tar.',
  haze: 'There\'s haze inside the lens.',
  fungus: 'There\'s fungus in the lens.',
  corrosion: 'The battery compartment is corroded.',
  slowshutter: 'The slow speeds are dragging.',
  squeal: 'Hear that squeal? The mirror damper is dry.',
  dents: 'It\'s had a knock: there are dents.',
  deadmeter: 'The meter needle doesn\'t move at all.',
};

function askFor(value: number, style: SellerStyle, r: Rng): number {
  const mult = { chatty: range(r, 0.85, 1.05), stubborn: range(r, 0.95, 1.15), clueless: range(r, 0.35, 0.8), dealer: range(r, 1.1, 1.3) }[style];
  return roundPrice(value * mult);
}

export function roundPrice(p: number): number {
  if (p < 20) return Math.max(2, Math.round(p));
  if (p < 100) return Math.round(p / 5) * 5;
  if (p < 1000) return Math.round(p / 10) * 10;
  return Math.round(p / 50) * 50;
}

function allowedKinds(chapter: number): string[] {
  const k = ['zone', 'rangefinder'];
  if (chapter >= 3) k.push('tlr');
  if (chapter >= 4) k.push('slr');
  if (chapter >= 6) k.push('super8');
  return k;
}

export function generateMarket(s: GameState, venue: 'flea' | 'estate'): Market {
  const day = s.marketDay;
  const r = makeRng(9001 + day * 7919 + s.chapter * 31);
  const chapter = s.sandbox ? 9 : s.chapter;
  const listings: Listing[] = [];
  let lid = 0;
  const L = (x: Omit<Listing, 'id' | 'pointed'>): Listing => {
    const l = { ...x, id: `l${day}-${lid++}`, pointed: [] };
    listings.push(l);
    return l;
  };
  if (venue === 'estate') {
    const sellers = [ESTATE_SELLER];
    const d = makeUnit('yashicad', 1958 + day, 0.45, s.day);
    d.foundRoll = { stockId: 'verichrome', framesShot: 9, expiredYears: 38, storySeed: 41 };
    d.traits.seals = 0.75; // TLRs don't need seals much; keep the found film clean
    L({ kind: 'camera', sellerId: ESTATE_SELLER.id, ask: 140, unit: d, label: 'Yashica-D twin lens, as found' });
    const extra = makeUnit(pick(r, ['trip35', 'electro35', 'ql17']), int(r, 1, 1e9), 0.4, s.day);
    L({ kind: 'camera', sellerId: ESTATE_SELLER.id, ask: askFor(unitValue(extra), 'stubborn', r), unit: extra, label: `${camera(extra.modelId).maker} ${camera(extra.modelId).name}` });
    L({ kind: 'film', sellerId: ESTATE_SELLER.id, ask: 12, stockId: 'verichrome', expiredYears: 35, qty: 3, label: '3 rolls Verichrome Pan, expired 1989' });
    L({ kind: 'accessory', sellerId: ESTATE_SELLER.id, ask: 25, accessory: 'tripod', label: 'Wooden tripod' });
    return { day, venue, sellers, listings };
  }
  const sellers: Seller[] = NAMES.slice(0, 4 + (day % 2)).map(([name, style, greeting], i) => ({ id: `s${i}`, name, style, patience: style === 'stubborn' ? 2 : style === 'dealer' ? 3 : 4, greeting }));
  const kinds = allowedKinds(chapter);
  const pool = CAMERAS.filter((c) => kinds.includes(c.kind));
  const ensure: string[] = [];
  if (chapter === 1) ensure.push('ql17', 'ql17', 'electro35');
  if (chapter === 5) ensure.push('k1000', 'ae1p', 'spotf');
  if (chapter === 7) ensure.push('c514xl', 'nizo560');
  if (chapter >= 3 && chapter !== 3) ensure.push(pick(r, ['mat124g', 'yashicad']));
  const count = 7 + int(r, 0, 3);
  const models = [...ensure];
  while (models.length < count) {
    const m = pool[Math.floor(Math.pow(r(), 1.4) * pool.length)];
    if (m.rarity >= 4 && !chance(r, 0.35)) continue;
    models.push(m.id);
  }
  for (const mid of models) {
    const seller = pick(r, sellers);
    const q = seller.style === 'dealer' ? 0.8 : seller.style === 'clueless' ? 0.25 : 0.5;
    const u = makeUnit(mid, int(r, 1, 1e9), q, s.day);
    const m = camera(mid);
    if (m.mount !== 'fixed' && chance(r, 0.8)) {
      // body usually comes with the standard lens
      const std = { pk: 'smcm50', fd: 'fd50', f: 'ais50', m42: 'helios44' }[m.mount as 'pk'];
      const lu = makeLensUnit(std, int(r, 1, 1e9), q);
      u.lensId = lu.id;
      u.bundledLens = lu;
    }
    if (chance(r, 0.06) && m.format !== 'super8') {
      const stock = pick(r, FILMS.filter((f) => f.formats.includes(m.format) && f.process !== 'e6'));
      u.foundRoll = { stockId: stock.id, framesShot: int(r, 2, 8), expiredYears: int(r, 5, 30), storySeed: int(r, 1, 999) };
    }
    const known = seller.style === 'dealer' ? (trueDefects(u).length ? 'quirky' : 'working') : undefined;
    const value = unitValue(u, known as never) + (u.bundledLens ? 30 : 0);
    L({ kind: 'camera', sellerId: seller.id, ask: askFor(value, seller.style, r), unit: u, label: `${m.maker} ${m.name}` });
  }
  // Lenses
  if (chapter >= 4) {
    const n = chapter === 5 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const lm = chapter === 5 && i < 3 ? lens(['fd28', 'smcm28', 'helios44'][i]) : randomLensModel(r, ['pk', 'fd', 'f', 'm42']);
      const seller = pick(r, sellers);
      const lu = makeLensUnit(lm.id, int(r, 1, 1e9), seller.style === 'dealer' ? 0.8 : 0.45);
      L({ kind: 'lens', sellerId: seller.id, ask: askFor(lensValue(lu), seller.style, r), lens: lu, label: lm.name });
    }
    if (chapter === 5) {
      for (const id of ['fd85', 'smcm100macro', 'jupiter9', 'fd50macro']) {
        const seller = pick(r, sellers);
        const lu = makeLensUnit(id, int(r, 1, 1e9), 0.6);
        L({ kind: 'lens', sellerId: seller.id, ask: askFor(lensValue(lu), seller.style, r), lens: lu, label: lens(id).name });
      }
    }
  }
  // Expired film box
  const expSeller = pick(r, sellers);
  const expStock = pick(r, FILMS.filter((f) => f.process === 'bw' || f.process === 'c41'));
  L({ kind: 'film', sellerId: expSeller.id, ask: int(r, 3, 8), stockId: expStock.id, expiredYears: int(r, 4, 25), qty: int(r, 1, 3), label: `Expired ${expStock.maker} ${expStock.name}` });
  // As-is mystery box
  const boxSeller = sellers.find((x) => x.style === 'clueless') ?? sellers[0];
  L({ kind: 'box', sellerId: boxSeller.id, ask: int(r, 15, 30), boxSeed: int(r, 1, 1e9), label: 'Box of "old cameras", as is, untested' });
  if (!s.tools.includes('tripod')) L({ kind: 'accessory', sellerId: sellers[0].id, ask: 30, accessory: 'tripod', label: 'Tripod' });
  return { day, venue, sellers, listings };
}

export function openBox(seed: number, s: GameState): CameraUnit {
  const r = makeRng(seed);
  const kinds = allowedKinds(s.chapter);
  const pool = CAMERAS.filter((c) => kinds.includes(c.kind));
  const m = pool[Math.floor(Math.pow(r(), 1.2) * pool.length)];
  // Mostly junk, occasionally a gem
  const q = chance(r, 0.15) ? 0.8 : 0.15;
  const u = makeUnit(m.id, int(r, 1, 1e9), q, s.day);
  if (chance(r, 0.15) && m.format !== 'super8') u.foundRoll = { stockId: 'trix', framesShot: int(r, 3, 10), expiredYears: int(r, 8, 30), storySeed: int(r, 1, 999) };
  return u;
}

export interface HaggleResult {
  accepted: boolean;
  price: number;
  line: string;
  walkedAway: boolean;
}

/** Minimum the seller will take right now */
export function floorPrice(l: Listing, seller: Seller): number {
  const maxDisc = { chatty: 0.25, stubborn: 0.1, clueless: 0.4, dealer: 0.15 }[seller.style];
  const flawDisc = { chatty: 0.1, stubborn: 0.06, clueless: 0.04, dealer: 0.07 }[seller.style];
  const disc = clamp(maxDisc + flawDisc * l.pointed.length, 0, 0.7);
  return Math.max(1, Math.round(l.ask * (1 - disc)));
}

export function pointOutFlaw(l: Listing, seller: Seller, flaw: string): string {
  if (l.pointed.includes(flaw)) return `${seller.name}: "Yes, you said."`;
  l.pointed.push(flaw);
  const lines: Record<SellerStyle, string[]> = {
    chatty: ['Oh! I never noticed that. Well, I suppose I could come down a bit.', 'Is that bad? Goodness.'],
    stubborn: ['Hm. They all have something.', 'Still a good camera.'],
    clueless: ['Dunno what that means, but alright.', 'No idea, mate. Make an offer.'],
    dealer: ['I\'ll take that into account.', 'Fair. These need a service.'],
  };
  return `${seller.name}: "${pick(makeRng(l.pointed.length + l.ask), lines[seller.style])}"`;
}

export function haggle(l: Listing, seller: Seller, offer: number): HaggleResult {
  const floor = floorPrice(l, seller);
  if (seller.patience <= 0) return { accepted: false, price: l.ask, line: `${seller.name}: "I'm done haggling with you today."`, walkedAway: true };
  if (offer >= l.ask || offer >= floor) {
    return { accepted: true, price: offer, line: `${seller.name}: "${offer >= l.ask ? 'Sold.' : pick(makeRng(offer), ['Go on then.', 'Deal.', 'You drive a hard bargain.', 'Fine. Take it.'])}"`, walkedAway: false };
  }
  seller.patience -= offer < floor * 0.6 ? 2 : 1;
  if (seller.patience <= 0) return { accepted: false, price: l.ask, line: `${seller.name}: "${offer < floor * 0.6 ? 'Now you\'re insulting me.' : 'No. We\'re done.'}"`, walkedAway: true };
  const counter = roundPrice(Math.max(floor, (offer + (l.lastCounter ?? l.ask)) / 2));
  l.lastCounter = counter;
  return { accepted: false, price: counter, line: `${seller.name}: "${pick(makeRng(offer + 3), ['Couldn\'t go lower than', 'I\'d take', 'Meet me at', 'Best I can do is'])} $${counter}."`, walkedAway: false };
}

/** What the dealer stall pays for a camera you own */
export function sellPrice(u: CameraUnit): number {
  const grade = u.report?.grade;
  return roundPrice(unitValue(u, grade) * 0.6);
}

/** What the player learns from each hands-on check (no repairs, just looking). */
import { camera } from './data';
import { CameraUnit, variantOf } from './units';
import { actualShutter } from './exposure';

export type Check = 'back' | 'lens' | 'shutter' | 'advance' | 'battery' | 'serial' | 'counter';

export interface Finding {
  text: string;
  flaw?: string;
  good?: boolean;
}

export function inspect(unit: CameraUnit, check: Check, speed?: number): Finding {
  const t = unit.traits;
  const m = camera(unit.modelId);
  switch (check) {
    case 'back': {
      if (m.kind === 'super8') return { text: 'The cartridge chamber is clean. Super 8 cartridges carry their own pressure plate, so there are no seals to worry about.', good: true };
      if (m.kind === 'tlr') return t.seals < 0.3 ? { text: 'The felt around the film path is threadbare. Most TLRs don\'t rely on foam, but this could leak.', flaw: 'seals' } : { text: 'Clean film path, felt light traps intact.', good: true };
      if (t.seals < 0.3) return { text: 'The foam seals along the hinge and the door channel have turned to black sticky tar. It comes off on your fingertip. This will leak light.', flaw: 'seals' };
      if (t.seals < 0.5) return { text: 'The seals are crumbling in places: flattened and powdery near the hinge. Probably leaks a little.', flaw: 'seals' };
      if (t.seals < 0.75) return { text: 'The seals are old but still springy. Should be fine.', good: true };
      return { text: 'The seals look like they were replaced not long ago: soft, black, even.', good: true };
    }
    case 'lens': {
      const parts: string[] = [];
      let flaw: string | undefined;
      if (t.fungus > 0.25) {
        parts.push('Shining the torch through the lens shows fine, branching filaments between the elements. Fungus.');
        flaw = 'fungus';
      }
      if (t.haze > 0.55) {
        parts.push('The beam turns into a milky glow inside the lens: heavy haze.');
        flaw = flaw ?? 'haze';
      } else if (t.haze > 0.3) {
        parts.push('There\'s a faint, even haze when the torch hits it at an angle.');
        flaw = flaw ?? 'haze';
      }
      if (!parts.length) parts.push(t.haze > 0.12 ? 'A couple of dust specks, nothing that will show on film. Clear.' : 'Crystal clear. The coatings glint purple and amber.');
      return { text: parts.join(' '), flaw, good: !flaw };
    }
    case 'shutter': {
      const s = speed ?? (m.speeds.includes(1) ? 1 : m.speeds[0]);
      const actual = actualShutter(s, t.shutterSlow, t.shutterFast);
      const label = s >= 1 ? `${s} s` : `1/${Math.round(1 / s)}`;
      const ratio = actual / s;
      let text = `You fire it at ${label}.`;
      let flaw: string | undefined;
      if (m.autoExposure && m.kind !== 'rangefinder') text = 'It fires with a crisp little tick.';
      else if (s >= 1 / 8) {
        if (ratio > 1.6) {
          text += ` That took noticeably longer than it should. It sounds like ${actual.toFixed(1)} s. The slow speeds drag.`;
          flaw = 'slowshutter';
        } else if (ratio < 0.6) text += ' That was quick for a slow speed. It might be running fast.';
        else text += ' Sounds about right.';
      } else text += ' Too fast to judge by ear. Only a test roll will tell.';
      if (t.squeal) {
        text += ' A thin squeal follows the mirror on every shot.';
        flaw = flaw ?? 'squeal';
      }
      return { text, flaw };
    }
    case 'advance':
      return t.cosmetic <= 3 ? { text: 'The advance is gritty but it winds and cocks.', flaw: 'dents' } : { text: 'Smooth advance, it cocks the shutter and moves the counter.', good: true };
    case 'battery': {
      if (m.meter === 'none' || m.meter === 'selenium') return { text: m.meter === 'selenium' ? 'No battery: the selenium cell powers the meter. Point it at the window and the needle swings.' : 'No meter, no battery. Sunny-16 it is.', good: true };
      if (t.corrosion > 0.6) return { text: 'Green-white crust all over the battery contacts. Someone left an old cell in there for decades. The meter may be dead.', flaw: 'corrosion' };
      if (t.corrosion > 0.3) return { text: 'Some light corrosion on the contacts.', flaw: 'corrosion' };
      if (t.meterDead) return { text: 'Contacts look clean, but with a fresh battery the needle doesn\'t move.', flaw: 'deadmeter' };
      return { text: 'Clean contacts. With a battery fitted the meter needle comes alive.', good: true };
    }
    case 'serial': {
      const v = variantOf(unit);
      let extra = '';
      if (m.id === 'leicam3') extra = v.id === 'ds' ? ' Below 915 000: an early double-stroke body.' : v.id === 'olive' ? ' Olive paint and an army engraving. This is very rare.' : ' A single-stroke body.';
      if (m.id === 'k1000' && v.id === 'asahi') extra = ' The top plate still says ASAHI: early production, collectors pay extra.';
      if (m.id === 'trip35' && v.id === 'black') extra = ' Black shutter button: early production.';
      return { text: `${m.maker} ${m.name}, serial No. ${unit.serial}. ${v.name}.${extra} Cosmetic grade ${t.cosmetic}/10.`, good: true };
    }
    case 'counter': {
      if (unit.foundRoll) return { text: `The frame counter reads ${unit.foundRoll.framesShot}. There's still film in it! Don't open the back.`, good: true };
      return { text: 'The counter reads S: no film inside.', good: true };
    }
  }
}

export function checkLabel(c: Check): string {
  return {
    back: 'Open the back',
    lens: 'Torch through the lens',
    shutter: 'Fire the shutter',
    advance: 'Wind on',
    battery: 'Battery compartment',
    serial: 'Read the serial',
    counter: 'Frame counter',
  }[c];
}

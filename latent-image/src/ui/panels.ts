/** Studio panels: desk sheet, catalogue, board, outing, settings. */
import { h, btn, link, money, tornClip } from './dom';
import type { Game } from '../app/Game';
import { CAMERAS, DEVELOPERS, FILMS, camera, film, formatSpeed, lens as lensModel, lensesForBody, LOCATIONS } from '../sim/data';
import { CameraUnit, lensValue, unitValue, DEFECT_LABEL } from '../sim/units';
import { GameState, loadFilm, rollById, unloadFilm, unitById, attachDefaultLenses, setFlag } from '../sim/state';
import { ASSIGNMENTS, CHAPTERS, openAssignments, subjectName } from '../sim/career';
import { testPlan } from '../sim/testing';
import { Lighting, LIGHTING_LABEL, sunny16 } from '../sim/exposure';
import { Check, checkLabel } from '../sim/inspection';
import { makeRng } from '../sim/rng';
import { openPhonePanel } from './phonePanel';

export function unitTitle(u: CameraUnit): string {
  const m = camera(u.modelId);
  return `${m.maker} ${m.name}`;
}

export interface DeskCallbacks {
  check: (c: Check) => void;
  setSpeed: (s: number) => void;
  refresh: () => void;
  putAway: () => void;
  loaded: () => void;
}

export function deskPanel(game: Game, unit: CameraUnit, cb: DeskCallbacks, findings: Map<Check, { text: string }>, speed: number): HTMLElement {
  const s = game.state;
  const m = camera(unit.modelId);
  const roll = rollById(s, unit.rollId);
  const sheet = h('div', { class: 'sheet card side-panel' });
  sheet.append(h('h3', null, `${m.year} · ${m.kind === 'zone' ? 'zone-focus compact' : m.kind === 'tlr' ? 'twin lens reflex' : m.kind === 'super8' ? 'Super 8 cine camera' : m.kind}`), h('h2', null, unitTitle(unit)));
  if (unit.clientJob) sheet.append(h('div', { class: 'stamp blue', style: 'margin:4px 0 8px' }, 'Client camera'));
  sheet.append(h('p', { class: 'small' }, m.notes));
  // lens
  if (m.mount !== 'fixed') {
    const cur = s.lenses.find((l) => l.id === unit.lensId);
    const options = s.lenses.filter((l) => lensModel(l.modelId).mount === m.mount);
    const sel = h('select', { onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      for (const c of s.cameras) if (c.lensId === v) c.lensId = undefined;
      unit.lensId = v || undefined;
      game.save();
      cb.refresh();
    } }, h('option', { value: '' }, '— body cap —'), ...options.map((l) => h('option', { value: l.id, selected: l.id === cur?.id }, lensModel(l.modelId).name)));
    sheet.append(h('div', { class: 'flex', style: 'margin:6px 0' }, h('span', { class: 'label' }, 'Lens'), sel));
  } else sheet.append(h('div', { class: 'small' }, `Lens: ${lensModel(m.fixedLens!).name}`));
  sheet.append(h('hr'));
  // Inspection
  sheet.append(h('h3', null, 'Look it over'));
  const checks: Check[] = ['back', 'lens', 'shutter', 'advance', 'battery', 'serial', 'counter'];
  const row = h('div', { class: 'flex' });
  for (const c of checks) row.append(btn(checkLabel(c), () => cb.check(c), 'mini'));
  sheet.append(row);
  if (!m.autoExposure) {
    const speeds = m.speeds.slice().reverse();
    const sp = h('select', { onchange: (e: Event) => cb.setSpeed(Number((e.target as HTMLSelectElement).value)) }, ...speeds.map((t) => h('option', { value: String(t), selected: t === speed }, formatSpeed(t))));
    sheet.append(h('div', { class: 'flex small', style: 'margin-top:4px' }, 'Dry-fire speed', sp));
  }
  const log = h('div', { style: 'margin-top:8px' });
  for (const [c, f] of findings) log.append(h('p', { class: 'small' }, h('b', null, `${checkLabel(c)}: `), f.text));
  sheet.append(log);
  sheet.append(h('hr'));
  // Film
  sheet.append(h('h3', null, 'Film'));
  if (unit.foundRoll) {
    sheet.append(h('p', null, `There is an exposed roll inside (${unit.foundRoll.framesShot} frames). Wind it off and take it to the darkroom.`), btn('Remove the found roll', () => {
      const fr = unit.foundRoll!;
      const r = loadFilm(game.state, unit.id, fr.stockId, film(fr.stockId).iso, { expiredYears: fr.expiredYears });
      r.found = { storySeed: fr.storySeed };
      r.unknownStock = true;
      r.capacity = Math.max(fr.framesShot, r.capacity);
      unit.foundRoll = undefined;
      unloadFilm(game.state, unit.id, true);
      setFlag(game.state, 'found-roll-taken');
      game.audio.rewind();
      game.hud.toast('Found roll wound off. Its frames are latent images waiting for developer.', 'good');
      game.progress();
      cb.refresh();
    }));
  } else if (roll) {
    sheet.append(h('p', null, `${film(roll.stockId).maker} ${film(roll.stockId).name} @ EI ${roll.ei}: ${roll.frames.length}/${roll.capacity} exposed.`));
    sheet.append(
      btn(m.format === '135' ? 'Rewind & unload' : 'Wind off & unload', () => {
        unloadFilm(game.state, unit.id, true);
        game.audio.rewind();
        game.hud.toast('Roll unloaded. It is in the darkroom tray, waiting.', 'good');
        game.progress();
        cb.refresh();
      }),
    );
  } else {
    const stocks = Object.entries(s.fridge).filter(([id, n]) => n > 0 && film(id).formats.includes(m.format));
    const expired = s.expiredFilm.filter((e) => e.count > 0 && film(e.stockId).formats.includes(m.format));
    if (!stocks.length && !expired.length) sheet.append(h('p', { class: 'small' }, `No ${m.format === '120' ? '120' : m.format === 'super8' ? 'Super 8' : '35mm'} film in the fridge. Order some from the catalogue.`));
    const stockSel = h('select', null, ...stocks.map(([id, n]) => h('option', { value: id }, `${film(id).maker} ${film(id).name} (${n})`)), ...expired.map((e, i) => h('option', { value: `exp:${i}` }, `${film(e.stockId).name}, expired ~${e.expiredYears}y (${e.count})`)));
    const eiSel = h('select', null, ...[0.5, 1, 2, 4, 8].map((k) => h('option', { value: String(k), selected: k === 1 }, k === 1 ? 'box speed' : k < 1 ? 'pull 1 stop' : `push ${Math.log2(k)} stop${k > 2 ? 's' : ''}`)));
    if (stocks.length || expired.length) {
      sheet.append(h('div', { class: 'flex' }, stockSel, m.kind !== 'super8' && m.kind !== 'zone' ? eiSel : null));
      sheet.append(
        btn('Load film', () => {
          const v = stockSel.value;
          let stockId = v;
          let exp: { expiredYears: number } | undefined;
          if (v.startsWith('exp:')) {
            const e = expired[Number(v.slice(4))];
            stockId = e.stockId;
            exp = { expiredYears: e.expiredYears };
            e.count--;
          } else s.fridge[v]--;
          const k = Number(eiSel.value || 1);
          const ei = Math.round(film(stockId).iso * (m.kind === 'super8' || m.kind === 'zone' ? 1 : k));
          loadFilm(game.state, unit.id, stockId, ei, exp);
          game.audio.door();
          setTimeout(() => game.audio.advance(m.kind === 'tlr' ? 'crank' : m.id === 'trip35' ? 'wheel' : 'lever'), 500);
          game.hud.toast(`Loaded ${film(stockId).name}${ei !== film(stockId).iso ? ` at EI ${ei} (remember the push when developing)` : ''}.`, 'good');
          cb.loaded();
          game.progress();
          cb.refresh();
        }),
      );
    }
  }
  sheet.append(h('hr'));
  // Notebook: suggested test sequence + sunny 16
  const nb = h('div', { class: 'small' });
  if (s.assist !== 'purist') {
    nb.append(h('div', { class: 'label' }, 'Ruth\'s notebook: testing'));
    for (const line of testPlan(unit.modelId)) nb.append(h('div', null, `· ${line}`));
    const iso = roll ? roll.ei : 400;
    nb.append(h('div', { class: 'label', style: 'margin-top:8px' }, `Sunny 16 at ISO ${iso}`));
    for (const l of ['sun', 'overcast', 'shade', 'dusk'] as Lighting[]) {
      const x = sunny16(l, iso);
      nb.append(h('div', null, `${LIGHTING_LABEL[l]}: f/${x.aperture} @ ${formatSpeed(1 / Math.round(1 / x.time))}`));
    }
  }
  sheet.append(nb);
  if (unit.report) sheet.append(h('hr'), h('div', { class: `stamp ${unit.report.grade === 'working' ? 'green' : unit.report.grade === 'quirky' ? 'blue' : ''}` }, unit.report.grade), h('div', { class: 'small', style: 'margin-top:6px' }, unit.report.defects.length ? unit.report.defects.map((d) => DEFECT_LABEL[d]).join(', ') : 'No defects found.'));
  if (unit.clientJob && unit.report) {
    sheet.append(
      btn('Return to client', () => {
        game.state.cameras = game.state.cameras.filter((c) => c.id !== unit.id);
        setFlag(game.state, `${unit.clientJob}-returned`);
        game.state.money += 80;
        game.hud.toast('Returned to Mrs. Adeyemi with your report. +$80', 'good');
        game.audio.coin();
        game.progress();
        cb.putAway();
      }),
    );
  }
  sheet.append(h('div', { style: 'margin-top:10px' }, btn('Put it back in the cabinet', () => cb.putAway(), 'blue')));
  return sheet;
}

export function cataloguePanel(game: Game, onChange: () => void): HTMLElement {
  const s = game.state;
  const sheet = h('div', { class: 'sheet', style: 'width:620px' }, h('h1', null, 'Mail order'), h('p', { class: 'small' }, 'Kowalski Photographic: same-day courier for local customers. Prices include postage.'));
  const list = h('div', { class: 'rows' });
  const add = (label: string, price: number, buy: () => void, note = '') => {
    list.append(
      h('div', { class: 'row', onclick: () => {
        if (s.money < price) {
          game.hud.toast('Not enough money.', 'bad');
          return;
        }
        s.money -= price;
        buy();
        game.audio.coin();
        game.save();
        game.hud.update(s);
        onChange();
      } }, h('span', null, label, note ? h('span', { class: 'small' }, `  ${note}`) : null), h('span', { class: 'r' }, money(price))),
    );
  };
  list.append(h('div', { class: 'label', style: 'margin-top:4px' }, 'Film'));
  for (const f of FILMS.filter((x) => !x.discontinued)) {
    if (f.process === 'bwrev' && s.chapter < 7 && !s.sandbox) continue;
    if ((f.process === 'c41' || f.process === 'e6') && s.chapter < 6 && !s.sandbox) continue;
    add(`${f.maker} ${f.name} (${f.formats.join('/')})`, f.price, () => (s.fridge[f.id] = (s.fridge[f.id] ?? 0) + 1), `in fridge: ${s.fridge[f.id] ?? 0}`);
  }
  list.append(h('div', { class: 'label', style: 'margin-top:10px' }, 'Chemistry'));
  add('Ilford Rapid Fixer, fresh 1 L', 14, () => (s.chem.fixerUses = 0), `used for ${s.chem.fixerUses} rolls`);
  if (s.chapter >= 6 || s.sandbox) {
    add('C-41 colour kit (8 rolls)', 32, () => (s.chem.c41Kits += 1), `have ${s.chem.c41Kits}`);
    add('E-6 slide kit (6 rolls)', 38, () => (s.chem.e6Kits += 1), `have ${s.chem.e6Kits}`);
  }
  if (s.chapter >= 7 || s.sandbox) add('B&W reversal kit (Super 8)', 30, () => (s.chem.revKits += 1), `have ${s.chem.revKits}`);
  list.append(h('div', { class: 'small', style: 'margin-top:6px' }, `Developers on the shelf: ${DEVELOPERS.map((d) => d.name).join(', ')}. Ruth kept plenty.`));
  if (!s.tools.includes('tripod')) {
    list.append(h('div', { class: 'label', style: 'margin-top:10px' }, 'Accessories'));
    add('Tripod', 45, () => s.tools.push('tripod'));
  }
  sheet.append(list, h('div', { style: 'margin-top:12px' }, btn('Close', () => (sheet.parentElement as HTMLElement & { close?: () => void })?.close?.())));
  return sheet;
}

export function boardPanel(game: Game, openLetter: (i: number) => void): HTMLElement {
  const s = game.state;
  const sheet = h('div', { class: 'sheet kraft', style: 'width:640px' }, h('h1', null, 'The board'));
  const ch = CHAPTERS[s.chapter];
  if (ch) sheet.append(h('h3', null, `${ch.subtitle}: ${ch.title}`));
  const asg = openAssignments(s);
  if (asg.length) {
    sheet.append(h('div', { class: 'label', style: 'margin-top:8px' }, 'Open assignments'));
    for (const a of asg) {
      sheet.append(
        h(
          'div',
          { class: 'sheet card', style: 'margin:8px 0;padding:10px 14px;transform:rotate(-.4deg)' },
          h('div', { class: 'flex' }, h('b', { class: 'label' }, a.client), h('span', { class: 'spacer' }), h('span', { class: 'hand', style: 'font-size:22px' }, money(a.reward))),
          h('div', { style: 'font-family:var(--font-label);font-size:16px;font-weight:600;margin:2px 0' }, a.title),
          h('div', { class: 'small' }, a.brief),
        ),
      );
    }
  }
  const done = s.assignments.filter((a) => a.done);
  if (done.length) {
    sheet.append(h('div', { class: 'label', style: 'margin-top:8px' }, 'Delivered'));
    for (const d of done) {
      const def = ASSIGNMENTS.find((x) => x.id === d.id);
      if (def) sheet.append(h('div', { class: 'small' }, `${def.title}: ${'★'.repeat(d.stars ?? 0)}${'☆'.repeat(5 - (d.stars ?? 0))}`));
    }
  }
  sheet.append(h('div', { class: 'label', style: 'margin-top:10px' }, 'Letters'));
  s.letters.slice(0, 8).forEach((l, i) => sheet.append(h('div', { class: 'row', onclick: () => openLetter(i) }, h('span', null, `${l.read ? '' : '● '}${l.title}`), h('span', { class: 'r' }, l.from))));
  sheet.append(h('div', { style: 'margin-top:12px' }, btn('Close', () => (sheet.parentElement as HTMLElement & { close?: () => void })?.close?.())));
  return sheet;
}

export function weatherFor(day: number): 'sun' | 'overcast' | 'hazy' {
  const r = makeRng(day * 131 + 7)();
  return r < 0.5 ? 'sun' : r < 0.8 ? 'hazy' : 'overcast';
}

export function outingPanel(game: Game, go: (where: string, lighting: Lighting) => void, market: () => void): HTMLElement {
  const s = game.state;
  const wx = weatherFor(s.day);
  const sheet = h('div', { class: 'sheet card', style: 'width:560px' }, h('h1', null, 'Going out'));
  const active = unitById(s, s.activeCameraId);
  sheet.append(h('p', { class: 'small' }, `Today: ${LIGHTING_LABEL[wx].toLowerCase()}. Taking: ${active ? unitTitle(active) : 'no camera'}${active?.rollId ? '' : ' (no film loaded!)'}.`));
  for (const loc of LOCATIONS) {
    const times: Lighting[] = loc.outdoor ? [wx, 'golden', 'dusk'] : ['window', 'room'];
    const row = h('div', { class: 'flex', style: 'margin:6px 0' }, h('div', { style: 'width:160px' }, h('div', { style: 'font-family:var(--font-label);font-weight:600' }, loc.name), h('div', { class: 'small' }, loc.blurb)));
    for (const t of times) row.append(btn(t === wx ? 'Daytime' : LIGHTING_LABEL[t], () => go(loc.id, t), 'mini'));
    sheet.append(row);
  }
  if (s.chapter >= 1 || s.sandbox) {
    sheet.append(h('hr'), h('div', { class: 'flex' }, h('div', { style: 'width:160px' }, h('div', { style: 'font-family:var(--font-label);font-weight:600' }, s.chapter === 3 && !s.cameras.some((c) => c.modelId === 'yashicad') ? 'Estate sale' : 'Saturday market'), h('div', { class: 'small' }, 'Cameras, lenses, expired film. Next week has different stock.')), btn('Go', market)));
  }
  sheet.append(h('hr'), h('div', { class: 'flex' }, h('div', { style: 'width:160px' }, h('div', { style: 'font-family:var(--font-label);font-weight:600' }, 'The real world'), h('div', { class: 'small' }, 'Take one of your cameras out for real, on your phone.')), btn('Pair phone', () => openPhonePanel(game))));
  sheet.append(h('div', { style: 'margin-top:12px' }, btn('Stay in', () => (sheet.parentElement as HTMLElement & { close?: () => void })?.close?.(), 'red')));
  return sheet;
}

export function settingsPanel(game: Game, onQuitToMenu?: () => void): HTMLElement {
  const s = game.state;
  const sheet = h('div', { class: 'sheet card', style: 'width:460px' }, h('h1', null, 'Settings'));
  const q = h('select', { onchange: (e: Event) => ((s.settings.quality = (e.target as HTMLSelectElement).value as GameState['settings']['quality']), game.save(), game.hud.toast('Quality applies when you next change room.')) }, ...(['low', 'medium', 'high', 'ultra'] as const).map((v) => h('option', { value: v, selected: s.settings.quality === v }, v)));
  const a = h('select', { onchange: (e: Event) => ((s.assist = (e.target as HTMLSelectElement).value as GameState['assist']), game.save(), game.progress()) }, h('option', { value: 'guided', selected: s.assist === 'guided' }, 'Guided: hints and wide tolerances'), h('option', { value: 'standard', selected: s.assist === 'standard' }, 'Standard'), h('option', { value: 'purist', selected: s.assist === 'purist' }, 'Purist: no hints'));
  const rl = h('select', { onchange: (e: Event) => ((s.settings.rollLength = Number((e.target as HTMLSelectElement).value) as 12), game.save()) }, ...[12, 24, 36].map((n) => h('option', { value: String(n), selected: s.settings.rollLength === n }, `${n} exposures`)));
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.settings.volume), oninput: (e: Event) => ((s.settings.volume = Number((e.target as HTMLInputElement).value)), game.audio.setVolume(s.settings.volume), game.save()) });
  sheet.append(h('div', { class: 'grid2' }, h('span', { class: 'label' }, 'Graphics'), q, h('span', { class: 'label' }, 'Assistance'), a, h('span', { class: 'label' }, '35mm roll length'), rl, h('span', { class: 'label' }, 'Volume'), vol));
  sheet.append(h('p', { class: 'small', style: 'margin-top:10px' }, 'F11 toggles fullscreen.'));
  const row = h('div', { style: 'margin-top:12px' }, btn('Back', () => (sheet.parentElement as HTMLElement & { close?: () => void })?.close?.()), btn('Phone camera', () => openPhonePanel(game), 'blue'));
  if (onQuitToMenu) row.append(btn('Main menu', onQuitToMenu, 'red'));
  sheet.append(row);
  return sheet;
}

export function collectionPanel(game: Game): HTMLElement {
  const s = game.state;
  const sheet = h('div', { class: 'sheet', style: 'width:760px' }, h('h1', null, 'Collection book'), h('p', { class: 'small' }, 'Every model you have owned or handled. Values assume a tested, working example.'));
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px' });
  for (const m of CAMERAS) {
    const owned = s.cameras.filter((c) => c.modelId === m.id && !c.clientJob);
    const seen = s.catalogSeen.includes(m.id) || owned.length > 0;
    const card = h(
      'div',
      { class: 'sheet card', style: `padding:10px 12px;${seen ? '' : 'opacity:.45'}` },
      h('div', { class: 'label' }, seen ? m.maker : '—'),
      h('div', { style: 'font-family:var(--font-label);font-weight:600;font-size:16px' }, seen ? m.name : 'Not yet found'),
      h('div', { class: 'small' }, seen ? `${m.year} · ${'●'.repeat(m.rarity)}${'○'.repeat(5 - m.rarity)} · ~${money(m.value)}` : `${'●'.repeat(m.rarity)}${'○'.repeat(5 - m.rarity)}`),
      seen ? h('div', { class: 'small' }, `Variants: ${m.variants.map((v) => (owned.some((o) => o.variantId === v.id) ? `${v.name} ✓` : v.name)).join(' · ')}`) : null,
      owned.length ? h('div', { class: 'hand', style: 'font-size:20px' }, `owned × ${owned.length}`) : null,
    );
    grid.append(card);
  }
  sheet.append(grid);
  const lensList = s.lenses.map((l) => `${lensModel(l.modelId).name} (~${money(lensValue(l))})`);
  if (lensList.length) sheet.append(h('div', { class: 'label', style: 'margin-top:12px' }, 'Lenses'), h('div', { class: 'small' }, lensList.join(' · ')));
  const total = s.cameras.filter((c) => !c.clientJob).reduce((acc, c) => acc + unitValue(c, c.report?.grade), 0) + s.lenses.reduce((a, l) => a + lensValue(l), 0);
  sheet.append(h('p', { style: 'margin-top:10px' }, `Estimated collection value: ${money(total)}`));
  sheet.append(h('div', { style: 'margin-top:8px' }, btn('Close', () => (sheet.parentElement as HTMLElement & { close?: () => void })?.close?.())));
  void lensesForBody;
  void attachDefaultLenses;
  void subjectName;
  void tornClip;
  void link;
  return sheet;
}

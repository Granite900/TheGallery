/** Light table: negatives with a loupe, starring, assignments, test reports, prints, shows. */
import type { Game } from '../app/Game';
import { h, btn, money } from './dom';
import { camera, film, formatSpeed, formatAperture, lens as lensModel } from '../sim/data';
import { FrameRecord, Roll, setFlag, unitById, hasFlag } from '../sim/state';
import { openAssignments, gradeFrame, assignmentDef, subjectName } from '../sim/career';
import { DEFECT_LABEL, DefectId, defectsFor, TestReport, trueDefects } from '../sim/units';
import { FrameEvidence, scoreReport } from '../sim/testing';
import { LIGHTING_LABEL } from '../sim/exposure';
import { unitTitle } from './panels';

export function openLightTable(game: Game, onClose: () => void): void {
  const s = game.state;
  const sheet = h('div', { class: 'sheet dark', style: 'width:min(1180px,94vw);height:88vh;display:flex;flex-direction:column;gap:10px;background:#1d1a16' });
  const close = game.hud.modal(sheet, { onClose });
  const tabs = h('div', { class: 'flex' });
  const body = h('div', { style: 'flex:1;overflow:auto;position:relative' });
  sheet.append(h('div', { class: 'flex' }, h('h2', { style: 'color:#efe6d0;margin:0' }, 'Light table'), h('span', { class: 'spacer' }), tabs, btn('Close', () => close(), 'red')), body);
  let tab: 'negs' | 'prints' = 'negs';
  const setTab = (t: 'negs' | 'prints') => {
    tab = t;
    tabs.innerHTML = '';
    tabs.append(btn('Negatives', () => setTab('negs'), tab === 'negs' ? 'blue' : ''), btn('Prints', () => setTab('prints'), tab === 'prints' ? 'blue' : ''));
    if (t === 'negs') renderNegs();
    else renderPrints();
  };

  const rolls = s.rolls.filter((r) => r.state === 'developed' && r.format !== 'super8').reverse();
  let roll: Roll | undefined = rolls[0];
  let sel = 0;
  let showPos = true;

  const renderNegs = () => {
    body.innerHTML = '';
    if (!rolls.length) {
      body.append(h('p', { style: 'color:#cfc6b2' }, 'No developed film yet. Shoot a roll and develop it in the darkroom.'));
      return;
    }
    const rollSel = h('select', { style: 'color:#efe6d0;border-color:#efe6d0', onchange: (e: Event) => ((roll = rolls[Number((e.target as HTMLSelectElement).value)]), (sel = 0), renderNegs()) }, ...rolls.map((r, i) => h('option', { value: String(i), selected: r === roll, style: 'color:#000' }, rollLabel(game, r))));
    body.append(h('div', { class: 'flex' }, rollSel, h('span', { class: 'spacer' }), h('label', { class: 'check', style: 'color:#efe6d0' }, h('input', { type: 'checkbox', checked: showPos, onchange: (e: Event) => ((showPos = (e.target as HTMLInputElement).checked), renderNegs()) }), 'Show as positive (scan)')));
    if (!roll) return;
    const strip = h('div', { class: 'negstrip', style: 'margin:10px 0' });
    roll.frames.forEach((f, i) => {
      const img = h('img', { alt: `frame ${i + 1}` });
      void game.images.url(f.negKey ?? '').then((u) => u && (img.src = u));
      strip.append(h('div', { class: `fr ${i === sel ? 'sel' : ''}`, onclick: () => ((sel = i), renderNegs()) }, img, h('span', { class: 'n' }, `${i + 1}${f.starred ? ' ★' : ''} ▸`)));
    });
    body.append(strip);
    const f = roll.frames[sel];
    if (!f) return;
    const big = h('img', { style: 'max-width:100%;max-height:52vh;display:block;cursor:none' });
    void game.images.url((showPos ? f.posKey : f.negKey) ?? '').then((u) => {
      if (u) big.src = u;
    });
    const loupe = h('div', { class: 'loupe' });
    const wrap = h('div', { style: 'position:relative;display:inline-block' }, big, loupe);
    big.addEventListener('mousemove', (e) => {
      const r = big.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const zoom = 4;
      loupe.style.display = 'block';
      loupe.style.left = `${x - 130}px`;
      loupe.style.top = `${y - 130}px`;
      loupe.style.backgroundImage = `url(${big.src})`;
      loupe.style.backgroundSize = `${r.width * zoom}px ${r.height * zoom}px`;
      loupe.style.backgroundPosition = `${-x * zoom + 130}px ${-y * zoom + 130}px`;
    });
    big.addEventListener('mouseleave', () => (loupe.style.display = 'none'));
    const notes = frameNotes(game, roll, f);
    const actions = h('div', { class: 'flex', style: 'margin-top:8px' });
    actions.append(
      btn(f.starred ? 'Unstar' : 'Star ★', () => {
        f.starred = !f.starred;
        game.save();
        game.progress();
        renderNegs();
      }),
    );
    const open = openAssignments(s);
    if (open.length && !roll.dev?.ruined) {
      const asel = h('select', { style: 'color:#efe6d0;border-color:#efe6d0' }, ...open.map((a) => h('option', { value: a.id, style: 'color:#000' }, `${a.client}: ${a.title}`)));
      actions.append(
        asel,
        btn('Send to client', () => {
          const def = assignmentDef(asel.value)!;
          const g = gradeFrame(def, f, roll!);
          f.submitted = def.id;
          const st = s.assignments.find((a) => a.id === def.id);
          if (g.pass) {
            if (st) Object.assign(st, { done: true, stars: g.stars, critique: g.critique });
            else s.assignments.push({ id: def.id, done: true, stars: g.stars, critique: g.critique });
            const pay = Math.round(def.reward * (0.6 + g.stars * 0.08));
            s.money += pay;
            s.rep += def.rep;
            game.audio.coin();
          }
          game.audio.stamp();
          const slip = h('div', { class: 'sheet card', style: 'width:440px' }, h('div', { class: 'label' }, def.client), h('h2', null, def.title), h('div', { class: `stamp big ${g.pass ? 'green' : ''}`, style: 'margin:8px 0 12px' }, g.pass ? `${'★'.repeat(g.stars)} accepted` : 'Returned'), ...g.critique.map((c) => h('p', { class: 'small' }, `· ${c}`)), g.pass ? h('p', null, `Payment enclosed: ${money(Math.round(def.reward * (0.6 + g.stars * 0.08)))}.`) : h('p', { class: 'small' }, 'Try again with another frame, or reshoot.'), btn('OK', () => c2()));
          const c2 = game.hud.modal(slip);
          game.save();
          game.progress();
        }),
      );
    }
    const unit = unitById(s, roll.unitId);
    if (unit && !roll.found && !unit.report) actions.append(btn('Write test report', () => testReport(game, roll!, () => renderNegs()), 'blue'));
    else if (unit?.report) actions.append(h('span', { class: `stamp ${unit.report.grade === 'working' ? 'green' : unit.report.grade === 'quirky' ? 'blue' : ''}`, style: 'transform:rotate(-3deg)' }, `${unitTitle(unit)}: ${unit.report.grade}`));
    body.append(h('div', { class: 'flex', style: 'align-items:flex-start;gap:18px' }, wrap, h('div', { style: 'flex:1;min-width:260px;color:#efe6d0' }, notes, actions)));
    if (roll.dev?.notes.length) body.append(h('div', { style: 'color:#b9b09c;font-size:13px;margin-top:8px' }, h('b', null, 'Processing: '), roll.dev.notes.join(' ')));
    if (roll.found) body.append(h('div', { class: 'hand', style: 'color:#d9c99c;margin-top:8px' }, storyText(roll)));
  };

  const renderPrints = () => {
    body.innerHTML = '';
    const prints = s.prints.filter((p) => !p.testStrip);
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px' });
    for (const p of prints.slice().reverse()) {
      const img = h('img', { style: 'width:100%' });
      void game.images.url(p.key).then((u) => u && (img.src = u));
      grid.append(h('div', null, h('div', { class: 'photo', style: 'width:100%' }, img), h('div', { style: 'color:#efe6d0;font-size:13px;margin-top:6px' }, `${p.score}/100 · day ${p.day}${p.exhibited ? ' · exhibited' : ''}`)));
    }
    if (!prints.length) body.append(h('p', { style: 'color:#cfc6b2' }, 'No prints yet. The enlarger is in the darkroom.'));
    body.append(grid);
    const good = prints.filter((p) => p.score >= 60 && !p.exhibited);
    if (s.chapter >= 4 && !hasFlag(s, 'show-hung')) {
      body.append(
        h(
          'div',
          { style: 'margin-top:14px' },
          btn(`Hang the show at the Harbour Café (${Math.min(good.length, 3)}/3 good prints)`, () => {
            if (good.length < 3) {
              game.hud.toast('You need three prints scoring 60 or more.', 'bad');
              return;
            }
            const best = good.sort((a, b) => b.score - a.score).slice(0, 3);
            best.forEach((p) => (p.exhibited = true));
            const avg = best.reduce((a, p) => a + p.score, 0) / 3;
            const sold = best.filter((p) => p.score >= 70).length;
            const income = sold * 90;
            s.money += income;
            s.rep += Math.round(avg / 10);
            setFlag(s, 'show-hung');
            game.audio.coin();
            game.hud.letter('Inês, Harbour Café', 'Opening night', `Full house. People stood in front of your prints for a long time. ${sold ? `${sold} sold (your 70% share: ${money(income)}).` : 'None sold this time, but everyone asked who took them.'} Ruth would have liked the one by the door.`);
            game.save();
            game.progress();
            renderPrints();
          }),
        ),
      );
    }
  };
  setTab('negs');
}

function rollLabel(game: Game, r: Roll): string {
  const u = unitById(game.state, r.unitId);
  const f = film(r.stockId);
  return `${r.found ? 'Found roll' : `${f.name} @ ${r.ei}`} · ${u ? camera(u.modelId).name : 'camera'} · ${r.frames.length} fr · day ${r.frames[0]?.meta.day ?? '?'}`;
}

function frameNotes(game: Game, roll: Roll, f: FrameRecord): HTMLElement {
  const m = f.meta;
  const d = h('div', { style: 'font-size:14px;line-height:1.6' });
  if (roll.found) {
    d.append(h('div', null, 'Frame from the found roll. Exposure unknown.'));
    return d;
  }
  const lensName = m.lensId ? lensModel(m.lensId).name : '';
  d.append(
    h('div', { class: 'label', style: 'color:#d9c99c' }, `Frame ${f.idx + 1}`),
    h('div', null, `${LIGHTING_LABEL[m.lighting]} · ${m.location}`),
    h('div', null, `${formatAperture(m.aperture)} · ${formatSpeed(m.marked)} · focus ${m.focusDist > 500 ? '∞' : m.focusDist.toFixed(1) + ' m'}`),
    h('div', null, `${lensName}${m.focal ? ` (${Math.round(m.focal)}mm)` : ''}`),
    h('div', null, m.usedMeter ? 'Exposed by the camera\'s meter' : 'Exposed manually'),
  );
  if (game.state.assist === 'guided') {
    d.append(h('div', { style: 'margin-top:6px;color:#b9b09c' }, `Exposure vs. EI: ${m.error > 0 ? '+' : ''}${m.error.toFixed(1)} stops${m.subject ? ` · subject: ${subjectName(m.subject)} (${Math.round(m.coverage * 100)}% of frame, ${m.inFocus ? 'in focus' : 'out of focus'})` : ''}${m.shake > 0.3 ? ' · camera shake' : ''}`));
  }
  return d;
}

function testReport(game: Game, roll: Roll, after: () => void) {
  const s = game.state;
  const unit = unitById(s, roll.unitId)!;
  const options = defectsFor(unit.modelId);
  const claimed = new Set<DefectId>();
  let grade: TestReport['grade'] = 'working';
  const sheet = h('div', { class: 'sheet', style: 'width:520px' }, h('div', { class: 'label' }, 'Field Test · camera report'), h('h2', null, `${unitTitle(unit)} · No. ${unit.serial}`), h('p', { class: 'small' }, 'Tick what your test roll shows. Only report what you can see on the film or found by hand.'));
  for (const o of options) sheet.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e: Event) => ((e.target as HTMLInputElement).checked ? claimed.add(o) : claimed.delete(o)) }), DEFECT_LABEL[o]));
  const gradeRow = h('div', { class: 'flex', style: 'margin:12px 0' });
  const stamps: HTMLElement[] = [];
  (['working', 'quirky', 'faulty'] as const).forEach((g) => {
    const st = h('div', { class: `stamp ${g === 'working' ? 'green' : g === 'quirky' ? 'blue' : ''}`, style: `cursor:pointer;opacity:${g === grade ? 0.9 : 0.25}` }, g);
    st.addEventListener('click', () => {
      grade = g;
      stamps.forEach((x, i) => (x.style.opacity = ['working', 'quirky', 'faulty'][i] === g ? '0.9' : '0.25'));
      game.audio.stamp();
    });
    stamps.push(st);
    gradeRow.append(st);
  });
  sheet.append(h('div', { class: 'label', style: 'margin-top:8px' }, 'Verdict'), gradeRow, h('p', { class: 'small' }, 'Working: nothing wrong. Quirky: usable with care (meter off, a little haze). Faulty: leaks, capping, badly wrong shutter, fungus.'));
  sheet.append(
    btn('File the report', () => {
      const ev: FrameEvidence[] = roll.frames.map((f) => ({ marked: f.meta.marked, aperture: f.meta.aperture, focusDist: f.meta.focusDist, subjectDist: f.meta.subjectDist, usedMeter: f.meta.usedMeter, independentExposure: f.meta.independent }));
      const sc = scoreReport(unit, ev, [...claimed], grade);
      unit.report = { grade, defects: [...claimed], day: s.day, accuracy: sc.accuracy };
      roll.reportFiled = true;
      const pay = unit.clientJob ? 0 : Math.round(25 + sc.accuracy * 0.5);
      s.money += pay;
      s.rep += sc.rep;
      game.audio.stamp();
      c();
      const truth = trueDefects(unit);
      const res = h(
        'div',
        { class: 'sheet card', style: 'width:480px' },
        h('h2', null, 'Report filed'),
        h('div', { class: `stamp big ${sc.accuracy >= 75 ? 'green' : sc.accuracy >= 50 ? 'blue' : ''}`, style: 'margin:6px 0 12px' }, `${sc.accuracy}% accurate`),
        h('p', { class: 'small' }, `The editor's own check (with a shutter tester and a collimator): ${truth.length ? truth.map((d) => DEFECT_LABEL[d]).join(', ') : 'no defects'}. Verdict: ${sc.truthGrade}.`),
        sc.missed.length ? h('p', { class: 'small' }, `Visible on your roll but not reported: ${sc.missed.map((d) => DEFECT_LABEL[d]).join(', ')}.`) : null,
        sc.wrong.length ? h('p', { class: 'small' }, `Reported but not there: ${sc.wrong.map((d) => DEFECT_LABEL[d]).join(', ')}.`) : null,
        pay ? h('p', null, `Fee: ${money(pay)}. Reputation ${sc.rep >= 0 ? '+' : ''}${sc.rep}.`) : h('p', null, 'Client camera: return it from the desk.'),
        btn('OK', () => c3()),
      );
      const c3 = game.hud.modal(res);
      game.save();
      game.progress();
      after();
    }),
  );
  const c = game.hud.modal(sheet);
}

const STORIES = [
  'Arthur\'s roll: the harbour before the new breakwater. The MARIGOLD was his father\'s boat. The clock face was still blue and gold then.',
  'Someone stood exactly where you stood, a long time ago.',
  'The town looks smaller, quieter. The boats have different names.',
];

function storyText(roll: Roll): string {
  const seed = roll.found?.storySeed ?? 0;
  return seed === 41 ? STORIES[0] : STORIES[1 + (seed % 2)];
}

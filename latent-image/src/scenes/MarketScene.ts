/**
 * Saturday market on the quay (or the estate sale at 14 Rope Walk).
 * Stalls with real cameras, lenses and expired film; inspect, haggle, buy.
 */
import { CascadedShadowGenerator, Color3, DirectionalLight, MeshBuilder, PointerEventTypes, Vector3, TransformNode, DynamicTexture, Mesh, AbstractMesh, Matrix } from '@babylonjs/core';
import type { Game, SceneHost } from '../app/Game';
import { Mats } from '../render/materials';
import { makeEnvironment, skyFor, skyPainter, studioPainter } from '../render/env';
import { makePipeline, SHADOW_SIZE } from '../render/quality';
import { GlideCamera, Pose, V, findMeta, newScene } from './common';
import { buildHarbour, buildPortraitRoom } from '../models/locations';
import { table as tableProp } from '../models/props';
import { roundedBox, textTexture } from '../models/geom';
import { buildCamera } from '../models/CameraBuilder';
import { buildLens } from '../models/LensBuilder';
import { Inspector } from './Inspector';
import { h, btn, money } from '../ui/dom';
import { FLAW_LINES, Listing, Market, generateMarket, haggle, inspectableFlaws, openBox, pointOutFlaw, sellPrice } from '../sim/market';
import { camera, film, lens as lensModel } from '../sim/data';
import { setFlag } from '../sim/state';
import { venueFor } from '../sim/career';
import { weatherFor } from '../ui/panels';
import { lensValue } from '../sim/units';

export async function createMarket(game: Game, _args: Record<string, unknown>): Promise<SceneHost> {
  const s = game.state;
  const q = s.settings.quality;
  const venue = venueFor(s);
  const scene = newScene(game.engine);
  const mats = new Mats(scene);
  const outdoor = venue === 'flea';
  const lighting = outdoor ? weatherFor(s.day) : 'window';
  const toSun = new Vector3(-0.55, 0.62, -0.55).normalize();
  const env = outdoor ? await makeEnvironment(scene, skyPainter(skyFor(lighting, [toSun.x, toSun.y, toSun.z]))) : await makeEnvironment(scene, studioPainter([1, 0.2, 0], [0, 1, 0], 1));
  scene.environmentTexture = env;
  if (outdoor) {
    const sky = scene.createDefaultSkybox(env, true, 1500, 0, false);
    if (sky) sky.isPickable = false;
  }
  const sun = new DirectionalLight('sun', outdoor ? toSun.scale(-1) : new Vector3(-1, -0.45, 0.1).normalize(), scene);
  sun.intensity = outdoor ? (lighting === 'overcast' ? 0.6 : 4.5) : 3.5;
  if (!outdoor) sun.position = new Vector3(8, 5, 0);
  const csm = new CascadedShadowGenerator(SHADOW_SIZE[q], sun);
  csm.usePercentageCloserFiltering = true;
  csm.shadowMaxZ = outdoor ? 60 : 12;
  csm.lambda = 0.9;
  csm.bias = 0.002;
  csm.normalBias = 0.015;
  const loc = outdoor ? buildHarbour(scene, mats, { lighting, sunDir: toSun }) : buildPortraitRoom(scene, mats, { lighting: 'window', sunDir: toSun });
  for (const m of loc.root.getChildMeshes()) if (m.name !== 'water' && m.name !== 'quay') csm.addShadowCaster(m, false);
  if (!outdoor) {
    // estate sale: hide the portrait props a bit and add trestle tables
    for (const m of scene.meshes) if (['head', 'cloche', 'band', 'neck', 'nose', 'stand', 'chart'].includes(m.name)) m.setEnabled(false);
  }

  const market: Market = generateMarket(s, venue);
  setFlag(s, 'visited-market');
  for (const l of market.listings) if (l.unit && !s.catalogSeen.includes(l.unit.modelId)) s.catalogSeen.push(l.unit.modelId);

  // ---------- stalls ----------
  const stallPos = (i: number): { pos: Vector3; ry: number } =>
    outdoor ? { pos: new Vector3(-8 + i * 4.2, 0, 3.5), ry: 0 } : { pos: new Vector3(-1.2 + (i % 2) * 2.0, 0, -0.6 + Math.floor(i / 2) * 1.6), ry: Math.PI / 2 };
  const awningCols = ['#7a2318', '#1f3b5c', '#2d5131', '#8a6a1a', '#5c2a4a'];
  const stalls: { seller: string; root: TransformNode; pose: Pose; items: { l: Listing; node: TransformNode; anchor: Vector3 }[] }[] = [];
  market.sellers.forEach((seller, i) => {
    const { pos, ry } = stallPos(i);
    const root = new TransformNode(`stall-${i}`, scene);
    root.position.copyFrom(pos);
    root.rotation.y = ry;
    const tb = tableProp(scene, mats, outdoor ? 2.2 : 1.4, 0.9, 0.78, 'deskWood');
    tb.root.parent = root;
    const cloth = MeshBuilder.CreateBox('cloth', { width: outdoor ? 2.3 : 1.5, height: 0.01, depth: 1.0 }, scene);
    cloth.parent = root;
    cloth.position.y = 0.785;
    cloth.material = mats.textured('cloth', 4, 2, i % 2 ? new Color3(0.55, 0.15, 0.12) : new Color3(0.25, 0.32, 0.45), 0.8);
    const skirt = MeshBuilder.CreatePlane('clothSkirt', { width: outdoor ? 2.3 : 1.5, height: 0.6 }, scene);
    skirt.parent = root;
    skirt.position.set(0, 0.48, -0.5);
    skirt.material = cloth.material;
    if (outdoor) {
      const tex = new DynamicTexture('awning', { width: 512, height: 256 }, scene, true);
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k % 2 ? '#efe7d4' : awningCols[i % awningCols.length];
        ctx.fillRect(k * 64, 0, 64, 256);
      }
      tex.update(true);
      const aw = MeshBuilder.CreatePlane('awning', { width: 2.6, height: 1.4, sideOrientation: Mesh.DOUBLESIDE }, scene);
      aw.parent = root;
      aw.position.set(0, 2.25, 0.05);
      aw.rotation.x = Math.PI / 2 + 0.35;
      aw.material = mats.decal(tex, 0.85);
      for (const sx of [-1.15, 1.15])
        for (const sz of [-0.55, 0.65]) {
          const pole = MeshBuilder.CreateCylinder('pole', { diameter: 0.04, height: sz > 0 ? 2.5 : 2.0 }, scene);
          pole.parent = root;
          pole.position.set(sx, sz > 0 ? 1.25 : 1.0, sz);
          pole.material = mats.painted(new Color3(0.1, 0.1, 0.1), 0.5, 'pole');
        }
    }
    const sign = MeshBuilder.CreatePlane('sign', { width: 0.7, height: 0.32 }, scene);
    sign.parent = root;
    sign.position.set(outdoor ? 0.75 : 0.45, outdoor ? 1.55 : 1.15, 0.42);
    sign.rotation.x = -0.1;
    sign.material = mats.decal(textTexture(scene, [seller.name], { w: 512, h: 230, bg: '#1d211e', color: '#ece8dc', font: '400 80px "Reenie Beanie"' }), 0.9);
    const items = market.listings.filter((l) => l.sellerId === seller.id);
    const placed: { l: Listing; node: TransformNode; anchor: Vector3 }[] = [];
    items.forEach((l, k) => {
      const node = new TransformNode(`item-${l.id}`, scene);
      node.parent = root;
      const n = items.length;
      const span = outdoor ? 1.9 : 1.2;
      node.position.set(-span / 2 + (span * (k + 0.5)) / n, 0.79, -0.12 + (k % 2) * 0.18);
      node.rotation.y = Math.PI + (k % 3 - 1) * 0.3;
      if (l.unit) {
        const r = buildCamera(scene, mats, l.unit, l.unit.bundledLens);
        r.root.parent = node;
        r.root.position.y = r.size[1] / 2 + (camera(l.unit.modelId).kind === 'super8' ? 0.14 : 0.001);
        r.setCounter(l.unit.foundRoll ? l.unit.foundRoll.framesShot : 0);
      } else if (l.lens) {
        const lr = buildLens(scene, mats, lensModel(l.lens.modelId), { haze: l.lens.haze });
        lr.root.parent = node;
        lr.root.rotation.x = -Math.PI / 2;
        lr.root.position.y = 0.0;
      } else if (l.kind === 'film') {
        for (let b = 0; b < (l.qty ?? 1); b++) {
          const bx = roundedBox('filmBox', scene, 0.06, 0.04, 0.035, 0.003, 2);
          bx.parent = node;
          bx.position.set(b * 0.065 - 0.06, 0.02, 0);
          const f = film(l.stockId!);
          bx.material = mats.painted(f.maker === 'Kodak' ? new Color3(0.85, 0.6, 0.05) : f.maker === 'Ilford' ? new Color3(0.9, 0.9, 0.88) : new Color3(0.1, 0.4, 0.2), 0.5, `fb-${f.maker}`);
        }
      } else if (l.kind === 'box') {
        const bx = roundedBox('mysteryBox', scene, 0.34, 0.22, 0.26, 0.01, 2);
        bx.parent = node;
        bx.position.y = 0.11;
        bx.material = mats.textured('paper', 2, 2, new Color3(0.55, 0.4, 0.25), 0.5);
      } else if (l.accessory === 'tripod') {
        for (let t = 0; t < 3; t++) {
          const leg = MeshBuilder.CreateCylinder('tripodLeg', { diameter: 0.02, height: 0.6 }, scene);
          leg.parent = node;
          leg.rotation.z = Math.PI / 2;
          leg.position.set(0, 0.012 + t * 0.022, 0);
          leg.material = mats.textured('deskWood', 0.2, 1);
        }
      }
      for (const m of node.getChildMeshes()) {
        m.metadata = { ...(m.metadata ?? {}), listing: l.id };
        csm.addShadowCaster(m, false);
        m.receiveShadows = true;
      }
      placed.push({ l, node, anchor: node.getAbsolutePosition() });
    });
    const world = root.getAbsolutePosition();
    const facing = new Vector3(Math.sin(ry), 0, Math.cos(ry)).scale(-1);
    const pose: Pose = { pos: world.add(facing.scale(1.25)).add(new Vector3(0, 1.45, 0)), target: world.add(new Vector3(0, 0.82, 0)), fov: 0.85 };
    for (const m of root.getChildMeshes()) if (!m.metadata?.listing) m.metadata = { ...(m.metadata ?? {}), stall: i };
    stalls.push({ seller: seller.id, root, pose, items: placed });
  });

  // ---------- camera ----------
  const overview: Pose = outdoor ? { pos: V(0, 2.1, -4.5), target: V(0, 1.0, 4), fov: 1.0 } : { pos: V(-3.0, 1.6, 0.2), target: V(1.2, 0.9, 0.2), fov: 1.0 };
  const glide = new GlideCamera(scene, overview);
  const pipe = makePipeline(scene, [glide.cam], q, { exposure: 1.0, contrast: 1.08, bloom: 0.12, ssaoRadius: 0.6, vignette: 0.3 });
  // exposure for the bright outdoors
  pipe.main.imageProcessing.exposure = outdoor ? (lighting === 'overcast' ? 1.3 : 0.55) : 0.9;

  // ---------- UI ----------
  const layer = game.hud.sceneLayer;
  const tagLayer = h('div', { class: 'passthrough', style: 'position:absolute;inset:0' });
  const panel = h('div', { class: 'sheet card side-panel', style: 'width:400px;display:none' });
  layer.append(tagLayer, panel);
  game.hud.setVisible({ clip: true });
  let mode: 'overview' | 'stall' | 'inspect' = 'overview';
  let curStall = -1;
  let inspector: Inspector | null = null;
  let current: Listing | null = null;
  const tags = new Map<string, HTMLElement>();

  const hints = () =>
    game.hud.hints(mode === 'overview' ? [['Click', 'a stall'], ['Esc', 'go home']] : mode === 'stall' ? [['Click', 'an item'], ['Esc', 'step back']] : [['Drag', 'turn it over'], ['Click part', 'inspect'], ['Esc', 'put it down']]);
  hints();
  game.hud.toast(outdoor ? `Saturday market. ${market.sellers.length} stalls today.` : 'Estate sale, 14 Rope Walk. Mrs. Pell watches from the doorway.', '', 5000);

  const updateTags = () => {
    const eng = game.engine;
    const w = eng.getRenderWidth();
    const hh = eng.getRenderHeight();
    const vp = glide.cam.viewport.toGlobal(w, hh);
    const cw = game.canvas.clientWidth;
    const ch = game.canvas.clientHeight;
    for (const st of stalls)
      for (const it of st.items) {
        let el = tags.get(it.l.id);
        if (!el) {
          el = h('div', { class: 'pricetag', style: `--rot:${(Math.random() * 12 - 6).toFixed(1)}deg` });
          tags.set(it.l.id, el);
          tagLayer.append(el);
        }
        if (it.l.sold) {
          el.style.display = 'none';
          continue;
        }
        const p = Vector3.Project(it.node.getAbsolutePosition().add(new Vector3(0, 0.12, 0)), Matrix.Identity(), scene.getTransformMatrix(), vp);
        const visible = p.z > 0 && p.z < 1 && (mode === 'stall' ? st === stalls[curStall] : mode === 'overview');
        el.style.display = visible ? '' : 'none';
        el.style.left = `${(p.x / w) * cw}px`;
        el.style.top = `${(p.y / hh) * ch}px`;
        const price = it.l.agreed ?? it.l.lastCounter ?? it.l.ask;
        el.innerHTML = `${money(price)}<small>${it.l.kind === 'box' ? 'as is!' : it.l.label.slice(0, 26)}</small>`;
      }
  };
  scene.onAfterRenderObservable.add(updateTags);

  const sellerOf = (l: Listing) => market.sellers.find((x) => x.id === l.sellerId)!;

  const openStall = (i: number) => {
    curStall = i;
    mode = 'stall';
    glide.go(stalls[i].pose);
    const seller = market.sellers.find((x) => x.id === stalls[i].seller)!;
    panel.style.display = '';
    panel.innerHTML = '';
    panel.append(h('div', { class: 'label' }, seller.style === 'dealer' ? 'Dealer' : 'Stall'), h('h2', null, seller.name), h('p', { class: 'hand', style: 'font-size:22px' }, `"${seller.greeting}"`));
    for (const it of stalls[i].items) panel.append(h('div', { class: `row ${it.l.sold ? 'disabled' : ''}`, onclick: () => !it.l.sold && openItem(it.l) }, h('span', null, it.l.label), h('span', { class: 'r' }, it.l.sold ? 'sold' : money(it.l.agreed ?? it.l.lastCounter ?? it.l.ask))));
    if (seller.style === 'dealer') {
      const mine = s.cameras.filter((c) => !c.clientJob && c.id !== s.activeCameraId && !c.rollId);
      if (mine.length) {
        panel.append(h('hr'), h('h3', null, 'Sell to the dealer'));
        for (const c of mine)
          panel.append(
            h('div', { class: 'row', onclick: async () => {
              const p = sellPrice(c);
              if (!(await game.hud.confirm('Sell?', `${camera(c.modelId).maker} ${camera(c.modelId).name} for ${money(p)}${c.report ? ` (your "${c.report.grade}" report raises the price)` : ' (untested)'}?`, 'Sell', 'Keep'))) return;
              s.cameras = s.cameras.filter((x) => x.id !== c.id);
              if (c.lensId) c.lensId = undefined;
              s.money += p;
              game.audio.coin();
              game.save();
              game.progress();
              openStall(i);
            } }, h('span', null, `${camera(c.modelId).name} No. ${c.serial}`), h('span', { class: 'r' }, money(sellPrice(c)))),
          );
      }
    }
    panel.append(h('div', { style: 'margin-top:10px' }, btn('Next stall', () => openStall((i + 1) % stalls.length)), btn('Step back', back, 'red')));
    hints();
  };

  const back = () => {
    if (mode === 'inspect') {
      closeInspect();
      openStall(curStall);
      return;
    }
    mode = 'overview';
    curStall = -1;
    panel.style.display = 'none';
    glide.go(overview);
    hints();
  };

  const closeInspect = () => {
    inspector?.dispose();
    inspector = null;
    if (current) {
      const it = stalls.flatMap((x) => x.items).find((x) => x.l.id === current!.id);
      it?.node.setEnabled(!current.sold);
    }
    current = null;
  };

  const openItem = (l: Listing) => {
    closeInspect();
    current = l;
    mode = 'inspect';
    const it = stalls[curStall].items.find((x) => x.l.id === l.id)!;
    const seller = sellerOf(l);
    if (l.unit) {
      it.node.setEnabled(false);
      const st = stalls[curStall];
      const anchor = st.pose.target.add(st.pose.pos.subtract(st.pose.target).scale(0.45)).add(new Vector3(0, -0.12, 0));
      inspector = new Inspector({
        scene,
        mats,
        unit: l.unit,
        lensUnit: l.unit.bundledLens,
        anchor,
        audio: game.audio,
        hud: game.hud,
        scale: 1,
        baseYaw: glide.cam.rotation.y + Math.PI + 0.4,
        confirmOpenBack: async () => {
          if (!l.unit!.foundRoll) return true;
          return game.hud.confirm('Film inside!', 'The counter shows exposed frames. Open the back in daylight?', 'Open it', 'Leave it');
        },
        onFinding: (c) => {
          if (c === 'back' && l.unit!.foundRoll && inspector && inspector.backOpen < 0.5) {
            l.unit!.foundRoll = undefined;
            game.hud.toast('Light pours in. Whatever was on that roll is gone.', 'bad', 6000);
          }
          renderHaggle();
        },
      });
      for (const m of inspector.rig.root.getChildMeshes()) csm.addShadowCaster(m, false);
      glide.go({ pos: anchor.add(st.pose.pos.subtract(anchor).normalize().scale(0.42)).add(new Vector3(0, 0.08, 0)), target: anchor.add(new Vector3(0, 0.04, 0)), fov: 0.75 });
    } else glide.go({ pos: it.node.getAbsolutePosition().add(stalls[curStall].pose.pos.subtract(it.node.getAbsolutePosition()).normalize().scale(0.7)), target: it.node.getAbsolutePosition(), fov: 0.75 });
    renderHaggle();
    void seller;
    hints();
  };

  const renderHaggle = () => {
    const l = current;
    if (!l) return;
    const seller = sellerOf(l);
    panel.innerHTML = '';
    panel.style.display = '';
    panel.append(h('div', { class: 'label' }, seller.name), h('h2', null, l.label));
    if (l.unit) {
      const m = camera(l.unit.modelId);
      panel.append(h('p', { class: 'small' }, `${m.year}. ${m.notes}`), h('p', { class: 'small' }, `Rarity ${'●'.repeat(m.rarity)}${'○'.repeat(5 - m.rarity)} · typical price for a working one ~${money(m.value)}`));
      if (l.unit.bundledLens) panel.append(h('p', { class: 'small' }, `With ${lensModel(l.unit.bundledLens.modelId).name}.`));
      const found = inspector ? [...inspector.findings.entries()] : [];
      if (!found.length) panel.append(h('p', { class: 'hand', style: 'font-size:21px' }, 'Turn it over. Open the back, torch the lens, fire it.'));
      for (const [c, f] of found) panel.append(h('p', { class: 'small' }, h('b', null, `${c}: `), f.text));
      const flaws = inspectableFlaws(l.unit).filter((f) => found.some(([, x]) => x.flaw === f) || (f === 'dents' && l.unit!.inspected.length >= 2));
      if (flaws.length) {
        panel.append(h('div', { class: 'label', style: 'margin-top:6px' }, 'Point out'));
        const row = h('div', { class: 'flex' });
        for (const f of flaws) row.append(btn(f, () => (sayLine(pointOutFlaw(l, seller, f)), renderHaggle()), l.pointed.includes(f) ? 'mini blue' : 'mini'));
        panel.append(row);
      }
    } else if (l.lens) {
      const lm = lensModel(l.lens.modelId);
      panel.append(h('p', { class: 'small' }, `${lm.notes} ${l.lens.haze > 0.3 ? 'Held to the light: a milky haze inside.' : 'Held to the light: clear glass.'}${l.lens.fungus > 0.25 ? ' Fine fungus threads near the edge.' : ''}${l.lens.oilyBlades ? ' The aperture blades look wet with oil.' : ''}`), h('p', { class: 'small' }, `Fair value ~${money(lensValue(l.lens))}.`));
      if (l.lens.haze > 0.3 && !l.pointed.includes('haze')) panel.append(btn('Point out the haze', () => (sayLine(pointOutFlaw(l, seller, 'haze')), renderHaggle()), 'mini'));
    } else if (l.kind === 'film') panel.append(h('p', { class: 'small' }, `${film(l.stockId!).notes} Expired about ${l.expiredYears} years. Expect fog: overexpose a stop or two.`));
    else if (l.kind === 'box') panel.append(h('p', { class: 'small' }, 'Taped shut. It rattles. Could be junk, could be something good.'));
    const price = l.agreed ?? l.lastCounter ?? l.ask;
    panel.append(h('div', { style: 'font-family:var(--font-hand);font-size:34px;color:#1d2a5a;margin:8px 0' }, money(price)), h('div', { class: 'small' }, `Patience: ${'■'.repeat(Math.max(0, seller.patience))}${'□'.repeat(Math.max(0, 4 - seller.patience))}`));
    const offer = h('input', { type: 'number', value: String(Math.round(price * 0.75)), min: '1', style: 'width:90px' });
    const line = h('p', { class: 'hand', style: 'font-size:22px;min-height:28px' });
    lineEl = line;
    panel.append(
      line,
      h(
        'div',
        { class: 'flex' },
        offer,
        btn('Offer', () => {
          const v = Math.round(Number(offer.value));
          if (!(v > 0)) return;
          const r = haggle(l, seller, v);
          sayLine(r.line);
          if (r.accepted) buy(l, r.price);
          else renderHaggle();
        }),
        btn(`Pay ${money(price)}`, () => buy(l, price)),
      ),
      h('div', { style: 'margin-top:8px' }, btn('Put it down', back, 'red')),
    );
    if (lastLine) line.textContent = lastLine;
  };
  let lineEl: HTMLElement | null = null;
  let lastLine = '';
  const sayLine = (t: string) => {
    lastLine = t;
    if (lineEl) lineEl.textContent = t;
    game.audio.paper();
  };

  const buy = (l: Listing, price: number) => {
    if (s.money < price) {
      game.hud.toast(`You only have ${money(s.money)}.`, 'bad');
      return;
    }
    s.money -= price;
    l.sold = true;
    l.agreed = price;
    game.audio.coin();
    if (l.unit) {
      const u = l.unit;
      u.paid = price;
      u.acquiredDay = s.day;
      if (u.bundledLens) {
        u.bundledLens.paid = 0;
        s.lenses.push(u.bundledLens);
        u.lensId = u.bundledLens.id;
        u.bundledLens = undefined;
      }
      s.cameras.push(u);
      game.hud.toast(`Bought: ${l.label} for ${money(price)}.`, 'good');
    } else if (l.lens) {
      l.lens.paid = price;
      s.lenses.push(l.lens);
      game.hud.toast(`Bought: ${l.label}.`, 'good');
    } else if (l.kind === 'film') {
      const e = s.expiredFilm.find((x) => x.stockId === l.stockId && x.expiredYears === l.expiredYears);
      if (e) e.count += l.qty ?? 1;
      else s.expiredFilm.push({ stockId: l.stockId!, expiredYears: l.expiredYears ?? 10, count: l.qty ?? 1 });
      game.hud.toast('Into the bag. It goes in the fridge at home.', 'good');
    } else if (l.kind === 'box') {
      const u = openBox(l.boxSeed!, s);
      u.paid = price;
      s.cameras.push(u);
      if (!s.catalogSeen.includes(u.modelId)) s.catalogSeen.push(u.modelId);
      const m = camera(u.modelId);
      game.hud.letter('The box', 'You open it on the quay wall', `Under some newspaper from 1987: a ${m.maker} ${m.name}${u.traits.cosmetic <= 4 ? ', dented and grimy' : ', in surprisingly decent shape'}.${u.foundRoll ? ' The frame counter is not on S…' : ''}`);
    } else if (l.accessory === 'tripod') {
      if (!s.tools.includes('tripod')) s.tools.push('tripod');
      game.hud.toast('Tripod: press T in the viewfinder to set it up.', 'good');
    }
    closeInspect();
    game.save();
    game.progress();
    openStall(curStall);
  };

  scene.onPointerObservable.add((pi) => {
    if (game.hud.modalOpen || mode === 'inspect') return;
    const e = pi.event as PointerEvent;
    const pick = pi.type === PointerEventTypes.POINTERMOVE || pi.type === PointerEventTypes.POINTERUP ? scene.pick(scene.pointerX, scene.pointerY) : null;
    const lid = pick?.pickedMesh ? findMeta<string>(pick.pickedMesh as AbstractMesh, 'listing')?.value : undefined;
    const stall = pick?.pickedMesh ? findMeta<number>(pick.pickedMesh as AbstractMesh, 'stall')?.value : undefined;
    if (pi.type === PointerEventTypes.POINTERMOVE) {
      game.canvas.style.cursor = lid || stall !== undefined ? 'pointer' : 'default';
    } else if (pi.type === PointerEventTypes.POINTERUP && e.button === 0) {
      if (lid) {
        const si = stalls.findIndex((x) => x.items.some((it) => it.l.id === lid));
        if (si !== curStall) openStall(si);
        const l = market.listings.find((x) => x.id === lid)!;
        if (!l.sold) openItem(l);
      } else if (stall !== undefined) openStall(stall);
    }
  });

  const leave = () => {
    s.day += 1;
    s.marketDay += 1;
    game.save();
    void game.goto('studio');
  };

  const host: SceneHost = {
    scene,
    dispose: () => {
      inspector?.dispose();
      pipe.dispose();
      scene.dispose();
    },
    onKey: (e, down) => {
      if (!down || e.key !== 'Escape') return;
      if (game.hud.closeTop()) return;
      if (mode !== 'overview') back();
      else void game.hud.confirm('Head home?', 'The stalls pack up at noon. Next Saturday there will be different stock.', 'Go home', 'Keep browsing').then((y) => y && leave());
    },
  };
  game.audio.loop('market', true);
  return host;
}

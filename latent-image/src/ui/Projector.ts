/** Super 8 projector: plays developed reversal footage on the studio screen. */
import { DynamicTexture, Mesh, Scene, TransformNode, SpotLight, Vector3, Color3, PBRMaterial } from '@babylonjs/core';
import type { Game } from '../app/Game';
import type { Mats } from '../render/materials';
import { h, btn } from './dom';
import { setFlag } from '../sim/state';

export function openProjector(game: Game, scene: Scene, mats: Mats, screen: Mesh, lensFront: TransformNode, onClose: () => void): void {
  const s = game.state;
  const reels = s.rolls.filter((r) => r.format === 'super8' && r.state === 'developed' && !r.dev?.ruined);
  const sheet = h('div', { class: 'sheet card', style: 'position:absolute;right:16px;bottom:60px;width:340px' });
  const close = game.hud.modal(sheet, { clear: true, onClose: () => stop(true) });
  sheet.append(h('h2', null, 'Projector'));
  if (!reels.length) {
    sheet.append(h('p', { class: 'small' }, 'No developed Super 8 reels. Shoot a cartridge and reversal-process it.'), btn('Close', () => close()));
    return;
  }
  const tex = new DynamicTexture('projTex', { width: 640, height: 444 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const oldMat = screen.material;
  const m = mats.decal(tex, 0.95, 0, 1.6);
  (m as PBRMaterial).emissiveIntensity = 1.4;
  screen.material = m;
  const beam = new SpotLight('beam', lensFront.getAbsolutePosition(), new Vector3(0, 0.1, -1), 0.5, 2, scene);
  beam.diffuse = new Color3(1, 0.95, 0.85);
  beam.intensity = 2;
  let playing = false;
  let timer = 0;
  game.audio.loop('projector', true);
  const play = async (rollIdx: number) => {
    const reel = reels[rollIdx];
    const frames: HTMLImageElement[] = [];
    for (const shot of reel.frames) {
      const n = shot.meta.frameCount ?? 0;
      for (let k = 0; k < n; k++) {
        const img = await game.images.image(`${shot.key}-${k}-pos`);
        if (img) frames.push(img);
      }
    }
    if (!frames.length) return;
    playing = true;
    let i = 0;
    const t0 = performance.now();
    const step = () => {
      if (!playing) return;
      const img = frames[i];
      const weave = (Math.random() - 0.5) * 4;
      const flick = 0.88 + Math.random() * 0.12;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 640, 444);
      ctx.globalAlpha = flick;
      ctx.drawImage(img, weave, weave * 0.5, 640, 444);
      ctx.globalAlpha = 1;
      if (Math.random() < 0.08) {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillRect(Math.random() * 640, Math.random() * 444, 2, 2 + Math.random() * 6);
      }
      tex.update(true);
      i++;
      if (i >= frames.length) {
        playing = false;
        setFlag(s, 'screened');
        game.save();
        game.progress();
        ctx.fillStyle = '#efe6cf';
        ctx.fillRect(0, 0, 640, 444);
        tex.update(true);
        game.hud.toast('The end. The reel flaps on the take-up spool.', 'good');
        return;
      }
      const due = t0 + (i * 1000) / 18;
      timer = window.setTimeout(step, Math.max(0, due - performance.now()));
    };
    step();
  };
  const sel = h('select', null, ...reels.map((r, i) => h('option', { value: String(i) }, `Reel ${i + 1}: ${r.frames.length} shots`)));
  sheet.append(sel, h('div', { style: 'margin-top:8px' }, btn('Thread & run', () => void play(Number(sel.value))), btn('Stop', () => close(), 'red')));
  const stop = (final: boolean) => {
    playing = false;
    clearTimeout(timer);
    game.audio.loop('projector', false);
    if (final) {
      beam.dispose();
      screen.material = oldMat;
      tex.dispose();
      onClose();
    }
  };
}

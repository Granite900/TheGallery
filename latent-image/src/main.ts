import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/jost/600.css';
import '@fontsource/jost/700.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/reenie-beanie/400.css';
import './ui/ui.css';
import { Game } from './app/Game';
import { h, paperNoiseDataUrl, stampMaskDataUrl } from './ui/dom';
import { ALL_TEXTURES, warmTextures } from './render/proctex';
import { createStudio } from './scenes/StudioScene';
import { createMarket } from './scenes/MarketScene';
import { createShoot } from './scenes/ShootScene';
import { createDarkroom } from './scenes/DarkroomScene';
import { debugDevelopAll } from './app/debug';
import { initPhoneLink } from './app/phoneLink';
import { FilmLab } from './render/filmLook';

async function boot() {
  const root = document.documentElement.style;
  root.setProperty('--paper-noise', paperNoiseDataUrl());
  root.setProperty('--stamp-mask', stampMaskDataUrl());
  const bar = h('i');
  const loader = h('div', { class: 'loader' }, h('div', { class: 'title' }, 'Latent Image'), h('div', { class: 'sub' }, 'mixing chemistry…'), h('div', { class: 'bar' }, bar));
  document.body.append(loader);
  await Promise.all(['400 20px Jost', '600 20px Jost', '400 20px "Courier Prime"', '400 20px "Reenie Beanie"'].map((f) => document.fonts.load(f).catch(() => undefined)));
  await warmTextures(ALL_TEXTURES, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  await game.images.open();
  game.register('menu', (g, a) => createStudio(g, { ...a, menu: true }));
  game.register('studio', (g, a) => createStudio(g, a));
  game.register('market', (g, a) => createMarket(g, a));
  game.register('shoot', (g, a) => createShoot(g, a));
  game.register('darkroom', (g, a) => createDarkroom(g, a));
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__game = game;
    (window as unknown as Record<string, unknown>).__develop = () => debugDevelopAll(game);
    (window as unknown as Record<string, unknown>).__lab = FilmLab;
  }
  initPhoneLink(game);
  await game.goto('menu');
  loader.style.opacity = '0';
  setTimeout(() => loader.remove(), 700);
}

boot().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { style: 'color:#eee;padding:20px;position:fixed;inset:0;z-index:99;background:#111' }, String(e?.stack ?? e)));
});

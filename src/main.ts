import { Game } from './game/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const game = new Game(container);
game.start();

if (import.meta.env.DEV) {
  // console access for debugging/automated playthrough checks
  (window as unknown as Record<string, unknown>).__game = game;
}

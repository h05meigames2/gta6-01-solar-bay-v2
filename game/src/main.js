// SOLAR BAY bootstrap: canvas loop + ?shot= scenes for screenshots. Written in this session.
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__solarbay = game;

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  game.setupShot(shot);
  game.render();
} else {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

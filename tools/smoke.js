// ブラウザなしで game.js を動かす煙テスト。ボットが1周＋α遊んで、例外やフェーズの詰まりがないか見る。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const stub = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : ['createLinearGradient', 'createRadialGradient'].includes(k) ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 6 }) : k === 'getContext' ? () => stub() : noop),
  set: (t, k, v) => { t[k] = v; return true; },
});
const listeners = {};
const sandbox = {
  console, Math, performance: { now: () => 0 }, localStorage: { getItem: () => null, setItem: noop },
  document: { getElementById: () => stub(), createElement: () => stub() },
  addEventListener: (ev, fn) => { listeners[ev] = fn; },
  requestAnimationFrame: noop, window: {},
};
vm.createContext(sandbox);
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'stages.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'game.js'), 'utf8') + '\n;this.__g=()=>({G,S,P,E,EB,IT});this.__u=update;this.__r=render;', sandbox);

const keys = new Set();
const set = (code, on) => { if (on && !keys.has(code)) { keys.add(code); listeners.keydown({ code, preventDefault: noop }); } if (!on && keys.has(code)) { keys.delete(code); listeners.keyup({ code }); } };
const tap = (code) => { set(code, false); set(code, true); };

tap('Enter'); sandbox.__u(); set('Enter', false);
const god = process.argv.includes('--god');
let last = '', t0 = 0, frames = 0, deaths = 0, lastLives = 3;
const log = [];
while (frames < 60 * 60 * 25) {
  const { G, S, P, E, EB, IT } = sandbox.__g();
  if (G.state === 'gameover') { log.push('GAME OVER at ' + last); break; }
  const key = `${G.loop}-${G.si}-${G.pi}:${S.type}`;
  if (key !== last) {
    if (last) log.push(`${last} ${((frames - t0) / 60).toFixed(0)}s score=${G.score} parts=[${P.units}] lives=${G.lives} P=${G.snare}`);
    last = key; t0 = frames;
    if (G.loop >= 1 && G.si >= 1) break;
  }
  if (frames - t0 > 60 * 240) { log.push(`STUCK ${key} enemies=${E.length} ${E.slice(0, 5).map((e) => e.kind + ':' + e.st + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' ')}`); break; }
  if (god) { G.lives = 3; }
  if (G.lives < lastLives) deaths++;
  lastLives = G.lives;
  // ボット: 近くの弾から逃げつつ、敵の真下に行って撃つ
  let tx = 120, ty = 280;
  const tgt = S.boss || E.filter((e) => e.st !== 'ally' && e.st !== 'ground' && !(e.wait > 0)).sort((a, b) => b.y - a.y)[0] || E.find((e) => e.st === 'ground') || IT[0];
  if (tgt) tx = tgt.x;
  if (IT.length) { tx = IT[0].x; ty = Math.max(160, IT[0].y); }
  for (const b of EB) if (Math.abs(b.x - P.x) < 14 && b.y < P.y && P.y - b.y < 60) tx = P.x + (b.x < P.x ? 30 : -30);
  if (S.type === 'docking') {
    set('ArrowLeft', P.x > S.mx + 1 && P.vx > -0.6); set('ArrowRight', P.x < S.mx - 1 && P.vx < 0.6);
    set('ArrowUp', P.vy > -0.6); set('ArrowDown', P.vy < -0.9);
    set('KeyZ', false);
  } else {
    set('ArrowLeft', tx < P.x - 3); set('ArrowRight', tx > P.x + 3);
    set('ArrowUp', ty < P.y - 3); set('ArrowDown', ty > P.y + 3);
    set('KeyZ', true);
    if (frames % 300 === 0) tap('KeyX');
    if (G.gauge >= 100) tap('KeyC');
  }
  sandbox.__u();
  if (frames % 7 === 0) sandbox.__r();
  frames++;
}
const { G } = sandbox.__g();
log.push(`end: state=${G.state} loop=${G.loop} si=${G.si} score=${G.score} deaths=${deaths} time=${(frames / 60).toFixed(0)}s`);
console.log(log.join('\n'));

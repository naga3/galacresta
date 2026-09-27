'use strict';
// GALA CRESTA — 陣形・捕獲・合体・地上戦を全部のせたレトロ縦シューティング

const W = 240, H = 320, SC = 2, TAU = Math.PI * 2;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W * SC;
cv.height = H * SC;
ctx.setTransform(SC, 0, 0, SC, 0, 0);
ctx.imageSmoothingEnabled = false;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FONT = '"Press Start 2P","DotGothic16",monospace';
const JFONT = '"DotGothic16","Press Start 2P",monospace';

// ================================================================ 入力
const keys = {}, pr = {};
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
addEventListener('keydown', (e) => {
  if (!keys[e.code]) pr[e.code] = true;
  keys[e.code] = true;
  if (PREVENT.has(e.code)) e.preventDefault();
  initAudio();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const fireHeld = () => keys.KeyZ || keys.Space;
const slowHeld = () => keys.ShiftLeft || keys.ShiftRight;

// ================================================================ 音
// 効果音は sfxBus、BGM は musicBus へ。どちらもコンプレッサーを通す。
// sndT に時刻を入れると、その時刻を基準に鳴らす（動画用のオフライン書き出しで使う）
let AC = null, master = null, musicBus = null, sfxBus = null, delayIn = null, noiseBuf = null, muted = false, sndT = null;
const WAVES = {};
function setupAudio(ac) {
  AC = ac;
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.55;
  master.connect(comp); comp.connect(AC.destination);
  musicBus = AC.createGain(); musicBus.gain.value = 0.6; musicBus.connect(master);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  // リードにかけるディレイ（付点8分）
  delayIn = AC.createDelay(1);
  const fb = AC.createGain(), wet = AC.createGain(), lp = AC.createBiquadFilter();
  fb.gain.value = 0.35; wet.gain.value = 0.3; lp.type = 'lowpass'; lp.frequency.value = 2800;
  delayIn.connect(lp); lp.connect(fb); fb.connect(delayIn); lp.connect(wet); wet.connect(musicBus);
  for (const d of [0.125, 0.25]) {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * d);
    WAVES[d] = AC.createPeriodicWave(re, im);
  }
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}
function initAudio() {
  if (AC) return;
  try { setupAudio(new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { AC = null; }
}
const sndNow = () => (sndT !== null ? sndT : AC.currentTime);
function tone(f, f2, dur, type = 'square', vol = 0.3, delay = 0, bus) {
  if (!AC) return;
  const t = sndNow() + Math.max(0, delay);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, delay = 0, hp = 0, bus) {
  if (!AC) return;
  const t = sndNow() + Math.max(0, delay);
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = noiseBuf;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  let node = s;
  if (hp) { const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; s.connect(f); node = f; }
  node.connect(g); g.connect(bus || sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const arp = (fs, step, vol = 0.12, type = 'square') => fs.forEach((f, i) => tone(f, f, step * 1.6, type, vol, i * step));
let shotSnd = 0;
const SFX = {
  shot: () => { if (shotSnd++ % 2 === 0) tone(1400, 500, 0.05, 'square', 0.05); },
  hit: () => tone(300, 120, 0.05, 'square', 0.08),
  pop: () => { noise(0.18, 0.22); tone(500, 60, 0.15, 'triangle', 0.2); },
  boom: () => { noise(0.5, 0.4); tone(200, 30, 0.5, 'sawtooth', 0.25); },
  huge: () => { noise(1.4, 0.5); tone(120, 20, 1.2, 'sawtooth', 0.35); tone(60, 20, 1.4, 'square', 0.2, 0.1); },
  dive: () => tone(1200, 300, 0.35, 'triangle', 0.06),
  beam: () => { for (let i = 0; i < 6; i++) tone(300 + i * 80, 900 + i * 60, 0.12, 'sawtooth', 0.06, i * 0.1); },
  beamHum: () => tone(220, 260, 0.2, 'sawtooth', 0.05),
  capture: () => arp([880, 830, 784, 740, 698, 659, 622, 587], 0.07, 0.12),
  rescue: () => arp([523, 659, 784, 1047, 1319], 0.06, 0.14),
  part: () => arp([660, 880, 1100, 1320, 1760], 0.05, 0.15),
  item: () => arp([988, 1319, 1976], 0.05, 0.12),
  lost: () => { tone(800, 100, 0.4, 'sawtooth', 0.2); noise(0.3, 0.3); },
  snare: () => { tone(200, 1600, 0.6, 'sawtooth', 0.12); tone(210, 1700, 0.6, 'square', 0.06); },
  suck: () => tone(1500, 300, 0.2, 'triangle', 0.12),
  firebird: () => { arp([392, 523, 659, 784, 1047, 1319, 1568], 0.06, 0.16, 'sawtooth'); noise(0.8, 0.2, 0, 2000); },
  formation: () => arp([523, 784, 1047, 784, 1047, 1568], 0.06, 0.14),
  warn: () => { for (let i = 0; i < 4; i++) { tone(880, 440, 0.25, 'sawtooth', 0.12, i * 0.5); tone(440, 880, 0.25, 'sawtooth', 0.12, i * 0.5 + 0.25); } },
  laser: () => tone(2000, 200, 0.4, 'sawtooth', 0.1),
  die: () => { noise(1.0, 0.45); arp([784, 622, 523, 392, 311, 262, 196], 0.08, 0.14, 'sawtooth'); },
  extend: () => arp([1047, 1319, 1568, 2093, 1568, 2093], 0.07, 0.14),
  clear: () => arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.08, 0.15),
  select: () => tone(880, 880, 0.04, 'square', 0.1),
  thrust: () => noise(0.06, 0.05, 0, 800),
};

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
// ---------------------------------------------------------------- BGM（小さなトラッカー）
// mel: 16分音符ごとのトークン。'-' 伸ばす / '.' 休符。小節は '|' 区切り
// chords: 小節ごとのコード。bass: drive / gallop / pulse / walk。arp: up / updown / 空
const SONGS = {
  title: { bpm: 120, bass: 'walk', arp: 'up', drum: ['k.h.s.h.k.hks.h.', 'k.h.s.h.k.s.ssss'],
    chords: 'C D Bm Em C D G G',
    mel: `E5 - - - G5 - - . C6 - - - B5 - G5 - | A5 - - - - - F#5 - D5 - - - E5 - F#5 - | G5 - - - F#5 - D5 - B4 - - - D5 - F#5 - | E5 - - - - - - - - - - . B4 - E5 - |
          G5 - - - E5 - G5 - C6 - - - D6 - E6 - | D6 - - - C6 - B5 - A5 - - - F#5 - A5 - | B5 - - - A5 - G5 - D5 - G5 - B5 - D6 - | G5 - - - - - - - - - - - . . . .` },
  stage: { bpm: 144, bass: 'drive', arp: 'up', drum: ['k.h.s.hkk.h.s.h.', 'k.h.s.hkk.s.ssss'],
    chords: 'Em C D B Em C Am B C D Bm Em C D Am B',
    mel: `E5 - - . B4 - E5 - G5 - - . F#5 - E5 - | G5 - - . E5 - - . C5 - D5 - E5 - - . | F#5 - - . D5 - F#5 - A5 - - . G5 - F#5 - | F#5 - - - - - - . D#5 - - . B4 - - . |
          E5 - - . B4 - E5 - G5 - - . B5 - - . | A5 - G5 - E5 - - . G5 - E5 - C5 - - . | A4 - C5 - E5 - A5 - G5 - - . E5 - D5 - | D#5 - - - F#5 - - - B5 - - - - - . . |
          E6 - - . D6 - C6 - B5 - - . G5 - - . | A5 - - . B5 - C6 - D6 - - . A5 - - . | B5 - - . A5 - G5 - F#5 - - . D5 - F#5 - | E5 - - - - - - . G5 - B5 - E6 - - . |
          E6 - - . D6 - C6 - G5 - - . C6 - E6 - | F#6 - - . E6 - D6 - A5 - - . D6 - F#6 - | E6 - - . C6 - A5 - E5 - A5 - C6 - E6 - | D#6 - - - - - - - F#5 - - - B5 - - .` },
  scroll: { bpm: 156, bass: 'gallop', arp: 'updown', drum: ['k.h.s.hkk.hks.h.', 'k.h.s.hks.s.ssss'],
    chords: 'Dm Bb C A Dm Bb Gm A',
    mel: `D5 - . D5 . F5 - . A5 - . G5 - . F5 . | F5 - . D5 - - Bb4 - - . C5 - D5 - - . | E5 - . C5 . E5 - . G5 - . F5 - . E5 . | C#5 - - - E5 - - - A5 - - - G5 - E5 - |
          D5 - . D5 . F5 - . A5 - . D6 - . C6 . | Bb5 - - . A5 - - . G5 - - . F5 - D5 - | G5 - - . F5 - - . D5 - - . Bb4 - D5 - | C#5 - - - - - E5 - - - A5 - - - . .` },
  boss: { bpm: 172, bass: 'pulse', arp: 'updown', drum: ['kkh.s.hkk.hks.h.', 'kkh.s.hks.ssssss'],
    chords: 'Am Am F E Am Am Dm E',
    mel: `A4 . A4 . C5 . A4 . D#5 - D5 - C5 - A4 . | A4 . A4 . C5 . A4 . G5 - F5 - E5 - C5 . | F5 - - . E5 - - . C5 - - . A4 - C5 - | B4 - - - G#4 - - - E5 - - - D5 - C5 - |
          A5 . A5 . G5 . A5 . C6 - B5 - A5 - G5 . | A5 . E5 . A5 . E5 . G5 - F5 - E5 - D5 . | F5 - - . D5 - F5 - A5 - - . G5 - F5 - | E5 - - - G#5 - - - B5 - - - E6 - - .` },
  challenge: { bpm: 150, bass: 'drive', arp: 'up', drum: ['k.h.s.h.k.h.s.hh', 'k.h.s.h.s.s.ssss'],
    chords: 'F C Dm Bb F C Bb C',
    mel: `A5 - C6 - A5 - F5 - C5 - F5 - A5 - C6 - | G5 - - . E5 - G5 - C6 - - . Bb5 - A5 - | F5 - A5 - F5 - D5 - A4 - D5 - F5 - A5 - | Bb5 - - . A5 - - . G5 - - . F5 - G5 - |
          A5 - C6 - A5 - F5 - C5 - F5 - A5 - C6 - | E6 - - . D6 - C6 - G5 - - . C6 - E6 - | F6 - - . D6 - Bb5 - G5 - - . A5 - Bb5 - | C6 - - - - - - - E5 - G5 - C6 - . .` },
  dock: { bpm: 96, bass: 'walk', arp: 'updown', drum: ['k.h.h.h.s.h.h.h.'],
    chords: 'Am F C G Am F G E',
    mel: `E5 - - - - - A5 - - - - - G5 - - - | F5 - - - - - E5 - - - - - C5 - - - | E5 - - - - - G5 - - - - - C6 - - - | B5 - - - - - - - D5 - - - G5 - - - |
          A5 - - - - - C6 - - - - - B5 - - - | A5 - - - - - F5 - - - - - C5 - - - | D5 - - - - - B4 - - - - - G5 - - - | G#5 - - - - - - - - - - - - - - -` },
};
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteNum(s) { const m = /^([A-G])(#|b)?(\d)$/.exec(s); return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12; }
function chordOf(s) {
  const m = /^([A-G])(#|b)?(m)?$/.exec(s);
  const pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { pc: (pc + 12) % 12, tones: [0, m[3] ? 3 : 4, 7] };
}
function prepSong(s) {
  if (s._p) return s._p;
  const bars = s.mel.split('|').map((b) => b.trim().split(/\s+/));
  bars.forEach((b, i) => { if (b.length !== 16) throw new Error(`song bar ${i + 1}: ${b.length} steps`); });
  const tok = bars.flat(), n = tok.length;
  const mel = tok.map((t, i) => {
    if (t === '-' || t === '.') return null;
    let len = 1;
    while (tok[(i + len) % n] === '-' && len < n) len++;
    return { n: noteNum(t), len };
  });
  const chords = s.chords.split(/\s+/).map(chordOf);
  if (chords.length !== bars.length) throw new Error('chords / bars mismatch');
  s._p = { mel, chords, n, step: 60 / s.bpm / 4 };
  return s._p;
}
function voice(o) {
  const t = o.t, osc = AC.createOscillator();
  if (WAVES[o.wave]) osc.setPeriodicWave(WAVES[o.wave]); else osc.type = o.wave;
  osc.frequency.setValueAtTime(o.f, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib && o.dur > 0.2) {
    const l = AC.createOscillator(), lg = AC.createGain();
    l.frequency.value = 5.8;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(o.f * 0.012, t + 0.25);
    l.connect(lg); lg.connect(osc.frequency);
    l.start(t); l.stop(t + o.dur + 0.1);
  }
  let node = osc;
  if (o.cutoff) {
    const f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.cutoff * 3, t);
    f.frequency.exponentialRampToValueAtTime(o.cutoff, t + 0.12);
    node.connect(f); node = f;
  }
  const g = AC.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.vol, t + (o.att || 0.004));
  g.gain.setTargetAtTime(o.vol * (o.sus ?? 0.7), t + 0.01, 0.08);
  g.gain.setTargetAtTime(0, t + o.dur, o.rel || 0.03);
  node.connect(g); g.connect(musicBus);
  if (o.send) { const sg = AC.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(delayIn); }
  osc.start(t); osc.stop(t + o.dur + 0.3);
}
function drum(k, t) {
  if (k === 'k') {
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  } else if (k === 's') {
    const pt = sndT; sndT = t;
    noise(0.16, 0.45, 0, 1200, musicBus);
    tone(230, 140, 0.08, 'triangle', 0.35, 0, musicBus);
    sndT = pt;
  } else if (k === 'h' || k === 'o') {
    const pt = sndT; sndT = t;
    noise(k === 'o' ? 0.14 : 0.035, 0.16, 0, 7000, musicBus);
    sndT = pt;
  }
}
// i 番目の16分音符を時刻 t に鳴らす
function schedStep(s, i, t) {
  const p = prepSong(s), st = i % p.n, bar = Math.floor(st / 16), b = st % 16;
  const ch = p.chords[bar], sl = p.step;
  const m = p.mel[st];
  if (m) {
    const f = mtof(m.n), dur = m.len * sl * 0.95;
    voice({ t, f, dur, wave: 0.25, vol: 0.075, vib: true, send: 0.5, cutoff: 3500 });
    voice({ t, f, dur, wave: 'sawtooth', vol: 0.035, detune: 9, vib: true, cutoff: 2200 });
  }
  if (s.arp) {
    const seq = s.arp === 'updown' ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3];
    const k = seq[b % seq.length], base = 60 + ch.pc + (ch.pc < 5 ? 12 : 0);
    const n = k === 3 ? base + 12 : base + ch.tones[k];
    voice({ t, f: mtof(n), dur: sl * 0.6, wave: 0.125, vol: 0.03, sus: 0.4 });
  }
  if (b === 0) for (const tt of ch.tones) voice({ t, f: mtof(60 + ch.pc + tt), dur: sl * 15, wave: 'sawtooth', vol: 0.012, att: 0.15, sus: 1, rel: 0.1, cutoff: 900, detune: tt * 2 - 6 });
  const R = 36 + ch.pc + (ch.pc > 6 ? -12 : 0) + 12;
  let bn = null;
  if (s.bass === 'drive' && b % 2 === 0) bn = R + ((b % 8) === 4 ? 12 : 0);
  else if (s.bass === 'gallop' && b % 4 !== 1) bn = R + (b % 8 === 6 ? 12 : 0);
  else if (s.bass === 'pulse') bn = R + (b % 4 === 2 ? 12 : 0);
  else if (s.bass === 'walk' && b % 4 === 0) bn = R + [0, 7, 12, 7][b / 4];
  if (bn !== null) {
    const len = s.bass === 'walk' ? sl * 3.6 : sl * (s.bass === 'pulse' ? 0.8 : 1.6);
    voice({ t, f: mtof(bn), dur: len, wave: 'sawtooth', vol: 0.16, cutoff: 520, q: 5, sus: 0.5 });
    voice({ t, f: mtof(bn - 12), dur: len, wave: 'triangle', vol: 0.18, sus: 0.8 });
  }
  const pat = s.drum[(bar % 4 === 3 && s.drum[1]) ? 1 : 0];
  if (pat[b] !== '.') drum(pat[b], t);
}
const BGM = { song: null, step: 0, next: 0 };
function playSong(s) { if (BGM.song === s) return; BGM.song = s || null; BGM.step = 0; BGM.next = 0; }
function bgmTick() {
  if (!AC || !BGM.song) return;
  const p = prepSong(BGM.song);
  if (BGM.next < AC.currentTime - 0.2) BGM.next = AC.currentTime + 0.05;
  while (BGM.next < AC.currentTime + 0.15) {
    schedStep(BGM.song, BGM.step, BGM.next);
    BGM.step++;
    BGM.next += p.step;
  }
}

// ================================================================ 絵
const PAL = { b: '#3a78ff', y: '#ffe040', r: '#ff3048', w: '#ffffff', g: '#30d060', k: '#101018', c: '#40e0ff', p: '#d050ff', o: '#ff9020' };
const SHIP_PAL = { w: '#d8e0f0', c: '#40e0ff', b: '#3050c0', o: '#ff9020' };
const KPAL = {
  drone: { ...PAL, y: '#40e0a0', b: '#8060ff', r: '#ffffff' },
  moth: { ...PAL, r: '#ff9020', w: '#ffe8b0', b: '#a03000' },
  warden: { ...PAL, g: '#e04890' },
};
const mir = (half) => half.map((r) => r + r.slice(0, -1).split('').reverse().join(''));
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function build(map, pal) {
  const h = map.length, w = map[0].length, c = newCanvas(w, h), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = map[j][i];
    if (ch === '.') continue;
    x.fillStyle = pal[ch] || pal._ || '#fff';
    x.fillRect(i, j, 1, 1);
  }
  return c;
}
const MAPS = {
  fighter: mir(['.....o', '....ww', '....wc', '...wwc', '...www', '..wwbw', '.wwwbw', 'wwwwww', 'wo.www', 'o..ooo', '....o.']),
  pod: mir(['....c', '...cc', '..cww', '.ccwk', 'cccww', 'cc.cc', 'c..cc', '...c.', '...r.']),
  drone0: mir(['b.....', 'bb..y.', 'bbbyyy', '.bbyry', '..yyry', '..yyyy', '.b..yy', 'b...y.']),
  drone1: mir(['......', '.b..y.', 'bbbyyy', 'bbbyry', '.byyry', '..yyyy', '..b.yy', '....y.']),
  moth0: mir(['r.....', 'rr..w.', 'rrrwww', 'rrrwwb', '.rrwwb', 'rrrwww', 'rr..w.', 'r.....']),
  moth1: mir(['......', '.r..w.', 'rrrwww', 'rrrwwb', 'rrrwwb', '.rrwww', '.r..w.', '......']),
  warden0: mir(['.g....', 'gg.ggg', 'ggggyy', 'ggg.yr', '.ggyyy', '..gggg', '.g.g.g', 'g...g.']),
  warden1: mir(['......', '.g.ggg', 'ggggyy', 'ggg.yr', 'gggyyy', '.ggggg', '..gg.g', '....g.']),
  orb: mir(['..cc', '.ccc', 'cwww', 'cwkk', 'cwkk', 'cwww', '.ccc', '..cc']),
  zigzag: mir(['p...p', '.p..p', '..ppp', '.pppw', 'ppppp', '.ppp.', 'p.p.p']),
  dart: mir(['o....', 'oo..o', 'ooooo', '.oooy', '..ooy', '...oy', '....y']),
};
const PART_COL = { 2: '#40e0ff', 3: '#ff50d0', 4: '#ffe040', 5: '#50ff70' };
const SPR = {};
function makeSprites() {
  const white = { _: '#ffffff' };
  const red = { _: '#ff4050', k: '#000' };
  SPR.fighter = build(MAPS.fighter, SHIP_PAL);
  SPR.fighterRed = build(MAPS.fighter, { ...red, w: '#ff6070', b: '#802030', c: '#ffc040', o: '#ffc040' });
  SPR.fighterW = build(MAPS.fighter, white);
  for (const n of [2, 3, 4, 5]) {
    SPR['pod' + n] = build(MAPS.pod, { c: PART_COL[n], w: '#fff', k: '#113', r: '#f60' });
    SPR['podRed' + n] = build(MAPS.pod, { c: '#ff3040', w: '#ffa0a0', k: '#300', r: '#f60' });
  }
  for (const k of ['drone', 'moth', 'warden']) for (const f of [0, 1]) {
    SPR[k + f] = build(MAPS[k + f], KPAL[k]);
    SPR[k + f + 'W'] = build(MAPS[k + f], white);
    SPR[k + f + 'A'] = build(MAPS[k + f], { ...PAL, y: '#a0f0ff', r: '#40a0ff', g: '#40c0ff', b: '#80ffff' }); // 味方化
  }
  SPR.wardenHurt0 = build(MAPS.warden0, { ...KPAL.warden, g: '#ff9040' });
  SPR.wardenHurt1 = build(MAPS.warden1, { ...KPAL.warden, g: '#ff9040' });
  SPR.carrier = [];
  for (let i = 0; i < 6; i++) SPR.carrier.push(build(MAPS.warden0, { ...PAL, g: `hsl(${i * 60},100%,60%)`, y: '#fff' }));
  for (const k of ['orb', 'zigzag', 'dart']) { SPR[k] = build(MAPS[k], PAL); SPR[k + 'W'] = build(MAPS[k], white); }
}
makeSprites();

// ================================================================ ボスのドット絵
// 1ドット = 1ピクセル。黒フチとディザの陰影で、雑魚と同じドット絵の見た目にそろえる。
const OUT = '#0c0c14';
function pix(w, h, fn) {
  const W2 = w + 2, H2 = h + 2, grid = new Array(W2 * H2).fill(null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[(y + 1) * W2 + x + 1] = fn(x, y);
  const out = grid.slice();
  const solid = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && grid[y * W2 + x] && grid[y * W2 + x] !== OUT;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    if (!grid[y * W2 + x] && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) out[y * W2 + x] = OUT;
  }
  const mk = (white) => {
    const c = newCanvas(W2, H2), g = c.getContext('2d');
    for (let i = 0; i < out.length; i++) if (out[i]) { g.fillStyle = white ? '#fff' : out[i]; g.fillRect(i % W2, Math.floor(i / W2), 1, 1); }
    return c;
  };
  return { img: mk(false), white: mk(true), w: W2, h: H2 };
}
// 市松ディザ付きの階調
const shade = (v, x, y, cols, amt = 0.07) => cols[clamp(Math.floor((v + ((x + y) & 1 ? amt : -amt)) * cols.length), 0, cols.length - 1)];
function sphereL(x, y, cx, cy, r) {
  const dx = (x - cx) / r, dy = (y - cy) / r, d = dx * dx + dy * dy;
  if (d > 1) return -1;
  return clamp(-0.5 * dx - 0.6 * dy + 0.62 * Math.sqrt(1 - d), 0, 1);
}
const fromMap = (map, pal) => (x, y) => (map[y][x] === '.' ? null : pal[map[y][x]]);

const QUEEN_MAP = mir([
  '.............k.....k...k',
  '............kyk...kyk.ky',
  '............kYk...kYk.kY',
  '............kYYk.kYYk.kY',
  '............kYYYkYYYYkYY',
  '............kOYRYOYYRYOY',
  '............kkkkkkkkkkkk',
  '.........kkkGGGGGGGGGGGG',
  '.......kkGGggggggggggggg',
  '......kGgglllggggggggggg',
  '.....kGglllkkkkggggggggg',
  '.....kGgllkRRRRkgggggggg',
  '....kGggllkRrWRRkggggggg',
  '....kGgggkRRrRRRkggggggg',
  '....kGgggkRRRRRRkggggggg',
  '....kGggggkRRRRkgggggggg',
  '.....kGggggkkkkggggggggg',
  '.....kGGgggggggggggkkkkk',
  '......kGGgggggggggkRRRRR',
  '.......kkGGgggggkkkRWRWR',
  '.........kkkGGkk..kkkkkk',
  '...........kOk......kYYY',
  '..k.......kkYYkkkkkkkYYY',
  '.kGk....kkGGGkggggggkkYY',
  '.kGGk.kkGGgggggllllgggky',
  '..kGGkGGgggggllllllggkyy',
  '...kGGGggggggllllggggkyy',
  '....kkGGgggggggggggggkyy',
  '..kk..kGGGgggggggggggkYY',
  '.kGGk..kkGGGgggggggkkYYY',
  'kGGk.....kkkkkkkkkkYYYYY',
  'kGk.....kYYYYYYYYYYYYYYY',
  'kk.....kOOOOOOOOOOOOOOOO',
  '.......kYYYYyyyyYYYYYYYY',
  '........kOOOOOOOOOOOOOOO',
  '........kYYYYyyyYYYYYYYY',
  '.........kOOOOOOOOOOOOOO',
  '..........kYYYyyYYYYYYYY',
  '...........kkOOOOOOOOOOO',
  '.............kkkYYYYYYYY',
  '................kkkkRRRR',
  '...................kkkRR',
  '......................kR',
  '.......................k',
]);

const BOSS = {};
function makeBossArt() {
  // --- GORGON: 目玉の怪物。紫の肉塊、緑の触手、左右の砲台
  const gc = 56, gy = 28;
  BOSS.gorgon = pix(112, 58, (x, y) => {
    const L = sphereL(x, y, gc, gy, 22);
    if (L >= 0) {
      const de = Math.hypot(x - gc, y - (gy - 1));
      if (de <= 10) return de > 8.6 ? '#ff6088' : shade(Math.max(0, sphereL(x, y, gc, gy - 1, 10)), x, y, ['#8088a8', '#c0c8dc', '#eef0ff', '#ffffff']);
      const vn = Math.sin(x * 0.55 + Math.sin(y * 0.3) * 2) * Math.cos(y * 0.5 - x * 0.15);
      if (Math.abs(vn) < 0.09 && L < 0.8) return '#3a1458';
      return shade(L, x, y, ['#361250', '#5a2280', '#8a3cb8', '#b86ae0', '#e4b8ff']);
    }
    const u = Math.abs(x - gc), dy = y - (gy + 6);
    if (u >= 18 && u <= 46 && Math.abs(dy) <= 3) {
      if (u % 5 === 0) return '#24481f';
      return dy <= -2 ? '#9ad878' : dy >= 2 ? '#2a5c2c' : '#5aa04a';
    }
    return null;
  });
  BOSS.gorgonTent = [];
  for (let f = 0; f < 8; f++) {
    const ph = (f / 8) * TAU;
    BOSS.gorgonTent.push(pix(64, 42, (x, y) => {
      for (let i = 0; i < 6; i++) {
        const cx = 32 + (i - 2.5) * 7 + (i - 2.5) * y * 0.2 + Math.sin(ph + i * 1.3 + y * 0.18) * (1 + y * 0.1);
        const hw = 2.2 - y * 0.04, d = x - cx;
        if (Math.abs(d) <= hw) {
          if (y % 5 === 2 && Math.abs(d) < 0.8) return '#c8f4a0';
          return d < -hw / 3 ? '#8cd468' : d > hw / 3 ? '#285c24' : '#50a040';
        }
      }
      return null;
    }));
  }
  BOSS.gorgonCannon = pix(20, 22, (x, y) => {
    const dx = (x - 9.5) / 9, dy = (y - 9) / 9;
    if (x >= 8 && x <= 11 && y >= 16) return x === 8 ? '#6a7a78' : '#2c3634';
    if (dx ** 4 + dy ** 4 > 1) return null;
    const L = sphereL(x, y, 9.5, 9, 3.4);
    if (L >= 0) return shade(L, x, y, ['#600818', '#c01830', '#ff5050', '#ffc0b0']);
    return shade(0.55 - 0.35 * dx - 0.4 * dy, x, y, ['#223826', '#46664c', '#6c9070', '#a2c4a2', '#e0f4e0']);
  });
  BOSS.gorgonIris = pix(5, 5, fromMap(['.RRR.', 'RRRRR', 'RRkRR', 'RRRRR', '.RRR.'], { R: '#e81830', k: '#000' }));
  BOSS.gorgonIris2 = pix(5, 5, fromMap(['.RRR.', 'RRRRR', 'RRkRR', 'RRRRR', '.RRR.'], { R: '#18e0f0', k: '#000' }));

  // --- MOTHER ARCA: 六角形の母艦。装甲は弾を止め、中央のコアだけが弱点
  const mc = 66, my = 30;
  const mother = (pulse) => pix(132, 60, (x, y) => {
    const ax = Math.abs(x - mc), ay = y - my;
    if (Math.abs(ay) > 27 || ax > 65 - Math.abs(ay) * 0.55) return null;
    const dc = Math.hypot(x - mc, y - (my + 5));
    if (dc <= 15) {
      if (dc > 12) return y < my + 5 ? '#1a1e28' : '#8890a4';
      return shade(clamp(sphereL(x, y, mc, my + 5, 12) + pulse, 0, 1), x, y, ['#400808', '#901010', '#e03020', '#ff8040', '#ffe8b0']);
    }
    if (ax >= 50 && ax <= 56 && Math.abs(ay) < 6) return (x + y) % 6 < 3 ? '#f0c020' : '#202020';
    if (ay === -21 && ax < 40 && ax % 8 < 2) return '#60e0ff';
    let v = 0.78 - ((ay + 27) / 54) * 0.62;
    if (ay <= -25) v = 0.95;
    if (ax > 63 - Math.abs(ay) * 0.55) v += ay < 0 ? 0.2 : -0.25;
    if ((x - mc) % 12 === 0 && Math.abs(ay) < 24) v -= 0.18;
    if (ay === -10 || ay === 13) v -= 0.22;
    return shade(v, x, y, ['#1c2030', '#343a50', '#565e78', '#7e88a4', '#aab4cc', '#d4dcf0'], 0.05);
  });
  BOSS.mother = [mother(0), mother(0.2)];
  BOSS.motherTurret = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, ex = 8.5 + Math.cos(a) * 8.5, ey = 8.5 + Math.sin(a) * 8.5;
    BOSS.motherTurret.push(pix(18, 18, (x, y) => {
      const t = clamp(((x - 8.5) * (ex - 8.5) + (y - 8.5) * (ey - 8.5)) / 72.25, 0, 1);
      const px = 8.5 + (ex - 8.5) * t, py = 8.5 + (ey - 8.5) * t;
      if (t > 0.3 && Math.hypot(x - px, y - py) <= 1.3) return t > 0.85 ? '#ff6030' : '#262a38';
      const L = sphereL(x, y, 8.5, 8.5, 6.5);
      if (L < 0) return null;
      return shade(L, x, y, ['#30364a', '#586078', '#8890a8', '#c0c8dc']);
    }));
  }

  // --- QUEEN ASTRA: 冠をかぶった女王蜂。左右の羽の宝珠が砲台
  const qpal = (hurt) => ({ k: OUT, G: hurt ? '#502080' : '#801848', g: hurt ? '#9040d0' : '#e04890', l: hurt ? '#d0a0ff' : '#ffa8d8',
    Y: '#f0c020', y: '#fff080', O: '#a07010', R: '#e02040', r: '#ff80a0', W: '#ffffff' });
  BOSS.queen = pix(QUEEN_MAP[0].length, QUEEN_MAP.length, fromMap(QUEEN_MAP, qpal(false)));
  BOSS.queenHurt = pix(QUEEN_MAP[0].length, QUEEN_MAP.length, fromMap(QUEEN_MAP, qpal(true)));
  const wing = (pulse) => pix(40, 44, (x, y) => {
    const dx = x - 19.5, dy = y - 21.5, t = -0.6;
    const u = (dx * Math.cos(t) + dy * Math.sin(t)) / 19, v = (-dx * Math.sin(t) + dy * Math.cos(t)) / 10;
    if (u * u + v * v > 1) return null;
    const L = sphereL(x, y, 19.5, 21.5, 5.5);
    if (L >= 0) return shade(clamp(L + pulse, 0, 1), x, y, ['#084860', '#1890b0', '#40e0f0', '#d0ffff']);
    if (Math.abs(v) < 0.07 || Math.abs(v - u * 0.6) < 0.06 || Math.abs(v + u * 0.6) < 0.06) return '#e8c8ff';
    return shade(0.25 + 0.6 * (1 - u * u - v * v), x, y, ['#3a1458', '#62289a', '#9048d0', '#c490f4']);
  });
  BOSS.wing = [wing(0), wing(0.25)];
}
makeBossArt();

// スプライトの (ax, ay) の画素を画面の (x, y) に置く。flip で左右反転
function blitAt(spr, x, y, ax, ay, white = false, flip = false) {
  const dx = Math.round(x - (flip ? spr.w - 1 - ax : ax)), dy = Math.round(y - ay);
  // 被弾の白は半透明で重ねる（真っ白に点滅すると絵が見えなくなる）
  for (const img of white ? [spr.img, spr.white] : [spr.img]) {
    if (img === spr.white) ctx.globalAlpha = 0.5;
    if (flip) { ctx.save(); ctx.translate(dx + spr.w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
    else ctx.drawImage(img, dx, dy);
    ctx.globalAlpha = 1;
  }
}

const GLOW = {};
function glow(x, y, r, col, a = 1) {
  r = Math.max(2, Math.round(r));
  const key = col + '|' + r;
  let g = GLOW[key];
  if (!g) {
    g = newCanvas(r * 2, r * 2);
    const c = g.getContext('2d');
    const gr = c.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, col);
    gr.addColorStop(0.35, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, r * 2, r * 2);
    GLOW[key] = g;
  }
  ctx.globalAlpha = a;
  ctx.drawImage(g, x - r, y - r);
  ctx.globalAlpha = 1;
}
function drawSpr(img, x, y, ang = 0, s = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (ang) ctx.rotate(ang);
  if (s !== 1) ctx.scale(s, s);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
function rect(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
function text(s, x, y, col = '#fff', size = 8, align = 'left', font = FONT) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}
const jtext = (s, x, y, col, size = 8, align = 'left') => text(s, x, y, col, size, align, JFONT);
function rainbow(s, x, y, size, align = 'center', font = FONT) {
  ctx.font = `${size}px ${font}`;
  const w = ctx.measureText(s).width;
  let cx = align === 'center' ? x - w / 2 : x;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const yy = y + Math.sin(G.t * 0.15 + i * 0.6) * 2;
    text(ch, cx, yy, `hsl(${(G.t * 6 + i * 25) % 360},100%,65%)`, size, 'left', font);
    ctx.font = `${size}px ${font}`;
    cx += ctx.measureText(ch).width;
  }
}

// 背景テーマ
const THEMES = [
  { neb: ['#2a1060', '#0a1848'], land: '#3d6b35', dark: '#1d3a18', hi: '#7fb05a' },
  { neb: ['#084850', '#301048'], land: '#6b5535', dark: '#3a2a15', hi: '#b09060' },
  { neb: ['#401040', '#102060'], land: '#444', dark: '#222', hi: '#888' },
  { neb: ['#402010', '#102030'], land: '#5a6a40', dark: '#2a3418', hi: '#a0b070' },
  { neb: ['#081830', '#000010'], land: '#444', dark: '#222', hi: '#888' },
  { neb: ['#401010', '#200830'], land: '#50506a', dark: '#282838', hi: '#9090b0' },
  { neb: ['#502008', '#300010'], land: '#7a3a20', dark: '#401808', hi: '#d07040' },
  { neb: ['#300840', '#081040'], land: '#40306a', dark: '#201838', hi: '#8070c0' },
];
const NEB = {};
function nebula(ti) {
  if (NEB[ti]) return NEB[ti];
  const c = newCanvas(W, H), x = c.getContext('2d'), th = THEMES[ti];
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  let seed = ti * 97 + 13;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 7; i++) {
    const cx = r() * W, cy = r() * H, rad = 60 + r() * 120;
    for (const oy of [-H, 0, H]) {
      const g = x.createRadialGradient(cx, cy + oy, 0, cx, cy + oy, rad);
      g.addColorStop(0, th.neb[i % 2]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.55;
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }
  }
  NEB[ti] = c;
  return c;
}

// ================================================================ 状態
const G = { state: 'title', t: 0, score: 0, hi: 0, lives: 3, loop: 0, si: 0, pi: 0, gauge: 0, chain: 0, lastKill: -99,
  shake: 0, flash: 0, flashCol: '#fff', warp: 1, warpTo: 1, banner: null, firebird: 0, formation: 0, beam: 0, snare: 0,
  nextExtend: 30000, timer: 0, neb: 0, scrollY: 0 };
try { G.hi = +(localStorage.getItem('galacresta_hi') || 0); } catch (e) { G.hi = 0; }
let S = null;       // 現在のフェーズ
let P = null;       // 自機
let E = [];         // 敵（空中・地上）
let PB = [], EB = [], IT = [], FX = [], TX = [];
const STARS = [];
for (let i = 0; i < 110; i++) STARS.push({ x: rnd(0, W), y: rnd(0, H), z: pick([0.3, 0.6, 1.2]), c: pick(['#fff', '#aaf', '#ffa', '#faa', '#aff']) });

const diff = () => 1 + G.loop * 0.45 + G.si * 0.04;

// ================================================================ 敵の種類
const KIND = {
  drone: { hp: 1, r: 6, score: 50, dscore: 100 },
  moth: { hp: 1, r: 6, score: 80, dscore: 160 },
  warden: { hp: 2, r: 7, score: 150, dscore: 400 },
  carrier: { hp: 1, r: 7, score: 500, dscore: 1000 },
  orb: { hp: 1, r: 5, score: 100 },
  zigzag: { hp: 1, r: 6, score: 150 },
  orbiter: { hp: 2, r: 7, score: 300 },
  dart: { hp: 1, r: 6, score: 100 },
  spinner: { hp: 2, r: 7, score: 200 },
  turret: { hp: 3, r: 9, score: 300, ground: true },
  tank: { hp: 4, r: 9, score: 400, ground: true },
  hangar: { hp: 10, r: 15, score: 1000, ground: true },
  pbase: { hp: 6, r: 12, score: 500, ground: true },
  fbase: { hp: 6, r: 12, score: 500, ground: true },
};

// ================================================================ 経路
const BAKED = {};
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}
function getPath(name, m) {
  const key = name + (m ? 'm' : '');
  if (BAKED[key]) return BAKED[key];
  const pts = PATHS[name].map(([x, y]) => [m ? W - x : x, y]);
  const Q = [pts[0], ...pts, pts[pts.length - 1]];
  const raw = [];
  for (let i = 1; i < Q.length - 2; i++) for (let s = 0; s < 24; s++) raw.push(catmull(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], s / 24));
  raw.push(pts[pts.length - 1]);
  // 2px 間隔に並べ直す
  const out = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    const seg = Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    acc += seg;
    while (acc >= 2) {
      acc -= 2;
      const f = seg ? 1 - acc / seg : 1;
      out.push([raw[i - 1][0] + (raw[i][0] - raw[i - 1][0]) * f, raw[i - 1][1] + (raw[i][1] - raw[i - 1][1]) * f]);
    }
  }
  BAKED[key] = out;
  return out;
}

// ================================================================ 演出
function explode(x, y, col, size = 1) {
  FX.push({ t: 'flash', x, y, r: 14 * size, life: 10, max: 10, col: '#fff' });
  FX.push({ t: 'flash', x, y, r: 22 * size, life: 18, max: 18, col });
  FX.push({ t: 'ring', x, y, r: 3, vr: 2 * Math.sqrt(size), life: 16 + size * 4, max: 16 + size * 4, col });
  const n = Math.round(10 * size);
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(0.6, 3.2) * Math.sqrt(size);
    FX.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(15, 35), max: 35, col: i % 3 ? col : '#fff' });
  }
  for (let i = 0; i < n / 3; i++) FX.push({ t: 'debris', x, y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: rnd(20, 45), max: 45, col, a: rnd(0, TAU), va: rnd(-0.3, 0.3) });
}
function bigExplode(x, y, col) {
  explode(x, y, col, 3);
  for (let i = 0; i < 5; i++) explode(x + rnd(-20, 20), y + rnd(-20, 20), pick(['#fff', '#ff0', '#f80', col]), 1.5);
  FX.push({ t: 'ring', x, y, r: 5, vr: 5, life: 30, max: 30, col: '#fff' });
}
function sparkle(x, y, col, n = 4) {
  for (let i = 0; i < n; i++) FX.push({ t: 'spark', x, y, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), life: rnd(8, 18), max: 18, col });
}
function popText(x, y, s, col = '#fff', size = 8, life = 50) { TX.push({ x, y, s, col, size, t: life, max: life }); }
function shake(n) { G.shake = Math.max(G.shake, n); }
function flash(a, col = '#fff') { G.flash = Math.max(G.flash, a); G.flashCol = col; }
function banner(lines, dur = 150) { G.banner = { lines, t: 0, dur }; }

function addScore(n) {
  G.score += n;
  if (G.score >= G.nextExtend) {
    G.lives++;
    G.nextExtend += G.nextExtend < 60000 ? 50000 : 100000;
    SFX.extend();
    popText(W / 2 - 30, H / 2, '1UP!', '#0f8', 12, 90);
  }
  if (G.score > G.hi) G.hi = G.score;
}

// ================================================================ 自機
const SLOT = { 2: [-13, 4], 3: [13, 4], 4: [0, -13], 5: [0, 13], T: [-26, 6] };
const ALLY_X = [-10, 10, -26, 26, -42, 42];

function newPlayer(keepUnits) {
  P = { x: 120, y: 285, vx: 0, vy: 0, units: keepUnits ? P.units : [], inv: 150, fireT: 0, fireN: 0, alive: true, respawn: 0 };
}
function unitPos(u, i) {
  if (G.formation > 0) {
    const n = P.units.length, a = G.t * 0.07 + (i / n) * TAU;
    return [P.x + Math.cos(a) * 36, P.y + Math.sin(a) * 30];
  }
  const s = SLOT[u];
  return [P.x + s[0], P.y + s[1]];
}
const fullParts = () => [2, 3, 4, 5].every((n) => P.units.includes(n));

function shot(x, y, vx, vy, dmg, kind = 'shot') { PB.push({ x, y, vx, vy, r: 3, dmg, kind, life: 60 }); }

function playerFire() {
  P.fireN++;
  SFX.shot();
  if (G.firebird > 0) {
    for (let i = -3; i <= 3; i++) PB.push({ x: P.x + i * 3, y: P.y - 12, vx: i * 0.7, vy: -6.5, r: 7, dmg: 1.2, kind: 'fire', pierce: true, hits: new Set(), life: 60 });
    return;
  }
  shot(P.x, P.y - 8, 0, -8, 1);
  P.units.forEach((u, i) => {
    const [ux, uy] = unitPos(u, i);
    if (u === 'T') shot(ux, uy - 6, 0, -8, 1);
    else if (u === 2) { shot(ux, uy - 4, 0, -8, 1); shot(ux, uy - 4, -2.2, -7, 0.8); }
    else if (u === 3) { shot(ux, uy - 4, 0, -8, 1); shot(ux, uy - 4, 2.2, -7, 0.8); }
    else if (u === 4) PB.push({ x: ux, y: uy - 12, vx: 0, vy: -12, r: 3, dmg: 0.7, kind: 'laser', pierce: true, hits: new Set(), life: 40 });
    else if (u === 5 && P.fireN % 4 === 0) {
      for (const s of [-1, 1]) PB.push({ x: ux + s * 4, y: uy, vx: s * 1.8, vy: 0.5, r: 4, dmg: 2, kind: 'missile', life: 150 });
    }
  });
  if (P.fireN % 2 === 0) for (const e of E) if (e.st === 'ally') shot(e.x, e.y - 6, 0, -7.5, 1, 'ally');
}

function updatePlayer() {
  if (!P.alive) {
    if (--P.respawn <= 0) {
      if (G.lives < 0) { gameOver(); return; }
      newPlayer(false);
      popText(W / 2 - 24, 250, 'READY', '#0ff', 10, 80);
    }
    return;
  }
  if (P.inv > 0) P.inv--;
  if (S && S.type === 'docking') return;
  const sp = slowHeld() ? 1.1 : 2.4;
  let dx = 0, dy = 0;
  if (keys.ArrowLeft) dx--;
  if (keys.ArrowRight) dx++;
  if (keys.ArrowUp) dy--;
  if (keys.ArrowDown) dy++;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  P.x = clamp(P.x + dx * sp, 8, W - 8);
  P.y = clamp(P.y + dy * sp, 150, H - 14);
  P.vx = dx;
  if (P.fireT > 0) P.fireT--;
  if (fireHeld() && P.fireT <= 0 && !(S && S.type === 'challenge' && S.result)) { playerFire(); P.fireT = G.firebird > 0 ? 5 : 6; }

  // X: スネアビーム（敵を捕まえて味方にする）
  if (pr.KeyX && G.beam <= 0) {
    if (G.snare > 0) { G.snare--; G.beam = 160; SFX.snare(); flash(0.3, '#0ff'); }
    else popText(P.x - 26, P.y - 24, 'NO SNARE', '#888');
  }
  // C: オービット / ファイアバード
  if (pr.KeyC && G.firebird <= 0 && G.formation <= 0) {
    if (G.gauge < 100) popText(P.x - 26, P.y - 24, 'CHARGING', '#888');
    else if (fullParts()) {
      G.firebird = 600; G.gauge = 0; SFX.firebird(); flash(0.9, '#f80'); shake(12);
      banner([['FIREBIRD!!', 'rainbow', 18]], 90);
    } else if (P.units.length) {
      G.formation = 540; G.gauge = 0; SFX.formation(); flash(0.4, '#0ff');
      banner([['ORBIT', '#0ff', 14]], 70);
    } else popText(P.x - 26, P.y - 24, 'NO PARTS', '#888');
  }
  if (G.firebird > 0) {
    G.firebird--;
    for (let i = 0; i < 3; i++) FX.push({ t: 'spark', x: P.x + rnd(-14, 14), y: P.y + rnd(0, 10), vx: rnd(-0.5, 0.5), vy: rnd(1, 3), life: rnd(10, 22), max: 22, col: pick(['#ff0', '#f80', '#f40', '#fff']) });
    if (G.firebird === 0) popText(P.x - 20, P.y - 20, 'FIREBIRD END', '#f80');
  }
  if (G.formation > 0 && --G.formation === 0) popText(P.x - 26, P.y - 20, 'ORBIT END', '#0ff');
  if (G.beam > 0) {
    G.beam--;
    if (G.t % 3 === 0) FX.push({ t: 'spark', x: P.x + rnd(-6, 6), y: rnd(0, P.y), vx: 0, vy: rnd(2, 5), life: 14, max: 14, col: '#8ff' });
  }
}

function hitCore() {
  if (P.inv > 0 || G.firebird > 0 || !P.alive) return;
  if (P.units.length) {
    const u = P.units.pop();
    loseUnit(u, P.units.length);
    P.inv = 90;
  } else playerDie();
}
function hitUnit(i) {
  if (P.inv > 0 || G.firebird > 0 || G.formation > 0) return;
  const u = P.units[i];
  P.units.splice(i, 1);
  loseUnit(u, i);
  P.inv = 60;
}
function loseUnit(u, i) {
  const [x, y] = u === undefined ? [P.x, P.y] : (() => { const s = SLOT[u]; return [P.x + s[0], P.y + s[1]]; })();
  explode(x, y, u === 'T' ? '#fff' : PART_COL[u], 1.4);
  SFX.lost();
  shake(6);
  popText(x - 24, y - 16, 'PART LOST', '#f66');
}
function playerDie(captured = false) {
  if (!P.alive) return;
  P.alive = false;
  P.respawn = 170;
  G.lives--;
  if (!captured) {
    bigExplode(P.x, P.y, '#f60');
    for (let i = 0; i < P.units.length; i++) { const [x, y] = unitPos(P.units[i], i); explode(x, y, '#fff', 1.2); }
    SFX.die(); shake(20); flash(0.6, '#f40');
  }
  P.units = [];
  for (const e of E) if (e.st === 'ally' || e.st === 'captured') { explode(e.x, e.y, '#8ff'); e.dead = true; }
  G.formation = 0; G.firebird = 0; G.beam = 0;
}

// ================================================================ 敵の生成と行動
function mkEnemy(kind, x, y, st, extra = {}) {
  const k = KIND[kind];
  const e = { kind, x, y, st, hp: k.hp * (k.ground ? 1 + G.loop * 0.5 : 1), r: k.r, t: 0, flash: 0, ang: 0, vx: 0, vy: 0, ...extra };
  E.push(e);
  return e;
}
function enemyShoot(e, n = 1, spread = 0.22, spd) {
  if (!P.alive || (S && S.type === 'challenge')) return;
  const v = spd || 1.9 + 0.12 * G.si + 0.4 * G.loop;
  const a = Math.atan2(P.y - e.y, P.x - e.x);
  for (let i = 0; i < n; i++) {
    const aa = a + (i - (n - 1) / 2) * spread;
    EB.push({ x: e.x, y: e.y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, r: 2.5, col: '#f4f' });
  }
}
function fireAt(x, y, ang, spd, col = '#f4f', r = 2.5) { EB.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, col }); }
function ring(x, y, n, spd, off = 0, col = '#fa0') { for (let i = 0; i < n; i++) fireAt(x, y, off + (i / n) * TAU, spd, col); }
function aimAng(x, y) { return Math.atan2(P.y - y, P.x - x); }

function moveToward(e, tx, ty, sp) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d <= sp) { e.x = tx; e.y = ty; return true; }
  e.x += (dx / d) * sp; e.y += (dy / d) * sp;
  return false;
}

// 陣形の定位置
const SLOT_ROWS = { warden: [0], carrier: [0], moth: [1, 2], drone: [3, 4] };
const COL_ORDER = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9];
function takeSlot(kind) {
  for (const r of [...(SLOT_ROWS[kind] || [3, 4]), 1, 2, 3, 4]) for (const c of COL_ORDER) {
    if (r === 0 && (c < 1 || c > 8)) continue;
    const k = c + ',' + r;
    if (!S.taken[k]) { S.taken[k] = 1; return { c, r }; }
  }
  return { c: rndi(0, 9), r: 4 };
}
function slotXY(s) {
  const b = S && S.breath ? S.breath : 1, sw = S && S.sway ? S.sway : 0;
  return [120 + (s.c - 4.5) * 19 * b + sw, 42 + s.r * 17 * (0.7 + 0.3 * b)];
}

const FREE = {
  orb(e) {
    e.x = e.bx + Math.sin(e.t * 0.05 + e.ph) * 40;
    e.y += e.vy;
    if (!e.leaving) {
      if (e.y > 230 && e.vy > 0) e.vy = -1.1;
      if (e.y < 40 && e.vy < 0) e.vy = 1.1;
      if (e.t > 520) { e.leaving = true; e.vy = 2.4; }
    }
    if (e.t % 90 === 45 && Math.random() < 0.35 * S.fireMul) enemyShoot(e);
  },
  zigzag(e) {
    if (e.t % 22 === 0) e.vx = -e.vx;
    e.x += e.vx; e.y += e.vy;
    if (e.x < 8 || e.x > W - 8) e.vx = -e.vx;
    if (e.t === 40 && Math.random() < 0.5 * S.fireMul) enemyShoot(e);
  },
  orbiter(e) {
    if (e.t < 160) {
      e.a += 0.06;
      const tx = P.x + Math.cos(e.a) * 60, ty = Math.min(P.y - 90, 150) + Math.sin(e.a) * 30;
      moveToward(e, tx, ty, 2.6);
      if (e.t % 50 === 25) enemyShoot(e, 2, 0.3);
    } else {
      if (e.t === 160) { const a = aimAng(e.x, e.y); e.vx = Math.cos(a) * 3.6; e.vy = Math.sin(a) * 3.6; SFX.dive(); }
      e.x += e.vx; e.y += e.vy;
    }
  },
  dart(e) {
    e.vx += clamp((P.x - e.x) * 0.002, -0.04, 0.04);
    e.x += e.vx; e.y += 2.3;
    if (!e.shot && e.y > 70) { e.shot = true; enemyShoot(e, G.loop > 0 ? 3 : 1); }
  },
  spinner(e) {
    e.x += e.vx;
    e.y = e.by + Math.sin(e.t * 0.06) * 30;
    if (e.t % 60 === 30) enemyShoot(e, 1);
  },
};

function spawnFree(kind, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const delay = i * (opt.gap || 14);
    const x = opt.x !== undefined ? opt.x : 120;
    let e;
    switch (kind) {
      case 'orb': e = { x: x + rnd(-20, 20), y: -12 - i * 14, extra: { bx: x + (i % 2 ? 30 : -30), ph: i, vy: 1.1 } }; break;
      case 'zigzag': e = { x: x + (i % 2 ? 20 : -20), y: -12 - i * 20, extra: { vx: i % 2 ? 2.2 : -2.2, vy: 1.8 + G.loop * 0.3 } }; break;
      case 'orbiter': e = { x: i % 2 ? W + 10 : -10, y: rnd(40, 120), extra: { a: i * 1.6 } }; break;
      case 'dart': e = { x: x + (i - (n - 1) / 2) * 22, y: -12 - Math.abs(i - (n - 1) / 2) * 16, extra: {} }; break;
      case 'spinner': {
        const L = opt.from !== 'R';
        e = { x: L ? -10 - i * 24 : W + 10 + i * 24, y: 0, extra: { vx: L ? 1.4 : -1.4, by: 70 + (i % 2) * 30 } };
        e.y = e.extra.by;
        break;
      }
      case 'drone': case 'moth': {
        e = { x: opt.x + rnd(-10, 10), y: opt.y || -10, extra: {} };
        const en = mkEnemy(kind, e.x, e.y, 'dive', { dir: i % 2 ? 1 : -1, vx: (i % 2 ? 1 : -1) * 1.4, vy: -1.5 });
        continue;
      }
    }
    mkEnemy(kind, e.x, e.y, 'free', { ...e.extra, wait: delay });
  }
}

function updateEnemy(e) {
  const ox = e.x, oy = e.y;
  if (e.flash > 0) e.flash--;
  if (e.wait > 0) { e.wait--; return; }
  e.t++;
  switch (e.st) {
    case 'path': {
      e.pi += e.spd;
      const p = e.path;
      if (e.pi >= p.length - 1) {
        if (e.fo) e.st = 'return';
        else { e.dead = true; e.escaped = true; }
        break;
      }
      const i = Math.floor(e.pi), f = e.pi - i;
      e.x = p[i][0] + (p[i + 1][0] - p[i][0]) * f;
      e.y = p[i][1] + (p[i + 1][1] - p[i][1]) * f;
      if (e.fireAt && e.t === e.fireAt) enemyShoot(e);
      break;
    }
    case 'return': {
      const [sx, sy] = slotXY(e.slot);
      if (moveToward(e, sx, sy, 2.8)) e.st = 'form';
      break;
    }
    case 'form': {
      const [sx, sy] = slotXY(e.slot);
      e.x = sx; e.y = sy;
      break;
    }
    case 'dive': {
      e.vy = Math.min(e.vy + 0.11, 2.9 + G.loop * 0.4 + G.si * 0.07);
      e.vx += clamp((P.x - e.x) * 0.004, -0.09, 0.09);
      if (e.kind === 'moth') e.vx += Math.sin(e.t * 0.09) * 0.2;
      e.vx = clamp(e.vx, -2.5, 2.5);
      e.x += e.vx; e.y += e.vy;
      const fm = S.fireMul || 1;
      if ((e.t === 30 || e.t === 55 || (G.loop > 0 && e.t === 80)) && e.y < P.y - 50 && Math.random() < 0.75 * fm) enemyShoot(e, e.kind === 'warden' && G.si > 3 ? 3 : 1);
      if (e.y > H + 14) {
        if (e.fo) { e.y = -14; e.x = slotXY(e.slot)[0]; e.st = 'return'; }
        else e.dead = true;
      }
      break;
    }
    case 'beamdown':
      if (moveToward(e, e.tx, 150, 2.2)) { e.st = 'beaming'; e.t = 0; SFX.beam(); }
      break;
    case 'beaming':
      if (e.t % 14 === 0 && e.t < 200) SFX.beamHum();
      if (e.t >= 40 && e.t < 200 && P.alive && P.inv <= 0 && G.firebird <= 0 && inBeam(e, P.x, P.y, e.t)) capture(e, false);
      if (e.t >= 220) e.st = 'return';
      break;
    case 'pulling':
      if (e.t >= 80) { e.captive = e.pulling; e.pulling = null; e.st = e.slot ? 'return' : 'free'; }
      break;
    case 'free':
      FREE[e.kind](e);
      if (e.t > 30 && (e.y > H + 30 || e.y < -80 || e.x < -60 || e.x > W + 60)) e.dead = true;
      break;
    case 'captured': // スネアビームに吸い込まれ中
      e.ang += 0.4;
      if (moveToward(e, P.x, P.y - 24, 3.5)) {
        const used = new Set(E.filter((x) => x.st === 'ally').map((x) => x.ai));
        e.ai = [0, 1, 2, 3, 4, 5].find((i) => !used.has(i));
        e.st = 'ally'; e.ang = Math.PI;
        popText(e.x - 12, e.y - 10, 'JOIN!', '#8ff');
        sparkle(e.x, e.y, '#8ff', 8);
      }
      return;
    case 'ally':
      e.x += (P.x + ALLY_X[e.ai] - e.x) * 0.2;
      e.y += (P.y - 24 - (e.ai >> 1) * 4 - e.y) * 0.2;
      e.ang = Math.PI;
      return;
    case 'ground':
      updateGround(e);
      return;
  }
  // 進行方向を向く
  const vx = e.x - ox, vy = e.y - oy;
  const target = e.st === 'form' ? 0 : (vx || vy ? Math.atan2(vy, vx) - Math.PI / 2 : e.ang);
  let da = target - e.ang;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  e.ang += da * 0.25;
}

function inBeam(e, x, y, t) {
  const len = Math.min(1, t / 40) * (H - e.y);
  if (y < e.y + 8 || y > e.y + len) return false;
  return Math.abs(x - e.x) < 5 + (y - e.y) * 0.28;
}
// トラクタービームで捕まる
function capture(e) {
  if (P.units.length) {
    const u = P.units.pop();
    const [x, y] = [P.x + SLOT[u][0], P.y + SLOT[u][1]];
    e.pulling = u; e.pullFrom = [x, y];
    P.inv = 60;
    popText(P.x - 30, P.y - 24, 'PART CAPTURED!', '#f44');
  } else {
    e.pulling = 'core'; e.pullFrom = [P.x, P.y];
    popText(W / 2 - 50, 200, 'SHIP CAPTURED', '#f44', 8, 120);
    playerDie(true);
  }
  e.st = 'pulling'; e.t = 0;
  SFX.capture();
}

function updateGround(e) {
  e.y += S.scrollSpd || 0.7;
  if (e.kind === 'turret') {
    e.ang = Math.atan2(P.y - e.y, P.x - e.x);
    const rate = Math.max(40, Math.round(110 / diff()));
    if (e.y > 10 && e.y < H - 90 && e.t % rate === 0) {
      EB.push({ x: e.x + Math.cos(e.ang) * 9, y: e.y + Math.sin(e.ang) * 9, vx: Math.cos(e.ang) * 2, vy: Math.sin(e.ang) * 2, r: 2.5, col: '#fa0' });
    }
  } else if (e.kind === 'tank') {
    e.x += e.vx;
    if (e.x < 20 || e.x > W - 20) e.vx = -e.vx;
    e.ang = Math.atan2(P.y - e.y, P.x - e.x);
    if (e.y > 10 && e.y < H - 90 && e.t % 100 === 50) enemyShoot(e, 3, 0.3, 1.8);
  }
  if (e.y > H + 40) e.dead = true;
}

function damageEnemy(e, dmg) {
  if (e.st === 'ally' || e.st === 'captured' || e.dead) return false;
  e.hp -= dmg;
  e.flash = 6;
  if (e.hp <= 0) { killEnemy(e); return true; }
  SFX.hit();
  return true;
}

function killEnemy(e) {
  e.dead = true;
  const k = KIND[e.kind];
  const moving = e.st !== 'form' && e.st !== 'ground';
  let sc = moving && k.dscore ? k.dscore : k.score;
  if (e.kind === 'warden' && e.st === 'dive' && e.escorted) sc = 1600;
  if (G.t - G.lastKill < 50) G.chain++; else G.chain = 1;
  G.lastKill = G.t;
  const mult = Math.min(8, 1 + Math.floor((G.chain - 1) / 4));
  addScore(sc * mult);
  if (sc >= 400 || mult > 1) popText(e.x - 12, e.y - 8, mult > 1 ? `${sc * mult}` : `${sc}`, mult > 1 ? '#ff0' : '#fff', 7);
  if (mult > 1 && (G.chain - 1) % 4 === 0) popText(e.x - 20, e.y - 18, `CHAIN x${mult}`, `hsl(${G.t * 8 % 360},100%,60%)`, 8, 60);
  if (G.firebird <= 0 && G.formation <= 0) G.gauge = Math.min(100, G.gauge + (k.ground ? 6 : 3));
  const col = { drone: '#4fa', moth: '#fa4', warden: '#f4a', carrier: '#fff', orb: '#4ef', zigzag: '#d5f', orbiter: '#f8f', dart: '#f90', spinner: '#8ff' }[e.kind] || '#fa4';
  if (k.ground) { explode(e.x, e.y, '#fa4', e.kind === 'hangar' ? 2.5 : 1.6); shake(e.kind === 'hangar' ? 10 : 4); SFX.boom(); }
  else { explode(e.x, e.y, col, e.kind === 'warden' ? 1.5 : 1); SFX.pop(); }
  if (e.kind === 'carrier' || e.kind === 'pbase') IT.push({ kind: 'S', x: e.x, y: e.y, t: 0 });
  if (e.kind === 'fbase') IT.push({ kind: 'F', x: e.x, y: e.y, t: 0 });
  if (e.kind === 'hangar') {
    const n = nextPart();
    IT.push(n ? { kind: 'part', unit: n, x: e.x, y: e.y, t: 0 } : { kind: 'F', x: e.x, y: e.y, t: 0 });
    popText(e.x - 20, e.y - 20, n ? `PART ${n}` : 'FULL POWER', '#ff0', 8, 70);
  }
  for (const c of [e.captive, e.pulling]) if (c) {
    IT.push({ kind: 'rescue', unit: c === 'core' ? 'T' : c, x: e.x, y: e.y - 12, t: 0 });
    popText(e.x - 24, e.y - 20, 'RESCUE!', '#0ff', 9, 80);
    SFX.rescue();
  }
  if (S && S.type === 'challenge') S.hits++;
}
function nextPart() {
  const pending = new Set([...IT.filter((i) => i.kind === 'part' || i.kind === 'rescue').map((i) => i.unit), ...E.map((e) => e.captive || e.pulling)]);
  return [2, 3, 4, 5].find((n) => !P.units.includes(n) && !pending.has(n)) || null;
}
function addUnit(u) {
  if (P.units.includes(u) || P.units.length >= 5) { addScore(5000); popText(P.x - 16, P.y - 20, '5000', '#ff0'); return; }
  P.units.push(u);
  SFX.part();
  flash(0.35, u === 'T' ? '#fff' : PART_COL[u]);
  const [x, y] = [P.x + SLOT[u][0], P.y + SLOT[u][1]];
  FX.push({ t: 'ring', x, y, r: 2, vr: 3, life: 20, max: 20, col: '#fff' });
  if (fullParts() && u !== 'T') banner([['FULL DOCKING!', 'rainbow', 12], ['ファイアバード準備完了', '#ff0', 8, true]], 100);
  else popText(P.x - 24, P.y - 26, u === 'T' ? 'TWIN FIGHTER!' : 'DOCKING!', '#0ff', 8, 60);
}

// ================================================================ ボス
function makeBoss(type) {
  const D = 1 + G.loop * 0.45; // ボスの硬さは周回だけで上げる
  const b = { type, x: 120, y: -80, t: 0, flash: 0, dying: 0, enter: true, parts: [], captives: [], lasers: [] };
  if (type === 'gorgon') {
    Object.assign(b, { name: 'GORGON', r: 22, hp: 130 * D });
    b.parts = [{ ox: -40, oy: 6, r: 11, hp: 30 * D }, { ox: 40, oy: 6, r: 11, hp: 30 * D }];
  } else if (type === 'mother') {
    Object.assign(b, { name: 'MOTHER ARCA', r: 12, coreOy: 5, hp: 230 * D });
    b.parts = [{ ox: -52, oy: -4, r: 10, hp: 32 * D }, { ox: 52, oy: -4, r: 10, hp: 32 * D }, { ox: -28, oy: 26, r: 10, hp: 32 * D }, { ox: 28, oy: 26, r: 10, hp: 32 * D }];
  } else {
    Object.assign(b, { name: 'QUEEN ASTRA', r: 20, hp: 240 * D });
    b.parts = [{ ox: -38, oy: 2, r: 14, hp: 55 * D }, { ox: 38, oy: 2, r: 14, hp: 55 * D }];
  }
  b.maxHp = b.hp;
  for (const p of b.parts) { p.maxHp = p.hp; p.flash = 0; }
  return b;
}
const partXY = (b, p) => [b.x + p.ox, b.y + p.oy];
const aliveParts = (b) => b.parts.filter((p) => p.hp > 0);

function updateBoss(b) {
  b.t++;
  if (b.flash > 0) b.flash--;
  for (const p of b.parts) if (p.flash > 0) p.flash--;
  if (b.dying) {
    b.dying--;
    if (b.dying % 5 === 0) { explode(b.x + rnd(-40, 40), b.y + rnd(-30, 30), pick(['#fff', '#ff0', '#f60', '#f0f']), rnd(1, 2.2)); SFX.pop(); shake(6); }
    if (b.dying === 0) {
      bigExplode(b.x, b.y, '#fff');
      for (let i = 0; i < 12; i++) explode(b.x + rnd(-50, 50), b.y + rnd(-40, 40), pick(['#ff0', '#f80', '#fff']), 2);
      SFX.huge(); flash(1); shake(30);
      const bonus = { gorgon: 30000, mother: 50000, queen: 100000 }[b.type] * (G.loop + 1);
      addScore(bonus);
      banner([[`${b.name}`, '#fff', 10], ['DESTROYED', 'rainbow', 16], [`BONUS ${bonus}`, '#ff0', 10]], 180);
      for (const c of b.captives) IT.push({ kind: 'rescue', unit: c === 'core' ? 'T' : c, x: b.x + rnd(-20, 20), y: b.y, t: 0 });
      for (let i = 0; i < 3; i++) IT.push({ kind: pick(['S', 'F']), x: b.x + rnd(-30, 30), y: b.y + rnd(-10, 10), t: 0 });
      S.boss = null;
      EB = [];
      S.doneT = 200;
    }
    return;
  }
  if (b.enter) {
    b.y += (80 - b.y) * 0.03;
    if (b.y > 76) b.enter = false;
    return;
  }
  const D = diff(), t = b.t;
  if (b.type === 'gorgon') {
    b.x = 120 + Math.sin(t * 0.012) * 60;
    b.y = 78 + Math.sin(t * 0.025) * 12;
    b.parts.forEach((p, i) => {
      if (p.hp > 0 && (t + i * 35) % Math.max(35, Math.round(70 / D)) === 0) {
        const [x, y] = partXY(b, p), a = aimAng(x, y);
        for (let k = -1; k <= 1; k++) fireAt(x, y + 6, a + k * 0.25, 2.2);
      }
    });
    if (aliveParts(b).length) {
      if (t % 150 === 0) ring(b.x, b.y, 16, 1.5, t * 0.1);
    } else {
      if (t % 100 < 60 && t % 4 === 0) { const a = t * 0.13; fireAt(b.x, b.y, a, 2.0, '#0ff'); fireAt(b.x, b.y, a + Math.PI, 2.0, '#0ff'); }
      if (t % 120 === 0) ring(b.x, b.y, 20, 1.7);
    }
  } else if (b.type === 'mother') {
    b.x = 120 + Math.sin(t * 0.008) * 40;
    b.y = 80 + Math.sin(t * 0.02) * 6;
    const cyc = Math.floor(t / 360) % 3, ct = t % 360;
    b.parts.forEach((p, i) => {
      if (p.hp > 0 && (t + i * 13) % 55 === 0) { const [x, y] = partXY(b, p); fireAt(x, y, aimAng(x, y), 2.1); }
    });
    if (t % 200 === 100) ring(b.x, b.y, 18 + G.loop * 6, 1.5, t);
    if (cyc === 0 && ct > 60 && ct < 250 && ct % 14 === 0) {
      const a = aimAng(b.x, b.y);
      for (let k = -2; k <= 2; k++) fireAt(b.x, b.y + 20, a + k * 0.18, 2.4, '#f44');
    }
    if (cyc === 1) {
      if (ct === 30) { b.lasers = [P.x, clamp(P.x + pick([-60, 60]), 20, 220), rnd(20, 220)].map((x) => ({ x, t: 0 })); }
      for (const l of b.lasers) { l.t++; if (l.t === 60) { SFX.laser(); shake(4); } }
      if (ct === 160) b.lasers = [];
    }
    if (cyc === 2 && (ct === 40 || ct === 110 || ct === 180)) spawnFree(pick(['drone', 'moth']), 2, { x: b.x, y: b.y + 20 });
  } else {
    const rage = b.hp < b.maxHp * 0.35;
    const cyc = Math.floor(t / 300) % 4, ct = t % 300;
    if (cyc !== 1) { b.x += (120 + Math.sin(t * 0.011) * 70 - b.x) * 0.05; b.y += (80 + Math.sin(t * 0.022) * 22 - b.y) * 0.05; }
    if (cyc === 0 && ct % (rage ? 4 : 5) === 0) {
      const a = t * 0.07, arms = rage ? 4 : 2;
      for (let k = 0; k < arms; k++) fireAt(b.x, b.y, a + (k / arms) * TAU, 1.9, k % 2 ? '#f4f' : '#ff4');
    }
    if (cyc === 1) {
      if (ct < 60) { b.x += (clamp(P.x, 40, 200) - b.x) * 0.06; b.y += (110 - b.y) * 0.06; }
      if (ct === 60) SFX.beam();
      if (ct >= 60 && ct < 230) {
        const bt = ct - 60;
        if (bt % 14 === 0) SFX.beamHum();
        if (bt >= 40 && P.alive && P.inv <= 0 && G.firebird <= 0 && inBeam(b, P.x, P.y, bt)) {
          if (P.units.length) { const u = P.units.pop(); b.captives.push(u); P.inv = 90; popText(P.x - 30, P.y - 24, 'PART CAPTURED!', '#f44'); SFX.capture(); }
          else { b.captives.push('core'); popText(W / 2 - 50, 200, 'SHIP CAPTURED', '#f44', 8, 120); SFX.capture(); playerDie(true); }
        }
      }
      if (rage && ct % 30 === 0) ring(b.x, b.y, 12, 1.6, t);
    }
    if (cyc === 2 && ct % 60 === 30) spawnFree(pick(['moth', 'drone', 'moth']), 2, { x: b.x, y: b.y + 10 });
    if (cyc === 3) {
      b.parts.forEach((p, i) => {
        if (p.hp > 0 && ct > 30 && ct < 260 && (ct + i * 4) % 8 === 0) { const [x, y] = partXY(b, p); fireAt(x, y, aimAng(x, y) + rnd(-0.12, 0.12), 2.6, '#4ff'); }
      });
      if (!aliveParts(b).length && ct % 40 === 0) ring(b.x, b.y, 16, 2, t);
    }
    if (rage && t % 50 === 0) ring(b.x, b.y, 24, 1.4, t * 0.3, '#f80');
  }
}
function bossBeamActive(b) {
  if (b.type !== 'queen' || b.dying || b.enter) return -1;
  const ct = b.t % 300;
  return Math.floor(b.t / 300) % 4 === 1 && ct >= 60 && ct < 230 ? ct - 60 : -1;
}
function damageBoss(b, x, y, r, dmg) {
  if (b.enter || b.dying) return false;
  for (const p of b.parts) {
    if (p.hp <= 0) continue;
    const [px, py] = partXY(b, p);
    if (d2(x, y, px, py) < (p.r + r) ** 2) {
      p.hp -= dmg; p.flash = 4;
      if (p.hp <= 0) { explode(px, py, '#fa0', 2.2); SFX.boom(); shake(8); addScore(5000); popText(px - 12, py - 10, '5000', '#ff0'); }
      return true;
    }
  }
  const cy = b.y + (b.coreOy || 0);
  if (b.type === 'mother' && d2(x, y, b.x, cy) >= (b.r + r) ** 2) {
    const ax = Math.abs(x - b.x), ay = y - b.y;
    // コアの真下は素通し（下から撃てばコアに届く）
    if (ax > b.r + r && Math.abs(ay) <= 27 && ax <= 65 - Math.abs(ay) * 0.55) { if (G.t % 3 === 0) sparkle(x, y, '#aab', 1); return true; }
    return false;
  }
  if (d2(x, y, b.x, cy) < (b.r + r) ** 2) {
    b.hp -= dmg * (aliveParts(b).length ? 0.6 : 1);
    b.flash = 3;
    if (G.t % 4 === 0) SFX.hit();
    if (b.hp <= 0) { b.hp = 0; b.dying = 150; EB = []; SFX.boom(); }
    return true;
  }
  return false;
}

// ================================================================ フェーズ
function curStage() { return STAGES[G.si]; }
// ボーナスを除いた通し番号
function stageNo() {
  const per = STAGES.filter((s) => !s.bonus).length;
  return G.loop * per + STAGES.slice(0, G.si + 1).filter((s) => !s.bonus).length;
}
function startPhase() {
  const st = curStage(), def = st.phases[G.pi];
  S = { type: def.type, def, t: 0, delay: G.pi === 0 ? 150 : 70, fireMul: (def.fire || 0.8) * (1 + G.loop * 0.3) };
  G.neb = st.theme;
  if (P.y < 150) { P.x = 120; P.y = 285; P.inv = 60; }
  if (G.pi === 0) {
    const label = st.bonus ? [[st.name, 'rainbow', 12]] : [[`STAGE ${stageNo()}`, '#fff', 8], [st.name, 'rainbow', 12]];
    banner([...label, [st.jp, '#aaf', 10, true]], 150);
    G.warpTo = 6;
  }
  switch (def.type) {
    case 'formation': {
      S.taken = {}; S.queue = []; S.breath = 1; S.sway = 0; S.diveT = 200;
      let t = 0;
      for (const g of def.groups) {
        const path = getPath(g.path, g.m);
        for (let j = 0; j < g.n; j++) S.queue.push({ t: t + j * 9, kind: g.kind, path, slot: takeSlot(g.kind) });
        t += g.gap !== undefined ? g.gap : g.n * 9 + 65;
      }
      S.queue.sort((a, b) => a.t - b.t);
      playSong(SONGS.stage);
      break;
    }
    case 'scroll':
      S.dist = 0; S.scrollSpd = 0.85; S.gq = [...def.ground].sort((a, b) => a.d - b.d); S.aq = [...def.air].sort((a, b) => a.d - b.d);
      S.seed = G.si * 131 + G.loop * 17;
      playSong(SONGS.scroll);
      break;
    case 'swarm':
      S.queue = [...def.spawns].sort((a, b) => a.t - b.t);
      playSong(SONGS.stage);
      break;
    case 'boss':
      S.delay = 200; S.boss = null;
      banner([['WARNING', '#f33', 20], ['巨大戦艦 接近中', '#faa', 10, true]], 180);
      playSong(null);
      SFX.warn();
      break;
    case 'challenge':
      S.hits = 0; S.total = def.groups.length * 8; S.queue = [];
      for (const g of def.groups) for (let j = 0; j < 8; j++) S.queue.push({ t: g.t + j * 8, kind: g.kind, path: getPath(g.path, g.m) });
      S.queue.sort((a, b) => a.t - b.t);
      playSong(SONGS.challenge);
      break;
    case 'docking': {
      const u = nextPart();
      S.part = u;
      S.mx = 120; S.my = 70;
      S.done = false;
      S.limit = 1500;
      P.x = pick([50, 190]); P.y = 300; P.vx = pick([-0.3, 0.3]); P.vy = 0;
      EB = []; PB = [];
      playSong(SONGS.dock);
      banner([['DOCKING', 'rainbow', 16], [u ? `PART ${u} とドッキングせよ` : 'ボーナスカプセルとドッキングせよ', '#fff', 8, true], ['↑↓ 速さ  ←→ 位置  ゆっくり、まっすぐ', '#aaf', 7, true]], 170);
      break;
    }
  }
}
function phaseDone() {
  if (S.finished) return;
  S.finished = true;
  S.nextT = 90;
}
function nextPhase() {
  const st = curStage();
  G.pi++;
  if (G.pi >= st.phases.length) {
    G.pi = 0;
    if (!st.bonus) {
      const b = 10000 * (G.loop + 1);
      addScore(b);
      SFX.clear();
    }
    G.si++;
    if (G.si >= STAGES.length) {
      G.si = 0; G.loop++;
      banner([['ROUND CLEAR!', 'rainbow', 16], [`ROUND ${G.loop + 1}`, '#fff', 10], ['敵がさらに強くなる', '#f88', 8, true]], 200);
    }
  }
  startPhase();
}

function updatePhase() {
  if (S.delay > 0) { S.delay--; if (S.delay === 0 && S.type === 'boss') { S.boss = makeBoss(S.def.boss); playSong(SONGS.boss); } return; }
  S.t++;
  const def = S.def;
  switch (S.type) {
    case 'formation': {
      while (S.queue.length && S.queue[0].t <= S.t) {
        const q = S.queue.shift();
        const e = mkEnemy(q.kind, q.path[0][0], q.path[0][1], 'path', { path: q.path, pi: 0, spd: 1.6 + G.loop * 0.2, slot: q.slot, fo: true });
        if (G.si >= 3 && Math.random() < 0.25 * S.fireMul) e.fireAt = rndi(40, 90);
      }
      const entering = S.queue.length || E.some((e) => e.fo && (e.st === 'path' || e.st === 'return'));
      if (entering) S.sway = Math.sin(S.t * 0.02) * 14;
      else { S.sway *= 0.97; S.breath = 1 + 0.1 * Math.sin(S.t * 0.035); }
      if (S.t > 260 && --S.diveT <= 0) {
        launchDive();
        const alive = E.filter((e) => e.fo).length;
        S.diveT = Math.max(16, (95 - G.si * 5 - G.loop * 15) * (alive < 8 ? 0.45 : 1) / (def.dive || 1));
      }
      if (!S.queue.length && !E.some((e) => e.fo)) phaseDone();
      break;
    }
    case 'scroll': {
      S.dist += S.scrollSpd;
      while (S.gq.length && S.gq[0].d <= S.dist) {
        const g = S.gq.shift();
        mkEnemy(g.k, g.x, -24, 'ground', { vx: g.k === 'tank' ? pick([-0.4, 0.4]) : 0, t: rndi(0, 50) });
      }
      while (S.aq.length && S.aq[0].d <= S.dist) { const a = S.aq.shift(); spawnFree(a.kind, a.n, a); }
      if (S.dist > def.length + H && !E.some((e) => !e.fo && e.st !== 'ally' && e.st !== 'captured')) phaseDone();
      break;
    }
    case 'swarm':
      while (S.queue.length && S.queue[0].t <= S.t) { const q = S.queue.shift(); spawnFree(q.kind, q.n, q); }
      if (!S.queue.length && !E.some((e) => e.st === 'free' || e.st === 'dive')) phaseDone();
      break;
    case 'boss':
      if (S.boss) updateBoss(S.boss);
      if (S.doneT > 0 && --S.doneT === 0) phaseDone();
      break;
    case 'challenge':
      while (S.queue.length && S.queue[0].t <= S.t) {
        const q = S.queue.shift();
        mkEnemy(q.kind, q.path[0][0], q.path[0][1], 'path', { path: q.path, pi: 0, spd: 1.8 + G.loop * 0.2, hp: 1 });
      }
      if (!S.queue.length && !S.result && !E.some((e) => e.st === 'path')) {
        S.result = 240;
        const perfect = S.hits >= S.total;
        S.bonus = perfect ? 10000 * (G.loop + 1) : S.hits * 100;
        addScore(S.bonus);
        if (perfect) { SFX.extend(); flash(0.5); } else SFX.clear();
      }
      if (S.result && --S.result === 0) phaseDone();
      break;
    case 'docking':
      updateDocking();
      break;
  }
}

function launchDive() {
  const cand = E.filter((e) => e.fo && e.st === 'form');
  if (!cand.length) return;
  const e = pick(cand);
  if (e.kind === 'warden') {
    const beaming = E.some((x) => x.st === 'beamdown' || x.st === 'beaming' || x.st === 'pulling');
    if (!beaming && !e.captive && G.firebird <= 0 && P.alive && Math.random() < 0.45) {
      e.st = 'beamdown'; e.t = 0; e.tx = clamp(P.x, 30, 210);
      return;
    }
    const esc = cand.filter((x) => x.kind === 'moth' && x.slot.r === 1).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x)).slice(0, 2);
    const dir = e.x < 120 ? -1 : 1;
    startDive(e, dir);
    e.escorted = esc.length;
    for (const x of esc) startDive(x, dir);
    return;
  }
  startDive(e);
  if (G.si >= 4 && Math.random() < 0.3) { const e2 = pick(cand); if (e2.st === 'form') startDive(e2); }
}
function startDive(e, dir) {
  e.st = 'dive'; e.t = 0;
  e.dir = dir || (e.x < 120 ? -1 : 1);
  e.vx = e.dir * 1.4; e.vy = -2.2;
  SFX.dive();
}

// ドッキングのボーナスステージ
function updateDocking() {
  if (S.done) { if (--S.doneT <= 0) phaseDone(); return; }
  S.limit--;
  S.mx = 120 + Math.sin(S.t * 0.015) * (15 + G.loop * 15);
  if (keys.ArrowLeft) P.vx -= 0.035;
  if (keys.ArrowRight) P.vx += 0.035;
  if (keys.ArrowUp) { P.vy -= 0.03; if (G.t % 4 === 0) SFX.thrust(); }
  if (keys.ArrowDown) { P.vy += 0.03; if (G.t % 4 === 0) SFX.thrust(); }
  P.vy -= 0.006; // 母船に引かれる
  P.vx *= 0.995;
  P.vx = clamp(P.vx, -2, 2);
  P.vy = clamp(P.vy, -2.5, 0.6);
  P.x = clamp(P.x + P.vx, 10, W - 10);
  P.y = Math.min(H - 10, P.y + P.vy);
  if (G.t % 2 === 0) FX.push({ t: 'spark', x: P.x + rnd(-3, 3), y: P.y + 8, vx: 0, vy: 1.5 - P.vy, life: 10, max: 10, col: pick(['#0ff', '#fff', '#08f']) });
  const contact = P.y - 7 <= S.my + 7;
  if (contact || S.limit <= 0) {
    const dx = Math.abs(P.x - S.mx), spd = -P.vy;
    S.done = true; S.doneT = 180;
    if (contact && dx <= 5 && spd <= 1.1) {
      const bonus = 10000 * (G.loop + 1) + (dx <= 2 ? 5000 : 0);
      addScore(bonus);
      if (S.part) addUnit(S.part); else { G.gauge = 100; }
      P.y = S.my + 14; P.x = S.mx;
      flash(0.8, '#0ff'); SFX.extend();
      for (let i = 0; i < 4; i++) FX.push({ t: 'ring', x: P.x, y: P.y - 6, r: 2, vr: 2 + i, life: 30, max: 30, col: pick(['#0ff', '#fff', '#ff0']) });
      banner([['DOCKING SUCCESS!', 'rainbow', 12], [`BONUS ${bonus}`, '#ff0', 10], [dx <= 2 ? 'PERFECT!' : '', '#fff', 8]], 170);
    } else {
      bigExplode(S.mx, S.my, S.part ? PART_COL[S.part] : '#ff0');
      SFX.boom(); shake(15);
      const why = S.limit <= 0 ? 'TIME OVER' : dx > 5 ? 'ずれている' : '速すぎる';
      banner([['DOCKING MISS', '#f44', 14], [why, '#faa', 10, true]], 170);
      S.part = null;
      S.missed = true;
    }
  }
}

// ================================================================ 当たり判定
function updateBullets() {
  // 自機の弾
  for (const b of PB) {
    if (b.kind === 'missile') {
      b.life--;
      let tgt = null, best = 1e9;
      for (const e of E) {
        if (e.dead || e.st === 'ally' || e.st === 'captured' || e.wait > 0) continue;
        const dd = d2(b.x, b.y, e.x, e.y);
        if (dd < best) { best = dd; tgt = e; }
      }
      if (S && S.boss && !S.boss.enter && !S.boss.dying) { const dd = d2(b.x, b.y, S.boss.x, S.boss.y); if (dd < best) tgt = S.boss; }
      if (tgt) {
        const a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        b.vx += Math.cos(a) * 0.35; b.vy += Math.sin(a) * 0.35;
      } else b.vy -= 0.2;
      const v = Math.hypot(b.vx, b.vy);
      if (v > 4.5) { b.vx *= 4.5 / v; b.vy *= 4.5 / v; }
      if (G.t % 2 === 0) FX.push({ t: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 10, max: 10, col: '#8f8' });
    }
    b.x += b.vx; b.y += b.vy;
    if (b.life-- <= 0 || b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
    for (const e of E) {
      if (e.dead || e.wait > 0 || e.st === 'ally' || e.st === 'captured') continue;
      if (b.hits && b.hits.has(e)) continue;
      if (d2(b.x, b.y, e.x, e.y) < (e.r + b.r) ** 2) {
        damageEnemy(e, b.dmg);
        sparkle(b.x, b.y, '#fff', 2);
        if (b.pierce) b.hits.add(e); else { b.dead = true; break; }
      }
    }
    if (!b.dead && S && S.boss && damageBoss(S.boss, b.x, b.y, b.r, b.pierce ? b.dmg * 0.5 : b.dmg)) {
      sparkle(b.x, b.y, '#ff8', 2);
      if (!b.pierce) b.dead = true;
    }
  }
  PB = PB.filter((b) => !b.dead);

  // 敵の弾
  for (const b of EB) {
    b.x += b.vx; b.y += b.vy;
    if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
    if (!P.alive) continue;
    if (G.firebird > 0 && d2(b.x, b.y, P.x, P.y) < 18 ** 2) { b.dead = true; sparkle(b.x, b.y, '#f80', 2); continue; }
    if (d2(b.x, b.y, P.x, P.y) < (2 + b.r) ** 2) { b.dead = true; hitCore(); continue; }
    for (let i = 0; i < P.units.length; i++) {
      const [ux, uy] = unitPos(P.units[i], i);
      if (d2(b.x, b.y, ux, uy) < (4 + b.r) ** 2) {
        b.dead = true;
        if (G.formation > 0) sparkle(b.x, b.y, '#0ff', 3); else hitUnit(i);
        break;
      }
    }
    if (b.dead) continue;
    for (const e of E) if (e.st === 'ally' && d2(b.x, b.y, e.x, e.y) < (5 + b.r) ** 2) { b.dead = true; e.dead = true; explode(e.x, e.y, '#8ff'); SFX.pop(); break; }
  }
  EB = EB.filter((b) => !b.dead);

  // 体当たり・ビーム
  if (P.alive) {
    for (const e of E) {
      if (e.dead || e.wait > 0 || KIND[e.kind].ground) continue;
      if (e.st === 'ally') {
        for (const f of E) if (!f.dead && f !== e && f.st !== 'ally' && f.st !== 'captured' && !KIND[f.kind].ground && d2(e.x, e.y, f.x, f.y) < 100) { e.dead = true; explode(e.x, e.y, '#8ff'); killEnemy(f); break; }
        continue;
      }
      if (e.st === 'captured') continue;
      // スネアビームで吸い込む
      if (G.beam > 0 && Math.abs(e.x - P.x) < 10 && e.y < P.y - 10 && e.st !== 'pulling' && e.kind !== 'carrier') {
        const n = E.filter((x) => x.st === 'ally' || x.st === 'captured').length;
        if (n < 6) {
          e.st = 'captured'; e.fo = false; SFX.suck();
          if (e.slot && S.taken) delete S.taken[e.slot.c + ',' + e.slot.r];
          continue;
        }
      }
      if (G.firebird > 0 && d2(e.x, e.y, P.x, P.y) < 20 ** 2) { killEnemy(e); continue; }
      if (d2(e.x, e.y, P.x, P.y) < (e.r + 3) ** 2) { killEnemy(e); hitCore(); continue; }
      for (let i = 0; i < P.units.length; i++) {
        const [ux, uy] = unitPos(P.units[i], i);
        if (d2(e.x, e.y, ux, uy) < (e.r + 4) ** 2) { killEnemy(e); if (G.formation <= 0) hitUnit(i); break; }
      }
    }
    const b = S && S.boss;
    if (b && !b.enter && !b.dying) {
      if (G.firebird > 0) damageBoss(b, P.x, P.y, 16, 0.3);
      else if (d2(b.x, b.y, P.x, P.y) < (b.r + 3) ** 2) hitCore();
      for (const l of b.lasers) if (l.t >= 60 && l.t < 110 && Math.abs(P.x - l.x) < 7) hitCore();
    }
  }
  E = E.filter((e) => !e.dead);
}

function updateItems() {
  for (const it of IT) {
    it.t++;
    it.y += it.kind === 'rescue' ? 0.9 : 0.7;
    it.x += Math.sin(it.t * 0.05) * 0.3;
    if (P.alive && d2(it.x, it.y, P.x, P.y) < 40 ** 2) { it.x += (P.x - it.x) * 0.08; it.y += (P.y - it.y) * 0.08; }
    if (it.y > H + 20) { it.dead = true; if (it.kind === 'part' || it.kind === 'rescue') popText(it.x - 16, H - 30, 'MISSED', '#888'); continue; }
    if (!P.alive || d2(it.x, it.y, P.x, P.y) > 14 ** 2) continue;
    it.dead = true;
    switch (it.kind) {
      case 'part': case 'rescue': addUnit(it.unit); if (it.kind === 'rescue') addScore(2000); break;
      case 'S': G.snare = Math.min(3, G.snare + 1); SFX.item(); popText(P.x - 20, P.y - 20, 'SNARE', '#0ff'); break;
      case 'F': G.gauge = 100; SFX.item(); popText(P.x - 20, P.y - 20, 'FULL CHARGE', '#fa0'); break;
    }
  }
  IT = IT.filter((i) => !i.dead);
}

function updateFX() {
  for (const f of FX) {
    f.life--;
    if (f.t === 'ring') f.r += f.vr;
    else if (f.t === 'spark' || f.t === 'debris') { f.x += f.vx; f.y += f.vy; f.vx *= 0.96; f.vy *= 0.96; if (f.a !== undefined) f.a += f.va; }
  }
  FX = FX.filter((f) => f.life > 0);
  if (FX.length > 900) FX.splice(0, FX.length - 900);
  for (const t of TX) { t.t--; t.y -= 0.35; }
  TX = TX.filter((t) => t.t > 0);
}

// ================================================================ ゲームの流れ
function newGame() {
  Object.assign(G, { score: 0, lives: 3, loop: 0, si: 0, pi: 0, gauge: 0, chain: 0, firebird: 0, formation: 0, beam: 0, snare: 1, nextExtend: 30000 });
  E = []; PB = []; EB = []; IT = []; FX = []; TX = [];
  P = null;
  newPlayer(false);
  G.state = 'play';
  startPhase();
}
function gameOver() {
  G.state = 'gameover';
  G.timer = 120;
  playSong(null);
  try { localStorage.setItem('galacresta_hi', String(G.hi)); } catch (e) { /* 保存できなくても続ける */ }
}

function update() {
  G.t++;
  if (pr.KeyM) { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; }
  G.warp += (G.warpTo - G.warp) * 0.05;
  if (G.warpTo > 1 && G.banner === null) G.warpTo = 1;
  for (const s of STARS) { s.y += s.z * G.warp * 0.8; if (s.y > H) { s.y -= H; s.x = rnd(0, W); } }
  G.scrollY = (G.scrollY + 0.3 * G.warp) % H;
  if (G.shake > 0) G.shake *= 0.88;
  if (G.shake < 0.3) G.shake = 0;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - 0.04);
  if (G.banner && ++G.banner.t >= G.banner.dur) G.banner = null;

  switch (G.state) {
    case 'title':
      if (!BGM.song && AC) playSong(SONGS.title);
      if (pr.Enter || pr.Space || pr.KeyZ) newGame();
      updateFX();
      break;
    case 'play':
      if (pr.KeyP || pr.Escape) { G.state = 'pause'; break; }
      updatePlayer();
      if (G.state !== 'play') break;
      updatePhase();
      for (const e of E) updateEnemy(e);
      updateBullets();
      updateItems();
      updateFX();
      if (S.finished && --S.nextT <= 0) nextPhase();
      break;
    case 'pause':
      if (pr.KeyP || pr.Enter) G.state = 'play';
      else if (pr.Escape) { G.state = 'title'; playSong(SONGS.title); try { localStorage.setItem('galacresta_hi', String(G.hi)); } catch (e) { /* 無視 */ } }
      break;
    case 'gameover':
      updateFX();
      if (G.timer > 0) G.timer--;
      else if (pr.Enter || pr.Space || pr.KeyZ || pr.Escape) { G.state = 'title'; playSong(SONGS.title); }
      break;
  }
  for (const k in pr) delete pr[k];
  bgmTick();
}

// ================================================================ 描画
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function landAt(col, row) {
  if (row < 0 || row * 16 > S.def.length + 40) return false;
  const edge = Math.min(row, (S.def.length + 40) / 16 - row);
  const v = vnoise(col * 0.28 + S.seed, row * 0.22) + Math.min(0, edge * 0.08 - 0.3);
  return v > 0.33;
}
function drawTerrain() {
  const th = THEMES[G.neb], dist = S.dist;
  const k0 = Math.floor((dist - H - 20) / 16) - 1, k1 = Math.ceil((dist + 20) / 16) + 1;
  for (let k = k0; k <= k1; k++) {
    const y = Math.round(dist - k * 16 - 20);
    if (y < -16 || y > H) continue;
    for (let c = 0; c < 15; c++) {
      if (!landAt(c, k)) continue;
      const x = c * 16;
      rect(x, y, 16, 16, th.land);
      if (!landAt(c, k + 1)) rect(x, y, 16, 3, th.hi);
      if (!landAt(c, k - 1)) rect(x, y + 13, 16, 3, th.dark);
      if (!landAt(c - 1, k)) rect(x, y, 2, 16, th.hi);
      if (!landAt(c + 1, k)) rect(x + 14, y, 2, 16, th.dark);
      const h = hash(c + 99, k);
      if (h < 0.25) { rect(x + 4, y + 5, 6, 5, th.dark); rect(x + 5, y + 5, 4, 1, th.hi); }
      else if (h < 0.35) { rect(x + 3, y + 3, 2, 2, th.hi); rect(x + 10, y + 9, 3, 2, th.hi); }
    }
  }
}

function drawGroundEnemy(e) {
  const x = Math.round(e.x), y = Math.round(e.y), w = e.flash > 0;
  const base = w ? '#fff' : '#606878', dark = w ? '#fff' : '#303440';
  switch (e.kind) {
    case 'turret':
      rect(x - 10, y - 10, 20, 20, dark); rect(x - 9, y - 9, 18, 18, base);
      ctx.fillStyle = w ? '#fff' : '#a0a8b8'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = w ? '#fff' : '#303440'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(e.ang) * 11, y + Math.sin(e.ang) * 11); ctx.stroke();
      rect(x - 1, y - 1, 2, 2, '#f40');
      break;
    case 'tank':
      rect(x - 10, y - 8, 20, 16, dark); rect(x - 8, y - 6, 16, 12, w ? '#fff' : '#6a7a40');
      for (let i = 0; i < 5; i++) { rect(x - 10, y - 8 + i * 4, 3, 2, '#222'); rect(x + 7, y - 8 + i * 4, 3, 2, '#222'); }
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(e.ang) * 11, y + Math.sin(e.ang) * 11); ctx.stroke();
      break;
    case 'hangar': {
      rect(x - 17, y - 15, 34, 30, dark); rect(x - 15, y - 13, 30, 26, w ? '#fff' : '#8088a0');
      const open = (G.t >> 4) & 1;
      rect(x - 11, y - 9, 22, 18, '#101018');
      rect(x - 11, y - 9, 11 - open * 3, 18, '#505868'); rect(x + open * 3, y - 9, 11 - open * 3, 18, '#505868');
      const n = nextPart();
      text(n ? String(n) : 'F', x - 3, y - 4, n ? PART_COL[n] : '#fa0', 8);
      for (const s of [-1, 1]) rect(x + s * 14 - 1, y - 14, 3, 3, (G.t >> 3) & 1 ? '#f00' : '#400');
      break;
    }
    case 'pbase': case 'fbase': {
      const col = e.kind === 'pbase' ? '#0ff' : '#fa0';
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = w ? '#fff' : base; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 8, G.t * 0.1, G.t * 0.1 + 4.5); ctx.stroke();
      text(e.kind === 'pbase' ? 'S' : 'F', x - 3.5, y - 4, col, 8);
      break;
    }
  }
}

function enemySprite(e) {
  const f = (G.t >> 4) & 1;
  const white = e.flash > 0;
  switch (e.kind) {
    case 'drone': case 'moth': return SPR[e.kind + f + (white ? 'W' : e.st === 'ally' || e.st === 'captured' ? 'A' : '')];
    case 'warden':
      if (white) return SPR['warden' + f + 'W'];
      if (e.st === 'ally' || e.st === 'captured') return SPR['warden' + f + 'A'];
      return e.hp < 2 ? SPR['wardenHurt' + f] : SPR['warden' + f];
    case 'carrier': return SPR.carrier[(G.t >> 2) % 6];
    case 'orb': case 'zigzag': case 'dart': return SPR[e.kind + (white ? 'W' : '')];
  }
  return null;
}
function drawEnemy(e) {
  if (e.wait > 0) return;
  if (e.st === 'ground') { drawGroundEnemy(e); return; }
  const spr = enemySprite(e);
  if (spr) drawSpr(spr, e.x, e.y, e.ang);
  else if (e.kind === 'orbiter') {
    const c = e.flash > 0 ? '#fff' : '#f6f';
    ctx.globalCompositeOperation = 'lighter';
    glow(e.x, e.y, 8, '#a0a');
    ctx.globalCompositeOperation = 'source-over';
    rect(e.x - 2, e.y - 2, 4, 4, c);
    for (let i = 0; i < 3; i++) {
      const a = G.t * 0.2 + (i * TAU) / 3;
      rect(e.x + Math.cos(a) * 7 - 1, e.y + Math.sin(a) * 3.5 * (i + 1) / 2 - 1, 2, 2, '#fff');
    }
  } else if (e.kind === 'spinner') {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(G.t * 0.2);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#4ff';
    ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3; ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); } ctx.fill();
    ctx.fillStyle = '#048'; ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
  // 捕まえたパーツ・自機を頭上に掲げる
  const cap = e.captive;
  if (cap) drawCaptive(cap, e.x, e.y - 13);
  if (e.st === 'pulling') {
    const f = Math.min(1, e.t / 70);
    const x = e.pullFrom[0] + (e.x - e.pullFrom[0]) * f, y = e.pullFrom[1] + (e.y - 13 - e.pullFrom[1]) * f;
    ctx.save(); ctx.translate(x, y); ctx.rotate(e.t * 0.3); ctx.translate(-x, -y);
    drawCaptive(e.pulling, x, y);
    ctx.restore();
  }
}
function drawCaptive(c, x, y) {
  if (c === 'core' || c === 'T') drawSpr(SPR.fighterRed, x, y, Math.PI);
  else drawSpr(SPR['podRed' + c], x, y, Math.PI);
}
function drawBeam(x, y, t) {
  const len = Math.min(1, t / 40) * (H - y);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < len; i += 6) {
    const yy = y + 8 + i, hw = 5 + (yy - y) * 0.28;
    const ph = (i / 6 + Math.floor(G.t / 3)) % 4;
    ctx.fillStyle = ['rgba(80,120,255,0.35)', 'rgba(120,200,255,0.35)', 'rgba(200,120,255,0.3)', 'rgba(80,255,255,0.3)'][ph];
    ctx.fillRect(x - hw, yy, hw * 2, 4);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawBoss(b) {
  const x = Math.round(b.x), y = Math.round(b.y);
  const wb = b.flash > 0 && (G.t & 2) > 0;
  const pw = (p) => p.flash > 0 && (G.t & 2) > 0;
  if (b.type === 'gorgon') {
    blitAt(BOSS.gorgonTent[(G.t >> 3) % 8], x, y + 14, 33, 1, wb);
    blitAt(BOSS.gorgon, x, y, 57, 29, wb);
    const a = aimAng(x, y);
    blitAt(aliveParts(b).length ? BOSS.gorgonIris : BOSS.gorgonIris2, x + Math.round(Math.cos(a) * 4), y - 1 + Math.round(Math.sin(a) * 4), 3, 3);
    for (const p of b.parts) if (p.hp > 0) { const [px, py] = partXY(b, p); blitAt(BOSS.gorgonCannon, px, py, 11, 10, pw(p)); }
  } else if (b.type === 'mother') {
    for (const l of b.lasers) {
      if (l.t < 60) { if ((l.t >> 2) & 1) rect(Math.round(l.x), 0, 1, H, '#f44'); }
      else if (l.t < 110) {
        const w = 6 + ((l.t >> 1) & 1) * 2, lx = Math.round(l.x);
        rect(lx - w, 0, w * 2, H, '#c02020');
        rect(lx - w + 2, 0, w * 2 - 4, H, '#ff6040');
        rect(lx - 2, 0, 4, H, '#fff');
      }
    }
    for (const s of [-1, 1]) {
      const fl = (G.t >> 1) & 1;
      rect(x + s * 30 - 3, y - 31 - fl, 6, 3 + fl, '#ff8020');
      rect(x + s * 30 - 1, y - 33 - fl, 2, 3, '#ffe060');
    }
    blitAt(BOSS.mother[(G.t >> 3) & 1], x, y, 67, 31, wb);
    for (let i = 0; i < 8; i++) rect(x - 42 + i * 12, y - 17, 2, 1, (G.t >> 3) % 8 === i ? '#ff0' : '#553');
    for (const p of b.parts) {
      if (p.hp <= 0) continue;
      const [px, py] = partXY(b, p);
      const a = (aimAng(px, py) % TAU + TAU) % TAU;
      blitAt(BOSS.motherTurret[Math.round((a / TAU) * 16) % 16], px, py, 9, 9, pw(p));
    }
  } else {
    const bt = bossBeamActive(b);
    if (bt >= 0) drawBeam(x, y + 16, bt);
    const pulse = (G.t >> 3) & 1;
    for (const p of b.parts) if (p.hp > 0) { const [px, py] = partXY(b, p); blitAt(BOSS.wing[pulse], px, py, 20, 22, pw(p), p.ox < 0); }
    blitAt(b.hp < b.maxHp * 0.35 ? BOSS.queenHurt : BOSS.queen, x, y, 24, 20, wb);
    b.captives.forEach((c, i) => drawCaptive(c, x - (b.captives.length - 1) * 7 + i * 14, y - 30));
  }
}

function drawPlayer() {
  if (!P.alive) return;
  if (P.inv > 0 && (G.t >> 2) & 1 && G.firebird <= 0) return;
  if (G.firebird > 0) {
    // ファイアバード: 炎の鳥
    ctx.globalCompositeOperation = 'lighter';
    const flap = Math.sin(G.t * 0.3);
    glow(P.x, P.y, 34, '#f60', 0.9);
    glow(P.x, P.y - 4, 18, '#ff0', 0.9);
    ctx.fillStyle = 'rgba(255,160,40,0.9)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(P.x, P.y - 4);
      ctx.quadraticCurveTo(P.x + s * 20, P.y - 20 - flap * 8, P.x + s * 34, P.y - 6 - flap * 12);
      ctx.quadraticCurveTo(P.x + s * 18, P.y + 2, P.x, P.y + 6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,200,1)';
    ctx.beginPath(); ctx.moveTo(P.x, P.y - 16); ctx.lineTo(P.x - 4, P.y + 10); ctx.lineTo(P.x, P.y + 20); ctx.lineTo(P.x + 4, P.y + 10); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  P.units.forEach((u, i) => {
    const [x, y] = unitPos(u, i);
    if (G.formation > 0) { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 10, u === 'T' ? '#88f' : PART_COL[u], 0.6); ctx.globalCompositeOperation = 'source-over'; }
    else if (u !== 'T') { ctx.strokeStyle = 'rgba(160,220,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(x, y); ctx.stroke(); }
    drawSpr(u === 'T' ? SPR.fighter : SPR['pod' + u], x, y);
  });
  ctx.globalCompositeOperation = 'lighter';
  glow(P.x, P.y + 8, 5 + Math.random() * 2, '#08f', 0.9);
  ctx.globalCompositeOperation = 'source-over';
  drawSpr(SPR.fighter, P.x, P.y);
}

function drawItem(it) {
  const x = it.x, y = it.y, bl = (G.t >> 3) & 1;
  ctx.globalCompositeOperation = 'lighter';
  glow(x, y, 14, it.kind === 'S' ? '#0aa' : it.kind === 'F' ? '#a60' : '#666', 0.7 + bl * 0.3);
  ctx.globalCompositeOperation = 'source-over';
  if (it.kind === 'part') { drawSpr(SPR['pod' + it.unit], x, y); text(String(it.unit), x + 5, y - 10, PART_COL[it.unit], 6); }
  else if (it.kind === 'rescue') drawSpr(it.unit === 'T' ? SPR.fighter : SPR['pod' + it.unit], x, y, Math.sin(G.t * 0.2) * 0.3);
  else {
    rect(x - 6, y - 6, 12, 12, it.kind === 'S' ? '#066' : '#640');
    rect(x - 5, y - 5, 10, 10, it.kind === 'S' ? '#0cc' : '#f90');
    text(it.kind, x - 3.5, y - 4, '#fff', 8);
  }
}

function drawFX() {
  ctx.globalCompositeOperation = 'lighter';
  for (const f of FX) {
    const a = f.life / f.max;
    if (f.t === 'flash') glow(f.x, f.y, f.r * (0.6 + a * 0.4), f.col, a);
    else if (f.t === 'ring') {
      ctx.strokeStyle = f.col; ctx.globalAlpha = a; ctx.lineWidth = 2 * a + 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (f.t === 'spark') { ctx.globalAlpha = Math.min(1, a * 1.5); rect(f.x - 1, f.y - 1, 2, 2, f.col); ctx.globalAlpha = 1; }
    else if (f.t === 'debris') {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(-2, -1, 4, 2); ctx.restore();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawBullets() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of PB) {
    if (b.kind === 'fire') { glow(b.x, b.y, 10, '#f60', 0.9); glow(b.x, b.y, 5, '#ff8'); }
    else if (b.kind === 'laser') { rect(b.x - 1.5, b.y - 8, 3, 16, '#ff8'); rect(b.x - 0.5, b.y - 8, 1, 16, '#fff'); glow(b.x, b.y, 5, '#aa0', 0.5); }
    else if (b.kind === 'missile') { glow(b.x, b.y, 5, '#0f4'); rect(b.x - 1, b.y - 1, 3, 3, '#fff'); }
    else { rect(b.x - 1, b.y - 4, 2, 7, b.kind === 'ally' ? '#8ff' : '#fff'); glow(b.x, b.y, 4, b.kind === 'ally' ? '#088' : '#44a', 0.8); }
  }
  for (const b of EB) { glow(b.x, b.y, b.r * 2.6, b.col, 0.9); }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of EB) rect(b.x - 1, b.y - 1, 2, 2, '#fff');
}

function drawHUD() {
  rect(0, 0, W, 12, 'rgba(0,0,0,0.5)');
  text('1UP', 4, 2, (G.t >> 4) & 1 ? '#f33' : '#f88', 6);
  text(String(G.score).padStart(8, ' '), 24, 2, '#fff', 6);
  text('HI', 100, 2, '#f33', 6);
  text(String(G.hi).padStart(8, ' '), 112, 2, '#ff8', 6);
  const st = curStage();
  text(st.bonus ? 'BONUS' : `ST${stageNo()}`, 198, 2, '#8cf', 6);
  // 下段
  rect(0, H - 12, W, 12, 'rgba(0,0,0,0.5)');
  for (let i = 0; i < Math.min(G.lives, 5); i++) drawSpr(SPR.fighter, 8 + i * 12, H - 6, 0, 0.7);
  for (let i = 0; i < G.snare; i++) { rect(72 + i * 9, H - 10, 7, 8, '#0cc'); text('S', 73 + i * 9, H - 9.5, '#fff', 6); }
  // ゲージ
  const gx = 104, gw = 70;
  rect(gx, H - 9, gw, 6, '#222');
  const full = G.gauge >= 100;
  const gc = G.firebird > 0 ? '#f80' : G.formation > 0 ? '#0ff' : full ? `hsl(${G.t * 10 % 360},100%,60%)` : '#48f';
  const fill = G.firebird > 0 ? G.firebird / 600 : G.formation > 0 ? G.formation / 540 : G.gauge / 100;
  rect(gx + 1, H - 8, (gw - 2) * fill, 4, gc);
  const label = G.firebird > 0 ? 'FIREBIRD' : G.formation > 0 ? 'ORBIT' : full ? (fullParts() ? 'C:FIREBIRD' : 'C:ORBIT') : '';
  if (label) text(label, gx + gw / 2, H - 9, '#fff', 5, 'center');
  // パーツ
  [2, 3, 4, 5].forEach((n, i) => {
    const has = P && P.units.includes(n);
    rect(180 + i * 12, H - 10, 10, 8, has ? PART_COL[n] : '#333');
    text(String(n), 182.5 + i * 12, H - 9.5, has ? '#000' : '#666', 6);
  });
  if (S && S.boss && !S.boss.enter) {
    const b = S.boss;
    rect(20, 15, 200, 5, '#300');
    rect(21, 16, 198 * Math.max(0, b.hp / b.maxHp), 3, b.dying ? '#fff' : '#f33');
    text(b.name, 120, 22, '#faa', 6, 'center');
  }
}

function drawBanner() {
  const b = G.banner;
  if (!b) return;
  const inT = Math.min(1, b.t / 15), outT = Math.min(1, (b.dur - b.t) / 20);
  const a = Math.min(inT, outT);
  ctx.globalAlpha = a * 0.55;
  const h = b.lines.length * 16 + 12;
  rect(0, 120 - h / 2, W, h, '#000');
  ctx.globalAlpha = a;
  let y = 120 - h / 2 + 8;
  for (const [s, col, size, jp] of b.lines) {
    const off = (1 - inT) * W;
    if (col === 'rainbow') rainbow(s, W / 2 + off, y, size, 'center', jp ? JFONT : FONT);
    else text(s, W / 2 + off, y, col === '#f33' && (G.t >> 3) & 1 ? '#fff' : col, size, 'center', jp ? JFONT : FONT);
    y += size + 6;
  }
  ctx.globalAlpha = 1;
}

function drawBackground() {
  const neb = nebula(G.neb);
  const oy = Math.round(G.scrollY);
  ctx.drawImage(neb, 0, oy - H);
  ctx.drawImage(neb, 0, oy);
  for (const s of STARS) {
    const len = Math.max(1, s.z * (G.warp - 1) * 3);
    ctx.globalAlpha = s.z < 0.5 ? 0.5 : 1;
    rect(Math.round(s.x), Math.round(s.y - len), 1, Math.ceil(len), (G.t + s.x) % 40 < 3 ? '#000' : s.c);
  }
  ctx.globalAlpha = 1;
}

function drawDocking() {
  const mx = S.mx, my = S.my;
  // 母船とガイド
  for (let y = my + 12; y < H - 20; y += 8) rect(mx - 0.5, y, 1, 4, 'rgba(0,255,255,0.35)');
  if (!S.done) {
    ctx.globalCompositeOperation = 'lighter';
    glow(mx, my, 24, S.part ? PART_COL[S.part] : '#fa0', 0.6 + Math.sin(G.t * 0.1) * 0.2);
    ctx.globalCompositeOperation = 'source-over';
    if (S.part) drawSpr(SPR['pod' + S.part], mx, my, Math.PI, 2);
    else { rect(mx - 8, my - 8, 16, 16, '#fa0'); text('F', mx - 3.5, my - 4, '#fff', 8); }
  }
  if (!S.done) {
    const dx = P.x - mx, spd = -P.vy;
    const okX = Math.abs(dx) <= 5, okV = spd <= 1.1;
    text(`ズレ ${dx > 0 ? '+' : ''}${dx.toFixed(1)}`, 10, 40, okX ? '#0f8' : '#f66', 8, 'left', JFONT);
    text(`速さ ${spd.toFixed(2)}`, 10, 52, okV ? '#0f8' : '#f66', 8, 'left', JFONT);
    text(`TIME ${Math.ceil(S.limit / 60)}`, 230, 40, '#fff', 6, 'right');
    rect(P.x - 0.5, my + 10, 1, P.y - my - 18, okX ? 'rgba(0,255,120,0.25)' : 'rgba(255,80,80,0.25)');
  }
}

function drawTitle() {
  drawBackground();
  ctx.globalCompositeOperation = 'lighter';
  glow(120, 70, 90, '#406', 0.8);
  ctx.globalCompositeOperation = 'source-over';
  const t = G.t;
  for (let i = 0; i < 8; i++) {
    const a = t * 0.02 + (i * TAU) / 8;
    const k = ['drone', 'moth', 'warden', 'drone', 'moth', 'drone', 'moth', 'warden'][i];
    drawSpr(SPR[k + ((t >> 4) & 1)], 120 + Math.cos(a) * 100, 175 + Math.sin(a) * 28, a + Math.PI);
  }
  ctx.font = `22px ${FONT}`;
  const g = ctx.createLinearGradient(0, 40, 0, 92);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, `hsl(${t * 3 % 360},100%,65%)`); g.addColorStop(1, `hsl(${(t * 3 + 120) % 360},100%,45%)`);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [word, y] of [['GALA', 40], ['CRESTA', 68]]) {
    ctx.fillStyle = '#000'; ctx.fillText(word, 122, y + 2);
    ctx.fillStyle = g; ctx.fillText(word, 120, y);
  }
  jtext('陣形 × 捕獲 × 合体 × 地上戦  全部のせシューティング', 120, 100, '#aaf', 7, 'center');
  drawSpr(SPR.fighter, 120, 175, 0, 2);
  [[2, -26, 8], [3, 26, 8], [4, 0, -24], [5, 0, 24]].forEach(([n, ox, oy]) => drawSpr(SPR['pod' + n], 120 + ox, 175 + oy, 0, 2));
  if ((t >> 5) & 1) text('PUSH ENTER', 120, 216, '#fff', 8, 'center');
  const lines = [
    ['←↑↓→ 移動  Z 連射  Shift 低速', '#ccd'],
    ['X スネアビーム: 敵を捕まえて味方に', '#0ff'],
    ['C オービット / 4パーツでファイアバード', '#fa0'],
    ['格納庫を壊して 2〜5 のパーツと合体', '#8f8'],
    ['トラクタービームで奪われたら 撃って救出', '#f88'],
    ['P 一時停止  M 音', '#889'],
  ];
  lines.forEach(([s, c], i) => jtext(s, 120, 234 + i * 12, c, 7, 'center'));
  text(`HI ${G.hi}`, 120, 310, '#ff8', 6, 'center');
}

function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate(Math.round(rnd(-G.shake, G.shake)), Math.round(rnd(-G.shake, G.shake)));
  if (G.state === 'title') {
    drawTitle();
    drawFX();
  } else {
    drawBackground();
    if (S && S.type === 'scroll') drawTerrain();
    for (const e of E) if (e.st === 'ground') drawEnemy(e);
    if (S && S.type === 'docking') drawDocking();
    for (const it of IT) drawItem(it);
    for (const e of E) if (e.st === 'beaming') drawBeam(e.x, e.y, e.t);
    if (S && S.boss) drawBoss(S.boss);
    for (const e of E) if (e.st !== 'ground') drawEnemy(e);
    if (G.beam > 0 && P.alive) {
      ctx.globalCompositeOperation = 'lighter';
      const w = 9 + Math.sin(G.t * 0.5) * 2;
      rect(P.x - w, 0, w * 2, P.y - 8, 'rgba(0,200,255,0.25)');
      rect(P.x - 2, 0, 4, P.y - 8, 'rgba(200,255,255,0.7)');
      for (let y = (G.t * 6) % 20; y < P.y; y += 20) rect(P.x - w, y, w * 2, 2, 'rgba(255,255,255,0.4)');
      ctx.globalCompositeOperation = 'source-over';
    }
    drawPlayer();
    drawBullets();
    drawFX();
    for (const t of TX) {
      ctx.globalAlpha = Math.min(1, t.t / 15);
      text(t.s, t.x, t.y, t.col, t.size || 8, 'left', /[^\x00-\x7f]/.test(t.s) ? JFONT : FONT);
      ctx.globalAlpha = 1;
    }
    if (S && S.type === 'challenge') {
      if (S.result) {
        const perfect = S.hits >= S.total;
        text('HIT COUNT', 120, 120, '#0ff', 8, 'center');
        text(String(S.hits), 120, 136, '#fff', 12, 'center');
        if (perfect) rainbow('PERFECT!!', 120, 160, 14);
        text(`BONUS ${S.bonus}`, 120, 186, '#ff0', 8, 'center');
      } else text(`HITS ${S.hits}/${S.total}`, 120, 16, '#0ff', 6, 'center');
    }
    drawHUD();
    drawBanner();
    if (G.state === 'pause') {
      rect(0, 0, W, H, 'rgba(0,0,0,0.5)');
      text('PAUSE', 120, 140, '#fff', 14, 'center');
      jtext('P/Enter 再開   Esc タイトルへ', 120, 164, '#ccc', 8, 'center');
    }
    if (G.state === 'gameover') {
      rect(0, 0, W, H, 'rgba(0,0,0,0.4)');
      text('GAME OVER', 120, 130, '#f33', 16, 'center');
      text(`SCORE ${G.score}`, 120, 160, '#fff', 8, 'center');
      if (G.score >= G.hi && G.score > 0) rainbow('NEW RECORD!', 120, 178, 10);
    }
  }
  ctx.restore();
  if (G.flash > 0) { ctx.globalAlpha = Math.min(0.8, G.flash); rect(0, 0, W, H, G.flashCol); ctx.globalAlpha = 1; }
}

// ================================================================ ループ（60fps 固定）
let last = performance.now(), acc = 0;
function frame(now) {
  // window.MANUAL のときは外から update/render を呼ぶ（動画の書き出し用）
  if (!window.MANUAL) {
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

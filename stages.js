// GALA CRESTA のレベルデザイン。
// 1ステージ = フェーズの並び。フェーズの種類:
//   formation … groups の順に入場して陣形を組み、急降下してくる。warden はトラクタービームを撃つ
//               path: 入場経路 A〜E（m:1 で左右反転）  gap: 次のグループまでのフレーム数
//               dive: 急降下の頻度倍率  fire: 弾を撃つ頻度倍率
//   scroll    … 地上が流れる。ground の格納庫(hangar)を壊すと番号パーツが出る
//               d: 何ピクセル流れたところで出るか  x: 横位置
//   swarm     … 陣形を組まない敵が群れで来る。t: 開始からのフレーム
//   boss      … 大型ボス
//   challenge … ボーナスアタック。敵は撃ってこない。40機のうち何機落とせるか
//   docking   … ドッキングのボーナス。上のパーツに、ゆっくり、まっすぐ合体する
//
// 設計の流れ:
//   1面 基本（撃つ・避ける・パーツ2を拾う）
//   2面 トラクタービームとスネアビーム（虹色のキャリアーを落とすと S）、初ボス
//   3面 地上戦が本番。パーツ4・5が出て、ファイアバードが狙えるようになる
//   4面 弾が増える。母艦
//   5面 F 基地が多く、ファイアバードで押し切る面
//   6面 銀河女王。女王もビームでパーツを奪う
const STAGES = [
  {
    name: 'STAR ALLEY', jp: '星の通り道', theme: 0,
    phases: [
      { type: 'formation', dive: 0.6, fire: 0.45, groups: [
        { path: 'A', kind: 'drone', n: 4 }, { path: 'A', m: 1, kind: 'drone', n: 4 },
        { path: 'B', kind: 'moth', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'C', kind: 'warden', n: 2 },
        { path: 'D', kind: 'drone', n: 4 }, { path: 'D', m: 1, kind: 'drone', n: 4 },
      ] },
      { type: 'scroll', length: 1500,
        ground: [
          { d: 200, k: 'turret', x: 60 }, { d: 380, k: 'turret', x: 180 },
          { d: 700, k: 'hangar', x: 120 },
          { d: 900, k: 'turret', x: 50 }, { d: 900, k: 'turret', x: 190 },
          { d: 1150, k: 'tank', x: 100 }, { d: 1300, k: 'pbase', x: 180 },
        ],
        air: [
          { d: 300, kind: 'zigzag', n: 4, x: 70 }, { d: 560, kind: 'zigzag', n: 4, x: 170 },
          { d: 1000, kind: 'dart', n: 3, x: 120 },
        ] },
      { type: 'swarm', spawns: [
        { t: 0, kind: 'orb', n: 6, x: 70 }, { t: 60, kind: 'orb', n: 6, x: 170 },
        { t: 320, kind: 'zigzag', n: 5, x: 120 }, { t: 480, kind: 'orb', n: 8, x: 120 },
        { t: 700, kind: 'orbiter', n: 2 },
      ] },
    ],
  },
  {
    name: 'CORONA NEBULA', jp: 'コロナ星雲', theme: 1,
    phases: [
      { type: 'formation', dive: 0.85, fire: 0.65, groups: [
        { path: 'A', kind: 'drone', n: 4 }, { path: 'A', m: 1, kind: 'drone', n: 4 },
        { path: 'B', kind: 'moth', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'C', kind: 'warden', n: 4 },
        { path: 'E', kind: 'carrier', n: 1, gap: 40 },
        { path: 'D', kind: 'drone', n: 4 }, { path: 'D', m: 1, kind: 'drone', n: 4 },
        { path: 'E', m: 1, kind: 'moth', n: 4 },
      ] },
      { type: 'scroll', length: 1700,
        ground: [
          { d: 150, k: 'turret', x: 40 }, { d: 150, k: 'turret', x: 200 },
          { d: 420, k: 'tank', x: 60 }, { d: 520, k: 'turret', x: 150 },
          { d: 800, k: 'hangar', x: 80 },
          { d: 1000, k: 'turret', x: 180 }, { d: 1100, k: 'tank', x: 140 },
          { d: 1400, k: 'fbase', x: 120 },
        ],
        air: [
          { d: 250, kind: 'spinner', n: 3, from: 'L' }, { d: 600, kind: 'spinner', n: 3, from: 'R' },
          { d: 900, kind: 'dart', n: 4, x: 60 }, { d: 1200, kind: 'dart', n: 4, x: 180 },
        ] },
      { type: 'boss', boss: 'gorgon' },
    ],
  },
  {
    name: 'BONUS ATTACK', jp: 'ボーナスアタック', theme: 2, bonus: true,
    phases: [
      { type: 'challenge', groups: [
        { t: 0, path: 'CH1', kind: 'drone' }, { t: 150, path: 'CH1', m: 1, kind: 'moth' },
        { t: 330, path: 'CH3', kind: 'warden' }, { t: 500, path: 'CH2', kind: 'drone' },
        { t: 680, path: 'CH2', m: 1, kind: 'moth' },
      ] },
    ],
  },
  {
    name: 'IRON DRIFT', jp: '鉄の漂流帯', theme: 3,
    phases: [
      { type: 'scroll', length: 2100,
        ground: [
          { d: 120, k: 'turret', x: 50 }, { d: 200, k: 'turret', x: 190 },
          { d: 320, k: 'tank', x: 120 },
          { d: 600, k: 'hangar', x: 60 }, { d: 640, k: 'turret', x: 170 },
          { d: 850, k: 'turret', x: 40 }, { d: 850, k: 'turret', x: 120 }, { d: 850, k: 'turret', x: 200 },
          { d: 1200, k: 'pbase', x: 190 }, { d: 1300, k: 'tank', x: 60 }, { d: 1350, k: 'tank', x: 180 },
          { d: 1600, k: 'hangar', x: 170 }, { d: 1650, k: 'turret', x: 60 },
          { d: 1900, k: 'fbase', x: 120 },
        ],
        air: [
          { d: 400, kind: 'orbiter', n: 2 }, { d: 700, kind: 'zigzag', n: 5, x: 120 },
          { d: 1000, kind: 'spinner', n: 4, from: 'L' }, { d: 1450, kind: 'orbiter', n: 3 },
          { d: 1750, kind: 'dart', n: 5, x: 120 },
        ] },
      { type: 'swarm', spawns: [
        { t: 0, kind: 'orbiter', n: 3 }, { t: 100, kind: 'zigzag', n: 6, x: 60 },
        { t: 200, kind: 'zigzag', n: 6, x: 180 }, { t: 400, kind: 'orb', n: 10, x: 120 },
        { t: 620, kind: 'orbiter', n: 4 }, { t: 700, kind: 'spinner', n: 4, from: 'R' },
      ] },
      { type: 'formation', dive: 1.0, fire: 0.85, groups: [
        { path: 'B', kind: 'moth', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'A', kind: 'warden', n: 4 },
        { path: 'E', kind: 'carrier', n: 1, gap: 30 }, { path: 'E', m: 1, kind: 'carrier', n: 1, gap: 40 },
        { path: 'C', kind: 'moth', n: 8 },
        { path: 'D', kind: 'drone', n: 6 }, { path: 'D', m: 1, kind: 'drone', n: 6 },
      ] },
    ],
  },
  {
    name: 'DOCKING', jp: 'ドッキング', theme: 4, bonus: true,
    phases: [{ type: 'docking' }],
  },
  {
    name: "MOTHER'S NEST", jp: '母艦の巣', theme: 5,
    phases: [
      { type: 'formation', dive: 1.15, fire: 1.0, groups: [
        { path: 'A', kind: 'drone', n: 4 }, { path: 'A', m: 1, kind: 'drone', n: 4 },
        { path: 'B', kind: 'warden', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'C', kind: 'moth', n: 8 },
        { path: 'D', kind: 'drone', n: 6 }, { path: 'D', m: 1, kind: 'drone', n: 6 },
        { path: 'E', kind: 'carrier', n: 1, gap: 20 }, { path: 'E', m: 1, kind: 'moth', n: 3 },
      ] },
      { type: 'scroll', length: 1800,
        ground: [
          { d: 150, k: 'tank', x: 60 }, { d: 150, k: 'tank', x: 180 },
          { d: 400, k: 'turret', x: 30 }, { d: 430, k: 'turret', x: 90 }, { d: 460, k: 'turret', x: 150 }, { d: 490, k: 'turret', x: 210 },
          { d: 750, k: 'hangar', x: 120 },
          { d: 1000, k: 'turret', x: 50 }, { d: 1000, k: 'turret', x: 190 }, { d: 1100, k: 'tank', x: 120 },
          { d: 1450, k: 'fbase', x: 60 }, { d: 1500, k: 'pbase', x: 180 },
        ],
        air: [
          { d: 300, kind: 'dart', n: 5, x: 60 }, { d: 600, kind: 'orbiter', n: 3 },
          { d: 900, kind: 'spinner', n: 4, from: 'R' }, { d: 1300, kind: 'zigzag', n: 6, x: 120 },
        ] },
      { type: 'boss', boss: 'mother' },
    ],
  },
  {
    name: 'BONUS ATTACK', jp: 'ボーナスアタック', theme: 2, bonus: true,
    phases: [
      { type: 'challenge', groups: [
        { t: 0, path: 'CH4', kind: 'moth' }, { t: 120, path: 'CH4', m: 1, kind: 'moth' },
        { t: 300, path: 'CH5', kind: 'drone' }, { t: 440, path: 'CH5', m: 1, kind: 'drone' },
        { t: 620, path: 'CH3', kind: 'warden' },
      ] },
    ],
  },
  {
    name: 'FIREBIRD ROAD', jp: '炎の鳥街道', theme: 6,
    phases: [
      { type: 'swarm', spawns: [
        { t: 0, kind: 'orb', n: 8, x: 60 }, { t: 40, kind: 'orb', n: 8, x: 180 },
        { t: 260, kind: 'zigzag', n: 8, x: 120 }, { t: 400, kind: 'orbiter', n: 4 },
        { t: 560, kind: 'spinner', n: 5, from: 'L' }, { t: 620, kind: 'spinner', n: 5, from: 'R' },
        { t: 800, kind: 'dart', n: 6, x: 80 }, { t: 840, kind: 'dart', n: 6, x: 160 },
      ] },
      { type: 'formation', dive: 1.3, fire: 1.1, groups: [
        { path: 'A', kind: 'warden', n: 4 }, { path: 'A', m: 1, kind: 'moth', n: 4 },
        { path: 'B', kind: 'moth', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'E', kind: 'carrier', n: 1, gap: 20 }, { path: 'E', m: 1, kind: 'carrier', n: 1, gap: 30 },
        { path: 'C', kind: 'drone', n: 8 },
        { path: 'D', kind: 'drone', n: 6 }, { path: 'D', m: 1, kind: 'drone', n: 6 },
      ] },
      { type: 'scroll', length: 2000,
        ground: [
          { d: 150, k: 'fbase', x: 120 },
          { d: 350, k: 'turret', x: 40 }, { d: 350, k: 'turret', x: 200 }, { d: 450, k: 'tank', x: 120 },
          { d: 650, k: 'hangar', x: 60 }, { d: 700, k: 'hangar', x: 180 },
          { d: 950, k: 'turret', x: 30 }, { d: 980, k: 'turret', x: 80 }, { d: 1010, k: 'turret', x: 160 }, { d: 1040, k: 'turret', x: 210 },
          { d: 1300, k: 'fbase', x: 120 }, { d: 1350, k: 'tank', x: 50 }, { d: 1350, k: 'tank', x: 190 },
          { d: 1700, k: 'pbase', x: 120 },
        ],
        air: [
          { d: 250, kind: 'orbiter', n: 3 }, { d: 550, kind: 'zigzag', n: 6, x: 120 },
          { d: 850, kind: 'spinner', n: 5, from: 'L' }, { d: 1150, kind: 'dart', n: 6, x: 120 },
          { d: 1500, kind: 'orbiter', n: 4 },
        ] },
    ],
  },
  {
    name: 'DOCKING', jp: 'ドッキング', theme: 4, bonus: true,
    phases: [{ type: 'docking' }],
  },
  {
    name: 'STAR THRONE', jp: '星の女王の玉座', theme: 7,
    phases: [
      { type: 'formation', dive: 1.5, fire: 1.2, groups: [
        { path: 'C', kind: 'warden', n: 4 },
        { path: 'A', kind: 'moth', n: 4 }, { path: 'A', m: 1, kind: 'moth', n: 4 },
        { path: 'B', kind: 'moth', n: 4 }, { path: 'B', m: 1, kind: 'moth', n: 4 },
        { path: 'E', kind: 'carrier', n: 1, gap: 20 },
        { path: 'D', kind: 'drone', n: 6 }, { path: 'D', m: 1, kind: 'drone', n: 6 },
        { path: 'E', m: 1, kind: 'drone', n: 6 },
      ] },
      { type: 'boss', boss: 'queen' },
    ],
  },
];

// 入場経路（240x320 の画面座標）。最後の点から陣形の定位置へ向かう
const PATHS = {
  A: [[150, -10], [150, 50], [110, 130], [60, 180], [35, 135], [70, 95], [110, 110]],
  B: [[-10, 250], [50, 235], [110, 185], [140, 130], [110, 90], [70, 110], [65, 150], [95, 160]],
  C: [[120, -10], [120, 110], [165, 170], [120, 215], [75, 170], [120, 125]],
  D: [[30, -10], [60, 60], [200, 95], [40, 135], [200, 175], [120, 150]],
  E: [[250, 60], [170, 90], [80, 60], [50, 120], [120, 190], [190, 140], [150, 90]],
  // ボーナスアタック用。画面外へ抜けていく
  CH1: [[-10, 60], [100, 120], [180, 200], [140, 262], [60, 220], [80, 140], [180, 100], [260, 60]],
  CH2: [[120, -10], [120, 160], [60, 220], [30, 160], [90, 100], [180, 160], [210, 220], [150, 262], [120, 340]],
  CH3: [[260, 280], [160, 240], [80, 160], [120, 80], [200, 120], [160, 200], [40, 240], [-10, 300]],
  CH4: [[-10, 150], [60, 90], [120, 60], [180, 90], [200, 150], [160, 200], [120, 160], [80, 200], [40, 250], [-10, 290]],
  CH5: [[60, -10], [60, 120], [110, 190], [180, 190], [200, 130], [160, 90], [110, 130], [130, 230], [250, 300]],
};

if (typeof module !== 'undefined') module.exports = { STAGES, PATHS };

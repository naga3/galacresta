// 紹介動画を作る。node tools/record.js [出力 mp4]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch } = require('./cdp');

(async () => {
  const outFile = path.resolve(process.argv[2] || path.join(__dirname, '..', 'media', 'promo.mp4'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'galacresta-rec-'));
  const page = await launch('file://' + path.join(__dirname, 'record.html'), { width: 720, height: 1280 });
  await page.evaluate('document.fonts.ready.then(() => document.fonts.load("40px DotGothic16")).then(() => document.fonts.load("20px \\"Press Start 2P\\"")).then(() => true)');
  const n = await page.evaluate('SCENES.length');
  let f = 0;
  for (let i = 0; i < n; i++) {
    const frames = await page.evaluate(`startScene(${i})`);
    for (let k = 0; k < frames; k++) {
      const url = await page.evaluate('nextFrame()');
      fs.writeFileSync(path.join(work, String(f++).padStart(5, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    }
    process.stdout.write(`${await page.evaluate(`SCENES[${i}].id`)} `);
  }
  const sec = f / 30;
  const log = await page.evaluate('LOG');
  page.close();
  console.log(`\nframes=${f} (${sec.toFixed(1)}s) sfx=${log.filter((e) => e.sfx).length}`);

  // 音: BGM と効果音を同じタイムラインでオフライン書き出し
  const audio = await launch('file://' + path.join(__dirname, 'audio.html'));
  const b64 = await audio.evaluateBig(`renderTimeline(${JSON.stringify(log)}, ${Math.ceil(sec) + 1})`);
  audio.close();
  fs.writeFileSync(path.join(work, 'audio.wav'), Buffer.from(b64, 'base64'));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(work, '%05d.jpg'), '-i', path.join(work, 'audio.wav'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-af', `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${(sec - 1.2).toFixed(2)}:d=1.2`, '-ar', '44100', '-shortest', '-movflags', '+faststart', outFile]);
  console.log('wrote', outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + 'MB');
  fs.rmSync(work, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });

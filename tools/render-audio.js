// BGM を WAV/MP3 に書き出す（試聴・動画用）。node tools/render-audio.js [出力先]
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { launch } = require('./cdp');

(async () => {
  const out = process.argv[2] || '/tmp/galacresta-bgm';
  fs.mkdirSync(out, { recursive: true });
  const page = await launch('file://' + path.join(__dirname, 'audio.html'));
  for (const name of ['title', 'stage', 'scroll', 'boss', 'challenge', 'dock']) {
    const b64 = await page.evaluateBig(`renderSong('${name}', 32)`);
    const wav = path.join(out, name + '.wav');
    fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-b:a', '192k', path.join(out, name + '.mp3')]);
    const vd = spawnSync('ffmpeg', ['-i', wav, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString();
    const g = (k) => (vd.match(new RegExp(k + ': (-?[\\d.]+) dB')) || [])[1];
    console.log(`${name}: mean ${g('mean_volume')} dB, peak ${g('max_volume')} dB`);
  }
  page.close();
})().catch((e) => { console.error(e); process.exit(1); });

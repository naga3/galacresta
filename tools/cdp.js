// ヘッドレス Chromium を DevTools Protocol で操る最小限のクライアント（Node 22+ の WebSocket を使う）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return 'chromium';
}

async function launch(url, { width = 480, height = 640 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))}`, url], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* 起動待ち */ }
  }
  if (!target) throw new Error('chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  // ページ内で式を評価して値を返す
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };
  // 大きな文字列は1回の応答で返すと詰まるので、分けて受け取る
  const evaluateBig = async (expr) => {
    const n = await evaluate(`(async () => { window.__big = await (${expr}); return window.__big.length; })()`);
    let s = '';
    for (let i = 0; i < n; i += 1 << 20) s += await evaluate(`window.__big.slice(${i}, ${i + (1 << 20)})`);
    await evaluate('window.__big = null');
    return s;
  };
  for (let i = 0; i < 50; i++) { if (await evaluate('document.readyState === "complete" && typeof G !== "undefined"').catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  return { send, evaluate, evaluateBig, close: () => { ws.close(); proc.kill(); } };
}
module.exports = { launch };

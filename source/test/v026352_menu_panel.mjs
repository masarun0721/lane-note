// v0.26.35.2 「≡ メニュー」を開いた中身が、見出しで切れず・ボタンの下に出て・中のボタンを全部押せる（Chrome で実際に開いて測る）
// 前の版（v0.26.35.1）では、中身が見出しの右はしに出て、見出しの下で切れていた（下の本文に重なって押せない）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = process.env.ROOT || path.join(here, '../..'), require = createRequire(import.meta.url), puppeteer = require('puppeteer-core');
const SHOTS = process.env.SHOTS || '';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'] });
const sl = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log('  NG', n); } };
console.log('[v0.26.35.2] ≡ メニューの中身');
try {
  const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
  for (const page of ['index.html', 'records.html', 'schedule.html', 'guide.html', 'check.html', 'team.html', 'try.html']) {
    for (const [W, dpr] of [[1366, 1], [1280, 1], [1200, 1], [1100, 1], [1024, 1], [1366, 1.25], [1280, 1.25], [1366, 1.5], [1280, 1.5], [1024, 1.5]]) {
      await p.setViewport({ width: Math.round(W / dpr), height: Math.round(768 / dpr), deviceScaleFactor: dpr });
      await p.goto(B + page, { waitUntil: 'domcontentloaded' }); await sl(400);
      await p.evaluate(() => { document.querySelectorAll('.mp-ov,.mode-pick').forEach(x => x.remove()); if (window.__lnNavFit) window.__lnNavFit(); });
      const folded = await p.evaluate(() => document.getElementById('lnNav').classList.contains('fold'));
      if (!folded) { ok(true, ''); continue; }
      await p.click('#lnNav .pn-menu'); await sl(150);
      const r = await p.evaluate(() => {
        const more = document.getElementById('lnNavMore'), m = document.querySelector('#lnNav .pn-menu'), a = more.getBoundingClientRect(), mb = m.getBoundingClientRect();
        const vw = document.documentElement.clientWidth, vh = window.innerHeight;
        const items = [...more.children].filter(x => x.offsetWidth);
        const blocked = items.filter(x => { const c = x.getBoundingClientRect(); const cx = c.left + c.width / 2, cy = c.top + c.height / 2; if (cy > vh) return false; const e = document.elementFromPoint(cx, cy); return !e || !x.contains(e); }).map(x => x.textContent.trim().slice(0, 10));
        return { n: items.length, blocked, inView: a.left >= 0 && a.right <= vw + 0.5 && a.top >= 0, near: a.top >= mb.bottom - 1 && a.top <= mb.bottom + 20 && a.left <= mb.right && a.right >= mb.left };
      });
      const tag = page + ' ' + W + 'px×' + dpr;
      ok(r.n > 0, tag + ' 中身がある');
      ok(!r.blocked.length, tag + ' 中のボタンが全部見えて押せる（切れ・重なり：' + r.blocked.join('、') + '）');
      ok(r.inView, tag + ' 画面の中に出る');
      ok(r.near, tag + ' ≡ メニューのボタンの真下に出る');
      if (SHOTS && page === 'index.html' && (W === 1280 || W === 1024)) await p.screenshot({ path: path.join(SHOTS, 'v026352_menu_' + W + '_' + dpr + '.png') });
      await p.keyboard.press('Escape'); await sl(50);
      const closed = await p.evaluate(() => !document.getElementById('lnNav').classList.contains('open'));
      ok(closed, tag + ' Esc で閉じる');
    }
  }
} finally { await b.close(); srv.close(); }
console.log('v026352_menu_panel: ' + pass + ' ok / ' + fail + ' NG'); if (fail) process.exit(1);

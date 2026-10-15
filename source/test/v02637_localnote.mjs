// v0.26.37 ログインしていない人へ「このブラウザだけの記録は消えることがあります」（閉じても14日後にまた出す・ログイン中は出さない）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), require = createRequire(import.meta.url), puppeteer = require('puppeteer-core');
const SHOTS = process.env.SHOTS || '';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'] });
const sl = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ng = 0; const t = (n, c) => { if (c) { ok++; console.log('  ok', n); } else { ng++; console.log('  NG', n); } };
try {
  const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await p.evaluateOnNewDocument(() => { window.__persist = 0; try { const s = navigator.storage; if (s) { s.persisted = () => Promise.resolve(false); s.persist = () => { window.__persist++; return Promise.resolve(true); }; } } catch (e) { } });
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
  const st = () => p.evaluate(() => { const x = document.getElementById('rbLocalNote'); return { vis: !!x && !x.hidden && x.offsetHeight > 0, txt: x ? x.textContent : '', persist: window.__persist }; });
  await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(1500);
  let s = await st();
  t('ログインしていない：お知らせが出る', s.vis);
  t('文言：「消えることがあります」（「消えます」と言い切らない）・iPhone の Safari・7日ほど・Googleでログイン', /消えることがあります/.test(s.txt) && !/消えます。/.test(s.txt) && /iPhone の Safari/.test(s.txt) && /7日ほど/.test(s.txt) && /Googleでログイン/.test(s.txt));
  t('navigator.storage.persist() を呼ぶ', s.persist >= 1);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'v02637_localnote_390.png'), captureBeyondViewport: false });
  await p.evaluate(() => { const x = document.getElementById('rbLocalNote'); x.scrollIntoView(); }); await p.click('#rbLocalNoteX'); await sl(100);
  t('「閉じる」で消える', !(await st()).vis);
  await p.reload({ waitUntil: 'load' }); await sl(1500);
  t('読み直しても、しばらくは出ない', !(await st()).vis);
  await p.evaluate(() => localStorage.setItem('lanenote.localnote.v1', String(Date.now() - 15 * 864e5)));
  await p.reload({ waitUntil: 'load' }); await sl(1500);
  t('14日たつと、また出る', (await st()).vis);
  const src = fs.readFileSync(new URL('../src/records_app.js', import.meta.url), 'utf8');
  t('ログイン中は出さない（USER のときは隠す）', /if \(USER \|\| !AUTH_SEEN/.test(src));
} finally { await b.close(); srv.close(); }
console.log(`v02637_localnote: ${ok} ok / ${ng} NG`); if (ng) process.exit(1);

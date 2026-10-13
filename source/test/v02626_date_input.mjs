// v0.26.26 日付の入力欄：年は4けた（min/max）・「20260403」と続けて打てる・貼り付け「2026/4/3」「4/3」「20260403」・あとから出る欄にも付く（架空データのみ）
//   node v02626_date_input.mjs [スクショの頭]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'], env: Object.assign({}, process.env, { LANG: 'ja_JP.UTF-8', LANGUAGE: 'ja' }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
console.log('[v0.26.26] 日付の入力欄');
await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
const dates = () => p.evaluate(() => [...document.querySelectorAll('input[type=date]')].map(e => [e.id || e.className || e.getAttribute('data-rl') || '', e.min, e.max]));
for (const pg of ['records.html', 'index.html', 'team.html', 'check.html', 'try.html']) {
  await p.goto(B + pg, { waitUntil: 'load' }); await sleep(1200);
  const d = await dates(); ok(pg + '：日付欄はすべて min=2000-01-01・max=2099-12-31（' + d.length + '個）', d.every(x => x[1] === '2000-01-01' && x[2] === '2099-12-31'), JSON.stringify(d));
}
await p.goto(B + 'records.html', { waitUntil: 'load' }); await sleep(1200);
ok('記録の手入力の日付欄がある', await p.evaluate(() => !!document.getElementById('rmDate')));
await p.evaluate(() => { const e = document.getElementById('rmDate'); e.closest('details') && (e.closest('details').open = true); e.scrollIntoView(); e.focus(); });
await p.keyboard.type('20260403'); await sleep(100);
ok('「20260403」と続けて打つと 2026-04-03（年が6けたにならない）', (await p.evaluate(() => document.getElementById('rmDate').value)) === '2026-04-03', await p.evaluate(() => document.getElementById('rmDate').value));
await p.evaluate(() => { const e = document.getElementById('rmDate'); e.value = ''; e.blur(); }); { const bx = await (await p.$('#rmDate')).boundingBox(); await p.mouse.click(bx.x + 8, bx.y + bx.height / 2); } await p.keyboard.type('20251130'); await sleep(50);
ok('もう1つ続けて打っても正しく入る（2025-11-30）', (await p.evaluate(() => document.getElementById('rmDate').value)) === '2025-11-30');
{ await p.evaluate(() => { const i = document.createElement('input'); i.type = 'date'; i.id = 'rawD'; i.__lnDate = 1; document.body.prepend(i); }); await p.focus('#rawD'); await p.keyboard.type('20260403'); const raw = await p.evaluate(() => { const v = document.getElementById('rawD').value; document.getElementById('rawD').remove(); return v; });
  ok('（比べるため）max の無い日付欄に同じように打つと年が6けたになる：' + JSON.stringify(raw), raw !== '2026-04-03'); }
ok('あとから画面に出た日付欄にも自動で付く', await p.evaluate(async () => { const i = document.createElement('input'); i.type = 'date'; document.body.appendChild(i); await new Promise(r => setTimeout(r, 50)); const r = i.min === '2000-01-01' && i.max === '2099-12-31'; i.remove(); return r; }));
const pr = await p.evaluate(() => { const n = new Date(2026, 9, 13), P = s => LaneDate.parse(s, n); return [P('20260403'), P('2026/4/3'), P('2026-04-03'), P('2026年4月3日'), P('4/3'), P('0403'), P('２０２６／４／３'), P('2026/2/30'), P('1999/4/3'), P('202604/03'), P('abc')]; });
ok('貼り付けの読み取り：20260403・2026/4/3・2026-04-03・2026年4月3日・4/3（今年）・0403・全角。ありえない日付・2000年より前・6けたの年・文字は入れない',
  JSON.stringify(pr) === JSON.stringify(['2026-04-03', '2026-04-03', '2026-04-03', '2026-04-03', '2026-04-03', '2026-04-03', '2026-04-03', '', '', '', '']), JSON.stringify(pr));
const pv = await p.evaluate(() => { const e = document.getElementById('rmDate'); e.value = ''; let ch = 0; e.addEventListener('change', () => ch++, { once: true }); const dt = new DataTransfer(); dt.setData('text/plain', '2026/5/9'); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return [e.value, ch]; });
ok('日付欄に「2026/5/9」を貼り付けると 2026-05-09 が入り、変更として伝わる', pv[0] === '2026-05-09' && pv[1] === 1, JSON.stringify(pv));
if (SHOT) { await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await p.evaluate(() => document.getElementById('rmDate').scrollIntoView({ block: 'center' })); await sleep(300); await p.screenshot({ path: SHOT + '_date_phone.png' }); }
ok('ページのエラーなし', errs.length === 0, errs.join(' / '));
await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

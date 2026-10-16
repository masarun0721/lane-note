// v0.26.60 見た目：大会準備の読み込みカードの見出しは言葉の途中で折り返さない／たたむ行（summary）は全ページで押せる見た目（架空データのみ・外には通信しない）
//   node v02660_ui.mjs [スクショの保存先の頭]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
console.log('[v0.26.60] カードの見出し・たたむ行');
const p = await b.newPage(); await p.setRequestInterception(true); install(p, B); p.on('dialog', d => d.accept());
await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
// 見出しの文字ごとの行を調べて、折り返した所に「/」を入れる
const lines = () => p.evaluate(() => [...document.querySelectorAll('.drop .big')].filter(e => e.offsetParent).map(el => {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let s = '', top = null, n;
  while ((n = tw.nextNode())) for (let i = 0; i < n.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const rc = r.getClientRects()[0]; if (!rc) { s += n.data[i]; continue; } if (top !== null && rc.top > top + 4) s += '/'; top = rc.top; s += n.data[i]; }
  return s; }));
// 折り返してよい所：「タイムテーブル」と「（競技時間）」の間・「任意」の前
const OKBR = new Set(['🕘 タイムテーブル/（競技時間）', '📑 大会要項/任意', '📋 競技注意事項/任意']);
for (const pg of ['index.html', 'check.html', 'records.html']) for (const w of [1280, 1024, 390]) {
  await p.setViewport({ width: w, height: 900 }); await p.goto(B + pg, { waitUntil: 'load' }); await sleep(500);
  const L = await lines(); ok(pg + ' ' + w + 'px：カードの見出しが言葉の途中で折り返さない', L.length && L.every(s => !s.includes('/') || OKBR.has(s)), JSON.stringify(L));
  if (pg === 'index.html' && w === 1280) { ok('1280px：タイムテーブルは「タイムテーブル／（競技時間）」の所でだけ折り返す', L.includes('🕘 タイムテーブル/（競技時間）') || L.includes('🕘 タイムテーブル（競技時間）'), JSON.stringify(L));
    if (SHOT) { await p.evaluate(() => document.getElementById('ttDrop').scrollIntoView({ block: 'center' })); await sleep(300); await p.screenshot({ path: SHOT + '_cards.png' }); } }
}
await p.setViewport({ width: 1280, height: 800 });
for (const pg of ['index.html', 'records.html', 'check.html', 'guide.html', 'schedule.html']) {
  await p.goto(B + pg, { waitUntil: 'load' }); await sleep(500);
  const r = await p.evaluate(() => { const L = [...document.querySelectorAll('summary')]; return { n: L.length, bad: L.filter(s => { const c = getComputedStyle(s); return c.cursor !== 'pointer' || c.userSelect !== 'none'; }).map(s => s.textContent.trim().slice(0, 20)) }; });
  ok(pg + '：たたむ行はすべて指のカーソル・文字を選ばない（' + r.n + '個）', r.n > 0 && !r.bad.length, JSON.stringify(r));
}
// チームの画面（偽の Firebase・架空のチーム）
await p.evaluate(() => { localStorage.setItem('__fakeuser', JSON.stringify({ uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' })); });
await p.goto(B + 'team.html', { waitUntil: 'load' }); await p.waitForSelector('#rbTeam:not([hidden])'); await sleep(1500);
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空高校陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(2000);
const T = await p.evaluate(() => [...document.querySelectorAll('#rbTeam summary')].filter(s => s.offsetParent).map(s => ({ t: s.textContent.trim(), c: getComputedStyle(s).cursor, u: getComputedStyle(s).userSelect })));
const want = ['招待する', 'メンバー', '変更履歴', '自分の記録をこのチームへコピー', '引き継ぎ', '見える人とリンク'];
ok('チーム：6つのたたむ行がすべて指のカーソル・文字を選ばない', want.every(w => T.some(x => x.t.includes(w) && x.c === 'pointer' && x.u === 'none')), JSON.stringify(T));
const h = await p.evaluateHandle(() => [...document.querySelectorAll('#rbTeam summary')].find(s => s.offsetParent && /メンバー/.test(s.textContent)));
const bg0 = await h.evaluate(e => getComputedStyle(e).backgroundColor); await h.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(200); await h.hover(); await sleep(200);
const hv = await h.evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, r: getComputedStyle(e).borderRadius }));
ok('チーム：マウスを乗せると薄い背景・角丸', hv.bg !== bg0 && hv.bg !== 'rgba(0, 0, 0, 0)' && hv.r !== '0px', JSON.stringify([bg0, hv]));
if (SHOT) await p.screenshot({ path: SHOT + '_hover.png' });
await p.mouse.move(5, 5); await p.keyboard.press('Tab'); await h.evaluate(e => e.focus());
const fv = await p.evaluate(() => { const s = document.activeElement; return s.tagName === 'SUMMARY' && s.matches(':focus-visible') ? getComputedStyle(s).outlineStyle + ' ' + getComputedStyle(s).outlineWidth : 'no'; });
ok('キーボードで選んだときは枠が見える（:focus-visible）', /solid 3px/.test(fv), fv);
const keep = await p.evaluate(() => { const s = document.querySelector('details.act>summary'); return s ? getComputedStyle(s).borderStyle + ' ' + getComputedStyle(s).borderRadius : 'none'; });
ok('もともと見た目のある行（details.act）はそのまま', keep === 'none' || /solid 12px/.test(keep), keep);
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); srv.close(); if (fail) process.exit(1);

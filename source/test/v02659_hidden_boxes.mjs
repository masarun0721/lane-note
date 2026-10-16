// v0.26.59 ログイン中の記録ページに、中身のない黄色い枠（「⚠ この端末だけに保存中」の入れ物）が出ていたのを直す。
//   hidden の要素が CSS の display で見えてしまう所・中身のない「？」の入れ物が無いかを、ページ・モード・ログインの有無ごとに調べる（偽の Firebase・架空のデータだけ）
//   node v02659_hidden_boxes.mjs [スクショのパス（例 /workspace/ui_mock/fix59_loggedin.png）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1280, height: 800 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept());
const ALICE = { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' };
const setUser = (u, mode) => p.evaluate((x, m) => { if (x) localStorage.setItem('__fakeuser', JSON.stringify(x)); else localStorage.removeItem('__fakeuser'); localStorage.setItem('lanenote.mode.v1', m); localStorage.setItem('lanenote.xnews.v1', '1'); }, u, mode);
const go = async u => { await p.goto(B + u, { waitUntil: 'load' }); await sleep(1600); };
// 見えてはいけないのに見えているもの：hidden なのに箱がある要素／中身が空なのに見えている「？」の入れ物
const leaks = () => p.evaluate(() => {
  const out = [], name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  document.querySelectorAll('[hidden]').forEach(e => { if (shown(e)) out.push('hidden but shown: ' + name(e)); });
  document.querySelectorAll('.xpw').forEach(w => { const x = w.querySelector(':scope > .xp'); if (shown(w) && (!x || !x.textContent.trim())) out.push('empty tip: ' + name(w)); });
  return out;
});
const ln = () => p.evaluate(() => { const x = document.getElementById('rbLocalNote'); if (!x) return null; const r = x.getBoundingClientRect(); return { hidden: x.hidden, h: r.height, disp: getComputedStyle(x).display }; });
await p.goto(B + 'guide.html'); await p.evaluate(() => localStorage.clear());

// ログインしていない：お知らせは出る → 閉じると箱ごと消える
await setUser(null, 'coach'); await go('records.html');
let s = await ln(); ok('ログインしていない：「⚠ この端末だけに保存中」が出る', s && !s.hidden && s.h > 0, JSON.stringify(s));
await p.evaluate(() => document.getElementById('rbLocalNoteX').click()); await sleep(200);
s = await ln(); ok('「閉じる」：箱ごと見えない（高さ0・display:none）', s.hidden && s.h === 0 && s.disp === 'none', JSON.stringify(s));
ok('閉じたあと：hidden の要素が見えていない', !(await leaks()).length, (await leaks()).join(' / '));

// ログイン中（チームを作って選ぶ）
await setUser(ALICE, 'coach'); await go('team.html');
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空中学陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(1500);
await p.evaluate(() => localStorage.removeItem('lanenote.localnote.v1'));   // 閉じた記録が無くても出ないこと
await go('records.html');
const auth = await p.evaluate(() => (document.getElementById('rbAuthInfo') || document.querySelector('[id*="Auth"]') || {}).textContent || '');
ok('ログイン中の表示（偽の Firebase）', /ログイン中/.test(auth), auth.slice(0, 80));
s = await ln(); ok('ログイン中（チーム）：黄色い枠は出ない（高さ0・display:none）', s.hidden && s.h === 0 && s.disp === 'none', JSON.stringify(s));
if (SHOT) await p.screenshot({ path: SHOT });

// ページ・モード・ログインの有無ごとに、見えてはいけないものが見えていないか
const CASES = [['records.html', ALICE, 'coach'], ['team.html', ALICE, 'coach'], ['schedule.html', ALICE, 'coach'], ['index.html', ALICE, 'coach'], ['check.html', ALICE, 'coach'], ['guide.html', ALICE, 'coach'],
  ['records.html', null, 'coach'], ['team.html', null, 'coach'], ['schedule.html', null, 'coach'], ['index.html', null, 'coach'], ['check.html', null, 'coach'], ['guide.html', null, 'coach'],
  ['index.html', null, 'player'], ['index.html', ALICE, 'player'], ['records.html', ALICE, 'player'], ['records.html?me=1', null, 'player']];
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  await p.setViewport(vp);
  for (const [u, who, mode] of CASES) { await setUser(who, mode); await go(u); const L = await leaks(); ok(`${vp.width}px ${u}・${who ? 'ログイン中' : 'ログインなし'}・${mode}：中身のない枠・hidden の要素が見えていない`, !L.length, L.join(' / ')); }
}
await b.close(); srv.close();
console.log(`v02659_hidden_boxes: ${pass} ok / ${fail} NG`); if (fail) process.exit(1);

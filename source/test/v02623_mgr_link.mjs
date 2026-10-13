// v0.26.23 選手モードのホームの「📋 マネージャーの記録へ」（マネージャーとしてチームに入っていてログイン中の人だけ）・選手のホームへ戻る（偽の Firebase・架空のデータだけ）
//   node v02623_mgr_link.mjs [スクショの頭（例 /workspace/lane_note_shots/v02623）]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
const USERS = { alice: { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' }, bob: { uid: 'bob', displayName: '架空 選手B', email: 'player-b@example.invalid' } };
const setUser = (u, mode) => p.evaluate((x, m) => { if (x) localStorage.setItem('__fakeuser', JSON.stringify(x)); else localStorage.removeItem('__fakeuser'); localStorage.setItem('lanenote.mode.v1', m); }, u ? USERS[u] : null, mode);
const go = async u => { await p.goto(B + u, { waitUntil: 'load' }); await sleep(1500); };
const home = () => p.evaluate(() => ({ player: document.body.classList.contains('ln-player'), mgr: !!document.getElementById('phMgr'), href: (document.getElementById('phMgr') || {}).getAttribute ? document.getElementById('phMgr').getAttribute('href') : '', hint: localStorage.getItem('lanenote.mgrhint.v1') }));
const PH = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
await p.goto(B + 'guide.html'); await p.evaluate(() => localStorage.clear());
// 顧問がチームを作り、マネージャー用のコードを出す
await setUser('alice', 'coach'); await go('team.html');
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空中学陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(1500);
await p.evaluate(() => { document.querySelector('details[data-tmd="codes"]').open = true; }); await sleep(900);
const mcode = await p.evaluate(() => document.querySelectorAll('#rbTeam .tm-inv .tm-raw code')[1].textContent);
ok('顧問（マネージャーではない）には印を付けない', (await home()).hint === null);
await setUser('alice', 'player'); await go('index.html');
let h = await home(); ok('顧問が選手モードにしても「マネージャーの記録へ」は出ない', h.player && !h.mgr, JSON.stringify(h));
// 選手がマネージャーとして入る
await setUser('bob', 'coach'); await go('team.html');
await p.evaluate(c => { document.getElementById('rbTeamCode').value = c; document.querySelector('[data-tm="join"]').click(); }, mcode); await sleep(2000);
h = await home(); ok('マネージャーとして入ると、この端末に印（uid と時刻だけ）', !!h.hint && JSON.parse(h.hint).uid === 'bob' && Object.keys(JSON.parse(h.hint)).join() === 'uid,at', h.hint);
await setUser('bob', 'player'); await p.setViewport(PH); await go('index.html');
h = await home(); ok('選手モードのホーム：「📋 マネージャーの記録へ」が出る（records.html へ）', h.player && h.mgr && h.href === 'records.html', JSON.stringify(h));
if (SHOT) await p.screenshot({ path: SHOT + '_player_home.png', clip: { x: 0, y: 0, width: 390, height: 844 } });
await p.evaluate(() => document.getElementById('phMgr').click()); await sleep(2500);
let r = await p.evaluate(() => ({ path: location.pathname, mode: localStorage.getItem('lanenote.mode.v1'), back: !!document.querySelector('#phBack a[href="index.html"]'), team: (document.getElementById('rbTeam') || {}).innerText || '' }));
ok('記録のページが開く・モードは選手のまま・「👟 選手のホームへ戻る」がある・チームはマネージャーとして使える', r.path.endsWith('/records.html') && r.mode === 'player' && r.back && /架空中学陸上部/.test(r.team) && /マネージャー/.test(r.team), JSON.stringify(r).slice(0, 300));
if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: SHOT + '_records_back.png', clip: { x: 0, y: 0, width: 390, height: 844 } }); }
await p.evaluate(() => document.querySelector('#phBack a').click()); await sleep(1500);
h = await home(); ok('「選手のホームへ戻る」で選手のホームに戻る', h.player && h.mgr, JSON.stringify(h));
// チームのページでも戻れる
await go('team.html'); r = await p.evaluate(() => { const b = document.getElementById('phBack'); return !!b && b.getBoundingClientRect().height > 0; }); ok('チームのページでも「選手のホームへ戻る」が見える', r);
// 顧問モードでは戻るボタンを出さない
await setUser('bob', 'coach'); await go('records.html'); ok('顧問モードでは「選手のホームへ戻る」を出さない', !(await p.evaluate(() => !!document.getElementById('phBack'))));
// ログアウトしたら消える
await setUser(null, 'player'); await go('records.html'); await go('index.html');
h = await home(); ok('ログアウトすると印が消え、ボタンも出ない', !h.mgr && h.hint === null, JSON.stringify(h));
// ログインしていない選手には出ない（印がない）
ok('ページのエラーなし', errs.length === 0, errs.join(' / '));
await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

// v0.26：記録のページの「チームで共有」の画面（Chrome・ローカル・偽の Firebase。架空のデータだけ。権限のルールは rules_team_check.mjs で確かめる）
//   node v0260_team_ui.mjs [スクショの保存先の頭（例 /workspace/lane_note_shots/v0260）]
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
const USERS = { alice: { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' }, bob: { uid: 'bob', displayName: '架空 マネB', email: 'mgr-b@example.invalid' } };
async function as(u) { await p.evaluate((x) => { localStorage.setItem('__fakeuser', JSON.stringify(x)); localStorage.setItem('lanenote.mode.v1', 'coach'); }, USERS[u]); await p.goto(B + 'team.html', { waitUntil: 'load' }); await p.waitForSelector('#rbTeam:not([hidden])', { timeout: 8000 }).catch(() => {}); await sleep(900); }
const clk = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('ない：' + s); e.click(); }, sel);
const st = () => p.evaluate(() => ({ text: (document.getElementById('rbTeam') || {}).innerText || '', sel: [...document.querySelectorAll('#rbTeamSel option')].map(o => o.textContent), pend: document.querySelectorAll('#rbTeam .tm-plist li').length, codes: [...document.querySelectorAll('#rbTeam .tm-inv .tm-raw code')].map(c => c.textContent), talkHidden: document.getElementById('rbTalkBox').hidden, status: (document.getElementById('rbTeamStatus') || {}).textContent || '' }));
async function shot(name, mob, open = []) {
  if (!SHOT) return;
  await p.setViewport(mob ? { width: 390, height: 844, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  await sleep(1500); await p.waitForSelector('#rbTeam:not([hidden])').catch(() => {});
  if (open.length) { await p.evaluate(o => o.forEach(k => { const d = document.querySelector('details[data-tmd="' + k + '"]'); if (d) d.open = true; }), open); await sleep(1200); }
  const el = await p.$('#rbTeam'); await el.evaluate(e => e.scrollIntoView({ block: 'start' })); await sleep(300);
  await el.screenshot({ path: SHOT + '_' + name + '.png' });
  await p.setViewport({ width: 1280, height: 900 }); await sleep(200);
}
await p.goto(B + 'guide.html'); await p.evaluate(() => localStorage.clear());
await as('alice');
let s = await st(); ok('ログインすると「チームで共有」が出る（はじめは自分だけ）', /チームで共有/.test(s.text) && /チームを作る/.test(s.text) && /参加コードで入る/.test(s.text), s.text.slice(0, 200));
await shot('start_mobile', true);
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空高校陸上部'; }); await clk('[data-tm="create"]'); await sleep(1500);
s = await st(); ok('チームを作ると、保存先がそのチームになる（顧問・持ち主）', s.sel.some(x => /架空高校陸上部（顧問）/.test(x)) && /持ち主/.test(s.text), JSON.stringify(s.sel) + s.status);
const T = await p.evaluate(() => localStorage.getItem('lanenote.team.v1.alice'));
await p.evaluate(() => { const d = document.querySelector('details[data-tmd="codes"]'); d.open = true; }); await sleep(800);
s = await st(); ok('参加コード：顧問用とマネージャー用（期限つき）', s.codes.length === 2 && /^[A-Za-z0-9]{20}-[A-Za-z0-9]{24}$/.test(s.codes[0]) && /-\d{4}0331$/.test(s.codes[1]), JSON.stringify(s.codes));
{ const u = await p.evaluate(() => ({ inv: document.querySelectorAll('#rbTeam .tm-inv').length, big: [...document.querySelectorAll('#rbTeam .tm-inv .tm-big')].map(b => b.textContent), advOpen: [...document.querySelectorAll('#rbTeam .tm-adv')].some(d => d.open), rawOpen: [...document.querySelectorAll('#rbTeam .tm-raw')].some(d => d.open), chips: [...document.querySelectorAll('#rbTeam .tm-inv .tm-chip')].map(c => c.textContent), sum: (document.querySelector('#rbTeam .tm-sum') || {}).textContent || '', line: !!document.querySelector('#rbTeam .tm-share a[href^="https://line.me/R/share?text="]'), mexp: (document.querySelector('#rbTeam .tm-mexp') || {}).textContent || '', regenDanger: !!document.querySelector('#rbTeam .tm-adv [data-tm="regen"].tm-danger') }));
  ok('v0.26.17 招待：顧問・マネージャーの2枚のカード・「招待リンクをコピー」が主（v0.26.20）・コードと詳しい設定は閉じている', u.inv === 2 && u.big.every(t => /招待リンクをコピー/.test(t)) && !u.advOpen && !u.rawOpen && u.line && u.regenDanger, JSON.stringify(u));
  ok('v0.26.17 制限はチップで（v0.26.63 から顧問・マネージャーとも「承認あり」）・マネージャーの期限は1か所・上に今の状態', u.chips[0] === '承認あり' && u.chips[1] === '承認あり' && /まで 使えます/.test(u.mexp) && /架空高校陸上部/.test(u.sum) && /顧問/.test(u.sum), JSON.stringify(u)); }
const old = s.codes[1]; await clk('[data-tm="regen"][data-role="manager"]'); await sleep(800); s = await st(); ok('作り直すと、マネージャー用コードが変わる', s.codes[1] && s.codes[1] !== old && s.codes[0] === s.codes[0], s.codes[1]);
// マネージャー（bob）がチームに入ったことにして（偽のDBに直接）、bob の画面で記録を3件入れる
await p.evaluate((T) => { const d = JSON.parse(localStorage.getItem('__fakedb')); const exp = Date.now() + 100 * 864e5; d['teams/' + T + '/members/bob'] = { role: 'manager', name: '架空 マネB', joinedAt: { __ts: Date.now() }, expiresAt: { __ts: exp } }; d['users/bob/teams/' + T] = { name: '架空高校陸上部', role: 'manager' }; localStorage.setItem('__fakedb', JSON.stringify(d)); localStorage.setItem('lanenote.team.v1.bob', T); }, T);
await as('bob');
s = await st(); ok('マネージャーの画面：役割と期限・参加コードは出ない・やり取りは隠す', /マネージャー（\d{4}年\d+月\d+日まで）/.test(s.text) && !/参加コード（顧問だけ/.test(s.text) && s.talkHidden, s.text.slice(0, 300));
await p.evaluate(async (T) => { const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'); const api = LaneTeam.make({ F, fs: {}, uid: 'bob', name: '架空 マネB' }); await api.put(T, 'manager', [1, 2, 3].map(i => ({ id: 'x' + i, name: '架空選手' + i, team: '架空高', event: '100m', mark: '12.' + (30 + i), meet: '架空記録会', date: '2026-10-10', sex: 'm' }))); }, T);
await as('bob');
s = await st(); ok('マネージャーが入れた記録は「未確認」3件（確認ボタンは出ない）', s.pend === 3 && !/すべて確認済み/.test(s.text), s.pend + ' ' + s.text.slice(0, 200));
await shot('manager_mobile', true);
await as('alice');
await p.evaluate(() => { for (const k of ['members', 'hist']) document.querySelector('details[data-tmd="' + k + '"]').open = true; }); await sleep(1200);
s = await st(); ok('顧問の画面：未確認3件・メンバー2人・変更履歴（だれが・何を）', s.pend === 3 && /架空 マネB/.test(s.text) && /架空 マネB（マネージャー） が 追加/.test(s.text), s.text.slice(s.text.indexOf('変更履歴')));
await shot('coach_desktop', false, ['members', 'hist']); await shot('coach_mobile', true, ['members', 'hist']); await shot('codes_desktop', false, ['codes']); await shot('codes_mobile', true, ['codes']);
await clk('[data-tm="confirm"][data-id="x1"]'); await sleep(1200); s = await st(); ok('1件を確認済みにすると未確認は2件', s.pend === 2, s.pend + s.status);
await clk('[data-tm="confirmAll"]'); await sleep(1500); s = await st(); ok('まとめて確認済みにすると0件', s.pend === 0 && /未確認の記録はありません/.test(s.text), s.pend + s.status);
await p.evaluate(() => { document.querySelector('details[data-tmd="hist"]').open = false; }); await sleep(100); await p.evaluate(() => { document.querySelector('details[data-tmd="hist"]').open = true; }); await sleep(1000);
await clk('[data-tm="revert"][data-i="0"]'); await sleep(1500); s = await st(); ok('変更履歴から取り消すと、また未確認が1件（確認の取り消し）', s.pend === 1 && /取り消しました/.test(s.status), s.pend + s.status + s.text.slice(s.text.indexOf('変更履歴')));
const db = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('記録には書いた人・状態・履歴の番号が付き、履歴に前と後が残る', Object.keys(db).some(k => /\/hist\//.test(k) && db[k].act === 'revert' && db[k].before && db[k].after));
// v0.26.1 C404：形が正しくない記録が1件混ざっても、ほかの記録と画面は使える
await p.evaluate((T) => { const d = JSON.parse(localStorage.getItem('__fakedb')); d['teams/' + T + '/records/poison'] = { id: 'poison', name: '架空選手P', team: '架空高', event: { unexpected: 'OBJECT' }, mark: '12.34', date: '2026-10-10', meet: '架空記録会', _by: 'bob', _st: 'pending', _h: 'AAAAAAAAAAAAAAAAAAAA', _at: { __ts: Date.now() } }; d['teams/' + T + '/records/legacy2'] = { id: 'x2', name: '架空選手Q', team: '架空高', event: 123, mark: '12.35', date: '2026-10-10', meet: '架空記録会', _by: 'bob', _st: 'pending', _h: 'BBBBBBBBBBBBBBBBBBBB', _at: { __ts: Date.now() } }; localStorage.setItem('__fakedb', JSON.stringify(d)); }, T);   // v0.26.2：event が数（R261-02）・中の id が正常な x2 を指す（R261-03）
await as('alice'); s = await st();
ok('C404：壊れた記録は表示から外して知らせる（ほかの記録・未確認の一覧はそのまま）', /形が正しくない記録が 2件/.test(s.text) && s.pend === 1, s.pend + ' ' + s.text.slice(0, 300));
await clk('[data-tm="quarDel"]'); await sleep(1500); s = await st();
const db2 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('C404：「削除の印を付ける」で直せる（印が付き、知らせが消える）', !/形が正しくない記録/.test(s.text) && db2['teams/' + T + '/records/poison']._del === true && typeof db2['teams/' + T + '/records/poison'].event === 'undefined' && db2['teams/' + T + '/records/legacy2']._del === true && !db2['teams/' + T + '/records/x2']._del, s.status);
// v0.26.3 R262-01：形の正しくない記録の削除の印を取り消そうとしても「取り消しました」と出さない
await p.evaluate(() => { const d = document.querySelector('details[data-tmd="hist"]'); d.open = false; }); await sleep(100); await p.evaluate(() => { document.querySelector('details[data-tmd="hist"]').open = true; }); await sleep(1200);
const ri = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-tm="revert"]')].find(x => /架空選手P|poison/.test(x.closest('li').textContent)); return b ? b.getAttribute('data-i') : null; });
if (ri !== null) { await clk('[data-tm="revert"][data-i="' + ri + '"]'); await sleep(1500); }
s = await st(); const db3 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('R262-01：戻せない取り消しは成功と表示しない（印は残る）', ri !== null && !/取り消しました/.test(s.status) && /戻せません/.test(s.status) && db3['teams/' + T + '/records/poison']._del === true, ri + ' ' + s.status);
// v0.26.1 C403：同じページのまま別のアカウントになっても、前のチームのコード・履歴・名前が残らない
await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); const T2 = 'ZZZZZZZZZZZZZZZZZZZZ'; d['teams/' + T2] = { name: '架空中学陸上部', ownerUid: 'carol', createdAt: { __ts: Date.now() } }; d['teams/' + T2 + '/members/carol'] = { role: 'coach', name: '架空 顧問C', joinedAt: { __ts: Date.now() } }; d['users/carol/teams/' + T2] = { name: '架空中学陸上部', role: 'coach' }; localStorage.setItem('__fakedb', JSON.stringify(d)); localStorage.setItem('lanenote.team.v1.carol', T2); });
const CAROL = { uid: 'carol', displayName: '架空 顧問C', email: 'coach-c@example.invalid' };
for (const how of ['logout', 'direct']) {
  await as('alice'); await p.evaluate(() => { for (const k of ['codes', 'members', 'hist']) document.querySelector('details[data-tmd="' + k + '"]').open = true; }); await sleep(1500);
  const before = await st(); const leaked = before.codes.slice();
  if (how === 'logout') { await p.evaluate(() => window.__fakeAuthCb(null)); await sleep(800); const o = await st(); ok('C403：ログアウトするとチームの画面は空', !o.text && !o.codes.length, o.text.slice(0, 100)); }
  await p.evaluate(u => window.__fakeAuthCb(u), CAROL); await sleep(1500);
  await p.evaluate(() => { for (const k of ['codes', 'members', 'hist']) { const d = document.querySelector('details[data-tmd="' + k + '"]'); if (d) d.open = true; } }); await sleep(1500);
  s = await st(); const html = await p.evaluate(() => document.getElementById('rbTeam').innerHTML);
  ok('C403（' + (how === 'logout' ? 'ログアウト→別の人' : '直接 別の人') + '）：前のチームのコード・履歴・名前が残らない', leaked.length === 2 && /架空中学陸上部/.test(s.text) && !leaked.some(c => html.includes(c) || html.includes(c.split('-')[1])) && !/架空 マネB|架空 顧問A|架空選手/.test(s.text), s.text.slice(0, 400));
}
ok('画面のエラーなし', !errs.length, errs.join(' / '));
await b.close(); srv.close();
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);

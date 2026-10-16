// v0.26.63 招待コードは顧問・マネージャーとも、はじめから「承認あり」・期限切れ／外されたときの案内（偽の Firebase・架空のデータだけ。ルールは変えていない）
//   node v02663_invite.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '', LT = createRequire(import.meta.url)('../src/team.js');
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
console.log('[v0.26.63] 招待は「承認あり」がはじめ・期限切れ／外されたときの案内');
// --- 関数：参加（join）で「期限が過ぎたマネージャー」「承認待ち」「外された」を見分けて伝える（Firestore はまねるだけ。書き込みは権限なしで断られる）
async function joinWith(mine, banned) {
  const t = 'T'.repeat(20), sec = LT.newSecret(), code = LT.codeStr(t, sec, LT.schoolYearEnd());
  const TS = ms => ({ toMillis: () => ms });
  const snap = v => ({ exists: () => v != null, data: () => v });
  const deny = () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
  const F = { doc: (fs, ...p) => ({ path: p.join('/') }), collection: (fs, ...p) => ({ path: p.join('/') }), serverTimestamp: () => 0, increment: n => n, Timestamp: { fromMillis: TS },
    getDocFromServer: async r => snap(/members\/u1$/.test(r.path) ? mine : /banned\/u1$/.test(r.path) ? banned : null), getDoc: async () => snap(null),
    setDoc: async () => {}, writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => deny() }) };
  try { await LT.make({ F, fs: {}, uid: 'u1', name: '架空 マネB' }).join(code); return 'joined'; } catch (e) { return e.code + '|' + e.message; }
}
{
  const ex = await joinWith({ role: 'manager', expiresAt: { toMillis: () => Date.now() - 864e5 } });
  ok('参加：期限が過ぎたマネージャーが同じチームのコードを使うと「期限が過ぎています。顧問に期限をのばしてもらってください」', /^expired\|/.test(ex) && /期限が過ぎています。顧問に期限をのばしてもらってください/.test(ex), ex);
  const live = await joinWith({ role: 'manager', expiresAt: { toMillis: () => Date.now() + 864e5 } });
  ok('参加：期限内のマネージャーは今まで通り「もう入っています」', /もうこのチームにマネージャーとして入っています/.test(live), live);
  const pd = await joinWith({ role: 'pending', want: 'manager' }); ok('参加：申しこみ済みは「顧問の承認待ちです」', /顧問の承認待ちです/.test(pd), pd);
  const bn = await joinWith(null, { name: 'x' }); ok('参加：外された人は「再参加を許可」してもらう', /^banned\|.*再参加を許可/.test(bn), bn);
}
// --- 画面
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const sleep = ms => new Promise(r => setTimeout(r, ms));
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1280, height: 900 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
const U = { alice: { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' }, bob: { uid: 'bob', displayName: '架空 マネB', email: 'mgr-b@example.invalid' }, carol: { uid: 'carol', displayName: '架空 マネC', email: 'mgr-c@example.invalid' }, dan: { uid: 'dan', displayName: '架空 マネD', email: 'mgr-d@example.invalid' } };
async function as(u, page = 'team.html') { await p.evaluate(x => { localStorage.setItem('__fakeuser', JSON.stringify(x)); localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); }, U[u]); await p.goto(B + page, { waitUntil: 'load' }); await sleep(2000); }
const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
const put = f => p.evaluate(f => { const d = JSON.parse(localStorage.getItem('__fakedb')); new Function('d', f)(d); localStorage.setItem('__fakedb', JSON.stringify(d)); }, f);
const codesOf = async T => Object.entries(await db()).filter(([k]) => k.startsWith('teams/' + T + '/codes/')).map(([, v]) => v);
const openCodes = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-tmd="codes"]'); d.open = true; }); await sleep(1200); };
const ui = () => p.evaluate(() => ({ chips: [...document.querySelectorAll('#rbTeam .tm-inv .tm-inv-h .tm-chip')].map(c => c.textContent), boxes: [...document.querySelectorAll('[data-copt="approve"]')].map(c => [c.getAttribute('data-role'), c.checked]) }));
try {
  await p.goto(B + 'guide.html'); await p.evaluate(() => localStorage.clear());
  await as('alice'); await p.waitForSelector('#rbTeam:not([hidden])');
  await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空高校陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(2000);
  const T = await p.evaluate(() => localStorage.getItem('lanenote.team.v1.alice'));
  let cs = await codesOf(T);
  ok('チームを作ったときのコード：顧問用・マネージャー用とも approve=true', cs.length === 2 && cs.every(c => c.approve === true) && cs.map(c => c.role).sort().join() === 'coach,manager', JSON.stringify(cs));
  await openCodes(); let u = await ui();
  ok('カードの印は「承認あり」（顧問・マネージャーとも）', u.chips.length === 2 && u.chips.every(c => c === '承認あり'), JSON.stringify(u));
  ok('「詳しい設定」の「承認を必要にする」は、顧問・マネージャーともはじめからチェック', u.boxes.length === 2 && u.boxes.every(x => x[1]), JSON.stringify(u));
  if (SHOT) { await p.evaluate(() => { document.querySelectorAll('#rbTeam .tm-inv details').forEach(d => { if (/詳しい設定/.test(d.querySelector('summary').textContent)) d.open = true; }); document.querySelector('details[data-tmd="codes"]').scrollIntoView({ block: 'start' }); window.scrollBy(0, -10); }); await sleep(500); await p.screenshot({ path: SHOT }); }
  // 作り直す：そのまま → 承認あり／チェックを外す → 承認なし（制限なし）
  await p.evaluate(() => { document.querySelectorAll('#rbTeam .tm-inv details').forEach(d => d.open = true); document.querySelector('[data-tm="regen"][data-role="manager"]').click(); }); await sleep(1500);
  cs = await codesOf(T); ok('作り直し（そのまま）：マネージャー用も approve=true', cs.find(c => c.role === 'manager').approve === true, JSON.stringify(cs));
  await openCodes(); await p.evaluate(() => { document.querySelectorAll('#rbTeam .tm-inv details').forEach(d => d.open = true); const c = document.querySelector('[data-copt="approve"][data-role="coach"]'); c.checked = false; document.querySelector('[data-tm="regen"][data-role="coach"]').click(); }); await sleep(1500);
  cs = await codesOf(T); await openCodes(); u = await ui();
  ok('チェックを外して作り直すと承認なし（印は「制限なし」）。マネージャーは「承認あり」のまま', !('approve' in cs.find(c => c.role === 'coach')) && u.chips[0] === '制限なし' && u.chips[1] === '承認あり', JSON.stringify([cs, u]));
  await sleep(200); u = await ui(); ok('作り直したあとも「承認を必要にする」は、はじめからチェック', u.boxes.every(x => x[1]), JSON.stringify(u));
  // 前に作ったコード（approve なし）はそのまま：カードの印も今まで通り
  await put(`for (const k of Object.keys(d)) if (k.startsWith('teams/${T}/codes/') && d[k].role === 'manager') delete d[k].approve;`); await as('alice'); await openCodes(); u = await ui();
  ok('前に作ったコード（承認なし）は変えない：印は「制限なし」のまま', u.chips[1] === '制限なし' && (await codesOf(T)).find(c => c.role === 'manager').approve === undefined, JSON.stringify(u));
  // 入る人：承認待ちの案内
  await put(`d['teams/${T}/members/bob'] = { role: 'pending', want: 'manager', name: '架空 マネB', joinedAt: { __ts: Date.now() } };`);
  await as('bob');
  await p.evaluate(T => { const m = LaneTeam.make; LaneTeam.make = o => { const a = m(o); a.join = async () => { const d = JSON.parse(localStorage.getItem('__fakedb')); d['users/bob/teams/' + T] = { name: '', role: 'pending' }; localStorage.setItem('__fakedb', JSON.stringify(d)); return { team: T, role: 'pending', want: 'manager', name: '' }; }; return a; }; document.getElementById('rbTeamCode').value = 'x'; document.querySelector('[data-tm="join"]').click(); }, T); await sleep(2500);
  const jt = await p.evaluate(() => document.getElementById('rbTeam').innerText);
  ok('承認が要るコードで入った人：「参加を申しこみました。顧問の承認待ちです（マネージャーとして）」と、承認待ちの欄', /参加を申しこみました。顧問の承認待ちです（マネージャーとして）/.test(jt) && /承認待ちです。/.test(jt) && !/承認待ち として入りました/.test(jt), jt.slice(0, 400));
  // 期限が過ぎたマネージャー
  await put(`d['teams/${T}/members/carol'] = { role: 'manager', name: '架空 マネC', joinedAt: { __ts: Date.now() }, expiresAt: { __ts: Date.now() - 864e5 } }; d['users/carol/teams/${T}'] = { name: '架空高校陸上部', role: 'manager' };`);
  await p.evaluate(T => localStorage.setItem('lanenote.team.v1.carol', T), T); await as('carol');
  let t = await p.evaluate(() => document.getElementById('rbTeam').innerText);
  ok('期限が過ぎたマネージャー（チームのページ）：「顧問に期限をのばしてもらってください」', /マネージャーの期限が過ぎました）。顧問に期限をのばしてもらってください。/.test(t) && !/新しい参加コード|再参加/.test(t), t.slice(0, 300));
  await as('carol', 'records.html'); t = await p.evaluate(() => document.getElementById('rbTeam').innerText);
  ok('期限が過ぎたマネージャー（記録のページ）：「今は使えません」', /今は使えません/.test(t), t.slice(0, 200));
  // 外された人（メンバーの文書が無い）
  await put(`d['users/dan/teams/${T}'] = { name: '架空高校陸上部', role: 'manager' }; d['teams/${T}/banned/dan'] = { name: '架空 マネD', at: { __ts: Date.now() } };`);
  await p.evaluate(T => localStorage.setItem('lanenote.team.v1.dan', T), T); await as('dan');
  t = await p.evaluate(() => document.getElementById('rbTeam').innerText);
  ok('外された人：「チームから外されました）。顧問に再参加を許可してもらってください」', /チームから外されました）。顧問に再参加を許可してもらってください。/.test(t) && !/新しい参加コード|期限をのばして/.test(t), t.slice(0, 300));
  const src = fs.readFileSync(path.join(ROOT, 'team.html'), 'utf8');
  ok('見分けられないとき（参加の権限エラーなど）の文：「期限をのばしてもらうか、再参加を許可してもらってください」系・古い「新しい参加コードをもらってください」は無い', /顧問に期限をのばしてもらうか、再参加を許可してもらってください/.test(src) && /マネージャーの期限切れなら顧問に期限をのばしてもらい、チームから外されたなら顧問に再参加を許可してもらってください/.test(src) && !/必要なら顧問に新しい参加コードをもらってください/.test(src));
  ok('ページのエラーなし', !errs.length, errs.join(' / '));
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);

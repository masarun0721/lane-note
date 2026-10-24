// v0.26.38 みんなの結果（記録のページ）：候補を出す（自動では読まない）→ 押すと確認画面 → ゆるい一致は要確認 → 顧問にだけ登録を聞く
//   Chrome・ローカル・偽の Firebase・架空のデータだけ。権限のルールは rules_pubresults_check.mjs で確かめる
//   node v02638_pubresults_ui.mjs [スクショの保存先の頭（例 /workspace/lane_note_shots/v02638）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core'; import {FAKE_APP, FAKE_AUTH, FAKE_FS} from './fake_firebase.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '../..'), SHOT = process.argv[2] || '';
const PROXY = 'https://lane-note-fetch.lanenote-info.workers.dev/';
// 架空の速報ページ：所属が「架空学園」（そのまま一致）・「架空学園高」（ゆるい一致）・「見本大附高」（別の学校）
const PAGE0 = fs.readFileSync(path.join(HERE, 'fixtures/sgk_pc_individual.html'), 'utf8').replace('見本大附高', '架空学園'), CUT = PAGE0.indexOf('試験');
const PAGE = PAGE0.slice(0, CUT) + PAGE0.slice(CUT).replace('架空学園高', '見本大附高');
if (CUT < 0 || !PAGE.includes('見本大附高')) throw new Error('fixture');
const PAGE2 = PAGE.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
const LIVE = 'https://kaku-live.example/r/m100.html', LIVE2 = 'https://kaku-live2.example/r/m100.html';
let fetched = [];
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
console.log('[v0.26.38] みんなの結果（記録のページ）');
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }); await p.setRequestInterception(true);
const FAKE = { 'firebase-app.js': FAKE_APP, 'firebase-auth.js': FAKE_AUTH, 'firebase-firestore.js': FAKE_FS };
p.on('request', r => { const u = r.url(), m = /gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)$/.exec(u);
  if (m && FAKE[m[1]]) return r.respond({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE[m[1]] });
  if (u.startsWith(PROXY)) { const t = decodeURIComponent(u.slice((PROXY + '?url=').length)); fetched.push(t); return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: PAGE2 }); }
  if (u.startsWith(B)) r.continue(); else r.abort(); });
let dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); const errs = []; p.on('pageerror', e => errs.push(e.message));
const MEET = '第1回架空私学陸上競技大会', DAY = '2026-08-19', IMPQ = 'records.html?imp=' + encodeURIComponent(DAY + '|' + MEET);
const PUB = { name: MEET, key: MEET, date: DAY, end: DAY, venue: '架空競技場', url: LIVE, host: 'kaku-live.example', kind: 'live', by: 'carol', at: '2026-08-19T05:00:00.000Z', rep: 0, hid: false, ver: 1, exp: 1e13 };
const db = (pub, extra) => Object.assign({ 'teams/T1/members/alice': { role: 'coach' }, 'users/alice/teams/T1': { name: '架空学園陸上部', role: 'coach' }, 'teams/T1/members/bob': { role: 'manager' }, 'users/bob/teams/T1': { name: '架空学園陸上部', role: 'manager' } }, pub ? { 'pubResults/2026-08-19_x1': pub } : {}, extra || {});
async function open(user, data, url = IMPQ) {
  await p.goto(B + 'guide.html'); await p.evaluate((u, d) => { localStorage.clear(); if (u) localStorage.setItem('__fakeuser', JSON.stringify({ uid: u, displayName: '架空 ' + u, email: u + '@example.invalid' })); localStorage.setItem('__fakedb', JSON.stringify(d)); localStorage.setItem('lanenote.mode.v1', 'coach'); }, user, data);
  fetched = []; dialogs = []; await p.goto(B + url, { waitUntil: 'load' }); await sleep(1800);
}
const txt = sel => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
const clk = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('ない：' + s); e.click(); }, sel);
async function shot(name, sel) { if (!SHOT) return; const el = await p.$(sel); if (!el) return; await el.evaluate(e => e.scrollIntoView({ block: 'start' })); await sleep(300); await el.screenshot({ path: SHOT + '_' + name + '.png', captureBeyondViewport: false }); }

// 1) 候補が出る・まだ何も読まない
await open('alice', db(PUB));
let t = await txt('#resBox');
ok('大会予定から来ると、みんなの結果の候補が出る（大会名・速報のページ・だれでも報告できるボタン）', /みんなの結果/.test(t) && t.includes(MEET) && /速報のページ/.test(t) && /この結果を取り込む/.test(t) && /報告/.test(t), t);
ok('自動では読まない（中継に1回も取りに行っていない）', fetched.length === 0, JSON.stringify(fetched));
ok('ほかの人の登録には「登録を取り消す」が出ない', !/登録を取り消す/.test(t));
await p.evaluate(() => { document.getElementById('rbSchool').value = ''; document.getElementById('rbSchool').dispatchEvent(new Event('input', { bubbles: true })); });
await clk('[data-resuse="0"]'); await sleep(500);
ok('学校名が空なら読まずに止める', fetched.length === 0 && /学校・クラブ名/.test(await txt('#resMsg')), await txt('#resMsg'));
await shot('candidate_mobile', '#resBox');
// 2) 押すと読む → 確認画面 → ゆるい一致は要確認
await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空学園'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
await clk('[data-resuse="0"]'); await sleep(2500);
ok('押したときだけ、そのURLを読む', fetched.length >= 1 && fetched[0] === LIVE, JSON.stringify(fetched));
t = await txt('#rbBatches');
ok('確認画面に出典（みんなの結果・登録した日）', /📊/.test(t), t.slice(0, 300));
ok('ゆるい一致（架空学園高）は要確認・はじめはチェックなしで入らない', /要確認：学校名がゆるく一致した 1件/.test(t) && /架空学園高/.test(t) && /読み取った記録：1件/.test(t), t.slice(0, 600));
ok('別の学校（見本大附高）は出ない', !/試験 三太/.test(t) || !/見本大附高/.test(t.split('要確認')[0]));
await shot('confirm_mobile', '.rb-batch');
await p.evaluate(() => { const c = document.querySelector('[data-loose]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
t = await txt('#rbBatches');
ok('チェックを付けると、要確認の行も入る', /読み取った記録：2件/.test(t), t.slice(0, 400));
dialogs = [];
await clk('[data-save]'); await sleep(2500);
const d1 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const recs = Object.keys(d1).filter(k => /\/records\//.test(k));
ok('保存できる（2件）', recs.length === 2, JSON.stringify(recs));
ok('みんなの結果から読んだときは、登録を聞かない（すでにある）', !dialogs.some(x => /みんなの結果」に、この結果のURLを登録/.test(x)) && Object.keys(d1).filter(k => /^pubResults\//.test(k)).length === 1, JSON.stringify(dialogs));
// 3) 自分でURLを入れて読んだ顧問：1回だけ聞く → 登録（URLと大会の情報だけ）
await open('alice', db(null), 'records.html');
await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空学園'; s.dispatchEvent(new Event('input', { bubbles: true })); });
// 保存先をチームにしないで、自分の記録として保存（顧問かどうかはチームの名簿で確かめる）
await p.evaluate(u => { document.getElementById('ruUrl').value = u; }, LIVE2);
await p.evaluate(() => { const b = [...document.querySelectorAll('#rbUrlLoad button')].find(x => /読み込む/.test(x.textContent)); if (b) b.click(); }); await sleep(2500);
await p.evaluate(() => { const c = document.querySelector('[data-loose]'); if (c) c.checked = false; }); dialogs = [];
const hasSave = await p.evaluate(() => !!document.querySelector('[data-save]'));
if (hasSave) { await clk('[data-save]'); await sleep(3000); }
const d2 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const pk = Object.keys(d2).filter(k => /^pubResults\/[^/]+$/.test(k)), pv = pk.length ? d2[pk[0]] : {};
ok('自分でURLを入れて保存した顧問にだけ、1回聞く', dialogs.filter(x => /みんなの結果」に、この結果のURLを登録/.test(x)).length === 1, JSON.stringify(dialogs));
ok('登録されるのは大会の情報とURLだけ（選手の名前・記録・学校名は入らない）', pk.length === 1 && pv.url === LIVE2 && pv.kind === 'live' && pv.name === MEET && !JSON.stringify(pv).includes('架空 一郎') && !JSON.stringify(pv).includes('架空学園'), JSON.stringify(pv));
ok('答えを覚える（users/alice/settings/pubres）', d2['users/alice/settings/pubres'] && d2['users/alice/settings/pubres'].on === true, JSON.stringify(d2['users/alice/settings/pubres']));
ok('1日の数は、みんなの要項と同じ pubQuota に数える', d2['pubQuota/alice'] && d2['pubQuota/alice'].n === 1 && d2['pubQuota/alice'].team === 'T1', JSON.stringify(d2['pubQuota/alice']));
t = await txt('#resBox'); ok('登録したことと「これからは登録しない」が出る', /登録しました/.test(t) && /これからは登録しない/.test(t), t);
await shot('registered_mobile', '#resBox');
// 4) マネージャーには聞かない・登録しない
await open('bob', db(null), 'records.html');
await p.evaluate(u => { const s = document.getElementById('rbSchool'); s.value = '架空学園'; document.getElementById('ruUrl').value = u; }, LIVE2);
await p.evaluate(() => { const b = [...document.querySelectorAll('#rbUrlLoad button')].find(x => /読み込む/.test(x.textContent)); if (b) b.click(); }); await sleep(2500); dialogs = [];
if (await p.evaluate(() => !!document.querySelector('[data-save]'))) { await clk('[data-save]'); await sleep(2500); }
const d3 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('マネージャーには聞かない・登録しない', !dialogs.some(x => /みんなの結果/.test(x)) && !Object.keys(d3).some(k => /^pubResults\//.test(k)), JSON.stringify(dialogs));
// 4b) マネージャーがチームに取り込んだ記録は「未確認」（_st: pending）。顧問の取り込みは確認済み（ok）
async function teamImport(user) {
  await open(user, db(null, { 'teams/T1': { name: '架空学園陸上部', ownerUid: 'alice' } }), 'records.html');
  await p.evaluate(u => localStorage.setItem('lanenote.team.v1.' + u, 'T1'), user); await p.reload({ waitUntil: 'load' }); await sleep(2000);
  await p.evaluate(u => { const s = document.getElementById('rbSchool'); s.value = '架空学園'; s.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('ruUrl').value = u; }, LIVE2);
  await p.evaluate(() => { const b = [...document.querySelectorAll('#rbUrlLoad button')].find(x => /読み込む/.test(x.textContent)); if (b) b.click(); }); await sleep(2500);
  if (await p.evaluate(() => !!document.querySelector('[data-save]'))) { await clk('[data-save]'); await sleep(3000); }
  const d = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
  return Object.keys(d).filter(k => /^teams\/T1\/records\/[^/]+$/.test(k)).map(k => d[k]);
}
{ const r = await teamImport('bob');
  ok('マネージャーがチームに取り込んだ記録は「未確認」（_st: pending）', r.length >= 1 && r.every(x => x._st === 'pending' && x._by === 'bob'), JSON.stringify(r.map(x => [x._st, x._by, x.name])));
  await p.reload({ waitUntil: 'load' }); await sleep(2500);
  await p.evaluate(() => document.querySelector('.tabs [data-v="meet"]').click()); await sleep(500);
  const nm = await p.evaluate(() => [...document.querySelectorAll('#rbView .pend')].map(e => e.textContent));
  ok('読み込み直しても、大会別の表で取り込んだ行に「未確認」の印（マネージャーの画面）', nm.length === r.length && nm.every(x => x === '未確認'), JSON.stringify(nm));
  await shot('manager_pending_mobile', '#rbView');
  
  const r2 = await teamImport('alice');
  ok('顧問がチームに取り込んだ記録は確認済み（_st: ok）', r2.length >= 1 && r2.every(x => x._st === 'ok' && x._by === 'alice'), JSON.stringify(r2.map(x => [x._st, x._by])));
}
// 4c) 設定：「みんなの要項／みんなの結果に登録するか聞く」（顧問だけ・同じ場所）
await open('alice', db(null, { 'users/alice/settings/pubres': { on: false, at: 'x' }, 'users/alice/settings/pub': { on: true, at: 'x' } }), 'records.html'); await sleep(800);
let pp = await p.evaluate(() => { const b = document.getElementById('rbPubPref'); return { hidden: !b || b.hidden, t: b ? b.textContent : '', pub: (document.querySelector('[data-pp="pub"]') || {}).checked, res: (document.querySelector('[data-pp="pubres"]') || {}).checked }; });
ok('顧問には、記録のページに2つのスイッチが同じ場所に出る', !pp.hidden && /みんなの要項」に登録するか聞く/.test(pp.t) && /みんなの結果」に登録するか聞く/.test(pp.t), JSON.stringify(pp));
ok('今の設定どおり（結果：オフ・要項：オン（聞かずに登録））', pp.res === false && pp.pub === true && /聞かずに登録/.test(pp.t), JSON.stringify(pp));
await p.evaluate(() => { document.querySelector('[data-ppd]').open = true; });
await p.evaluate(() => { const c = document.querySelector('[data-pp="pubres"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
let d4 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('みんなの結果をオンに戻すと、設定を消す（次の1回また聞く）', !('users/alice/settings/pubres' in d4) && /もう一度聞きます/.test(await txt('#ppMsg')), JSON.stringify(d4['users/alice/settings/pubres']) + await txt('#ppMsg'));
await shot('settings_mobile', '#rbPubPref');
await p.evaluate(() => { const c = document.querySelector('[data-pp="pub"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
d4 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('みんなの要項をオフにすると users/alice/settings/pub が on:false', d4['users/alice/settings/pub'] && d4['users/alice/settings/pub'].on === false);
await p.evaluate(() => { const c = document.querySelector('[data-pp="pubres"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
d4 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
ok('みんなの結果をオフにすると users/alice/settings/pubres が on:false', d4['users/alice/settings/pubres'] && d4['users/alice/settings/pubres'].on === false);
await p.reload({ waitUntil: 'load' }); await sleep(1800);
pp = await p.evaluate(() => ({ pub: document.querySelector('[data-pp="pub"]').checked, res: document.querySelector('[data-pp="pubres"]').checked }));
ok('読み込み直しても残る', pp.pub === false && pp.res === false, JSON.stringify(pp));
await open('bob', db(null, { 'teams/T1': { name: '架空学園陸上部', ownerUid: 'alice' } }), 'records.html');
ok('マネージャーにはスイッチが出ない', await p.evaluate(() => { const b = document.getElementById('rbPubPref'); return !!b && b.hidden && !document.querySelector('[data-pp]'); }));
await open(null, db(null), 'records.html');
ok('ログインしていなければスイッチは出ない', await p.evaluate(() => { const b = document.getElementById('rbPubPref'); return !!b && b.hidden; }));
// 5) ログインしていなければ候補を探さない
await open(null, db(PUB));
ok('ログインしていなければ、みんなの結果は出ない', !(await txt('#resBox')) && fetched.length === 0);
ok('ページのエラーなし', !errs.length, errs.join(' / '));
await b.close(); srv.close();
console.log(`v02638_pubresults_ui: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

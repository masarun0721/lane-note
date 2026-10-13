// v0.26.11 選手台帳：選手ID・名前だけでは結びつけない・まとめる/分ける・学年と年度更新・所属の変更。架空データのみ（ログインなしの端末保存で確かめる）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), L = req('../src/roster.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.11] 選手台帳');
await check('選手ID：A＋10文字・記録に aid があれば名前や所属が違っても同じ人', () => {
  const a = L.newAid(); assert(L.validAid(a)); assert(!L.validAid('A123'));
  assert.equal(R.athleteKey({ name: '架空 一郎', team: '架空中', aid: a }), R.athleteKey({ name: '架空 壱郎', team: '架空高', aid: a }));
  assert.notEqual(R.athleteKey({ name: '架空 一郎', team: '架空高' }), R.athleteKey({ name: '架空 一郎', team: '架空高', aid: a }));
});
await check('学年は年度（4月はじまり）から・最上級を過ぎたら卒業の候補・記録の学年は変えない', () => {
  assert.equal(L.schoolYear(new Date(2027, 2, 31)), 2026); assert.equal(L.schoolYear(new Date(2027, 3, 1)), 2027);
  assert.equal(L.entryFor('2', 2026), 2025); assert.equal(L.gradeIn({ entry: 2025 }, 2027), 3);
  const list = [{ aid: 'AAAAAAAAAA1', name: '架空3年', entry: 2024, status: 'active' }, { aid: 'AAAAAAAAAA2', name: '架空2年', entry: 2025, status: 'active' }];
  const plan = L.rollover(list, 2027); assert.deepEqual(plan.map(p => p.action), ['graduate', 'stay']);
  const after = L.applyRollover(list, plan, 2027); assert.equal(after[0].status, 'graduated'); assert.equal(after[0].gradYear, 2026); assert.equal(after[1].status, 'active');
});
await check('所属の変更は履歴に残る', () => { const e = L.move({ aid: 'AAAAAAAAAA1', team: '架空中' }, '架空高', '2027-04-01', '進学'); assert.equal(e.team, '架空高'); assert.deepEqual(e.moves[0], { date: '2027-04-01', from: '架空中', to: '架空高', note: '進学' }); });
await check('同じ名前は「候補」として返すだけ（記録は変えない）・台帳に入った記録は候補にしない', () => {
  const recs = [{ id: '1', name: '架空 一郎', team: '架空高', date: '2026-05-01', aid: 'AAAAAAAAAA1' }, { id: '2', name: '架空　一郎', team: '架空南高', date: '2026-06-01' }, { id: '3', name: '見本 太郎', team: '架空高', date: '2026-06-01' }];
  const c = L.candidates(recs, { aid: 'AAAAAAAAAA1', name: '架空 一郎' }, R); assert.equal(c.length, 1); assert.equal(c[0].n, 1); assert.equal(recs[1].aid, undefined);
});
// 画面
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; let conf = []; w.confirm = (m) => { conf.push(m); return true; }; w.prompt = () => '架空 一郎B'; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; assert(js.includes(tail));
w.eval(js.replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,all:function(){return ALL;},roster:function(){return ROSTER;}};renderAuth();reload();')); await delay(150);
const T = w.__t, doc = w.document, mk = (id, name, team, date, grade, mark) => ({ id, name, team, date, grade, mark, event: '男子100m', meet: '架空記録会' + date, wind: '+0.5' });
await T.putMany([mk('a1', '架空 一郎', '架空中', '2025-07-01', '3', '12.10'), mk('a2', '架空 一郎', '架空中', '2025-09-01', '3', '12.00'), mk('a3', '架空 一郎', '架空高', '2026-06-01', '1', '11.80'), mk('b1', '見本 太郎', '架空高', '2026-06-01', '2', '11.50')], T.scope()); await T.reload(T.scope()); await delay();
const keyOf = id => R.athleteKey(T.all().find(r => r.id === id));
const go = async (k) => { w.location.hash = '#athlete=' + encodeURIComponent(k); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await delay(); };
await check('台帳に入っていない選手：「台帳に入れる」だけ出る（自動では結びつけない）', async () => {
  assert.notEqual(keyOf('a1'), keyOf('a3')); await go(keyOf('a1'));
  assert(doc.querySelector('[data-ro="add"]')); assert(T.all().every(r => !r.aid));
});
let aid;
await check('「台帳に入れる」：確かめてから、その人の記録（中学の2件）にだけIDがつく', async () => {
  doc.querySelector('[data-ro="add"]').click(); await delay(250);
  assert.match(conf.pop(), /2件の記録に選手ID/); const a = T.all(); aid = a.find(r => r.id === 'a1').aid; assert(L.validAid(aid));
  assert.equal(a.find(r => r.id === 'a2').aid, aid); assert.equal(a.find(r => r.id === 'a3').aid, undefined); assert.equal(T.roster().length, 1); assert.equal(T.roster()[0].entry, 2023);
});
await check('台帳の選手のページ：同じ名前の高校の記録は「候補」として出る→確かめて入れるとまとまる', async () => {
  await go('id:' + aid); const btn = doc.querySelector('[data-ro="link"]'); assert(btn, '候補が出ない'); assert.match(doc.querySelector('.ro-cand').textContent, /架空高・1件/);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + '_ath.html', doc.getElementById('rbView').innerHTML);
  btn.click(); await delay(250); assert.match(conf.pop(), /同じ人であることを確かめましたか/);
  assert.equal(T.all().find(r => r.id === 'a3').aid, aid); assert.equal(T.all().find(r => r.id === 'a3').team, '架空高'); assert.equal(T.all().find(r => r.id === 'a1').team, '架空中');
});
await check('分ける：選んだ記録だけ新しいIDの別の人になる', async () => {
  await go('id:' + aid); doc.querySelector('[data-ro-split="a2"]').checked = true; doc.querySelector('[data-ro="split"]').click(); await delay(250);
  const a2 = T.all().find(r => r.id === 'a2').aid; assert(L.validAid(a2)); assert.notEqual(a2, aid); assert.equal(T.all().find(r => r.id === 'a1').aid, aid); assert.equal(T.roster().length, 2);
});
await check('所属の変更・卒業：台帳だけが変わり、過去の記録の所属・学年はそのまま', async () => {
  await go('id:' + aid); doc.querySelector('[data-ro-in="to"]').value = '架空北高'; doc.querySelector('[data-ro="move"]').click(); await delay(200);
  const e = T.roster().find(x => x.aid === aid); assert.equal(e.team, '架空北高'); assert.equal(e.moves.length, 1); assert.equal(T.all().find(r => r.id === 'a3').team, '架空高'); assert.equal(T.all().find(r => r.id === 'a1').grade, '3');
  await go('id:' + aid); doc.querySelector('[data-ro="grad"]').click(); await delay(200); assert.equal(T.roster().find(x => x.aid === aid).status, 'graduated');
});
await check('ホーム：台帳の一覧と年度更新（卒業の候補を確かめてから）', async () => {
  w.location.hash = ''; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await delay();
  const box = doc.querySelector('.ro-home'); assert(box); assert.match(box.textContent, /在籍 1人・卒業など 1人/);
  doc.querySelector('[data-ro="plan"]').click(); await delay(); assert(doc.querySelector('.ro-plan')); if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + '_home.html', doc.querySelector('.ro-home').outerHTML);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

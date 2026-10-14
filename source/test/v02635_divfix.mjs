// v0.26.35 中学になっている高校生（「中3年」）を見つけて直す・手で決める（架空データのみ。v0.26.34 の「本郷・3」・中学/高校の決め方・種目の一覧の二重（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.35] 中学/高校の食いちがい');
const K = { name: '架空 一郎', team: '架空', event: '男子100m' };
await check('原因：大会予定の区分「中学」（カレンダーの「〜ジュニア」を前の版が中学と推測）で、高校生の記録が中学になる', () => {
  R.setDivisionHints({}); R.setPersonDivs({}); R.setMeetDivs({ '2026-04-18|架空区ジュニア': 'jh' });
  const r = Object.assign({ id: 'x1', grade: '3', date: '2026-04-18', meet: '架空区ジュニア', mark: '11.54' }, K); assert.equal(R.divisionOf(r), 'jh');
});
await check('同じ選手のほかの記録（高校）は、大会の区分より先（高2→次の年度は高3）', () => {
  const rs = [Object.assign({ id: 'x1', grade: '3', date: '2026-04-18', meet: '架空区ジュニア', mark: '11.54' }, K), Object.assign({ id: 'x2', grade: '2', date: '2025-07-01', meet: '架空記録会', mark: '11.8' }, K, { team: '架空高' })];
  const inf = R.inferDivisions(rs, {}); R.setDivisionHints(inf.hints); assert.equal(R.divisionOf(rs[0]), 'hs'); R.setDivisionHints({});
});
await check('学年が「中3」と保存された高校生：高校のしるし（同じ選手の高校の記録・大会の区分・台帳）があれば要確認に出し、学年の数字は高校の記録から数える', () => {
  R.setMeetDivs({ '2026-04-19|架空春季': 'hs' });
  const rs = [Object.assign({ id: 'y1', grade: '中3', date: '2026-04-18', meet: 'm', mark: '11.54' }, K), Object.assign({ id: 'y2', grade: '中2', date: '2026-04-19', meet: '架空春季', mark: '11.6' }, K), Object.assign({ id: 'y3', grade: '2', date: '2025-06-01', meet: 'm', mark: '11.9' }, K, { team: '架空高' }), Object.assign({ id: 'y0', grade: '3', date: '2023-07-01', meet: 'm', mark: '12.5' }, K, { team: '架空' , grade: '中3'})];
  const c = R.divConflicts(rs); assert.equal(c.length, 1); assert.deepEqual(c[0].recs.map(x => x.r.id + ':' + x.to), ['y1:3', 'y2:3']);
  assert(/同じ選手の高校の記録/.test(c[0].why.join()) && /大会予定の区分が「高校」/.test(c[0].why.join()));
  R.setPersonDivs({ [R.personKey(rs[0])]: 'jh' }); assert.equal(R.divConflicts(rs).length, 0, '先生が中学と決めたら出さない'); R.setPersonDivs({}); R.setMeetDivs({});
});
await check('台帳で高校の選手（aid）は、学年が「中3」でも高校・要確認に出る', () => {
  const r = Object.assign({ id: 'z1', aid: 'Aabcdefghij', grade: '中3', date: '2026-04-18', meet: 'm' }, K);
  R.setRosterDivs({ Aabcdefghij: 'hs' }); assert.equal(R.divisionOf(r), 'hs'); R.setRosterDivs({});
  assert.equal(R.divisionOf(r), 'jh');
});
await check('学校名に「中」「高」があるときは、それがいちばん先（先生の指定より）', () => { R.setPersonDivs({ [R.personKey({ name: '架空 二郎', team: '架空中' })]: 'hs' }); assert.equal(R.divisionOf({ name: '架空 二郎', team: '架空中', grade: '1' }), 'jh'); R.setPersonDivs({}); });
// 記録のページ：保存済みの「架空・3」を直す
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js']) w.eval(src(s));
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,all:function(){return ALL;}};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document;
async function seed(rows) { const sc = T.scope(), db = await new Promise(ok => { const q = w.indexedDB.open(sc.dbName); q.onsuccess = () => ok(q.result); }); const stn = db.objectStoreNames[0];
  await new Promise(ok => { const tx = db.transaction(stn, 'readwrite'), st = tx.objectStore(stn); rows.forEach(r => st.put(r)); tx.oncomplete = ok; }); db.close(); await T.reload(sc); await delay(100); }
await check('記録のページ：要確認「高校かもしれない選手」→「高校にする」で高校・学年「中3」→「3」（何を直したか出す）・ランキングは高3年', async () => {
  await seed([{ id: 'p1', name: '見本 太郎', team: '架空', grade: '中3', event: '男子100m', mark: '11.54', date: '2026-04-18', meet: '架空区ジュニア' }, { id: 'p2', name: '見本 太郎', team: '架空高', grade: '2', event: '男子100m', mark: '11.80', date: '2025-07-01', meet: '架空記録会' }]);
  const box = doc.getElementById('dcFix'); assert(box, doc.getElementById('rbReview').textContent.slice(0, 300)); assert(/見本 太郎/.test(box.textContent) && /中3 → 高3/.test(box.textContent), box.textContent);
  doc.querySelector('[data-dcfix="0"]').click(); await delay(500);
  const r = T.all().find(x => x.id === 'p1'); assert.equal(r.grade, '3'); assert(!doc.getElementById('dcFix'));
  assert(/見本 太郎 を高校にしました（学年を直した記録 1件：2026-04-18 高3）/.test(doc.getElementById('rbDataStatus').textContent), doc.getElementById('rbDataStatus').textContent);
});
await check('「中学のまま」を選ぶと出なくなる・手で決める欄で中学／高校を変えられる', async () => {
  await seed([{ id: 'q1', name: '見本 次郎', team: '架空', grade: '中2', event: '男子100m', mark: '12.54', date: '2026-04-18', meet: 'm' }, { id: 'q2', name: '見本 次郎', team: '架空高', grade: '1', event: '男子100m', mark: '12.80', date: '2025-07-01', meet: 'm' }]);
  assert(/見本 次郎/.test(doc.getElementById('dcFix').textContent)); doc.querySelector('#dcFix [data-divpick="jh"]').click(); await delay(300);
  assert(!doc.getElementById('dcFix') || !/見本 次郎/.test(doc.getElementById('dcFix').textContent));
  const sel = doc.getElementById('ovSel'); const k = [...sel.options].find(o => /見本 次郎/.test(o.text)).value; sel.value = k;
  doc.querySelector('[data-ovset="hs"]').click(); await delay(300);
  assert(/見本 次郎（架空）? ?を高校にしました|を高校にしました/.test(doc.getElementById('rbDataStatus').textContent));
  w.eval('void 0'); assert.equal(w.__t.all().filter(x => x.id === 'q1').length, 1);
});
console.log(`v02635_divfix: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

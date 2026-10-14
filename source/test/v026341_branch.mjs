// v0.26.34.1 「・3」は支部の番号・種目名の学年（v0.26.34 の「本郷・3」・中学/高校の決め方・種目の一覧の二重（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.34.1] 支部の番号と種目名の学年');
await check('「架空・3」の・3 は支部の番号：所属から外し、学年にしない（見出しが「学年」のときだけ学年）', () => {
  const a = R.splitTeamGrade('架空・3', ''); assert.deepEqual([a.team, a.grade, a.branch], ['架空', '', true]);
  assert.equal(R.splitTeamGrade('架空・3', '', { gradeHeader: true }).grade, '3');
  assert.equal(R.splitTeamGrade('架空・3', '', { gradeHeader: true, event: '3支部1年 100m' }).grade, '', '3支部があれば支部の番号');
  assert.equal(R.splitTeamGrade('架空 2年', '').grade, '2');
});
await check('種目名の学年：「3支部1年 100m」「1年100m」「中2 100m」「中学1年男子100m」→ 学年と「100m」', () => {
  const f = e => { const x = R.gradeFromEvent(e); return [x.grade, x.event]; };
  assert.deepEqual(f('3支部1年 100m'), ['1', '100m']); assert.deepEqual(f('1年100m'), ['1', '100m']); assert.deepEqual(f('中2 100m'), ['中2', '100m']);
  assert.deepEqual(f('中学1年男子100m'), ['中1', '男子100m']); assert.deepEqual(f('高校2年 女子走幅跳'), ['高2', '女子走幅跳']);
  for (const e of ['男子100m', '中1500m', '高3000mSC', '110mJH', '4×100mR']) assert.equal(R.gradeFromEvent(e).changed, false, e);
});
await check('読み取り：学年別の速報「3支部1年 100m」「架空・3」→ 所属 架空・学年 1・種目 100m（中学か高校かは学年の数字だけでは決めない）', () => {
  const r = R.parsePlain('架空支部大会 2026年5月30日\n3支部1年男子100m 決勝\n順位\t氏名\t所属\t記録\n1\t架空 一郎\t架空・3\t12.52\n', {}).recs[0];
  assert.deepEqual([r.team, r.grade, r.event], ['架空', '1', '男子100m']);
  R.setDivisionHints({}); R.setMeetDivs({}); assert.equal(R.divisionOf(r), '');
});
await check('v0.26.34 の「直す」で学年 3（支部の番号）が入った記録：種目名の「1年」とちがうので、学年 1 に直す（regrade）', () => {
  const x = R.fixRecord({ team: '架空', grade: '3', event: '3支部1年 100m' }); assert.deepEqual([x.team, x.grade, x.event, x.regrade], ['架空', '1', '100m', true]);
  const y = R.fixRecord({ team: '架空', grade: '1', event: '3支部1年 100m' }); assert.deepEqual([y.grade, y.event, y.regrade], ['1', '100m', false]);
  assert.equal(R.fixRecord({ team: '架空', grade: '3', event: '男子100m' }).changed, false, '種目名に学年がなければさわらない');
});
// 記録のページ：保存済みの「架空・3」を直す
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js']) w.eval(src(s));
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,all:function(){return ALL;}};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document;
await check('記録のページ：保存済みの「架空・3」＋v0.26.34 で学年3にした記録 → 要確認に「学年のまちがい」→「直す」で学年1・種目100m', async () => {
  const sc = T.scope(), db = await new Promise(ok => { const q = w.indexedDB.open(sc.dbName); q.onsuccess = () => ok(q.result); });
  const stn = db.objectStoreNames[0];
  await new Promise(ok => { const tx = db.transaction(stn, 'readwrite'), st = tx.objectStore(stn); for (const [i, t, g] of [[1, '架空・3', ''], [2, '架空', '3'], [3, '架空', '3']]) st.put({ id: 'b' + i, name: '架空 生徒' + i, team: t, grade: g, event: '3支部1年 100m', mark: '13.0' + i, date: '2026-05-30', meet: '架空学年別' }); tx.oncomplete = ok; });
  db.close(); await T.reload(sc); await delay(100);
  const box = doc.getElementById('tgFix'); assert(box); const t = box.textContent;
  assert(/学年のまちがい 2件/.test(t) && /支部の番号/.test(t) && /学年 3 → 1/.test(t) && /種目 3支部1年 100m → 100m/.test(t), t);
  doc.querySelector('[data-tgfix]').click(); await delay(400);
  const rs = T.all().filter(x => /^b/.test(x.id)).sort((a, b) => a.id < b.id ? -1 : 1).map(x => [x.team, x.grade, x.event]);
  assert.deepEqual(rs, [['架空', '1', '100m'], ['架空', '1', '100m'], ['架空', '1', '100m']]); assert(!doc.getElementById('tgFix'));
});
await check('新しく保存するときも同じ（所属・学年・種目名）', async () => {
  await T.putMany([{ id: 'n9', name: '架空 六郎', team: '架空・2', grade: '', event: '2支部中2 女子100m', mark: '13.3', date: '2026-06-01', meet: '架空記録会' }], T.scope()); await T.reload(T.scope());
  const r = T.all().find(x => x.name === '架空 六郎'); assert.deepEqual([r.team, r.grade, r.event], ['架空', '中2', '女子100m']);
});
console.log(`v026341_branch: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

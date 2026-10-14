// v0.26.34 所属に学年がついた「本郷・3」・中学/高校の決め方・種目の一覧の二重（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.34] 所属と学年・中学/高校・種目の一覧');
await check('「架空・3」「架空･2」「架空 3年」を所属と学年に分ける（学年が空のときだけ学年に。4以上の番号は学年にしない）', () => {
  assert.deepEqual([R.splitTeamGrade('架空・3', '').team, R.splitTeamGrade('架空・3', '').grade], ['架空', '3']);
  assert.deepEqual([R.splitTeamGrade('架空･2', '1').team, R.splitTeamGrade('架空･2', '1').grade], ['架空', '1']);
  assert.deepEqual([R.splitTeamGrade('架空 3年', '').team, R.splitTeamGrade('架空 3年', '').grade], ['架空', '3']);
  assert.equal(R.splitTeamGrade('架空・5', '').grade, ''); assert.equal(R.splitTeamGrade('架空・5', '').team, '架空');
  for (const t of ['江東・架空', '架空高', '架空中学校', '3・4']) assert.equal(R.splitTeamGrade(t, '').changed, false, t);
});
await check('読み取り（貼り付けの表）でも分ける：学年別の大会の「所属＝学校・学年」', () => {
  const r = R.parsePlain('架空記録会 2026年5月30日\n男子3年100m 決勝\n順位\t氏名\t所属\t記録\n1\t架空 一郎\t架空・3\t11.52\n', {});
  assert.equal(r.recs[0].team, '架空'); assert.equal(r.recs[0].grade, '3');
});
await check('同じ選手：「架空」「架空高」「架空高校」「架空・3」は同じ人（personKey）', () => {
  const k = t => R.personKey({ name: '架空 一郎', team: t }); assert.equal(new Set(['架空', '架空高', '架空高校', '架空・3'].map(k)).size, 1);
});
await check('中学/高校の決め方：学年の中/高 → 学校名 → 大会予定の区分 → 種目名。学年の数字だけでは決めない', () => {
  R.setDivisionHints({}); R.setMeetDivs({ '2026-04-18|架空春季': 'hs' });
  const d = r => R.divSource(r);
  assert.deepEqual(d({ team: '架空', grade: '3', event: '男子100m' }), { d: '', src: '' });
  assert.deepEqual(d({ team: '架空', grade: '高2', event: '男子中学100m' }), { d: 'hs', src: 'grade' });
  assert.deepEqual(d({ team: '架空高', grade: '3', event: '男子100m' }), { d: 'hs', src: 'team' });
  assert.deepEqual(d({ team: '架空', grade: '3', event: '男子100m', date: '2026-04-18', meet: '架空春季' }), { d: 'hs', src: 'meet' });
  assert.deepEqual(d({ team: '架空', event: '中学男子100m' }), { d: 'jh', src: 'event' });
  assert.equal(R.divisionOf({ id: 'x', team: '架空', grade: '3', event: '男子100m' }), '');
  R.setMeetDivs({});
});
await check('推測：去年まで中学の選手でも、記録の学年（3）が数えた学年と合わなければ中学にしない（高3を中3にしない）', () => {
  const recs = [
    { id: 'a1', name: '架空 一郎', team: '架空中', grade: '3', event: '男子100m', date: '2023-07-01' },
    { id: 'a2', name: '架空 一郎', team: '架空・3', grade: '', event: '男子100m', date: '2026-04-18' }
  ].map(r => { const x = R.splitTeamGrade(r.team, r.grade); return Object.assign(r, { team: x.team, grade: x.grade }); });
  const inf = R.inferDivisions(recs, {}); assert.equal(inf.hints.a2, undefined); R.setDivisionHints(inf.hints); assert.notEqual(R.divisionOf(recs[1]), 'jh');
  const ok = R.inferDivisions([{ id: 'b1', name: '見本 二郎', team: '架空中', grade: '1', event: '男子100m', date: '2025-07-01' }, { id: 'b2', name: '見本 二郎', team: '架空', grade: '2', event: '男子100m', date: '2026-05-01' }], {});
  assert.equal(ok.hints.b2, 'jh');   // 中1→次の年に2年：中学のまま
  const hs = R.inferDivisions([{ id: 'c1', name: '試験 三郎', team: '架空高', grade: '2', event: '男子100m', date: '2025-07-01' }, { id: 'c2', name: '試験 三郎', team: '架空', grade: '3', event: '男子100m', date: '2026-05-30' }], {});
  assert.equal(hs.hints.c2, 'hs');   // 高2→高3（学年別の大会の「・3」は高3）
  R.setDivisionHints({});
});
await check('ジュニアの大会を中学と決めつけない（大会予定の区分の推測）', () => { assert.equal(R.guessDiv('架空区ジュニア'), ''); assert.equal(R.guessDiv('架空中体連 支部大会'), '中学'); });
await check('種目の一覧：男女の書いていない記録があっても二重にならない・区分の見出しは1つずつ・110mJH は 110mH にまとめず、選手の区分（高校）のまま', () => {
  R.setDivisionHints({});
  const rows = [['男子100m', '架空高'], ['100m', '架空高'], ['男子200m', '架空高'], ['200m', '架空高'], ['男子110mH(1.067m)', '架空高'], ['110mJH', '架空高'], ['男子100m', '架空中'], ['共通男子100m', '架空中'], ['男子走幅跳', '架空高'], ['走幅跳', '架空高']]
    .map(([e, t], i) => ({ id: 'e' + i, name: '架空' + i, team: t, event: e, mark: '12.00', date: '2026-05-30' }));
  R.setGenderDefault(R.gendersIn(rows)[0]);
  const keys = [...new Set(rows.map(R.eventKey))], g = R.groupEvents(keys, rows, true);
  assert.deepEqual(g.map(x => x.group), ['中学', '高校']);
  const hsl = g[1].items.map(i => i.label); assert.equal(new Set(hsl).size, hsl.length, hsl.join(','));
  assert(hsl.includes('高校 110mJH') && hsl.some(l => /110mH\(1\.067m\)/.test(l)), hsl.join(','));
  assert.deepEqual(g[0].items.map(i => i.label), ['中学 100m']);
  R.setGenderDefault('');
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
await check('保存するときも分ける（新しく入れる記録）', async () => {
  await T.putMany([{ id: 'n1', name: '架空 四郎', team: '架空 2年', grade: '', event: '男子100m', mark: '12.30', date: '2026-06-01', meet: '架空記録会' }], T.scope()); await T.reload(T.scope());
  const r = T.all().find(x => x.name === '架空 四郎'); assert.deepEqual([r.team, r.grade], ['架空', '2']);
});
await check('保存済みの「架空・3」：要確認に件数と直し方を出し、「直す」で所属と学年を直す（何を変えたか出す）', async () => {
  const sc = T.scope(), db = await new Promise(ok => { const q = w.indexedDB.open(sc.dbName); q.onsuccess = () => ok(q.result); });
  const stn = db.objectStoreNames[0];
  await new Promise(ok => { const tx = db.transaction(stn, 'readwrite'), st = tx.objectStore(stn); for (const [i, t, g] of [[1, '架空・3', ''], [2, '架空・3', ''], [3, '架空･2', '2']]) st.put({ id: 'old' + i, name: '架空 五郎' + i, team: t, grade: g, event: '男子110mJH', mark: '16.51', date: '2026-05-30', meet: '架空学年別' }); tx.oncomplete = ok; });
  db.close(); await T.reload(sc); await delay(100);
  const box = doc.getElementById('tgFix'); assert(box, doc.getElementById('rbReview').textContent.slice(0, 200)); assert(/3件/.test(box.textContent) && /架空・3→架空（学年 3）/.test(box.textContent), box.textContent);
  doc.querySelector('[data-tgfix]').click(); await delay(400);
  const rs = T.all().filter(x => /^old/.test(x.id)).sort((a, b) => a.id < b.id ? -1 : 1).map(x => [x.id, x.team, x.grade, x.event]);
  assert.deepEqual(rs, [['old1', '架空', '3', '男子110mJH'], ['old2', '架空', '3', '男子110mJH'], ['old3', '架空', '2', '男子110mJH']]);
  const st = doc.getElementById('rbDataStatus').textContent; assert(/所属を直しました（3件）/.test(st) && /架空・3 → 架空・学年 3（2件）/.test(st), st);
  assert(!doc.getElementById('tgFix'));
});
console.log(`v02634_team_grade: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

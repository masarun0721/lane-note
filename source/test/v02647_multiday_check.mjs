// v0.26.47 複数日の大会：結果を取り込むとき、記録ごとに正しい日の日付（資料の日付の見出し → 大会準備のタイムテーブル → 要確認）。架空データのみ・本番に接続しない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.47] 複数日の大会の結果の日付');
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const K = '2026-10-24|架空新人大会';
const METS = { [K]: { plan: 1, date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' }, '2026-10-10|架空記録会': { plan: 1, date: '2026-10-10', meet: '架空記録会' } };
async function page(url, o = {}) {
  const d = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = m => { w.__alert = m; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = o.idb || new IDBFactory();
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-27T03:00:00Z"); }; })();');
  w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(o.mets || METS));
  if (o.snaps) await putSnaps(w, o.snaps);
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={mets:function(){return METS;},all:function(){return ALL;},add:function(b){addBatchIn(b,scope());},batches:function(){return batches;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = '架空第一高'; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  return w;
}
// 大会準備（index.html）が控える形：{ id: owner|key, owner, key, end, at, docs, snap: { st: { tt, ttName } } }
function putSnaps(w, snaps) {
  return new Promise((ok, ng) => { const q = w.indexedDB.open('lanenote-prep', 1); q.onupgradeneeded = () => q.result.createObjectStore('snap', { keyPath: 'id' }); q.onerror = () => ng(q.error);
    q.onsuccess = () => { const db = q.result, tx = db.transaction('snap', 'readwrite'); snaps.forEach(s => tx.objectStore('snap').put(Object.assign({ id: s.owner + '|' + s.key, at: 1, docs: {} }, s))); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => ng(tx.error); }; });
}
const TT = [{ event: '100m', gender: '男子', cat: '高校', round: '予選', date: '10/24', time: '10:00' }, { event: '100m', gender: '男子', cat: '高校', round: '決勝', date: '10/25', time: '14:00' },
  { event: '走幅跳', gender: '女子', round: '決勝', date: '10/25', time: '11:00' }, { event: '4×100mR', gender: '男子', round: '決勝', date: '10/25', time: '15:00' }];
const snap = (o = {}) => Object.assign({ owner: '|', key: K, end: '2026-10-25', snap: { v: 1, st: { tt: TT, ttName: '架空タイムテーブル.pdf' } } }, o);
const HEAD = '順位\tナンバー\t氏名\t所属\t記録\t風\n';
const T_DAYS = '架空新人大会 2026年10月24日\n1日目\n男子100m 予選 1組\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.52\t+1.0\n2日目\n男子100m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.40\t+0.5\n';
const T_PLAIN = '架空新人大会 2026年10月24日\n男子100m 予選 1組\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.52\t+1.0\n男子100m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.40\t+0.5\n女子400m 決勝\n' + HEAD + '2\t25\t見本 花子(1)\t架空第一高\t62.10\t\n';
async function paste(w, t) { const d = w.document; d.getElementById('rbPaste').value = t; d.getElementById('rbPasteGo').click(); await delay(250); }
const rows = w => [...w.document.querySelectorAll('.rb-days tr')].slice(1).map(tr => [tr.cells[0].textContent, tr.cells[1].textContent, tr.querySelector('input').value, tr.cells[4].textContent.replace(/\s+/g, ' ').trim()]);
async function save(w) { w.document.querySelector('#rbBatches [data-save]').click(); await delay(500); }
const recs = w => w.__t.all().filter(r => r.meet === '架空新人大会').map(r => [r.event, r.round, r.mark, r.date]).sort((a, b) => (a.join() > b.join() ? 1 : -1));
const IMPURL = 'https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent(K);

await check('資料の日付の見出し：「2日目」「10月11日」「2026年10月11日」は読む／期間・更新日時・2つの日付は読まない', () => {
  assert.equal(R.dayHead('2日目'), 'n:2'); assert.equal(R.dayHead('【第2日目】'), 'n:2'); assert.equal(R.dayHead('10月25日（日）'), 'md:10/25'); assert.equal(R.dayHead('2026年10月25日(日)'), 'd:2026-10-25');
  for (const s of ['期日 2026年10月24日(土)・25日(日)', '2026年10月24日～25日', '更新 2026/10/25 15:00', '第12回大会', '']) assert.equal(R.dayHead(s), '', s);
  const res = R.parsePlain(T_DAYS, {}); assert.deepEqual(res.recs.map(r => r.dday), ['n:1', 'n:2']);
});
await check('資料に日付の見出しがある：種目ごとに資料の日付（予選は1日目・決勝は2日目）、どこからかを表示 → 保存も正しい日付・件数は期間で数える', async () => {
  const w = await page(IMPURL); await paste(w, T_DAYS);
  assert.deepEqual(rows(w), [['男子100m', '予選', '2026-10-24', '資料'], ['男子100m', '決勝', '2026-10-25', '資料']]);
  assert(/複数日の大会（2026-10-24〜2026-10-25）/.test(w.document.querySelector('.rb-days').textContent));
  assert(!/日付要確認/.test(w.document.getElementById('rbBatches').textContent));
  await save(w);
  assert.deepEqual(recs(w), [['男子100m', '予選', '11.52', '2026-10-24'], ['男子100m', '決勝', '11.40', '2026-10-25']]);
  assert.equal(w.__t.mets()[K].importedN, 2);
  w.close();
});
await check('資料に日付がない：大会準備のタイムテーブル（この端末の控え）で合わせる。ない種目は開始日のまま「⚠ 日付要確認（複数日の大会）」→ 種目ごとに直して保存', async () => {
  const w = await page(IMPURL, { snaps: [snap()] }); await paste(w, T_PLAIN); await delay(200);
  const r = rows(w);
  assert.deepEqual(r.slice(0, 2), [['男子100m', '予選', '2026-10-24', 'タイムテーブル'], ['男子100m', '決勝', '2026-10-25', 'タイムテーブル']]);
  assert.equal(r[2][0], '女子400m'); assert.equal(r[2][2], '2026-10-24'); assert(/⚠ 日付要確認（複数日の大会）/.test(r[2][3]) && /タイムテーブルにこの種目が見つかりません/.test(r[2][3]), r[2][3]);
  const bt = w.document.getElementById('rbBatches').textContent; assert(/⚠ 日付要確認（複数日の大会）：1種目/.test(bt), bt); assert(/架空タイムテーブル\.pdf/.test(bt));
  const inp = w.document.querySelectorAll('.rb-days input')[2]; assert.equal(inp.min, '2026-10-24'); assert.equal(inp.max, '2026-10-25');
  inp.value = '2026-10-25'; inp.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(100);
  assert.deepEqual(rows(w)[2].slice(2), ['2026-10-25', '手入力']); assert(!/日付要確認/.test(w.document.getElementById('rbBatches').textContent));
  await save(w);
  assert.deepEqual(recs(w), [['女子400m', '決勝', '62.10', '2026-10-25'], ['男子100m', '予選', '11.52', '2026-10-24'], ['男子100m', '決勝', '11.40', '2026-10-25']]);
  w.close();
});
await check('資料の日付がタイムテーブルより先：資料が「2日目」ならタイムテーブル（1日目）より資料／開始日だけの表紙の日付は手がかりにしない', async () => {
  const w = await page(IMPURL, { snaps: [snap({ snap: { st: { tt: [{ event: '100m', gender: '男子', round: '予選', date: '10/24' }, { event: '100m', gender: '男子', round: '決勝', date: '10/24' }] } } })] });
  await paste(w, T_DAYS); await delay(200);
  assert.deepEqual(rows(w).map(x => x.slice(2)), [['2026-10-24', '資料'], ['2026-10-25', '資料']]);
  w.close();
  const w2 = await page(IMPURL, { snaps: [snap()] }); await paste(w2, '架空新人大会\n2026年10月24日\n男子100m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.40\t+0.5\n'); await delay(200);
  assert.deepEqual(rows(w2).map(x => x.slice(2)), [['2026-10-25', 'タイムテーブル']]);
  w2.close();
});
await check('ほかのアカウント・チームの控え、期限切れの控えは使わない（推測もしない → 要確認）', async () => {
  for (const s of [snap({ owner: 'uX|T9' }), snap({ end: '2026-08-01' })]) {
    const w = await page(IMPURL, { snaps: [s] }); await paste(w, T_PLAIN); await delay(200);
    assert(rows(w).every(x => x[2] === '2026-10-24' && /日付要確認/.test(x[3])), JSON.stringify(rows(w)));
    assert(/この端末には、この大会の大会準備のタイムテーブルがありません/.test(w.document.querySelector('.rb-days').textContent));
    w.close();
  }
});
await check('タイムテーブルの複数の日にある種目（ラウンドが分からない）は要確認', async () => {
  const w = await page(IMPURL, { snaps: [snap()] }); await paste(w, '架空新人大会\n男子100m\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.40\t+0.5\n'); await delay(200);
  const r = rows(w); assert.equal(r.length, 1); assert(/日付要確認/.test(r[0][3]) && /複数の日（10\/24・10\/25）/.test(r[0][3]), r[0][3]);
  w.close();
});
await check('単日の大会は今までどおり（複数日の表は出さない・資料の日付の見出しも使わない）', async () => {
  const w = await page('https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent('2026-10-10|架空記録会'));
  await paste(w, T_DAYS.replace(/架空新人大会/, '架空記録会')); assert(!w.document.querySelector('.rb-days'));
  await save(w); assert.deepEqual(w.__t.all().filter(r => r.meet === '架空記録会').map(r => r.date), ['2026-10-10', '2026-10-10']);
  w.close();
});
await check('取り込み直し：前に開始日で保存した同じ記録は、日付を直して置き換える（重ならない）→ もう一度でも重ならない → 「今の分を取り消す」で元に戻る', async () => {
  const idb = new IDBFactory();
  let w = await page(IMPURL, { idb }); await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await save(w);   // v0.26.46 までと同じ：全部開始日（タイムテーブルなし → 要確認で開始日）
  assert.deepEqual(recs(w).map(r => r[3]), ['2026-10-24', '2026-10-24']); w.close();
  w = await page(IMPURL, { idb, snaps: [snap()] }); await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await delay(200);
  assert(/前に保存した同じ記録（日付だけ違う）1件は、保存すると日付を直して置き換えます/.test(w.document.querySelector('.rb-days').textContent));
  await save(w);
  assert.deepEqual(recs(w), [['男子100m', '予選', '11.52', '2026-10-24'], ['男子100m', '決勝', '11.40', '2026-10-25']]);
  assert(/1件は、前に保存した同じ記録の日付を直しました/.test(w.document.getElementById('rbDone').textContent), w.document.getElementById('rbDone').textContent);
  w.document.querySelector('#rbDone [data-undo]').click(); await delay(500);
  assert.deepEqual(recs(w).map(r => r[3]), ['2026-10-24', '2026-10-24']);   // 取り消すと、置き換える前に戻る
  w.close();
  w = await page(IMPURL, { idb, snaps: [snap()] }); await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await save(w);
  await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await save(w);
  assert.deepEqual(recs(w), [['男子100m', '予選', '11.52', '2026-10-24'], ['男子100m', '決勝', '11.40', '2026-10-25']]);
  w.close();
});
await check('取り込み直しで日付が要確認なら、前に保存した（日付を直した）記録を残し、開始日の記録を重ねない', async () => {
  const idb = new IDBFactory();
  let w = await page(IMPURL, { idb, snaps: [snap()] }); await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await save(w); w.close();
  w = await page(IMPURL, { idb, snaps: [snap({ snap: { st: { tt: [] } } })] }); await paste(w, T_PLAIN.replace(/女子400m[\s\S]*$/, '')); await delay(200);   // 控えのタイムテーブルを空にした
  assert(/日付が要確認なので前の記録を残します/.test(w.document.querySelector('.rb-days').textContent));
  await save(w);
  assert.deepEqual(recs(w), [['男子100m', '予選', '11.52', '2026-10-24'], ['男子100m', '決勝', '11.40', '2026-10-25']]);
  w.close();
});
await check('リレーも同じ：タイムテーブルの日付で保存（走者の照合も期間内の記録から）', async () => {
  const w = await page(IMPURL, { snaps: [snap()] });
  const ind = R.parsePlain('架空新人大会\n2日目\n男子100m 決勝\n' + HEAD + '1\t11\t架空 一郎(2)\t架空第一高\t11.40\t+0.5\n', {});
  w.__t.add({ src: '架空リレー.pdf', kind: 'PDF', all: ind, meta: { name: '架空新人大会', date: '2026-10-24' },
    relays: [{ event: '男子4×100mR', round: '決勝', heat: '', rank: 1, lane: 4, team: '架空第一高', mark: '42.10', comment: '', runners: [{ bib: '11', name: '' }, { bib: '', name: '架空 二郎' }, { bib: '', name: '架空 三郎' }, { bib: '', name: '架空 四郎' }] }] });
  await delay(250);
  const r = rows(w); assert.deepEqual(r.map(x => [x[0], x[2], x[3]]), [['男子100m', '2026-10-25', '資料'], ['男子4×100mR', '2026-10-25', 'タイムテーブル']]);
  assert.equal(w.document.querySelector('[data-rll="0,0"]').value, '架空 一郎');
  await save(w);
  const rl = w.__t.all().filter(x => /4×100mR/.test(x.event)); assert.equal(rl.length, 1); assert.equal(rl[0].date, '2026-10-25'); assert.equal(rl[0].meet, '架空新人大会');
  w.close();
});
console.log(JSON.stringify({ passed: pass, failed: fail })); process.exit(fail ? 1 : 0);

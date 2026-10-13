// v0.26.28 大会予定をまとめて追加（CSV・貼り付け）：読み取り・見本・重複をとばす・保存・候補（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.28] 大会予定をまとめて追加');
await check('CSV：大会名・日付・終了日・会場・区分（中→中学・高→高校）。終了日・会場・区分は空でも可。見本（ひな形）も読める', () => {
  const r = R.parseMeetPlan('大会名,日付,終了日,会場,区分\n架空新人大会,2026/9/12,2026/9/13,架空競技場,高\n架空区秋季,2026-10-04,,,\n"架空記録会, 第2回",2026年11月3日,,見本公園,中\n').rows;
  assert.deepEqual(r.map(x => [x.meet, x.date, x.end, x.venue, x.div, x.err]), [['架空新人大会', '2026-09-12', '2026-09-13', '架空競技場', '高校', ''], ['架空区秋季', '2026-10-04', '', '', '', ''], ['架空記録会, 第2回', '2026-11-03', '', '見本公園', '中学', '']]);
  assert.equal(r[0].key, '2026-09-12|架空新人大会');
  assert(R.parseMeetPlan(R.PLAN_TEMPLATE).rows.every(x => !x.err));
});
await check('見出しの順番が違っても・列が少なくても読む。日付の「2026/5/3〜5/5」は終了日に。タブ区切り（Excelから貼り付け）も', () => {
  const r = R.parseMeetPlan('日付\t大会名\n2026/5/3〜5/5\t架空都大会\n2026/6/1〜2\t架空支部大会').rows;
  assert.deepEqual(r.map(x => [x.meet, x.date, x.end]), [['架空都大会', '2026-05-03', '2026-05-05'], ['架空支部大会', '2026-06-01', '2026-06-02']]);
});
await check('読めない行は理由つき（日付・区分・終了日が前）。見出しが無いときは説明', () => {
  const r = R.parseMeetPlan('大会名,日付,終了日,区分\n架空A,2026/13/1,,\n架空B,2026/5/3,2026/5/1,\n架空C,2026/5/3,,大\n,2026/5/3,,').rows;
  assert.deepEqual(r.map(x => x.err), ['日付が読めません（「2026/13/1」）', '終了日が日付より前です', '区分は「中」か「高」（空でも可）', '大会名がありません']);
  assert(/大会名」「日付/.test(R.parseMeetPlan('名前,タイム\na,1').err));
});
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
let dl = null; w.URL.createObjectURL = b => { dl = b; return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = function () { dl.name = this.download; };
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,mets:function(){return METS;},saveMeet:saveMeet};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document, $ = id => doc.getElementById(id);
await T.putMany([{ id: 'a1', name: '架空 一郎', team: '架空中', event: '男子100m', mark: '11.50', date: '2026-09-20', meet: '架空記録会' }], T.scope()); await T.reload(T.scope()); await delay();
await check('ひな形をダウンロード（UTF-8・BOM つき・ファイル名）', async () => {
  $('rpTemplate').click(); assert.equal(dl.name, '大会予定_ひな形.csv'); const t = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await dl.arrayBuffer()); assert(t.startsWith('\ufeff大会名,日付,終了日,会場,区分\n'), t);
});
const CSV = '大会名,日付,終了日,会場,区分\n架空新人大会,2026/9/12,2026/9/13,架空競技場,高\n架空記録会,2026/9/20,,,中\n架空新人大会,2026/9/12,,,高\n架空区秋季,2026/10/4,,見本公園,中\n架空X,2026/2/30,,,\n';
await check('見本：追加・記録がある大会・表の中の重複・読めない を分けて数える', async () => {
  $('rpPaste').value = CSV; $('rpRead').click(); await delay();
  assert(/追加 2件・登録済み 0件・記録がある大会 1件・表の中の重複 1件・読めない 1件/.test(doc.querySelector('.rpcount').textContent), doc.querySelector('.rpcount').textContent);
  assert.equal(doc.querySelectorAll('.rp-new').length, 2); assert(/9-13|〜09-13/.test(doc.querySelector('.rp-new').textContent));
  assert(/大会予定を追加（2件）/.test($('rpSave').textContent));
});
await check('追加：大会の印（会場・終了日・区分・予定）に入り、これからの大会と大会名の候補に出る', async () => {
  $('rpSave').click(); await delay(200);
  const m = T.mets()['2026-09-12|架空新人大会']; assert.deepEqual([m.meet, m.date, m.end, m.venue, m.div, m.plan], ['架空新人大会', '2026-09-12', '2026-09-13', '架空競技場', '高校', true]);
  assert(/2件 追加しました/.test($('rpStatus').textContent));
  assert([...doc.querySelectorAll('#rmMeets option')].some(o => o.value === '架空区秋季'));
});
await check('同じCSVをもう一度：全部「登録済み」などでとばす（追加0件）', async () => {
  $('rpPaste').value = CSV; $('rpRead').click(); await delay();
  const ct = doc.querySelector('.rpcount').textContent; assert(/追加 0件・登録済み 3件・記録がある大会 1件/.test(ct), ct); assert($('rpSave').disabled);
});
await check('天気を入れても、会場・終了日・区分は消えない', async () => {
  await T.saveMeet('2026-09-12|架空新人大会', { weather: '晴', temp: '20', humidity: '' }, T.scope());
  const m = T.mets()['2026-09-12|架空新人大会']; assert.deepEqual([m.weather, m.venue, m.end, m.div, m.plan], ['晴', '架空競技場', '2026-09-13', '高校', true]);
});
await check('1件ずつ入力：予定の大会名を選ぶと、空の日付に入る', async () => {
  $('rmDate').value = ''; $('rmMeet').value = '架空区秋季'; $('rmMeet').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal($('rmDate').value, '2026-10-04');
});
console.log(`v0.26.28 大会予定 ${pass} ok / ${fail} NG`); if (fail) process.exit(1);

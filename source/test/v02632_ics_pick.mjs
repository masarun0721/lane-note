// v0.26.32 カレンダーの取り込み：大会らしいものだけチェック・大会らしいものだけ表示・（会場）を会場に・選んだことをこの端末で覚える・CSV もチェック（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.32] カレンダーの取り込み：大会らしいものを選ぶ');
await check('見分け：大会らしい／大会ではなさそう／大会か不明（会場の手がかり・登録済みの会場・覚えたこと）', () => {
  const c = (t, v, o) => R.meetClass(t, v || '', o);
  for (const t of ['架空区ジュニア', '駅伝', '支部秋季', '架空記録会', '都大会', 'インハイ予選', '架空新人戦', '架空通信陸上']) assert.equal(c(t), 'meet', t);
  for (const t of ['監督会議', '部活', '部活(終了後)', '終了後', '練習', '休み', 'オフ', '清掃', '保護者会', '面談', '活動なし', '自主練', '朝練', '公園清掃']) assert.equal(c(t), 'not', t);
  assert.equal(c('架空カップ'), 'unk'); assert.equal(c('架空カップ', '架空競技場'), 'meet'); assert.equal(c('架空カップ(駒沢)'), 'meet');
  assert.equal(c('架空カップ', '見本運動場'), 'unk'); assert.equal(c('架空カップ', '見本運動場', { venues: ['見本運動場'] }), 'meet');
  assert.equal(c('架空カップ', '', { learn: { inc: { '架空カップ': 1 } } }), 'meet'); assert.equal(c('第3回 架空記録会', '', { learn: { exc: { '架空記録会': 1 } } }), 'not');
});
await check('（会場）：場所が空なら会場にして名前から外す・会場でないもの（終了後・中止など）はそのまま', () => {
  assert.deepEqual(R.splitVenue('江東区ジュニア (夢の島)'), { meet: '江東区ジュニア', venue: '夢の島' });
  assert.deepEqual(R.splitVenue('駅伝(味スタ)'), { meet: '駅伝', venue: '味スタ' });
  for (const t of ['部活(終了後)', '都大会(中止)', '記録会（予定）', '架空大会(2日目)']) assert.equal(R.splitVenue(t).venue, '', t);
});
const ev = (d, t, loc) => ['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:' + d, 'SUMMARY:' + t].concat(loc ? ['LOCATION:' + loc] : []).concat(['END:VEVENT']);
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:架空高校陸上競技部'].concat(
  ev('20261016', '監督会議'), ev('20261017', '部活'), ev('20261017', '部活(終了後)'), ev('20261018', '終了後'), ev('20261019', '部活'),
  ev('20261024', '江東区ジュニア (夢の島)'), ev('20261101', '駅伝(味スタ)'), ev('20261103', '支部秋季(夢の島)', '架空競技場'), ev('20261107', '架空カップ'), ev('20261108', '保護者会'),
  ['END:VCALENDAR', '']).join('\r\n');
await check('iCal：（会場）は場所が空のときだけ会場に（場所があれば名前はそのまま）', () => {
  const r = R.parseIcs(ICS).rows, f = t => r.find(x => x.title === t);
  assert.deepEqual([f('江東区ジュニア (夢の島)').meet, f('江東区ジュニア (夢の島)').venue], ['江東区ジュニア', '夢の島']);
  assert.deepEqual([f('支部秋季(夢の島)').meet, f('支部秋季(夢の島)').venue], ['支部秋季(夢の島)', '架空競技場']);
});
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
async function page(ls) {
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/schedule.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
  for (const [k, v] of Object.entries(ls || {})) w.localStorage.setItem(k, v);
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js']) w.eval(src(s));
  w.eval(src('records_app.js').replace(tail, 'window.__t={mets:function(){return METS;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  return w;
}
const w = await page(), doc = w.document;
const rows = () => [...doc.querySelectorAll('#rpPreview tr.rp-new')].map(tr => [tr.children[2].textContent, tr.querySelector('[data-rpon]').checked, tr.querySelector('.rp-cls').textContent]);
const save = () => doc.getElementById('rpSave');
doc.getElementById('rpPaste').value = ICS; doc.getElementById('rpRead').click(); await delay();
await check('最初：大会らしいものはチェック・大会か不明はチェックなしで表示・大会ではなさそうは隠す・ボタンの件数はチェックの数', () => {
  assert.deepEqual(rows(), [['江東区ジュニア', true, '大会らしい'], ['駅伝', true, '大会らしい'], ['支部秋季(夢の島)', true, '大会らしい'], ['架空カップ', false, '大会か不明']]);
  assert.equal(save().textContent, '大会予定を追加（3件）'); assert(doc.getElementById('rpOnly').checked); assert(/6件は隠しています/.test(doc.getElementById('rpPreview').textContent));
  assert.equal(doc.querySelectorAll('#rpPreview tr.rp-new')[0].children[3].textContent, '夢の島');
});
const tick = (name, on) => { const tr = [...doc.querySelectorAll('#rpPreview tr.rp-new')].find(t => t.children[2].textContent === name); const c = tr.querySelector('[data-rpon]'); c.checked = on; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
await check('「大会らしいものだけ表示」を外すと全部出る（大会ではなさそうはチェックなし）・チェックで件数が変わる', async () => {
  const o = doc.getElementById('rpOnly'); o.checked = false; o.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.equal(rows().length, 10); assert(rows().filter(r => r[2] === '大会ではなさそう').every(r => !r[1]));
  tick('架空カップ', true); await delay(); assert.equal(save().textContent, '大会予定を追加（4件）');
  tick('駅伝', false); await delay(); assert.equal(save().textContent, '大会予定を追加（3件）');
});
await check('言葉・期間でしぼるのはそのまま（チェックも残る）', async () => {
  const f = doc.getElementById('rpFrom'); f.value = '2026-11-01'; f.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.deepEqual(rows().map(r => r[0]), ['駅伝', '支部秋季(夢の島)', '架空カップ', '保護者会']); assert.equal(save().textContent, '大会予定を追加（2件）');
  const g = doc.getElementById('rpFrom'); g.value = '2026-10-14'; g.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
});
await check('追加はチェックしたものだけ・選んだこと（入れた／外した）はこの端末だけに覚える', async () => {
  save().click(); await delay(300);
  assert.deepEqual(Object.keys(w.__t.mets()).sort(), ['2026-10-24|江東区ジュニア', '2026-11-03|支部秋季(夢の島)', '2026-11-07|架空カップ']);
  assert.equal(w.__t.mets()['2026-10-24|江東区ジュニア'].venue, '夢の島');
  const L = JSON.parse(w.localStorage.getItem('lanenote.planlearn.v1')); assert.deepEqual([Object.keys(L.inc), Object.keys(L.exc)], [['架空カップ'], ['駅伝']]);
  assert(!/planlearn/.test(src('records_app.js').match(/function saveMeet[\s\S]*?\n  \}/)[0]));
});
await check('次の取り込み：覚えたことで見分けが変わる（架空カップ＝大会らしい、駅伝＝大会ではなさそう）', async () => {
  const w2 = await page({ 'lanenote.planlearn.v1': w.localStorage.getItem('lanenote.planlearn.v1') }), d2 = w2.document;
  d2.getElementById('rpPaste').value = ICS; d2.getElementById('rpRead').click(); await delay();
  const r = [...d2.querySelectorAll('#rpPreview tr.rp-new')].map(tr => [tr.children[2].textContent, tr.querySelector('[data-rpon]').checked]);
  assert.deepEqual(r.find(x => x[0] === '架空カップ'), ['架空カップ', true]); assert(!r.find(x => x[0] === '駅伝'));
});
await check('CSV：全部チェック済みで、外したものは追加しない（見分けの印・表示の切りかえは出さない）', async () => {
  const w3 = await page(), d3 = w3.document;
  d3.getElementById('rpPaste').value = '大会名,日付\n架空記録会,2026-10-20\n架空練習会,2026-10-21\n架空大会,2026-10-22\n'; d3.getElementById('rpRead').click(); await delay();
  assert.equal(d3.getElementById('rpSave').textContent, '大会予定を追加（3件）'); assert(!d3.getElementById('rpOnly')); assert(!d3.querySelector('#rpPreview .rp-cls'));
  const c = d3.querySelectorAll('#rpPreview [data-rpon]')[1]; c.checked = false; c.dispatchEvent(new w3.Event('change', { bubbles: true })); await delay();
  d3.getElementById('rpSave').click(); await delay(300);
  assert.deepEqual(Object.keys(w3.__t.mets()).sort(), ['2026-10-20|架空記録会', '2026-10-22|架空大会']); assert.equal(w3.localStorage.getItem('lanenote.planlearn.v1'), null);
});
console.log(`v02632_ics_pick: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

// v0.26.29 大会予定：今後の大会（一覧・カレンダー・締切・直す／消す）と、大会準備の「大会予定から選ぶ」（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), P = req('../src/plans.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.29] 大会予定：今後の大会・大会準備');
const TD = '2026-10-14';
await check('残り日数・開催中・終了・日付の書き方・締切', () => {
  assert.equal(P.leftLabel({ date: '2026-10-24' }, TD), 'あと10日'); assert.equal(P.leftLabel({ date: TD }, TD), '今日');
  assert.equal(P.leftLabel({ date: '2026-10-13', end: '2026-10-15' }, TD), '開催中'); assert.equal(P.leftLabel({ date: '2026-10-01' }, TD), '終了');
  assert.equal(P.jpRange({ date: '2026-10-24', end: '2026-10-25' }), '2026年10月24日（土）〜25日（日）'); assert.equal(P.jp('2026-11-03'), '2026年11月3日（火）');
  assert.equal(P.deadlineLabel({ deadline: '2026-10-20' }, TD), 'エントリー締切 10/20（火）（あと6日）'); assert(/過ぎました/.test(P.deadlineLabel({ deadline: '2026-10-01' }, TD)));
  assert.deepEqual(P.upcoming([{ date: '2026-11-01', meet: 'B' }, { date: '2026-10-01', meet: 'X' }, { date: '2026-10-20', meet: 'A' }, { date: '2026-10-13', end: '2026-10-14', meet: 'C' }], TD).map(p => p.meet), ['C', 'A', 'B']);
});
await check('1か月のカレンダー：曜日の位置・大会の日（2日間は両方）・締切・今日', () => {
  const h = P.monthHtml([{ date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', deadline: '2026-10-09' }], '2026-10', TD);
  const d = new JSDOM('<div>' + h + '</div>').window.document, td = [...d.querySelectorAll('td')];
  assert.equal(td.slice(0, 4).every(t => !t.textContent), true); assert.equal(td[4].querySelector('b').textContent, '1');   // 2026/10/1 は木曜
  const cell = n => td.find(t => t.querySelector('b') && t.querySelector('b').textContent === String(n));
  assert(cell(24).classList.contains('meet') && cell(25).classList.contains('meet') && !cell(26).classList.contains('meet'));
  assert(/締切/.test(cell(9).textContent)); assert(cell(14).classList.contains('today'));
  assert.equal(P.addMonth('2026-12', 1), '2027-01'); assert.equal(P.addMonth('2026-01', -1), '2025-12');
});
await check('CSV の「締切」列（省略可。「8/28」のような月日は大会の年、大会より後なら前の年）', () => {
  const r = R.parseMeetPlan('大会名,日付,締切\n架空A,2026/9/12,2026/8/28\n架空B,2027/1/10,12/20\n架空C,2026/10/4,\n架空D,2026/10/4,あした').rows;
  assert.deepEqual(r.map(x => [x.deadline, x.err]), [['2026-08-28', ''], ['2026-12-20', ''], ['', ''], ['', '締切が読めません（「あした」）']]);
});
// 記録のページ
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
w.eval('Date.now = (function (n) { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,mets:function(){return METS;}};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document, $ = id => doc.getElementById(id);
await check('予定がないとき：今後の大会に案内', () => { assert(!$('lpHome').hidden); assert(/まだありません/.test($('lpHome').textContent)); });
$('rpPaste').value = '大会名,日付,終了日,会場,区分,締切\n架空新人大会,2026/10/24,2026/10/25,架空競技場,高,2026/10/9\n架空区秋季,2026/11/3,,見本公園,中,10/20\n架空春季,2026/4/5,,,中,\n'; $('rpRead').click(); await delay(); $('rpSave').click(); await delay(300);
await check('今後の大会：近い順・残り日数・会場・区分・締切（過ぎた／あと何日）。終わった予定は別', () => {
  const li = [...$('lpHome').querySelectorAll('.lp-list > li')].filter(l => !l.closest('details'));
  assert.deepEqual(li.map(l => l.querySelector('.lp-left').textContent), ['あと10日', 'あと20日']);
  assert(/架空新人大会/.test(li[0].textContent) && /10\/24（土）〜10\/25（日）/.test(li[0].textContent) && /架空競技場/.test(li[0].textContent) && /高校/.test(li[0].textContent) && /過ぎました/.test(li[0].textContent));
  assert(/エントリー締切 10\/20（火）（あと6日）/.test(li[1].textContent));
  assert(/終わった予定 1件/.test($('lpHome').querySelector('details summary').textContent));
});
await check('カレンダー：今月（予定のある月）・前後の月へ', async () => {
  assert(/2026年10月/.test($('lpHome').querySelector('.lp-nav').textContent)); assert.equal($('lpHome').querySelectorAll('td.meet').length, 2);
  $('lpHome').querySelector('[data-lpm="1"]').click(); await delay(); assert(/2026年11月/.test($('lpHome').querySelector('.lp-nav').textContent)); assert.equal($('lpHome').querySelectorAll('td.meet').length, 1);
});
await check('この端末に写す（名前・日付・会場・区分・締切だけ）', () => {
  const c = JSON.parse(w.localStorage.getItem('lanenote.plans.v1')); assert.equal(c.list.length, 3);
  assert.deepEqual(Object.keys(c.list.find(p => p.meet === '架空新人大会')).sort(), ['date', 'deadline', 'div', 'end', 'meet', 'venue']);
});
await check('1件を直す：大会名・日付を変えると前の予定は消えて新しい予定になる（締切を消す）', async () => {
  $('lpHome').querySelector('[data-lpedit="2026-11-03|架空区秋季"]').click(); await delay();
  const f = k => $('lpHome').querySelector('[data-lpf="' + k + '"]');
  f('meet').value = '架空区秋季大会'; f('date').value = '2026-11-08'; f('deadline').value = ''; f('venue').value = '架空第二競技場';
  $('lpHome').querySelector('[data-lpsave]').click(); await delay(200);
  const M = T.mets(); assert(!M['2026-11-03|架空区秋季']); const m = M['2026-11-08|架空区秋季大会'];
  assert.deepEqual([m.venue, m.div, m.deadline, m.plan], ['架空第二競技場', '中学', undefined, true]);
  assert(/架空区秋季大会/.test($('lpHome').textContent) && /あと25日/.test($('lpHome').textContent));
});
await check('直すとき：大会名が空ならエラー', async () => {
  $('lpHome').querySelector('[data-lpedit="2026-11-08|架空区秋季大会"]').click(); await delay();
  $('lpHome').querySelector('[data-lpf="meet"]').value = ''; $('lpHome').querySelector('[data-lpsave]').click(); await delay();
  assert(/大会名を入れてください/.test($('lpStatus').textContent)); $('lpHome').querySelector('[data-lpcancel]').click(); await delay();
});
await check('1件を消す：記録も天気もない予定は消える。天気を入れた大会は、予定の印だけ外す', async () => {
  $('lpHome').querySelector('[data-lpdel="2026-11-08|架空区秋季大会"]').click(); await delay(200);
  assert(!T.mets()['2026-11-08|架空区秋季大会']);
  T.mets()['2026-10-24|架空新人大会'].weather = '晴';
  $('lpHome').querySelector('[data-lpdel="2026-10-24|架空新人大会"]').click(); await delay(200);
  const m = T.mets()['2026-10-24|架空新人大会']; assert.equal(m.weather, '晴'); assert(!m.plan && !m.venue);
  assert(/まだありません/.test($('lpHome').textContent));
});
// 大会準備のページ
const h2 = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d2 = new JSDOM(h2, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const v = d2.window; v.confirm = () => true; v.alert = () => {}; v.scrollTo = () => {}; v.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(v, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob }); v.fetch = () => Promise.reject(new Error('no network')); v.indexedDB = new IDBFactory();
v.eval('Date.now = (function () { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, list: [{ date: '2026-11-03', meet: '架空区秋季', venue: '見本公園', div: '中学', deadline: '2026-10-20' }, { date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場', div: '高校' }, { date: '2026-09-01', meet: '架空夏季' }] }));
for (const s of ['parser.js', 'logic.js', 'player.js', 'personal.js', 'auth_common.js', 'plans.js', 'app.js']) v.eval(src(s));
v.document.dispatchEvent(new v.Event('DOMContentLoaded')); await delay(200);
const sel = v.document.getElementById('planPick');
await check('大会準備：大会予定から選ぶ（これからの大会が先・近い順、終わった大会はあと）', () => {
  assert(!sel.hidden); const g = [...sel.querySelectorAll('optgroup')];
  assert.equal(g[0].label, 'これからの大会'); assert.deepEqual([...g[0].querySelectorAll('option')].map(o => o.value), ['2026-10-24|架空新人大会', '2026-11-03|架空区秋季']);
  assert(/10\/24（土）〜10\/25（日） 架空新人大会（架空競技場）・あと10日/.test(g[0].textContent)); assert.equal(g[1].label, '終わった大会');
});
await check('選ぶと大会名・日付（2日間）・会場の表示が入る', () => {
  sel.value = '2026-10-24|架空新人大会'; sel.dispatchEvent(new v.Event('change'));
  const D = v.document; assert.equal(D.getElementById('meetName').value, '架空新人大会'); assert.equal(D.getElementById('meetDate').value, '2026年10月24日（土）〜25日（日）');
  assert(/会場：架空競技場/.test(D.getElementById('planPicked').textContent)); assert.equal(sel.value, '');
  sel.value = '2026-11-03|架空区秋季'; sel.dispatchEvent(new v.Event('change'));
  assert.equal(D.getElementById('meetDate').value, '2026年11月3日（火）'); assert(/エントリー締切 10\/20/.test(D.getElementById('planPicked').textContent));
});
console.log(`v0.26.29 大会予定 ${pass} ok / ${fail} NG`); if (fail) process.exit(1);

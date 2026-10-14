// v0.26.30 選手のページの「これからの大会」・Google カレンダー（iCal）から大会予定・端末の写しはアカウントごと（A01）・中継の text/calendar（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), ROOT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), P = req('../src/plans.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.30] これからの大会（選手）・カレンダーから・A01・中継');
const TD = '2026-10-14';
const PL = [{ date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場', div: '高校', deadline: '2026-10-09' }, { date: '2026-09-01', meet: '架空夏季' }, { date: '2026-11-03', meet: '架空区秋季', venue: '見本公園' }];
await check('リンクに入れる予定：これからの大会だけ・[日付, 終了日, 大会名, 会場]（区分・締切・選手の情報は入れない）・20件まで', () => {
  assert.deepEqual(P.toSc(PL, TD), [['2026-10-24', '2026-10-25', '架空新人大会', '架空競技場'], ['2026-11-03', '', '架空区秋季', '見本公園']]);
  const many = Array.from({ length: 30 }, (_, i) => ({ date: '2026-12-' + String(i + 1).padStart(2, '0'), meet: '架空' + i })).slice(0, 30).filter(p => /\d{4}-\d{2}-\d{2}/.test(p.date) && +p.date.slice(8) <= 31);
  assert.equal(P.toSc(many, TD).length, 20);
});
await check('受け取った予定の検査：形が違えば読まない・長すぎる文字は切る・日付の形でないものは捨てる・21件目以降は捨てる', () => {
  assert.throws(() => P.fromSc('x')); assert.throws(() => P.fromSc([{ a: 1 }]));
  assert.deepEqual(P.fromSc([['2026-10-24', '', '架空' + 'あ'.repeat(200), 5], ['いつか', '', '架空B', ''], ['2026-10-30', '2026-10-29', '架空C', '<b>x</b>']]).map(p => [p.date, p.end, p.meet.length, p.venue]), [['2026-10-24', undefined, 100, undefined], ['2026-10-30', undefined, 3, '<b>x</b>']]);
  assert.equal(P.fromSc(Array.from({ length: 40 }, () => ['2026-10-24', '', 'A', ''])).length, 20);
  assert(!/<b>架空/.test(P.scHtml(P.fromSc([['2026-10-30', '', '<b>架空</b>', '']]), TD)));
});
await check('A01：端末の写しは、写したアカウントのときだけ使う（ほかのアカウント・ログインなしでは出さない）', () => {
  const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  P.save(PL, 'uidA'); assert.equal(P.load('uidA').length, 3); assert.equal(P.load('uidB').length, 0); assert.equal(P.load('').length, 0);
  P.save(PL, ''); assert.equal(P.load('').length, 3); assert.equal(P.load('uidA').length, 0);
  store['lanenote.plans.v1'] = JSON.stringify({ at: 1, list: PL }); assert.equal(P.load('uidA').length, 0); assert.equal(P.load(null).length, 3);   // 前の版の写し（アカウントなし）はログインなしの扱い
  delete global.localStorage;
});
// iCal
const enc = s => new TextEncoder().encode(s);
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:架空陸上部', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261024', 'DTEND;VALUE=DATE:20261026', 'SUMMARY:架空高校新人大会 支部予選', 'LOCATION:架空競技場\\, 架空区1-2-3', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:通知', 'END:VALARM', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261102T230000Z', 'DTEND:20261103T080000Z', 'SUMMARY:架空区中学校秋季陸上競技大会', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Asia/Tokyo:20261108T090000', 'DTEND;TZID=Asia/Tokyo:20261108T170000', 'SUMMARY:部活の保護者会', 'LOCATION:架空高校', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261115', 'DTEND;VALUE=DATE:20261116', 'SUMMARY:架空記録会（中止）', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260905', 'DTEND;VALUE=DATE:20260906', 'SUMMARY:架空夏季記録会', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
// 日本語の途中（3バイト文字の真ん中）で 75 バイトごとに折り返す（Google の書き出しと同じ）
const fold = s => { const b = enc(s), out = []; for (const line of s.split('\r\n')) { const lb = enc(line); for (let i = 0; i < lb.length; i += 74) { if (i) out.push(13, 10, 32); out.push(...lb.slice(i, i + 74)); } out.push(13, 10); } return new Uint8Array(out); };
await check('iCal：名前・日付・会場・2日間（終日の DTEND は次の日）・UTC の時刻は日本の日付・中止は入れない・通知の中身は読まない・区分の推測', () => {
  const r = R.parseIcs(R.icsBytesToText(fold(ICS)));
  assert.equal(r.cal, '架空陸上部');
  assert.deepEqual(r.rows.map(x => [x.meet, x.date, x.end, x.venue, x.div]), [['架空夏季記録会', '2026-09-05', '', '', ''], ['架空高校新人大会 支部予選', '2026-10-24', '2026-10-25', '架空競技場, 架空区1-2-3', '高校'], ['架空区中学校秋季陸上競技大会', '2026-11-03', '', '', '中学'], ['部活の保護者会', '2026-11-08', '', '架空高校', '']]);
  assert(!/\ufffd/.test(JSON.stringify(r.rows)), '折り返しで文字化けしない');
  assert.equal(R.parseIcs('こんにちは').err, 'カレンダー（iCal）の形ではありません');
  assert.deepEqual(['架空中体連 支部大会', '都高体連 新人戦', '架空ジュニア陸上', '架空記録会'].map(R.guessDiv), ['中学', '高校', '', '']);
});
// 記録のページ
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.indexedDB = new IDBFactory();
let fetched = []; w.fetch = async (u) => { fetched.push(String(u)); return new Response(fold(ICS), { headers: { 'Content-Type': 'application/octet-stream', 'X-Lane-Type': 'text/calendar; charset=UTF-8' } }); };
w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'personal.js', 'plans.js', 'urlload.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,mets:function(){return METS;},pp:ppPayload,ALL:function(){return ALL;}};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document, $ = id => doc.getElementById(id);
await check('Google カレンダーの読み方の説明（iCal 形式の公開URL／非公開URL・エクスポート）がある', () => {
  const t = $('rbPlanBox').textContent; assert(/設定と共有/.test(t) && /iCal 形式の公開URL/.test(t) && /iCal 形式の非公開URL/.test(t) && /エクスポート/.test(t) && /保存しません/.test(t));
});
await check('カレンダーのアドレス（webcal:// も）→ 中継を通して読み、今日から先の予定を見本に出す', async () => {
  $('rpIcsUrl').value = 'webcal://calendar.google.com/calendar/ical/kakuu%40example.invalid/public/basic.ics'; $('rpIcsGo').click(); await delay(200);
  assert.equal(fetched.length, 1); assert(fetched[0].includes(encodeURIComponent('https://calendar.google.com/calendar/ical/')), fetched[0]);
  const c = doc.querySelector('.rpcount').textContent; assert(/追加できる 3件/.test(c), c);
  assert(/架空陸上部/.test($('rpPreview').textContent) && /対象外 1件/.test($('rpPreview').textContent));
  assert(!/架空夏季記録会/.test(doc.querySelector('.rpt').textContent));
});
await check('しぼる：言葉（「大会」）で保護者会を外す・期間', async () => {
  const kw = $('rpKw'); kw.value = '大会 記録会'; kw.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/追加できる 2件/.test(doc.querySelector('.rpcount').textContent)); assert(!/保護者会/.test(doc.querySelector('.rpt').textContent));
  const to = $('rpTo'); to.value = '2026-10-31'; to.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/追加できる 1件/.test(doc.querySelector('.rpcount').textContent));
  const to2 = $('rpTo'); to2.value = ''; to2.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/追加できる 2件/.test(doc.querySelector('.rpcount').textContent));
});
await check('追加（区分は推測のまま）→ もう一度読むと登録済みでとばす', async () => {
  $('rpSave').click(); await delay(300);
  const m = T.mets()['2026-10-24|架空高校新人大会 支部予選']; assert.deepEqual([m.end, m.venue, m.div, m.plan], ['2026-10-25', '架空競技場, 架空区1-2-3', '高校', true]);
  $('rpIcsGo').click(); await delay(200); $('rpKw').value = '大会'; $('rpKw').dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/追加できる 0件（チェック \d+件）・登録済み 2件/.test(doc.querySelector('.rpcount').textContent), doc.querySelector('.rpcount').textContent);
});
await check('.ics ファイルを選んでも読める（折り返しのある日本語）', async () => {
  const f = new w.File([fold(ICS)], 'kakuu.ics', { type: 'text/calendar' }), inp = $('rpFile');
  Object.defineProperty(inp, 'files', { value: [f], configurable: true }); inp.dispatchEvent(new w.Event('change')); await delay(200);
  assert(/架空陸上部/.test($('rpPreview').textContent)); assert(!/\ufffd/.test($('rpPreview').textContent));
});
await check('中継が text/calendar を通さない（古い中継）とき：理由と、.ics ファイルで入れる方法を出す', async () => {
  w.fetch = async () => new Response('unsupported type', { status: 415 }); $('rpIcsGo').click(); await delay(200);
  assert(/中継の更新が必要/.test($('rpStatus').textContent) && /\.ics ファイル/.test($('rpStatus').textContent), $('rpStatus').textContent);
});
await check('端末の写しにアカウントを付ける（ログインなしは空）', () => { const c = JSON.parse(w.localStorage.getItem('lanenote.plans.v1')); assert.equal(c.uid, ''); assert.equal(c.list.length, 2); });
await check('個人ページのリンク：これからの大会（名前・日付・会場だけ）が入る', async () => {
  await T.putMany([{ id: 'r1', name: '架空 一郎', team: '架空高', event: '男子100m', mark: '11.50', date: '2026-09-20', meet: '架空記録会', grade: '2' }], T.scope()); await T.reload(T.scope()); await delay();
  const o = T.pp(w.ResultParser.athleteKey(T.ALL()[0])); assert.deepEqual(JSON.parse(JSON.stringify(o.sc)), [['2026-10-24', '2026-10-25', '架空高校新人大会 支部予選', '架空競技場, 架空区1-2-3'], ['2026-11-03', '', '架空区中学校秋季陸上競技大会', '']]);
  const back = w.LanePersonal.sanitize(JSON.parse(JSON.stringify(o))); assert.equal(back.sc.length, 2);
  const box = doc.createElement('div'); w.LanePersonal.render(back, box, {}); assert(/これからの大会/.test(box.textContent) && /あと10日/.test(box.textContent) && /架空競技場/.test(box.textContent));
});
// 選手のホーム（リンクを開いたスマホ）
const [MB, MP] = (() => { const t = src('mode_pick.html'), i = t.indexOf('\n'); return [t.slice(0, i), t.slice(i + 1)]; })();
const tpl = src('template.html').replace('__TOPBAR__', MB).replace('__MODEBTN__', MB).replace('__MODEPICK__', MP).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_0-9]+__/g, '');
const Pq = o => encodeURIComponent(JSON.stringify(o));
const meet = { v: 1, k: 'p', n: '架空記録会', d: '2026年10月18日', pl: '架空競技場', cp: '', g: '2026-10-10T00:00:00Z', a: { name: '架空 一郎', grade: '2', team: '架空高', bib: '12' }, e: [], sc: [['2026-10-24', '2026-10-25', '架空新人大会', '架空競技場'], ['2026-11-03', '', '架空区秋季', '']] };
const pp = { v: 1, k: 'pp', g: '2026-10-12T00:00:00Z', a: { name: '架空 一郎', team: '架空高', grade: '2' }, e: [], sc: [['2026-11-03', '', '架空区秋季', '見本公園'], ['2026-11-20', '', '架空都大会', '']] };
await check('選手のホーム：先生のリンクに入っていた「これからの大会」（新しいリンクが先・ほかのリンクだけの大会も）', async () => {
  const d3 = new JSDOM(tpl, { url: 'http://127.0.0.1/index.html', runScripts: 'outside-only' }), v = d3.window;
  const ls = { 'lanenote.mode.v1': 'player', 'lanenote.player.v1.Meet000001': JSON.stringify({ p: Pq(meet), at: '2026-10-10T00:00:00Z', exp: Date.now() + 864e5 }), 'lanenote.player.v1.Pers000001': JSON.stringify({ kind: 'pp', p: Pq(pp), at: '2026-10-12T00:00:00Z', exp: Date.now() + 864e5 }) };
  for (const k in ls) v.localStorage.setItem(k, ls[k]);
  v.confirm = () => true; v.scrollTo = () => {}; v.__playerNow = '2026-10-14T08:00:00';
  v.eval(src('player.js')); v.eval(src('personal.js')); v.eval(src('plans.js'));
  v.__meetApp = { decodePayload: async s => { const o = JSON.parse(decodeURIComponent(s)); return o.k === 'pp' ? v.LanePersonal.sanitize(o) : Object.assign({}, o, { sc: v.LanePlans.fromSc(o.sc) }); } };
  v.eval(src('mode.js')); v.LaneMode.init(); await delay(150);
  const card = v.document.querySelector('.ph-sc'); assert(card, v.document.getElementById('phBody').innerHTML.slice(0, 300));
  const items = [...card.querySelectorAll('li')].map(l => l.textContent); assert.equal(items.length, 3);
  assert(/あと10日/.test(items[0]) && /架空新人大会/.test(items[0])); assert(/架空区秋季/.test(items[1]) && /見本公園/.test(items[1]), '新しいリンク（個人ページ）の会場'); assert(/架空都大会/.test(items[2]));
  assert(!/架空 一郎/.test(card.textContent));
});
// 大会準備：選手用リンクの中身の検査
await check('大会準備：リンクの中身の検査で sc を通す（形が違えば読まない）', async () => {
  const h2 = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d2 = new JSDOM(h2, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const v = d2.window; v.scrollTo = () => {}; v.HTMLElement.prototype.scrollIntoView = function () {}; Object.assign(v, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob }); v.fetch = () => Promise.reject(new Error('no')); v.indexedDB = new IDBFactory();
  for (const s of ['parser.js', 'logic.js', 'player.js', 'personal.js', 'auth_common.js', 'plans.js']) v.eval(src(s));
  v.eval(src('app.js').replace('window.__meetApp = {', 'window.__v=validatePayload;\n  window.__meetApp = {'));
  const o = v.__v(JSON.parse(JSON.stringify(meet))); assert.deepEqual(o.sc.map(p => p.meet), ['架空新人大会', '架空区秋季']);
  assert.throws(() => v.__v(Object.assign({}, meet, { sc: 'x' })));
  assert.equal(v.__v(Object.assign({}, meet, { sc: undefined })).sc.length, 0);
});
// 中継
await check('中継：text/calendar を通す（ほかの形は今までどおり 415）', async () => {
  const {default: worker, _resetRate} = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, 'worker/worker.js')).toString('base64'));
  const of = globalThis.fetch; let reply;
  globalThis.fetch = async () => reply();
  try {
    const rq = u => new Request('https://worker.invalid/?url=' + encodeURIComponent(u), { headers: { Origin: 'https://masarun0721.github.io' } });
    _resetRate(); reply = () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', { headers: { 'Content-Type': 'text/calendar; charset=UTF-8' } });
    const r = await worker.fetch(rq('https://calendar.google.com/calendar/ical/x/public/basic.ics')); assert.equal(r.status, 200); assert(/text\/calendar/.test(r.headers.get('X-Lane-Type')));
    reply = () => new Response('x', { headers: { 'Content-Type': 'image/png' } }); assert.equal((await worker.fetch(rq('https://calendar.google.com/x.png'))).status, 415);
  } finally { globalThis.fetch = of; }
});
console.log(`v0.26.30 これからの大会・カレンダー ${pass} ok / ${fail} NG`); if (fail) process.exit(1);

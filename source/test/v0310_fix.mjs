// v0.31.0 大会準備：読み取りがまちがっていた行を先生が直す（✏️直す・手直し済・元に戻す）。架空データのみ・本番には接続しない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const require = createRequire(import.meta.url), here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const ML = require('../src/logic.js');
const sl = () => ({ format: 'startlist', hasTimes: false, warnings: [], diag: [], relays: [
  { team: '架空中A', event: '男子 中学 4X100mR', round: '決勝', heat: 1, pos: 3, members: [{ bib: '101', name: '架空 一郎', grade: '2' }], page: 2 }], entries: [
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 2, pos: 4, posKind: 'レーン', bib: '101', name: '架空 一郎', grade: '2', page: 1 },
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 3, pos: 5, posKind: 'レーン', bib: '102', name: '架空 二郎', grade: '1', page: 1 },
  { team: '架空中', event: '男子 中学 走幅跳', round: '決勝', heat: null, pos: 7, posKind: '試技順', bib: '101', name: '架空 一郎', grade: '2', page: 2 }] });
const tt = () => [{ event: '100m', gender: '男子', cat: '中学', round: '予選', time: '12:25', heats: null, callStart: '12:00', callEnd: '12:10' },
  { event: '走幅跳', gender: '男子', cat: '中学', round: '決勝', time: '11:00', heats: null }, { event: '4X100mR', gender: '男子', cat: '中学', round: '決勝', time: '15:00', heats: null }];
const S = { callTrack: [30, 20], callField: [40, 30] };

console.log('[v0.31.0] 手直し（関数）');
await check('checkFix：「13:30」はよい。「1330」「13時30分」「25:00」は推測せずエラー。招集は両方そろえる。組・レーンは数字', () => {
  assert.equal(ML.checkFix({ start: '13:30', callStart: '13:05', callEnd: '13:15', heat: '2', pos: '4' }).ok, true);
  for (const s of ['1330', '13時30分', '25:00', '13:5', '13：30']) { const c = ML.checkFix({ start: s }); assert.equal(c.ok, false, s); assert.match(c.errs[0], /時:分/); }
  assert.equal(ML.checkFix({ start: '13:30', callStart: '13:05' }).ok, false);
  assert.equal(ML.checkFix({ start: '13:30', heat: '二' }).ok, false); assert.equal(ML.checkFix({ start: '13:30', heat: '0' }).ok, false); assert.equal(ML.checkFix({ start: '13:30', pos: '4a' }).ok, false);
  assert.deepEqual(ML.checkFix({ start: '13:00', callStart: '13:10', callEnd: '13:05' }).warns, ['招集の開始が完了より後になっています', '招集の完了が開始時刻より後になっています']);
});
await check('fixKey は行の番号でなく 学校・選手（ナンバー＋名前）／リレーのチーム・種目・ラウンド・日付。読み直しても同じキー', () => {
  const a = ML.build(sl(), tt(), ['架空中'], S), b = ML.build(sl(), tt().reverse(), ['架空中'], S).reverse();
  assert.deepEqual(a.map(ML.fixKey).sort(), b.map(ML.fixKey).sort()); assert.equal(new Set(a.map(ML.fixKey)).size, a.length);
  assert.equal(ML.fixKey(a.find(r => r.typ === 'relay')), '架空中|R|架空中A|男子 中学 4X100mR|決勝|');
});
await check('applyFix：開始・招集・組・レーンを置きかえ、元の値を fixOrig に残す。2回当てても元の値は変わらない。おかしな値は当てない', () => {
  const rows = ML.build(sl(), tt(), ['架空中'], S), r = rows.find(x => x.bib === '101' && /100m/.test(x.event));
  assert.equal(r.start, '12:25'); const k = ML.fixKey(r);
  ML.applyFix(rows, { [k]: { start: '13:30', callStart: '13:05', callEnd: '13:15', heat: '7', pos: '2' } }); ML.applyFix(rows, { [k]: { start: '14:00', callStart: '', callEnd: '', heat: '', pos: '' } });
  assert.deepEqual([r.start, ML.callText(r), r.heat, r.pos, r.startMin, r.fixed], ['13:30', '13:05〜13:15', 7, '2', 810, true]);
  assert.deepEqual(r.fixOrig, { start: '12:25', call: '12:00〜12:10', heat: 2, pos: 4 });
  const r2 = ML.build(sl(), tt(), ['架空中'], S); ML.applyFix(r2, { [k]: { start: '1330' } }); assert.equal(r2.find(x => ML.fixKey(x) === k).start, '12:25');
});

console.log('[v0.31.0] 手直し（画面・jsdom）');
async function makeDom() {
  const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory(); w.requestAnimationFrame = f => setTimeout(f, 0);
  w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
  w.eval(src('app.js').replace('window.__meetApp = {', 'window.__t={payloadFromState,buildRecSheet,refreshPrint};\n  window.__meetApp = {'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
  return w;
}
let w = await makeDom(), $ = id => w.document.getElementById(id), app = w.__meetApp;
const load = () => { Object.assign(app.state, { sl: sl(), tt: tt(), teams: ['架空中'], slName: '架空.pdf', ttName: '架空TT.pdf' }); $('meetName').value = '架空記録会'; $('meetDate').value = '2026年11月3日'; app.render(); };
load(); await delay();
const row = (body, re) => Array.from($(body).querySelectorAll('tr')).find(tr => re.test(tr.textContent));
await check('時間順・選手別のどの行にも「✏️直す」（スマホのカードにも）。最初は「手直し済」なし。必要な文言はそのまま', () => {
  assert.equal($('timeBody').querySelectorAll('[data-fix]').length, 4); assert.equal($('athBody').querySelectorAll('[data-fix]').length, 4);
  assert.equal($('timeCards').querySelectorAll('[data-fix]').length, 4); assert.equal($('athCards').querySelectorAll('[data-fix]').length, 4);
  assert.match($('timeBody').textContent, /✏️直す/); assert.equal(w.document.querySelectorAll('.fixb').length, 0);
});
await check('直す：形がちがう（1330）とエラーを出して保存しない。招集が開始より後なら注意 → もう一度で保存', async () => {
  Array.from($('athBody').querySelectorAll('tr')).find(t => /100m/.test(t.textContent) && /架空 一郎/.test(t.textContent)).querySelector('[data-fix]').click();
  assert.equal($('fixDlg').hidden, false); assert.match($('fixWho').textContent, /架空 一郎/);
  $('fixStart').value = '1330'; $('fixSave').click(); assert.equal($('fixDlg').hidden, false); assert.match($('fixMsg').textContent, /時:分/);
  $('fixStart').value = '13:10'; $('fixCs').value = '13:05'; $('fixCe').value = '13:15'; $('fixSave').click();
  assert.equal($('fixDlg').hidden, false); assert.match($('fixMsg').textContent, /招集の完了が開始時刻より後/);
  $('fixStart').value = '13:30'; $('fixHeat').value = '7'; $('fixPos').value = '2'; $('fixSave').click(); await delay();
  assert.equal($('fixDlg').hidden, true);
});
const fixedRow = () => app.state.rows.find(r => r.fixed);
await check('直した値：時間順・選手別に「手直し済」と「元に戻す」。開始 13:30・招集 13:05〜13:15・7組・レーン2', () => {
  const r = fixedRow(); assert.ok(r); assert.equal(r.bib, '101'); assert.match(r.event, /100m/);
  assert.deepEqual([r.start, r.call, r.heat, r.pos], ['13:30', '13:05〜13:15', 7, '2']);
  assert.equal($('timeBody').querySelectorAll('.fixb').length, 1); assert.equal($('athBody').querySelectorAll('.fixb').length, 1); assert.equal($('timeCards').querySelectorAll('.fixb').length, 1);
  const tr = Array.from($('athBody').querySelectorAll('tr')).find(t => t.querySelector('.fixb')); assert.match(tr.textContent, /13:30/); assert.match(tr.textContent, /13:05〜13:15/); assert.ok(tr.querySelector('[data-unfix]'));
});
await check('印刷（時間順）・記録用紙・共有リンク（QR）の中身にも直した値。印刷には「✏️直す」ボタンを入れない', () => {
  w.__t.refreshPrint(); assert.match($('printTime').textContent, /13:30/); assert.match($('printTime').textContent, /13:05〜13:15/); assert.equal($('printTime').querySelectorAll('[data-fix]').length, 0);
  w.__t.buildRecSheet(); assert.match($('recSheet').textContent, /13:30/);
  const p = w.__t.payloadFromState(), s = p.r.find(a => a[8] === '架空 一郎' && /100m/.test(a[2])); assert.deepEqual([s[0], s[1], s[4], s[6]], ['13:30', '13:05〜13:15', '7', '2']);
});
await check('この端末に保存（localStorage）。同じ大会の資料を読み直しても（行の順がちがっても）同じ行に当たる。別の大会名では当てない', async () => {
  const st = JSON.parse(w.localStorage.getItem('lanenote-fix-anon')); assert.deepEqual(Object.keys(st), ['架空記録会|2026年11月3日']);
  const s2 = sl(); s2.entries.reverse(); Object.assign(app.state, { sl: s2, tt: tt() }); app.render(); await delay();
  assert.equal(fixedRow().bib, '101'); assert.equal(fixedRow().start, '13:30');
  $('meetName').value = '架空記録会2'; app.render(); assert.equal(app.state.rows.filter(r => r.fixed).length, 0); $('meetName').value = '架空記録会'; app.render();
});
await check('ページを開き直しても残る（同じ端末）', async () => {
  const ls = w.localStorage.getItem('lanenote-fix-anon'); w = await makeDom(); $ = id => w.document.getElementById(id); app = w.__meetApp; w.localStorage.setItem('lanenote-fix-anon', ls); load(); await delay();
  assert.equal(fixedRow().start, '13:30'); assert.equal($('timeBody').querySelectorAll('.fixb').length, 1);
});
await check('元に戻す：資料から読んだ値（12:25・12:00〜12:10・2組・レーン4）に戻り、「手直し済」が消える。保存も消える', async () => {
  $('athBody').querySelector('[data-unfix]').click(); await delay();
  const r = app.state.rows.find(r => r.bib === '101' && /100m/.test(r.event)); assert.deepEqual([r.start, r.call, r.heat, r.pos, !!r.fixed], ['12:25', '12:00〜12:10', 2, 4, false]);
  assert.equal(w.document.querySelectorAll('.fixb').length, 0); assert.equal(w.localStorage.getItem('lanenote-fix-anon'), '{}');
});
await check('リレー・フィールド（試技順）も直せる。欄の名前は「試技順」', async () => {
  Array.from($('athBody').querySelectorAll('tr')).find(t => /走幅跳/.test(t.textContent)).querySelector('[data-fix]').click();
  assert.equal($('fixPosL').textContent, '試技順'); $('fixPos').value = '9'; $('fixSave').click(); await delay();
  assert.equal(app.state.rows.find(r => /走幅跳/.test(r.event)).pos, '9');
  Array.from($('athBody').querySelectorAll('tr')).find(t => /4X100mR/.test(t.textContent)).querySelector('[data-fix]').click();
  $('fixHeat').value = '2'; $('fixSave').click(); await delay(); assert.equal(app.state.rows.find(r => r.typ === 'relay').heat, 2);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

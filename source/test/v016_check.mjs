// v0.16／記録 v0.8.0：通過したら出るラウンド・選手の個人ページ・体調メモ・個人で使う（架空データのみ・本番には接続しない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const ML = require('../src/logic.js'), PL = require('../src/player.js'), LP = require('../src/personal.js');

// 架空のスタートリスト（予選だけ）とタイムテーブル（予選・準決勝・決勝）
export const fakeSl = () => ({ format: 'startlist', hasTimes: false, warnings: [], diag: [], relays: [], entries: [
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 2, pos: 4, posKind: 'レーン', bib: '101', name: '山田 太郎', grade: '2', page: 1 },
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 3, pos: 5, posKind: 'レーン', bib: '102', name: '見本 次郎', grade: '1', page: 1 },
  { team: '架空中', event: '男子 中学 走幅跳', round: '決勝', heat: null, pos: 7, posKind: '試技順', bib: '101', name: '山田 太郎', grade: '2', page: 2 },
  { team: '他校中', event: '男子 中学 100m', round: '予選', heat: 1, pos: 3, posKind: 'レーン', bib: '201', name: '他校 花子', grade: '3', page: 1 }] });
export const fakeTt = () => [
  { event: '100m', gender: '男子', cat: '中学', round: '予選', time: '10:00', heats: null },
  { event: '100m', gender: '男子', cat: '中学', round: '準決勝', time: '12:30', heats: null, callStart: '12:00', callEnd: '12:10' },
  { event: '100m', gender: '男子', cat: '中学', round: '決勝', time: '15:00', heats: null },
  { event: '走幅跳', gender: '男子', cat: '中学', round: '決勝', time: '11:00', heats: null }];

console.log('[1] 通過したら出るラウンド（MeetLogic.tentative）');
const S = { callTrack: [30, 20], callField: [40, 30] };
const rows = ML.build(fakeSl(), fakeTt(), ['架空中'], S);
const tent = ML.tentative(rows, fakeTt(), fakeSl(), S);
await check('予選に出る2人それぞれに 準決勝・決勝 の「通過したら」行（走幅跳は決勝だけなので作らない・他校は作らない）', () => {
  assert.equal(tent.length, 4);
  assert(tent.every(t => t.tent && t.event === '男子 中学 100m' && t.team === '架空中'));
  assert.deepEqual(tent.map(t => t.name + ' ' + t.round).sort(), ['山田 太郎 決勝', '山田 太郎 準決勝', '見本 次郎 決勝', '見本 次郎 準決勝'].sort());
});
await check('時刻と招集：準決勝はタイムテーブルの招集列、決勝は招集ルール（30〜20分前）', () => {
  const sf = tent.find(t => t.round === '準決勝'), f = tent.find(t => t.round === '決勝');
  assert.equal(sf.start, '12:30'); assert.equal(sf.call, '12:00〜12:10'); assert.equal(f.start, '15:00'); assert.equal(f.call, '14:30〜14:40');
  assert.match(sf.note, /通過したら（予選の結果しだい）/); assert.match(f.note, /準決勝の結果しだい/);
  assert.equal(sf.heat, ''); assert.equal(sf.pos, '');
});
await check('名前はカッコ付き：（山田 太郎）', () => { assert.equal(ML.tentName(tent[0]).replace(/[^（）]/g, ''), '（）'); assert.match(ML.tentName(tent.find(t => t.bib === '101')), /^（山田 太郎）$/); });
await check('準決勝のスタートリストを読み込んだら、準決勝の仮の行は消え、載っている子だけ決勝の仮の行が残る', () => {
  const sl = fakeSl(); sl.entries.push({ team: '架空中', event: '男子 中学 100m', round: '準決勝', heat: 1, pos: 6, posKind: 'レーン', bib: '101', name: '山田 太郎', grade: '2', page: 3 });
  const r2 = ML.build(sl, fakeTt(), ['架空中'], S), t2 = ML.tentative(r2, fakeTt(), sl, S);
  assert(r2.some(r => !r.tent && r.round === '準決勝' && r.start === '12:30'), '本物の準決勝の行がある');
  assert.deepEqual(t2.map(t => t.name + ' ' + t.round), ['山田 太郎 決勝']);
});
await check('タイムテーブルが無い・後のラウンドが無いときは作らない', () => {
  assert.equal(ML.tentative(rows, [], fakeSl(), S).length, 0);
  assert.equal(ML.tentative(rows, fakeTt().filter(s => s.round !== '準決勝' && s.round !== '決勝'), fakeSl(), S).length, 0);
});
await check('時間順に並べると 予選 → 準決勝 → 決勝 の位置に入る', () => {
  const bt = ML.byTime(rows.concat(tent)).map(r => r.start + (r.tent ? '*' : ''));
  assert.deepEqual(bt, ['10:00', '10:00', '11:00', '12:30*', '12:30*', '15:00*', '15:00*']);
});

console.log('[2] 選手用リンク：その子の「通過したら」だけ入れる・通過！／敗退');
const A = PL.athletes(rows), yam = A.find(a => a.bib === '101'), mi = A.find(a => a.bib === '102');
const p = PL.payloadFor(rows.concat(tent), yam, { n: '架空区大会', d: '2026年10月18日' });
await check('山田さんの中身：予選・走幅跳・準決勝（仮）・決勝（仮）。見本さんの仮の行は入らない', () => {
  assert.equal(p.e.length, 4); assert.equal(p.e.filter(e => e[10] === 1).length, 2);
  assert(!/見本|102/.test(JSON.stringify(p)));
  const pm = PL.payloadFor(rows.concat(tent), mi, {}); assert(!/山田|101/.test(JSON.stringify(pm))); assert.equal(pm.e.filter(e => e[10] === 1).length, 2);
});
const items = PL.merge(PL.autoItems(p), []);
await check('仮の予定は tent の印つき。決まるまで「次は」に数えない', () => {
  const t = items.filter(x => x.tent); assert.equal(t.length, 4);   // 招集と試合 × 2ラウンド
  assert(t.every(x => /準決勝|決勝/.test(x.label)));
  const vis = PL.applyTent(items, {}), ni = PL.nextIndex(vis, 12 * 60);
  assert(ni < 0 || !vis[ni].tent, '仮の予定を「次は」にしない');
});
await check('「通過！」で確定（次はに数える）、準決勝を「敗退」にすると準決勝と決勝の両方が消える', () => {
  const kSf = PL.tentKey({ event: '男子 中学 100m', round: '準決勝' });
  const ok = PL.applyTent(items, { [kSf]: 'ok' }); assert(ok.filter(x => x.tent && x.confirmed).length === 2);
  const ni = PL.nextIndex(ok, 12 * 60); assert.equal(ok[ni].t, '12:00');
  const out = PL.applyTent(items, { [kSf]: 'out' }); assert.equal(out.filter(x => x.tent).length, 0);
  const kF = PL.tentKey({ event: '男子 中学 100m', round: '決勝' });
  const out2 = PL.applyTent(items, { [kF]: 'out' }); assert.equal(out2.filter(x => x.tent).length, 2, '決勝だけ敗退なら準決勝は残る');
});

console.log('[3] 大会準備の画面（jsdom）：時間順・選手別・記録用紙・Excel・選手のページ');
async function makeDom(file, url) {
  const html = src(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url, runScripts: 'outside-only' }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory(); w.requestAnimationFrame = f => setTimeout(f, 0);
  return w;
}
const w = await makeDom('template.html', 'http://127.0.0.1:9090/index.html');
w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
w.eval(src('app.js').replace('window.__meetApp = {', 'window.__t={validatePayload,openViewerStr,pvLoad};\n  window.__meetApp = {'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
const app = w.__meetApp, $ = id => w.document.getElementById(id);
Object.assign(app.state, { sl: fakeSl(), tt: fakeTt(), teams: ['架空中'], slName: '架空.pdf', ttName: '架空TT.pdf' });
app.render(); await delay();
await check('時間順の表：仮の行は class="tent"、名前はカッコ付き、「通過したら」の印', () => {
  const tr = Array.from($('timeBody').querySelectorAll('tr.tent')); assert.equal(tr.length, 4);
  assert.match(tr[0].textContent, /（山田 太郎）|（見本 次郎）/); assert.match($('timeBody').textContent, /通過したら/);
  assert.equal($('timeBody').querySelectorAll('tr:not(.tent)').length, 3);
});
await check('選手別の表にも仮の行', () => { assert.equal($('athBody').querySelectorAll('tr.tent').length, 4); });
await check('印刷（時間順）：仮のラウンドは tbody.tent・カッコ付き', () => {
  app.refreshPrint(); const tb = $('printTime').querySelectorAll('tbody.pg.tent'); assert.equal(tb.length, 2); assert.match(tb[0].textContent, /（山田 太郎）/); assert.match(tb[0].textContent, /通過したら/);
});
await check('記録用紙（印刷）にも仮のラウンド（レーンは「未定」）', () => {
  w.print = () => {}; $('btnRec').click(); const tb = $('recSheet').querySelectorAll('tbody.pg.tent'); assert.equal(tb.length, 2); assert.match(tb[1].textContent, /（見本 次郎）|（山田 太郎）/); assert.match(tb[0].textContent, /未定/);
});
await check('v0.17 大会準備の出力：「👀 画面で見る」は印刷ダイアログなしで重ねて表示・「📄 PDF作成」は案内つきで印刷・「🖨 印刷」はそのまま印刷', async () => {
  let n = 0; w.print = () => { n++; };
  $('btnPrintView').click(); assert.equal($('docView').hidden, false); assert.equal(n, 0); assert.match($('docFrame').getAttribute('srcdoc') || $('docFrame').srcdoc, /id="printTime"/); assert.match($('docTitle').textContent, /時間順/);
  $('docClose').click(); assert.equal($('docView').hidden, true);
  $('btnRecView').click(); assert.match($('docFrame').srcdoc, /<body class="print-rec">/); assert.equal(n, 0); $('docClose').click();
  $('btnPrintPdf').click(); assert.equal($('pdfHint').hidden, false); assert.match($('pdfHint').textContent, /保存先で『PDFに保存』を選んでください/); await delay(500); assert.equal(n, 1);
  $('btnPrint').click(); assert.equal(n, 2); assert.equal($('pdfHint').hidden, true);
  $('btnRecPdf').click(); await delay(500); assert.equal(n, 3); $('btnRec').click(); assert.equal(n, 4);
});
await check('Excel（時間順・選手別）：ラウンドに「（通過したら）」、名前はカッコ付き', () => {
  const t = app.tableData('time', true), a = app.tableData('ath', true);
  assert(t.some(r => r[3] === '準決勝（通過したら）')); assert(t.some(r => r[8] === '（山田 太郎）'));
  assert(a.some(r => r[2] === '（見本 次郎）' && r[5] === '決勝（通過したら）'));
});
await check('共有（全体のリンク）と参加料には仮の行を入れない', () => {
  const pl = app.payloadFromState(); assert.equal(pl.r.length, 3); assert(!pl.r.some(r => /（/.test(r[8])));
  assert.equal(app.state.rows.length, 3); assert.equal(app.state.tent.length, 4);
});
await check('選手のページ：仮のラウンドに「通過したら」と「通過！」「敗退」。押した結果はこの端末に保存', async () => {
  const str = await app.encodePayload(p); await w.__t.openViewerStr(str, true, 'abcDEF1234'); await delay();
  const L = $('pvList'); assert.equal(L.querySelectorAll('.pv-tent').length, 4); assert.match(L.textContent, /通過したら/);
  const pass1 = L.querySelector('.pv-pass'); assert(pass1); pass1.click(); await delay();
  const saved = w.__t.pvLoad('abcDEF1234'); assert.equal(Object.values(saved.tr).filter(v => v === 'ok').length, 1);
  assert.equal($('pvList').querySelectorAll('.pv-tent.pv-ok').length, 2);
  $('pvList').querySelector('.pv-out').click(); await delay();
  assert.equal($('pvList').querySelectorAll('.pv-tent.pv-ok').length, 2, '決勝を敗退→決勝は消え、準決勝（確定）は残る');
  assert.match($('pvList').textContent, /敗退にしたラウンド/);
});
await check('選手のページ：体調メモ（このスマホだけ）を保存・削除できる', async () => {
  const box = $('pvCond'); assert.match(box.textContent, /このスマホにだけ保存/); assert.match(box.textContent, /先生やほかの人には見えません/);
  box.querySelector('[data-cds="4"]').click(); box.querySelector('.cd-sl').value = '7.5'; box.querySelector('.cd-m').value = '足が軽い'; box.querySelector('.cd-save').click();
  const c = JSON.parse(w.localStorage.getItem('lanenote.cond.v1'))['2026-10-18']; assert.equal(c.s, 4); assert.equal(c.sl, 7.5); assert.equal(c.m, '足が軽い');
  box.querySelector('.cd-del').click(); assert.equal(w.localStorage.getItem('lanenote.cond.v1'), null);
});

console.log('[4] 選手の個人ページ（k:pp）');
const ppObj = { v: 1, k: 'pp', g: '2026-10-11T03:00:00.000Z', a: { name: '山田 太郎', team: '架空中', grade: '2' }, nx: { s: 'Abc1234567', n: '架空区大会' },
  e: [{ l: '100m', lw: 1, n: 4, b: ['12.10', '+0.5', '2026-06-01', '県大会'], rf: null,
    p: [['2026-04-01', 12.5, '12.50', '+1.0', 0], ['2026-05-01', 12.3, '12.30', '+2.5', 1], ['2026-06-01', 12.1, '12.10', '+0.5', 0]], x: [['2026-07-01', 'DNS', '夏の大会', '予選']],
    r: [['2026-07-01', 'DNS', '', '夏の大会', '予選', ''], ['2026-06-01', '12.10', '+0.5', '県大会', '予選', 'PB']] }] };
await check('sanitize：決まった項目だけ・リンクIDの形を確かめる', () => {
  const s = LP.sanitize(Object.assign({}, ppObj, { evil: '<script>', nx: { s: 'javascript:alert(1)' } })); assert(!('evil' in s)); assert.equal(s.nx, null);
  assert.throws(() => LP.sanitize({ v: 1, k: 'pp' })); assert.equal(LP.sanitize(ppObj).e[0].p.length, 3);
});
await check('validatePayload（大会準備のページ）が k:pp を受け付ける', () => { const s = w.__t.validatePayload(ppObj); assert.equal(s.k, 'pp'); assert.equal(s.a.name, '山田 太郎'); });
await check('個人ページを開く：自己ベスト・グラフ（参考・×の切り替え）・最近の記録・何月何日時点・予定へのリンク', async () => {
  const str = await app.encodePayload(ppObj); await w.__t.openViewerStr(str, true, 'ppLink1234'); await delay(80);
  const b = $('ppBody'); assert(w.document.body.classList.contains('personal-mode'));
  assert.match(b.textContent, /10月11日時点の記録です。先生が更新したら新しいリンクをもらってください/);
  assert.match(b.textContent, /自己ベスト/); assert.match(b.textContent, /12\.10/);
  assert.equal(b.querySelectorAll('svg.spark g.nmx').length, 1); assert(b.querySelector('input[data-ppofficial]')); assert(b.querySelector('input[data-ppnm]'));
  assert.match(b.querySelector('a.pp-go').getAttribute('href'), /\?s=Abc1234567$/);
  const cb = b.querySelector('input[data-ppnm]'); cb.checked = false; cb.dispatchEvent(new w.Event('change')); assert.equal($('ppBody').querySelectorAll('svg.spark g.nmx').length, 0);
  const of = $('ppBody').querySelector('input[data-ppofficial]'); of.checked = true; of.dispatchEvent(new w.Event('change')); assert.equal($('ppBody').querySelectorAll('svg.spark circle').length, 2);
});
await check('体調メモを書くと、その日の記録の横と一覧に出る（このスマホだけ）', () => {
  const b = $('ppBody'), di = b.querySelector('.pp-cdday'); di.value = '2026-06-01'; di.dispatchEvent(new w.Event('change')); 
  const f = $('ppBody').querySelector('.pp-cdform'); f.querySelector('[data-cds="5"]').click(); f.querySelector('.cd-sl').value = '8'; f.querySelector('.cd-save').click();
  assert.match($('ppBody').querySelector('.recent').textContent, /体調5/); assert.match($('ppBody').querySelector('.pp-cdlist').textContent, /100m 12\.10/);
  assert.match($('ppBody').textContent, /このスマホにだけ保存/);
  $('ppBody').querySelector('.pp-cdall').click(); assert.equal(w.localStorage.getItem('lanenote.cond.v1'), null);
});

console.log('[5] 記録ページ：個人ページのリンク・個人で使う');
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d2 = new JSDOM(html, { url: 'http://127.0.0.1:9090/records.html', runScripts: 'outside-only' }); const r = d2.window;
r.confirm = () => true; r.alert = () => {}; r.scrollTo = () => {}; r.HTMLElement.prototype.scrollIntoView = function () {}; r.indexedDB = new IDBFactory(); r.fetch = () => Promise.reject(new Error('no network'));
Object.assign(r, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, SHARE_BASE: 'https://example.invalid/lane-note/' });
r.eval(src('auth_common.js')); r.eval(src('results.js')); r.eval(src('personal.js'));
r.eval(src('records_app.js').replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload};renderAuth();'));
const RP = r.ResultParser, rt = r.__t;
const mk = (name, team, date, mark, meet, wind) => { const o = { name, team, event: '男子100m', mark, wind: wind || (/^\d/.test(mark) ? '+0.5' : ''), date, meet, grade: '2' }; o.id = RP.recId(o.meet, o.date, o); return o; };
await rt.putMany([mk('山田 太郎', '架空中', '2026-04-01', '12.50', '春の大会'), mk('山田 太郎', '架空中', '2026-06-01', '12.10', '県大会'), mk('山田 太郎', '架空中', '2026-07-01', 'DNS', '夏の大会'),
  mk('見本 次郎', '架空中', '2026-06-01', '13.00', '県大会'), mk('山田 太郎', '別の中', '2026-06-01', '14.00', '県大会')], rt.scope());
await rt.reload(rt.scope()); await delay(40);
await check('個人ページの中身：その選手1人分だけ（ほかの選手・同じ名前の別の学校は入らない）・データ量は短いリンクの上限より小さい', async () => {
  const key = RP.athleteKey(mk('山田 太郎', '架空中', '2026-04-01', '12.50', 'x'));
  const o = r.__recApp.ppPayload(key); const js = JSON.stringify(o);
  assert.equal(o.k, 'pp'); assert.equal(o.a.name, '山田 太郎'); assert(!/見本|13\.00|別の中|14\.00/.test(js));
  assert.equal(o.e[0].b[0], '12.10'); assert.equal(o.e[0].p.length, 2); assert.equal(o.e[0].x[0][1], 'DNS');
  const str = await r.__recApp.encodePP(o); assert(str.length < 190000 && /^1\.[A-Za-z0-9_-]+$/.test(str));
  assert.equal(LP.sanitize(o).e[0].r.length, 3);
});
await check('ログインなしで作ると長いリンク（#p=）。クラウドには書かない', async () => {
  const key = RP.athleteKey(mk('山田 太郎', '架空中', '2026-04-01', '12.50', 'x'));
  await r.__recApp.makePPLinks([key]); await delay(40);
  const inp = r.document.querySelector('#rbPPList input'); assert(inp); assert.match(inp.value, /^http:\/\/127\.0\.0\.1:9090\/#p=1\./);
});
await check('個人で使う：名前を入れると、ランキング・歴代のタブを隠し、ホームは自分の自己ベスト', async () => {
  r.document.getElementById('rbPersonal').checked = true; r.document.getElementById('rbPersonal').dispatchEvent(new r.Event('change'));
  r.document.getElementById('rbPName').value = '山田太郎'; r.document.getElementById('rbPTeam').value = '架空'; r.document.getElementById('rbPName').dispatchEvent(new r.Event('input'));
  assert(r.document.body.classList.contains('personal-on')); assert(r.document.getElementById('rbSchoolRow').hidden); assert(!r.document.getElementById('rbPersonRow').hidden);
  const v = r.document.getElementById('rbView'); assert.match(v.textContent, /山田太郎 さんの自己ベスト/); assert.match(v.textContent, /12\.10/); assert(!/14\.00/.test(v.textContent), '別の学校の同じ名前は入れない');
  assert.equal(JSON.parse(r.localStorage.getItem('lanenote-rec-mode') || 'null'), null, 'まだ保存前（少し待ってから保存）');
  await delay(700); assert.deepEqual(JSON.parse(r.localStorage.getItem('lanenote-rec-mode')), { personal: true, name: '山田太郎', team: '架空' });
});
await check('個人で使う：取り込みはその人の記録だけ（Excelの取り込みも同じ）', () => {
  const recs = [mk('山田 太郎', '架空中', '2026-08-01', '12.00', '秋'), mk('見本 次郎', '架空中', '2026-08-01', '12.90', '秋'), mk('山田 太郎', '別の中', '2026-08-01', '13.9', '秋')];
  const want = recs.filter(x => r.__recApp.isMe(x)); assert.equal(want.length, 1); assert.equal(want[0].team, '架空中');
});
await check('ログアウト・端末データの消去で「個人で使う」の名前も消える（userKeys に入っている）', () => {
  assert(r.LaneAuth.userKeys('u1').includes('lanenote-rec-mode-u1'));
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

// v0.21（試し版）保護者案内用の表：架空のデータだけで確かめる
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), OUT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const P = require('../src/parent.js');
export const fakeSl = () => ({ format: 'startlist', hasTimes: false, warnings: [], diag: [], entries: [
  { team: '架空中', event: '男子中学1年 100m', round: '予選', heat: 2, pos: 4, posKind: 'レーン', bib: '101', name: '山田 太郎', kana: 'ヤマダ タロウ', grade: '1', page: 1 },
  { team: '架空中', event: '男子中学共通 走幅跳', round: '決勝', heat: null, pos: 7, posKind: '試技順', bib: '101', name: '山田 太郎', kana: 'ヤマダ タロウ', grade: '1', page: 2 },
  { team: '架空中', event: '男子中学3年 100m', round: '予選', heat: 1, pos: 3, posKind: 'レーン', bib: '103', name: '青木 健', kana: 'アオキ ケン', grade: '3', page: 1 },
  { team: '架空中', event: '女子中学共通 200m', round: '予選', heat: 1, pos: 5, posKind: 'レーン', bib: '201', name: '佐藤 花子', kana: 'サトウ ハナコ', grade: '2', page: 1 },
  { team: '架空中', event: '女子中学2年 100m', round: '予選', heat: 2, pos: 6, posKind: 'レーン', bib: '202', name: '井上 舞', kana: 'イノウエ マイ', grade: '2', page: 1 },
  { team: '他校中', event: '男子中学1年 100m', round: '予選', heat: 1, pos: 3, posKind: 'レーン', bib: '901', name: '他校 一郎', grade: '1', page: 1 }],
  relays: [{ team: '架空中A', event: '男子中学共通 4×100mR', round: '決勝', heat: 1, pos: 4, page: 3, members: [{ bib: '101', name: '山田 太郎' }, { bib: '103', name: '青木 健' }, { bib: '104', name: '補欠 次郎' }] },
    { team: '架空中B', event: '男子中学共通 4×100mR', round: '決勝', heat: 2, pos: 2, page: 3, members: [{ bib: '103', name: '青木 健' }] }] });
const fakeTt = () => [
  { event: '100m', gender: '男子', cat: '中学1年', round: '予選', time: '10:00' }, { event: '100m', gender: '男子', cat: '中学1年', round: '決勝', time: '14:00' },
  { event: '走幅跳', gender: '男子', cat: '中学共通', round: '決勝', time: '11:00' }, { event: '200m', gender: '女子', cat: '中学共通', round: '予選', time: '10:30' }];

console.log('[v0.21-1] 表の中身（LaneParent）');
const rows = [
  { typ: 'track', event: '男子中学1年 100m', round: '予選', name: '山田 太郎', kana: 'ヤマダ', grade: '1', team: '架空中', start: '10:00', call: '9:30〜9:40' },
  { typ: 'field', event: '男子中学共通 走幅跳', round: '決勝', name: '山田 太郎', grade: '1', team: '架空中', start: '11:00' },
  { typ: 'track', event: '男子中学1年 100m', round: '決勝', name: '山田 太郎', grade: '1', team: '架空中', start: '14:00', tent: true },
  { typ: 'track', event: '男子中学3年 100m', round: '予選', name: '青木 健', kana: 'アオキ', grade: '3', team: '架空中', start: '10:10' },
  { typ: 'track', event: '女子中学共通 200m', round: '予選', name: '佐藤 花子', grade: '2', team: '架空中', start: '10:30' },
  { typ: 'relay', event: '男子中学共通 4×100mR', round: '決勝', name: '架空中A', relayTeam: '架空中A', team: '架空中', members: [{ name: '山田 太郎' }, { name: '青木 健' }, { name: '補欠 次郎' }], start: '15:00' },
  { typ: 'relay', event: '男子中学共通 4×100mR', round: '決勝', name: '架空中B', relayTeam: '架空中B', team: '架空中', members: [{ name: '青木 健' }], start: '15:05' }];
await check('出場選手表：選手×種目で1行・男子が先・学年順・同じ人の2行目は名前を空ける・リレーは記号（A・B）・リレーだけの人も行がある・通過したらは数えない', () => {
  const t = P.athleteRows(rows, { split: false });
  assert.deepEqual(t.rows.map(r => [r.first ? r.name : '', r.grade, r.event, r.relay]), [
    ['山田 太郎', '1年', '男子中学1年 100m', 'A'], ['', '1年', '男子中学共通 走幅跳', ''], ['青木 健', '3年', '男子中学3年 100m', 'A・B'], ['補欠 次郎', '', '', 'A'], ['佐藤 花子', '2年', '女子中学共通 200m', '']]);
  assert.equal(t.hasRelay, true);
});
await check('男女がいるときは左右に並べ（男子｜女子）、種目名から男子・女子を外す。学年の列はオン／オフ', () => {
  const g = P.athleteGrid(rows, { grade: true });
  assert.deepEqual(g.caps, ['男子', '女子']); assert.deepEqual(g.head, ['名前', '学年', '出場種目', 'リレー', '名前', '学年', '出場種目', 'リレー']);
  assert.deepEqual(g.body[0], ['山田 太郎', '1年', '中学1年 100m', 'A', '佐藤 花子', '2年', '中学共通 200m', '']);
  assert.deepEqual(g.body[1].slice(0, 4), ['', '', '中学共通 走幅跳', '']); assert.equal(g.body.length, 4);
  const g2 = P.athleteGrid(rows, { grade: false }); assert.deepEqual(g2.head.slice(0, 3), ['名前', '出場種目', 'リレー']);
});
await check('リレーがないときはリレーの列を出さない・片方の性別だけなら1列', () => {
  const g = P.athleteGrid(rows.filter(r => r.typ !== 'relay' && /男子/.test(r.event)), { grade: true });
  assert.equal(g.caps, null); assert.deepEqual(g.head, ['名前', '学年', '出場種目']);
});
await check('時間順の予定：時刻・招集・種目・出る人、「通過したら」の行、リレーはチームとメンバー', () => {
  const t = P.timeGrid(rows, rs => rs.slice().sort((a, b) => a.start.localeCompare(b.start)));
  assert.deepEqual(t.head, ['時刻', '招集', '種目', '出る人']);
  assert.deepEqual(t.body[0], ['10:00', '9:30〜9:40', '男子中学1年 100m 予選', '山田 太郎']);
  assert(t.body.some(r => r[2] === '男子中学1年 100m 決勝（通過したら）'));
  assert(t.body.some(r => r[3] === '架空中A（山田 太郎・青木 健・補欠 次郎）'));
});
await check('コピー用の HTML：セルに罫線（style を直接）・明朝・中身はエスケープ／タブ区切りも同じ行数', () => {
  const g = P.athleteGrid(rows.concat([{ typ: 'track', event: '女子中学共通 200m', name: '<b>悪</b>', grade: '1', team: '架空中' }]), { grade: true });
  const h = P.gridHtml(g); assert.match(h, /<td style="border:1px solid #000/); assert.match(h, /Mincho/); assert.match(h, /&lt;b&gt;悪/); assert.doesNotMatch(h, /<b>悪/);
  assert.match(h, /colspan="4"[^>]*>男子</);
  const tsv = P.gridTsv(g).split('\n'); assert.equal(tsv.length, g.body.length + 2); assert.equal(tsv[1].split('\t').length, 8);
});

console.log('[v0.21-2] 大会準備の画面（jsdom・実際のソース）');
const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' }); const w = d.window; await delay();
w.confirm = () => true; w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory(); w.requestAnimationFrame = f => setTimeout(f, 0);
const copied = [];
w.ClipboardItem = function (o) { this.o = o; }; Object.defineProperty(w.navigator, 'clipboard', { value: { write: async items => { for (const it of items) copied.push({ html: await it.o['text/html'].text(), text: await it.o['text/plain'].text() }); } }, configurable: true });
const aoas = []; w.XLSX = { utils: { book_new: () => ({ s: [] }), aoa_to_sheet: a => ({ a }), book_append_sheet: (wb, ws, n) => wb.s.push([n, ws.a]) }, writeFile: (wb, n) => aoas.push([n, wb.s]) };
['results.js', 'parser.js', 'logic.js', 'player.js', 'personal.js', 'auth_common.js', 'parent.js', 'app.js'].forEach(f => w.eval(src(f)));
w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
const app = w.__meetApp, $ = id => w.document.getElementById(id);
Object.assign(app.state, { sl: fakeSl(), tt: fakeTt(), teams: ['架空中'], slName: '架空.pdf', ttName: '架空TT.pdf' }); $('meetName').value = '第1回架空区大会'; app.render(); await delay();
await check('「👪 保護者案内用の表」→ 画面に2つの表（出場選手・時間順の予定）・他校は入らない', async () => {
  $('btnParent').click(); await delay();
  assert.equal($('parentView').hidden, false); const doc = $('pvFrame').srcdoc;
  assert.match(doc, /第1回架空区大会　出場選手・予定/); assert.match(doc, /出場選手<\/caption>/); assert.match(doc, /時間順の予定<\/caption>/);
  assert.match(doc, /山田 太郎/); assert.match(doc, /佐藤 花子/); assert.doesNotMatch(doc, /他校 一郎/); assert.match(doc, />男子</); assert.match(doc, />女子</);
  assert.match(doc, /（通過したら）/, '決勝（通過したら）が入る'); assert.match(doc, /A・B/);
});
await check('「📋 コピー」は text/html（罫線つきの表）と text/plain（タブ区切り）の両方', async () => {
  $('pvCopyAth').click(); await delay(); $('pvCopyTime').click(); await delay();
  assert.equal(copied.length, 2); assert.match(copied[0].html, /^<table style="border-collapse:collapse/); assert.match(copied[0].text, /^男子\t/); assert.match(copied[1].text, /^時刻\t招集\t種目\t出る人/);
  assert.match($('pvMsg').textContent, /コピーしました/);
});
await check('学年の列をはずすと表から消える・Excel は2枚のシート', async () => {
  $('pvGrade').checked = false; $('pvGrade').dispatchEvent(new w.Event('change')); await delay();
  assert.doesNotMatch($('pvFrame').srcdoc, />学年</);
  $('pvXlsx').click(); assert.equal(aoas.length, 1); assert.deepEqual(aoas[0][1].map(s => s[0]), ['出場選手', '時間順の予定']); assert.match(aoas[0][0], /保護者案内用\.xlsx$/);
  $('pvClose').click(); assert.equal($('parentView').hidden, true);
});
await check('ビルド結果：版 v0.21・ボタンに「試し版」・使い方に説明', () => {
  const I = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'), G = fs.readFileSync(path.join(OUT, 'guide.html'), 'utf8');
  assert.match(I, /v0\.21/); assert.match(I, /id="btnParent"[^>]*>👪 保護者案内用の表 <span class="trial">試し版/); assert.match(I, /var LaneParent/); assert.match(G, /id="g11"/);
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

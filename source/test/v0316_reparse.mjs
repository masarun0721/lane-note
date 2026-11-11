// v0.31.6：前の版で保存したタイムテーブルの照合結果を、新しい版では付け直す（架空データのみ・本番には接続しない）
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
const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }

const P = require('../src/parser.js');
globalThis.MeetParser = P;
const L = require('../src/logic.js');

console.log('[v0.31.6] 前の版の照合結果と、版が変わったときの付け直し');

const it = (str, x, y) => ({ str, x, y, w: String(str).length * 5, h: 9 });
const hdrY = 40;
const pages = [{ width: 595, height: 842, items: [
  it('（第１日）11月14日（土）', 40, 20),
  it('競技開始時刻', 40, hdrY), it('性別', 103, hdrY), it('種目', 169, hdrY),
  it('出場数', 242, hdrY), it('組数', 300, hdrY), it('招集開始', 380, hdrY), it('招集完了', 430, hdrY),
  it('9:40', 40, 80), it('男', 90, 80), it('（混）', 156, 80), it('100m', 186, 80), it('21', 252, 80), it('1～3組', 300, 80), it('9:10', 380, 80), it('9:20', 430, 80),
  it('9:50', 40, 100), it('1～8組', 300, 100), it('9:20', 380, 100), it('9:30', 430, 100),
  it('11:10', 40, 180), it('男', 90, 180), it('100m', 169, 180), it('540', 252, 180), it('33～40組', 300, 180), it('10:40', 380, 180), it('10:50', 430, 180)
] }];
const newTt = P.parseTimetable(pages);
// 前の版の読み取り：続きの組が落ち、混成100mが通常の100mに当たっている
const oldTt = [
  { event: '100m', time: '9:40', gender: '男', cat: null, heats: { from: 1, to: 3 }, date: '11/14', callStart: '9:10', callEnd: '9:20' },
  { event: '100m', time: '11:10', gender: '男', cat: null, heats: { from: 33, to: 40 }, date: '11/14', callStart: '10:40', callEnd: '10:50' }
];
const sl = { format: 'startlist', hasTimes: false, warnings: [], diag: [], dates: [], relays: [], entries: [
  { team: '架空高', event: '男子 100m', round: '', heat: 3, pos: 1, posKind: 'レーン', bib: '1', name: '架空 太郎', grade: '2', page: 1 },
  { team: '架空高', event: '男子 100m', round: '', heat: 4, pos: 2, posKind: 'レーン', bib: '2', name: '架空 次郎', grade: '2', page: 1 }
] };

await check('前の版の照合結果では、4組が時刻不明・3組が混成の9:40になる', () => {
  const rows = L.build(sl, oldTt, ['架空高'], {});
  const h3 = rows.find(r => r.heat === 3), h4 = rows.find(r => r.heat === 4);
  assert.equal(h3.start, '9:40');
  assert.equal(h4.start || '', '');
});

await check('同じ資料を今の読み取りで付け直すと、3組・4組とも9:50（混成の9:40ではない）', () => {
  assert.ok(newTt.some(s => s.event === '100m' && s.heats && s.heats.from === 1 && s.heats.to === 8 && s.time === '9:50'));
  const rows = L.build(sl, newTt, ['架空高'], {});
  const h3 = rows.find(r => r.heat === 3), h4 = rows.find(r => r.heat === 4);
  assert.equal(h3.start, '9:50');
  assert.equal(h4.start, '9:50');
});

const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' });
const w = d.window;
w.confirm = () => true; w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, File });
w.fetch = () => Promise.reject(new Error('network prohibited in tests'));
w.indexedDB = new IDBFactory();
w.requestAnimationFrame = f => setTimeout(f, 0);
w.APP_VERSION = 'v0.31.6';
w.eval(src('results.js')); w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js'));
w.eval(src('personal.js')); w.eval(src('auth_common.js')); w.eval(src('app.js'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
await delay();
const app = w.__meetApp;

await check('ssSnap に今の版（parseVer）が入る', () => {
  assert.equal(typeof app.ssSnap, 'function');
  assert.equal(app.parseVerNow(), 'v0.31.6');
  const snap = app.ssSnap();
  assert.equal(snap.v, 1);
  assert.equal(snap.parseVer, 'v0.31.6');
});

await check('前の版の一時保存（parseVer なし／古い版）は付け直しが必要。同じ版なら不要', () => {
  const st = { sl: sl, tt: oldTt, slName: '架空プロ.pdf', ttName: '架空TT.pdf' };
  assert.equal(app.snapNeedsParse({ v: 1, st }), true);
  assert.equal(app.snapNeedsParse({ v: 1, parseVer: 'v0.31.4', st }), true);
  assert.equal(app.snapNeedsParse({ v: 1, parseVer: 'v0.31.6', st }), false);
  assert.equal(app.snapNeedsParse({ v: 1, parseVer: 'v0.31.6', st: {} }), false);
});

await check('古い照合結果を戻すと、控えのPDFが無いときは案内を出し、4組はまだ時刻不明のまま（資料の入れ直しを促す）', async () => {
  Object.assign(app.state, { sl, tt: oldTt, slName: '架空プロ.pdf', ttName: '架空TT.pdf', teams: ['架空高'], day: '', notes: null });
  const school = w.document.getElementById('school');
  if (school) { school.value = '架空高'; school.dispatchEvent(new w.Event('input', { bubbles: true })); }
  app.updateTeams(); app.render(); await delay();
  const h4 = app.state.rows.find(r => r.event === '男子 100m' && r.heat === 4);
  assert.ok(h4); assert.equal(h4.start || '', '');
  const r = await app.reparseIfNeeded({ v: 1, parseVer: 'v0.31.4', st: { sl, tt: oldTt } });
  assert.equal(r.needed, true); assert.equal(r.got, 0);
  const note = w.document.getElementById('ssNoteText');
  const box = w.document.getElementById('ssNote');
  assert.ok(note && /もう一度入れてください/.test(note.innerHTML));
  assert.equal(box && box.hidden, false);
});

await check('同じ版の一時保存を戻すときは案内を出さず、付け直さない', async () => {
  const note = w.document.getElementById('ssNoteText');
  if (note) note.innerHTML = '';
  const box = w.document.getElementById('ssNote');
  if (box) box.hidden = true;
  const r = await app.reparseIfNeeded({ v: 1, parseVer: 'v0.31.6', st: { sl, tt: oldTt } });
  assert.equal(r.needed, false); assert.equal(r.got, 0);
  assert.equal((w.document.getElementById('ssNoteText') || {}).innerHTML, '');
});

console.log(`\n${pass} ok / ${fail} NG`);
if (fail) process.exit(1);

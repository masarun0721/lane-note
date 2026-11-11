// v0.31.7：複数日の大会で記録用紙などの日付は対象日／プログラムの「決勝」と「1組ＩＮ20名」の組（架空データのみ）
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

console.log('[v0.31.7] 対象日の日付と、決勝・組見出しの読み取り');

const it = (str, x, y, h = 5.7) => ({ str, x, y, w: String(str).length * 5, h });
function names(pageItems) {
  return [{ width: 595, height: 842, items: pageItems }];
}

await check('見出しから離れた「決勝」だけ（記録の行の下）はラウンド＝決勝、組は1（⚠組? にしない）', () => {
  const pages = names([
    it('男子 3000mSC', 31, 43, 16),
    it('日本高校記録', 31, 58, 8), it('8:32.12', 200, 58, 8),
    it('日本高校国際', 31, 70, 8),
    it('東京高校記録', 31, 82, 8),
    it('決勝', 31, 94, 13),
    it('ORD', 31, 101, 5), it('ﾅﾝﾊﾞｰ', 44, 102, 6),
    it('氏', 70, 102, 6), it('名', 82, 102, 6),
    it('所', 140, 102, 6), it('属', 152, 102, 6),
    it('順位', 220, 102, 6),
    it('架空 太郎(2)', 70, 128, 8),
    it('1', 31, 130), it('1001', 44, 130, 6), it('架空高', 140, 130)
  ]);
  const sl = P.parseStartList(pages);
  assert.equal(sl.entries.length, 1, 'entries ' + sl.entries.length);
  const e = sl.entries[0];
  assert.equal(e.round, '決勝', 'round=' + e.round);
  assert.equal(e.heat, 1, 'heat=' + e.heat);
  const rows = L.build(sl, [{ event: '3000mSC', gender: '男', time: '9:30', heats: { from: 1, to: 1 } }], ['架空高'], {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].heat, 1);
  assert.ok(!rows[0].heatNG);
  assert.equal(L.heatText(rows[0]), 1);
  assert.equal(rows[0].start, '9:30');
});

await check('「1組ＩＮ20名」「2組ＩＮ20名」は組番号として読む', () => {
  const pages = names([
    it('男子 5000m', 31, 40, 16),
    it('タイムレース', 31, 94, 13), it('全3組', 118, 94, 13),
    it('1組ＩＮ20名', 44, 107, 13), it('ＯＵＴ10名', 306, 107, 13),
    it('ORD', 31, 114, 5), it('ﾅﾝﾊﾞｰ', 44, 114, 6),
    it('氏', 70, 114, 6), it('名', 82, 114, 6),
    it('所', 140, 114, 6), it('属', 152, 114, 6),
    it('順位', 220, 114, 6),
    it('架空 太郎(2)', 70, 140, 8),
    it('1', 31, 142), it('2001', 44, 142, 6), it('架空高', 140, 142),
    it('2組ＩＮ20名', 44, 400, 13),
    it('ORD', 31, 407, 5), it('ﾅﾝﾊﾞｰ', 44, 407, 6),
    it('氏', 70, 407, 6), it('名', 82, 407, 6),
    it('所', 140, 407, 6), it('属', 152, 407, 6),
    it('順位', 220, 407, 6),
    it('見本 次郎(3)', 70, 430, 8),
    it('1', 31, 432), it('2002', 44, 432, 6), it('見本高', 140, 432)
  ]);
  const sl = P.parseStartList(pages);
  const a = sl.entries.find(e => e.team === '架空高');
  const b = sl.entries.find(e => e.team === '見本高');
  assert.ok(a && b, 'both entries: ' + sl.entries.map(e => e.team + '/' + e.heat).join(','));
  assert.equal(a.heat, 1);
  assert.equal(b.heat, 2);
  assert.equal(a.round, 'タイムレース');
  const rows = L.build(sl, [{ event: '5000m', gender: '男', time: '14:15', heats: { count: 3, bare: true } }], ['見本高'], {});
  assert.equal(rows[0].heat, 2);
  assert.ok(!rows[0].heatNG);
  assert.notEqual(L.heatText(rows[0]), '⚠組?');
});

await check('「1組ＩＮ20名」が左・右列に選手がいるときは、右列も同じ組（横並びの別組とは区別）', () => {
  const pages = names([
    it('男子 5000m', 31, 40, 16),
    it('タイムレース', 31, 60, 13),
    it('1組ＩＮ20名', 44, 80, 13), it('ＯＵＴ10名', 306, 80, 13),
    it('ORD', 31, 90, 5), it('ﾅﾝﾊﾞｰ', 44, 90, 6),
    it('氏', 70, 90, 6), it('名', 82, 90, 6),
    it('所', 140, 90, 6), it('属', 152, 90, 6),
    it('順位', 220, 90, 6),
    it('ORD', 306, 90, 5), it('ﾅﾝﾊﾞｰ', 319, 90, 6),
    it('氏', 350, 90, 6), it('名', 362, 90, 6),
    it('所', 420, 90, 6), it('属', 432, 90, 6),
    it('順位', 500, 90, 6),
    it('架空 太郎(2)', 70, 120, 8),
    it('1', 31, 122), it('2001', 44, 122, 6), it('架空高', 140, 122),
    it('見本 次郎(3)', 350, 120, 8),
    it('21', 306, 122), it('2002', 319, 122, 6), it('見本高', 420, 122),
    it('2組ＩＮ20名', 44, 280, 13), it('ＯＵＴ10名', 306, 280, 13),
    it('ORD', 31, 290, 5), it('ﾅﾝﾊﾞｰ', 44, 290, 6),
    it('氏', 70, 290, 6), it('名', 82, 290, 6),
    it('所', 140, 290, 6), it('属', 152, 290, 6),
    it('順位', 220, 290, 6),
    it('ORD', 306, 290, 5), it('ﾅﾝﾊﾞｰ', 319, 290, 6),
    it('氏', 350, 290, 6), it('名', 362, 290, 6),
    it('所', 420, 290, 6), it('属', 432, 290, 6),
    it('順位', 500, 290, 6),
    it('試験 三郎(1)', 70, 320, 8),
    it('1', 31, 322), it('2003', 44, 322, 6), it('試験高', 140, 322),
    it('試験 四郎(1)', 350, 320, 8),
    it('21', 306, 322), it('2004', 319, 322, 6), it('例示高', 420, 322)
  ]);
  const sl = P.parseStartList(pages);
  const byTeam = Object.fromEntries(sl.entries.map(e => [e.team, e.heat]));
  assert.equal(byTeam['架空高'], 1, JSON.stringify(byTeam));
  assert.equal(byTeam['見本高'], 1);
  assert.equal(byTeam['試験高'], 2);
  assert.equal(byTeam['例示高'], 2);
});

await check('予選で組の見出しが無いときは、今までどおり空欄・⚠組?（1組と推測しない）', () => {
  const pages = names([
    it('男子 200m', 31, 40, 16),
    it('予選', 31, 58, 13),
    it('ORD', 31, 70, 5), it('ﾅﾝﾊﾞｰ', 44, 70, 6),
    it('氏', 70, 70, 6), it('名', 82, 70, 6),
    it('所', 140, 70, 6), it('属', 152, 70, 6),
    it('順位', 220, 70, 6),
    it('架空 太郎(2)', 70, 100, 8),
    it('1', 31, 102), it('3001', 44, 102, 6), it('架空高', 140, 102)
  ]);
  const sl = P.parseStartList(pages);
  assert.equal(sl.entries.length, 1);
  assert.equal(sl.entries[0].round, '予選');
  assert.equal(sl.entries[0].heat, null);
  const rows = L.build(sl, [], ['架空高'], {});
  assert.equal(rows[0].heat, '');
  assert.equal(rows[0].heatNG, true);
  assert.equal(L.heatText(rows[0]), '⚠組?');
});

await check('決勝でも「1組」「2組」と書いてあれば、その組番号を使う（全員を1組にしない）', () => {
  const pages = names([
    it('男子 100m', 31, 40, 16),
    it('決勝', 31, 58, 13),
    it('1組', 31, 72, 10), it('2組', 310, 72, 10),
    it('ORD', 31, 85, 5), it('ﾅﾝﾊﾞｰ', 44, 85, 6),
    it('氏', 70, 85, 6), it('名', 82, 85, 6),
    it('所', 140, 85, 6), it('属', 152, 85, 6),
    it('順位', 220, 85, 6),
    it('ORD', 310, 85, 5), it('ﾅﾝﾊﾞｰ', 323, 85, 6),
    it('氏', 350, 85, 6), it('名', 362, 85, 6),
    it('所', 420, 85, 6), it('属', 432, 85, 6),
    it('順位', 500, 85, 6),
    it('架空 太郎(2)', 70, 110, 8),
    it('1', 31, 112), it('4001', 44, 112, 6), it('架空高', 140, 112),
    it('見本 次郎(2)', 350, 110, 8),
    it('1', 310, 112), it('4002', 323, 112, 6), it('見本高', 420, 112)
  ]);
  const sl = P.parseStartList(pages);
  const a = sl.entries.find(e => e.team === '架空高');
  const b = sl.entries.find(e => e.team === '見本高');
  assert.ok(a && b, JSON.stringify(sl.entries));
  assert.equal(a.heat, 1);
  assert.equal(b.heat, 2);
});

const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
async function openApp() {
  const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' });
  const w = d.window;
  w.confirm = () => true; w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, File });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests'));
  w.indexedDB = new IDBFactory();
  w.requestAnimationFrame = function () { return 0; };
  w.APP_VERSION = 'v0.31.7';
  w.eval(src('results.js')); w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js'));
  w.eval(src('personal.js')); w.eval(src('auth_common.js')); w.eval(src('app.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await delay();
  return w;
}

function loadMeet(w, extra) {
  const app = w.__meetApp;
  const sl = { format: 'startlist', hasTimes: false, warnings: [], diag: [], dates: ['11/14', '11/15'], relays: [], entries: [
    { team: '架空高', event: '男子 100m', round: '予選', heat: 1, pos: 1, posKind: 'レーン', bib: '1', name: '架空 太郎', grade: '2', page: 1, date: '11/14' },
    { team: '架空高', event: '男子 200m', round: '予選', heat: 3, pos: 2, posKind: 'レーン', bib: '1', name: '架空 太郎', grade: '2', page: 1, date: '11/15' },
    { team: '架空高', event: '男子 3000mSC', round: '決勝', heat: 1, pos: 9, posKind: 'ORD', bib: '2', name: '架空 次郎', grade: '3', page: 1, date: '11/15' }
  ] };
  const tt = [
    { event: '100m', gender: '男', time: '9:50', date: '11/14', heats: { from: 1, to: 1 }, callStart: '9:20', callEnd: '9:30' },
    { event: '200m', gender: '男', time: '10:50', date: '11/15', heats: { from: 3, to: 3 }, callStart: '10:20', callEnd: '10:30' },
    { event: '3000mSC', gender: '男', time: '9:30', date: '11/15', heats: { from: 1, to: 1 }, callStart: '9:00', callEnd: '9:10' }
  ];
  app.state.sl = sl; app.state.tt = tt; app.state.slName = '架空プロ.pdf'; app.state.ttName = '架空TT.pdf';
  app.state.teams = ['架空高']; app.state.allTeams = ['架空高'];
  app.state.date = { iso: '2026-11-14', label: '2026年11月14日（土）', src: '大会要項：2026年11月14日（土）・15日（日）' };
  const md = w.document.getElementById('meetDate');
  w.document.getElementById('meetName').value = '架空秋季記録会';
  md.value = '2026年11月14日（土）';
  if (extra && extra.manual) md.dataset.manual = '1';
  if (extra && extra.day) app.state.day = extra.day;
  app.render();
  return app;
}

await check('対象日 11/15：記録用紙・出場一覧の右上と共有リンクの日付は11月15日（日）（入力欄が1日目のままでも）', async () => {
  const w = await openApp();
  const app = loadMeet(w, { manual: true, day: '11/15' });
  assert.equal(w.document.getElementById('meetDate').value, '2026年11月14日（土）', '手入力の大会日付欄は残す');
  assert.equal(app.sheetDate(), '2026年11月15日（日）');
  const recDates = [...w.document.querySelectorAll('#recSheet .pb-date')].map(e => e.textContent);
  const timeDates = [...w.document.querySelectorAll('#printTime .pb-date')].map(e => e.textContent);
  assert.deepEqual(recDates, ['2026年11月15日（日）'], '記録用紙 ' + recDates);
  assert.deepEqual(timeDates, ['2026年11月15日（日）'], '出場一覧 ' + timeDates);
  assert.match(w.document.getElementById('printTitle').textContent, /2026年11月15日（日）/);
  assert.match(app.recHead().sub, /2026年11月15日（日）/);
  assert.equal(app.payloadFromState().d, '2026年11月15日（日）');
  const evs = app.state.rows.map(r => r.event).sort();
  assert.ok(evs.includes('男子 200m') && evs.includes('男子 3000mSC') && !evs.includes('男子 100m'), evs.join(','));
  w.close();
});

await check('対象日 11/14：日付は11月14日（土）。対象日を変えると記録用紙の日付も変わる', async () => {
  const w = await openApp();
  const app = loadMeet(w, { day: '11/14' });
  assert.equal(app.sheetDate(), '2026年11月14日（土）');
  assert.equal(w.document.querySelector('#recSheet .pb-date').textContent, '2026年11月14日（土）');
  const ds = w.document.getElementById('daySel');
  ds.value = '11/15';
  ds.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(app.sheetDate(), '2026年11月15日（日）');
  assert.equal(w.document.querySelector('#recSheet .pb-date').textContent, '2026年11月15日（日）');
  assert.equal(w.document.querySelector('#printTime .pb-date').textContent, '2026年11月15日（日）');
  assert.equal(app.payloadFromState().d, '2026年11月15日（日）');
  w.close();
});

console.log('\n' + pass + ' ok / ' + fail + ' NG');
process.exit(fail ? 1 : 0);

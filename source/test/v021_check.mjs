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
['results.js', 'parser.js', 'logic.js', 'player.js', 'personal.js', 'auth_common.js', 'parent.js', 'notice.js', 'overlay.js', 'app.js'].forEach(f => w.eval(src(f)));
const LN = w.LaneNotice;
w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
const app = w.__meetApp, $ = id => w.document.getElementById(id);
Object.assign(app.state, { sl: fakeSl(), tt: fakeTt(), teams: ['架空中'], slName: '架空.pdf', ttName: '架空TT.pdf' }); $('meetName').value = '第1回架空区大会'; app.render(); await delay();
const store = {}; Object.defineProperty(w, 'localStorage', { value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, configurable: true });
const JSZip = (await import('jszip')).default; w.JSZip = JSZip; const blobs = []; w.URL.createObjectURL = b => { blobs.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
const ED = () => $('ntEdit'), q = s => ED().querySelector(s), setv = async (sel, v) => { const e = q(sel); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); await delay(320); };
const doc = () => $('pvFrame').srcdoc;
app.state.docText = { yoko: '会場：架空区総合運動場陸上競技場\n最寄駅：架空駅 徒歩5分\n開門 8:00 競技開始 9:30' };
$('meetDate').value = '2026年10月18日';
await check('「👪 保護者へのお知らせ」→ タイトル・要点・2つの表（他校は入らない）', async () => {
  $('btnParent').click(); await delay();
  assert.equal($('parentView').hidden, false);
  assert.match(doc(), /<h1>第1回架空区大会について<\/h1>/); assert.match(doc(), /保護者各位/);
  assert.match(doc(), /令和8年10月18日（日）/); assert.match(doc(), /架空区総合運動場陸上競技場/); assert.match(doc(), /架空駅/);
  assert.match(doc(), /山田 太郎/); assert.match(doc(), /佐藤 花子/); assert.doesNotMatch(doc(), /他校 一郎/); assert.match(doc(), /（通過したら）/); assert.doesNotMatch(doc(), /<span>出場選手<\/span>/, '出場選手表ははじめは出さない'); assert.match(doc(), /<span>時間順の予定<\/span>/); assert.match(doc(), /class="tent"/);
  assert.match(q('[data-m="venue"]').nextElementSibling.textContent, /大会要項から/);
});
await check('集合時刻：自校の最初の種目の2時間前（ルールを変えると計算し直す・手で直したらそのまま）', async () => {
  const first = Math.min(...app.state.rows.filter(r => r.start).map(r => LN.toMin(r.start)));
  assert.equal(q('[data-m="gather"]').value, LN.fmtMin(first - 120));
  const sel = q('[data-t="call.base"]'); sel.value = 'gate'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.equal(q('[data-m="gather"]').value, '6:00'); assert.match(doc(), /6:00<\/div><div class="cs">競技場 正門前/);
  await setv('[data-m="gather"]', '7:15'); assert.match(doc(), /7:15/);
});
await check('学校の設定：学校名・顧問・タイトル・持ち物（追加・削除）・自由欄・レイアウト3つ', async () => {
  await setv('[data-t="school"]', '架空区立架空中学校'); assert.match(doc(), /架空区立架空中学校　陸上競技部/);
  q('[data-list="advisors"] [data-la="add"]').click(); await delay(); await setv('[data-list="advisors"] [data-li="0"]', '坂田'); assert.match(doc(), /顧問　坂田/);
  await setv('[data-t="title"]', '{大会名}の出場について'); assert.match(doc(), /第1回架空区大会の出場について/);
  q('[data-list="belongings.items"] [data-la="del"][data-i="0"]').click(); await delay(); assert.doesNotMatch(doc(), /ユニフォーム・/);
  $('ntEdit').querySelector('#ntFree').click(); await delay(); await setv('.nt-sec:last-of-type [data-sk="text"]', '応援よろしくお願いします{集合時刻}'); assert.match(doc(), /応援よろしくお願いします7:15/);
  for (const [l, re] of [['table', /class="L-table"[\s\S]*class="cards/], ['clean', /class="L-clean"[\s\S]*class="nt-dl"/], ['std', /class="L-std"[\s\S]*class="band"[\s\S]*class="chk"[\s\S]*LANE NOTE/]]) { q(`[data-layout="${l}"]`).click(); await delay(); assert.match(doc(), re, l); assert.equal(q(`[data-layout="${l}"]`).getAttribute('aria-checked'), 'true'); }
  q('[data-accent="red"]').click(); await delay(); assert.match(doc(), /--a:#c8452b/);
  const mo = q('[data-t="mono"]'); mo.checked = true; mo.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); assert.match(doc(), /--a:#000000/); assert.match(doc(), /class="L-std mono"/);
  const s = q('[data-son="1"]'); s.checked = false; s.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); assert.doesNotMatch(doc(), /<h1>/);
  s && (q('[data-son="1"]').checked = true, q('[data-son="1"]').dispatchEvent(new w.Event('change', { bubbles: true }))); await delay();
  q('[data-sa="down"][data-i="0"]').click(); await delay(); assert.ok(doc().indexOf('<h1>') < doc().indexOf('保護者各位'), '↓で順番が変わる');
});
await check('ひな形を保存→この端末に残る・開き直すと同じ設定（壊れたデータは初期値で補う）', async () => {
  q('#ntSave').click(); await delay(); const k = Object.keys(store).find(x => /parent-template/.test(x)); assert.ok(k); const t = JSON.parse(store[k]);
  assert.equal(t.school, '架空区立架空中学校'); assert.deepEqual(t.advisors, ['坂田']); assert.ok(t.sections.some(x => x.type === 'free'));
  assert.match($('pvMsg').textContent, /保存しました/);
  const z = LN.sanitize({ layout: 'evil', size: 99, sections: [{ type: 'x' }, { type: 'free', id: 'a', title: 1 }], cautions: [1, 'a'] }); assert.equal(z.layout, 'std'); assert.equal(z.size, 10.5); assert.deepEqual(z.cautions, ['a']); assert.equal(z.sections.length, 10);
});
await check('📋 コピー（text/html＋text/plain）・Excel 2枚・Word（.docx）', async () => {
  $('pvCopyAth').click(); await delay(); $('pvCopyTime').click(); await delay();
  assert.equal(copied.length, 2); assert.match(copied[0].html, /^<table style="border-collapse:collapse/); assert.match(copied[1].text, /^時刻\t招集\t種目\t出る人/);
  $('pvXlsx').click(); assert.equal(aoas.length, 1); assert.deepEqual(aoas[0][1].map(s => s[0]), ['出場選手', '時間順の予定']);
  $('pvDocx').click(); await delay(300); assert.equal(blobs.length, 1);
  const zz = await JSZip.loadAsync(blobs[0] instanceof Uint8Array ? blobs[0] : await blobs[0].arrayBuffer()); const x = await zz.file('word/document.xml').async('string');
  assert.match(x, /第1回架空区大会の出場について/); assert.match(x, /山田 太郎/); assert.match(x, /<w:numId w:val="1"\/>/); assert.match(x, /<w:pgSz w:w="11906" w:h="16838"\/>/); assert.ok(zz.file('word/numbering.xml'));
  $('pvClose').click(); assert.equal($('parentView').hidden, true);
});
await check('v0.22.2 要項の実際の書き方（期　日／場　所・番号つき）から 日付・競技開始・競技場名だけ・住所・電話', () => {
  const f = LN.extract({ yoko: '4．期　　日　　2026年10月11日（日）　9時30分競技開始予定\n5．場　　所　　スピアーズえどりくフィールド　〒134-0087 江戸川区清新町２－１－１　電話 03-3878-3388' });
  assert.equal(f.venue.v, 'スピアーズえどりくフィールド'); assert.equal(f.address.v, '〒134-0087 江戸川区清新町2-1-1'); assert.equal(f.phone.v, '03-3878-3388');
  assert.equal(f.date.v, '2026年10月11日'); assert.equal(f.start.v, '9:30');
  assert.equal(LN.extract({ yoko: '会　場　駒沢オリンピック公園陸上競技場' }).venue.v, '駒沢オリンピック公園陸上競技場');
  const T = LN.defaults(); T.call.base = 'start'; assert.equal(LN.gatherTime(T.call, { start: f.start.v }), '7:30');
});
await check('v0.22.2 競技場リスト：要項の名前と一部一致で選ばれ、最寄り駅・集合場所が入る／新しい競技場は「保存」できる', async () => {
  const T = LN.defaults(); T.venues = [{ name: 'えどりくフィールド', station: '西葛西駅', access: '徒歩15分', place: 'スタンド下', address: '', memo: '' }];
  assert.equal(LN.findVenue(T, 'スピアーズえどりくフィールド'), 0); assert.equal(LN.findVenue(T, '駒沢'), -1);
  assert.equal(LN.sanitize({ venues: [{ name: '' }, { name: 'A', station: 1 }] }).venues.length, 1);
  app.state.docText = { yoko: '5．場　　所　　スピアーズえどりくフィールド　〒134-0087 江戸川区清新町２－１－１' };
  $('btnParent').click(); await delay();
  assert.equal(q('[data-va="save"]'), null, '古い「この競技場を保存」は無い');
  assert.match(q('.nt-hint').textContent, /要項の競技場「スピアーズえどりくフィールド」は未登録です/);
  q('[data-va="regfound"]').click(); await delay();
  assert.equal($('venueView').hidden, false); const F = n => $('vnForm').querySelector(`[name="${n}"]`);
  assert.equal(F('name').value, 'スピアーズえどりくフィールド'); assert.equal(F('address').value, '〒134-0087 江戸川区清新町2-1-1');
  F('station').value = '西葛西駅'; F('place').value = 'スタンド下'; F('fareRound').value = '1040'; F('route').value = '本郷三丁目駅〜西葛西駅';
  $('vnForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await delay();
  assert.equal($('vnBody').querySelectorAll('.vn-card').length, 1); assert.match($('vnBody').textContent, /往復1,040円程度/);
  $('vnClose').click(); await delay(); assert.equal($('venueView').hidden, true); assert.equal($('parentView').hidden, false);
  assert.equal(q('[data-venue]').value, '0'); assert.equal(q('.nt-hint'), null); assert.match(doc(), /西葛西駅/); assert.match(doc(), /スタンド下/);
  assert.match(doc(), /交通費[\s\S]{0,200}往復1,040円程度（本郷三丁目駅〜西葛西駅）/, '要点に交通費');
  const fb = q('[data-t="fareInBelongings"]'); fb.checked = true; fb.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.match(doc(), /<li><i><\/i>交通費（往復1,040円程度/, '持ち物にも');
  await setv('[data-m="station"]', '葛西駅'); assert.match(doc(), /葛西駅/); assert.equal(LN.sanitize(JSON.parse(store[Object.keys(store).find(x => /parent-template/.test(x))])).venues[0].station, '西葛西駅', 'この大会だけの変更は競技場に書き戻さない');
  await setv('[data-m="fare"]', '往復1,200円程度'); assert.match(doc(), /往復1,200円程度/); assert.doesNotMatch(doc(), /1,040/);
  // 編集・削除（確認つき）
  q('[data-va="open"]').click(); await delay(); $('vnBody').querySelector('[data-ve="0"]').click(); await delay();
  F('memo').value = 'スタンド下に集合'; $('vnForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await delay(); assert.match($('vnBody').textContent, /スタンド下に集合/);
  $('vnBody').querySelector('#vnAdd').click(); await delay(); $('vnForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await delay(); assert.match($('vnMsg').textContent, /名前を入れてください/);
  $('vnCancel').click(); await delay(); assert.equal($('vnBody').querySelectorAll('.vn-card').length, 1);
  w.confirm = () => false; $('vnBody').querySelector('[data-vd="0"]').click(); await delay(); assert.equal($('vnBody').querySelectorAll('.vn-card').length, 1, '確認でやめたら消さない'); w.confirm = () => true;
  assert.equal(LN.sanitize({ venues: [{ name: '旧', station: 'X駅' }] }).venues[0].phone, '', '前の形式もそのまま読める');
  $('vnClose').click(); await delay();
  $('pvClose').click(); await delay();
  $('btnVenues').click(); await delay(); assert.equal($('venueView').hidden, false, '大会準備のボタンからも開ける'); assert.ok($('venueView').querySelector('.ov-back'));
  w.dispatchEvent(new w.PopStateEvent('popstate', { state: null })); await delay(); assert.equal($('venueView').hidden, true, '戻るで閉じる');
  assert.equal(LN.fareText({ route: '本郷三丁目駅〜西葛西駅' }), '', '金額がなければ書かない（推測しない）');
  $('pvClose').click(); await delay();
});
await check('v0.22.2 全画面に「← 戻る」・開くと pushState、ブラウザの戻る（popstate）で閉じる', async () => {
  const before = w.history.length;
  $('btnParent').click(); await delay();
  const back = $('parentView').querySelector('.ov-back'); assert.ok(back); assert.equal(back.textContent, '← 戻る');
  assert.equal(w.history.state && w.history.state.laneOv, 'parentView');
  w.dispatchEvent(new w.PopStateEvent('popstate', { state: null })); await delay();
  assert.equal($('parentView').hidden, true, '戻るで閉じる');
  $('btnParent').click(); await delay(); back.click(); await delay(); assert.equal($('parentView').hidden, true);
  for (const id of ['docView', 'shareDlg', 'playerDlg']) assert.ok($(id).querySelector('.ov-back'), id);
});
await check('v0.22.2 読み込んだ内容を sessionStorage に控え、再読み込みで戻す／「最初から」で消す', async () => {
  $('school').value = '架空'; app.updateTeams(); app.render(); app.ssSave(); await delay(500);
  const raw = w.sessionStorage.getItem('lanenote-meet-session'); assert.ok(raw); const o = JSON.parse(raw);
  assert.ok(o.st.sl.entries.length); assert.equal(o.inp.meetName.v, '第1回架空区大会');
  // 新しいページで戻す
  const d2 = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' }); const w2 = d2.window; await delay();
  Object.assign(w2, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob }); w2.alert = () => {}; w2.confirm = () => true; w2.scrollTo = () => {}; w2.fetch = () => Promise.reject(new Error('x')); w2.indexedDB = new IDBFactory(); w2.requestAnimationFrame = f => setTimeout(f, 0);
  w2.sessionStorage.setItem('lanenote-meet-session', raw);
  ['results.js', 'parser.js', 'logic.js', 'player.js', 'personal.js', 'auth_common.js', 'parent.js', 'notice.js', 'overlay.js', 'app.js'].forEach(f => w2.eval(src(f)));
  w2.document.dispatchEvent(new w2.Event('DOMContentLoaded')); await delay(50);
  const a2 = w2.__meetApp; assert.equal(w2.document.getElementById('meetName').value, '第1回架空区大会'); assert.ok(a2.state.rows.length > 0, '結果がもう一度出る'); assert.equal(w2.document.getElementById('ssNote').hidden, false);
  a2.resetAll(); await delay(500); assert.equal(w2.sessionStorage.getItem('lanenote-meet-session'), null);
});
await check('ビルド結果：版 v0.22・試し版の印なし・使い方に説明', () => {
  const I = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'), G = fs.readFileSync(path.join(OUT, 'guide.html'), 'utf8');
  assert.match(I, /v0\.22/); assert.match(I, /id="btnParent"[^>]*>👪 保護者へのお知らせ</); assert.doesNotMatch(I, /class="trial">試し版/); assert.match(I, /var LaneNotice/); assert.match(G, /id="g11"[^<]*<\/span>👪 保護者へのお知らせ/);
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

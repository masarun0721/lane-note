// v0.18／記録 v0.9.1：記録用紙の「自己ベスト」欄・はじめての人はこちら（guide.html）・ヘッダーの統一・個人表の作り直し（架空データのみ・本番には接続しない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), ROOT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), built = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const R = require('../src/results.js');
const fakeSl = () => ({ format: 'startlist', hasTimes: false, warnings: [], diag: [], relays: [], entries: [
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 2, pos: 4, posKind: 'レーン', bib: '101', name: '山田 太郎', grade: '2', page: 1 },
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 3, pos: 5, posKind: 'レーン', bib: '102', name: '見本 次郎', grade: '1', page: 1 },
  { team: '架空中', event: '男子 中学 走幅跳', round: '決勝', heat: null, pos: 7, posKind: '試技順', bib: '101', name: '山田 太郎', grade: '2', page: 2 },
  { team: '他校中', event: '男子 中学 100m', round: '予選', heat: 1, pos: 3, posKind: 'レーン', bib: '201', name: '他校 花子', grade: '3', page: 1 }] });
const fakeTt = () => [
  { event: '100m', gender: '男子', cat: '中学', round: '予選', time: '10:00', heats: null },
  { event: '100m', gender: '男子', cat: '中学', round: '準決勝', time: '12:30', heats: null, callStart: '12:00', callEnd: '12:10' },
  { event: '100m', gender: '男子', cat: '中学', round: '決勝', time: '15:00', heats: null },
  { event: '走幅跳', gender: '男子', cat: '中学', round: '決勝', time: '11:00', heats: null }];


const mk = (name, ev, mark, wind, team, date) => { const r = { name, team: team || '架空中', event: ev, mark, wind: wind || '', date: date || '2026-06-01', meet: '県大会', grade: '2' }; r.id = R.recId(r.meet, r.date, r); return r; };
console.log('[v0.18-1] 自己ベストの引き当て（ResultParser.pbLookup）');
const recs = [mk('山田 太郎', '男子100m', '12.10', '+1.0'), mk('山田 太郎', '男子100m', '11.98', '+2.5', '架空中', '2026-07-01'), mk('山田  太郎', '男子走幅跳', '5m21', '+0.5'), mk('見本 次郎', '男子100m', 'DNS'), mk('同名 一郎', '男子100m', '12.50', '+0.1', '架空中'), mk('同名 一郎', '男子100m', '11.70', '+0.1', '架空高')];
const look = R.pbLookup(recs);
await check('公認ベスト＋参考のほうが良ければ参考も・名前の空白の違いは同じ人', () => {
  const p = look({ name: '山田 太郎', team: '架空中', event: '男子 中学 100m', grade: '2' }); assert.equal(p.best.mark, '12.10'); assert.equal(p.ref.mark, '11.98');
  assert.equal(look({ name: '山田太郎', team: '架空中', event: '男子 中学 走幅跳' }).best.mark, '5m21');
});
await check('記録なし（DNS だけ）・知らない人・別の種目は空欄（null）', () => {
  { const q = look({ name: '見本 次郎', team: '架空中', event: '男子 中学 100m' }); assert.equal(q.best, null); assert.equal(q.ref, null); assert.equal(q.last.mark, 'DNS'); } assert.equal(look({ name: '例題 三郎', team: '架空中', event: '男子 中学 100m' }), null);
  assert.equal(look({ name: '山田 太郎', team: '架空中', event: '男子 中学 200m' }), null);
});
await check('区分（中学／高校）で分ける・区分が決められず同名が2人なら空欄', () => {
  assert.equal(look({ name: '同名 一郎', team: '架空中', event: '男子 中学 100m' }).best.mark, '12.50');
  assert.equal(look({ name: '同名 一郎', team: '架空高', event: '男子 高校 100m' }).best.mark, '11.70');
  assert.equal(look({ name: '同名 一郎', team: '架空', event: '男子100m' }), null);
});

console.log('[v0.18-2] 記録用紙の画面・Excel（jsdom・実際のソース）');
const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' }); const w = d.window; await delay();
w.confirm = () => true; w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory(); w.requestAnimationFrame = f => setTimeout(f, 0);
// 記録のページが置く保存先を先に作る：ログインなし＝lanenote-records、別アカウントの控え＝lanenote-cache-other（出てはいけない）
async function seed(name, rs) { await new Promise((ok, ng) => { const q = w.indexedDB.open(name, 1); q.onupgradeneeded = () => q.result.createObjectStore('records', { keyPath: 'id' }); q.onsuccess = () => { const t = q.result.transaction('records', 'readwrite'); rs.forEach(r => t.objectStore('records').put(r)); t.oncomplete = () => { q.result.close(); ok(); }; t.onerror = ng; }; q.onerror = ng; }); }
await seed('lanenote-records', recs); await seed('lanenote-cache-other', [mk('山田 太郎', '男子100m', '10.01', '+0.0')]);
w.eval(src('results.js')); w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
w.eval(src('app.js').replace('window.__meetApp = {', 'window.__pb={loadPBs:loadPBs,pbOf:pbOf,recAoa:recAoa,bump:function(){authEpoch++;}};\n  window.__meetApp = {'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
const app = w.__meetApp, $ = id => w.document.getElementById(id);
Object.assign(app.state, { sl: fakeSl(), tt: fakeTt(), teams: ['架空中'], slName: '架空.pdf', ttName: '架空TT.pdf' }); app.render(); await delay();
await check('「👀 画面で見る」の記録用紙：「自己ベスト」欄が「記録」の前・公認 12.10＋小さく参考 11.98・別アカウントの控えは出ない', async () => {
  $('btnRecView').click(); await delay(150);
  const ths = [...$('recSheet').querySelectorAll('tr.pcols th')].map(t => t.textContent); assert.equal(ths.indexOf('PB') + 2, ths.indexOf('記録')); assert.equal(ths.indexOf('前回') + 1, ths.indexOf('記録'));
  const sheet = $('recSheet').innerHTML; assert.match(sheet, /<b class="p-pbv">PB 12\.10<\/b><\/td>/); assert.doesNotMatch(sheet, /参考 11\.98/); assert.match(sheet, /<b class="p-pbv">前回 11\.98<span class="p-ref">（参考）<\/span><\/b><small class="p-pbr">7\/1 県大会<\/small>/); assert.match(sheet, /p-gr">2年</); assert.match(sheet, /5m21/); assert.doesNotMatch(sheet, /10\.01/);
  assert.match($('docFrame').srcdoc, /12\.10/); if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, $('recSheet').outerHTML); $('docClose').click();
});
await check('Excel の記録用紙にも「自己ベスト」列（記録の前）', () => {
  const a = w.__pb.recAoa(); const h = a[3]; assert.equal(h.indexOf('PB') + 2, h.indexOf('記録')); assert.equal(h.indexOf('前回大会') + 1, h.indexOf('記録'));
  assert(a.some(r => r[6] === '2年' && r[7] === 'PB 12.10' && /^前回 11\.98（参考）（7\/1 県大会）$/.test(r[8])), JSON.stringify(a.slice(4))); assert(a.slice(4).every(r => r.length === h.length));
});
await check('ログイン・ログアウト（認証の世代が変わる）と、前に読んだ自己ベストは使わない', () => {
  const row = app.state.rows.find(r => r.name === '山田 太郎'); assert(w.__pb.pbOf(row)); w.__pb.bump(); assert.equal(w.__pb.pbOf(row), null);
});
await check('電波なし（fetch 失敗）でも端末の控えから読める', async () => { await w.__pb.loadPBs(); assert.equal(w.__pb.pbOf(app.state.rows.find(r => r.name === '山田 太郎')).best.mark, '12.10'); });

console.log('[v0.18.1] 氏名はどの出力にも出る・PB／前回大会・空は「―」・凡例・アイコン');
await check('画面・印刷（recSheet）・PDF/画面で見る（srcdoc）・Excel のすべてに「氏名」列と選手名、通過したらは（）付き', async () => {
  $('btnRecView').click(); await delay(150);
  const ths = [...$('recSheet').querySelectorAll('tr.pcols th')].map(t => t.textContent);
  assert.deepEqual(ths, ['組', 'レーン', 'No.', '氏名', '学年', 'PB', '前回', '記録', '風', '順位']);
  const cols = [...$('recSheet').querySelectorAll('colgroup col')].map(c => c.style.width); assert.equal(cols.length, ths.length);
  assert(cols.every(c => /%$/.test(c)), '列幅は％（390px でも氏名が0幅にならない）'); assert(parseFloat(cols[3]) >= 20, '氏名がいちばん広い');
  const names = [...$('recSheet').querySelectorAll('td.p-name')].map(t => t.textContent);
  assert(names.some(n => n.includes('山田 太郎'))); assert(names.some(n => /（.*山田 太郎.*）|（山田 太郎）/.test(n)), names.join('/'));
  const doc = new JSDOM($('docFrame').srcdoc).window.document;
  assert([...doc.querySelectorAll('tr.pcols th')].some(t => t.textContent === '氏名')); assert(doc.querySelector('td.p-name').textContent.includes('山田'));
  assert(doc.body.textContent.includes('PB＝これまでの公認ベスト　前回＝この種目のいちばん新しい記録（参考＝追い風参考など公認にならない記録）'));
  assert(!/<img[^>]*src=""/.test($('recSheet').innerHTML), '空の src の画像を出さない'); $('docClose').click();
  const a = w.__pb.recAoa(); assert.equal(a[3][5], '氏名'); assert(a.slice(4).every(r => r[5]));
});
await check('記録のない選手は PB・前回大会とも「―」、DNS は前回大会に薄く', () => {
  const sheet = $('recSheet').innerHTML; assert.match(sheet, /p-none">―</); assert.match(sheet, /p-pbv p-bad">前回 DNS</);
  const a = w.__pb.recAoa(); assert(a.slice(4).some(r => r[7] === '―'));
});
await check('時間順（出場一覧）も氏名列が％幅', () => { $('btnPrintView').click(); const c = [...$('printTime').querySelectorAll('colgroup col')].map(x => x.style.width); assert(c.every(x => /%$/.test(x))); $('docClose').click(); });

console.log('[v0.18-3] はじめての人はこちら・ヘッダー・短い説明');
const G = built('guide.html'), I = built('index.html'), RC = built('records.html'), SW = built('sw.js');
await check('guide.html：9つの項目と、データの取り扱いの全文・免責・試作版の説明がある', () => {
  ['大会準備', '記録', '選手ページ', '個人で使う', 'ログインと保存場所', 'データの取り扱い（全文）', '共有と止め方', '体調メモ', 'よくある質問'].forEach(s => assert(G.includes(s), s));
  ['PDFは、ふだんはこの端末の中だけで読みます', 'ハッシュ確認はしていません', '共有を止めても回収できません', '119日', 'あなた専用のクラウド（Firebase）', '先生にも見えません', 'メールアドレスは送りません', '作成者は責任を負いかねます', '予告なく変わる', '共用のパソコンでは'].forEach(s => assert(G.includes(s), s));
});
await check('大会準備・記録：同じヘッダー（版の書き方・ナビ・試作版の1行・更新情報・はじめての人・不具合）・長い説明は無い', () => {
  for (const P of [I, RC]) {
    assert.match(P, /<div class="hdr-ver" aria-label="バージョン"><span class="appver"><\/span>／記録 v\d+\.\d+\.\d+<\/div>/);
    assert.match(P, /<nav class=\"pagenav ln-nav\"[^>]*>.*📒 記録.*🏁 大会準備<\/a><a href=\"check.html\"[^>]*>✅ 照合<\/a>.*<\/nav>/);   // v0.26.22：はじめての人などもヘッダーのナビに入った（v02622_header_nav.mjs）
    assert.match(P, /<div class="topbar" id="lnTopbar"><details class="changelog" id="changelog">.*<\/details><\/div>/); assert.match(P, /data-tb="guide">🔰 はじめての人はこちら<\/a>.*data-tb="manual">📖 マニュアル<\/a><button type="button" class="tb-btn fb-link" data-feedback="1" data-tb="feedback">🚨 不具合・要望を送る<\/button>/);
    assert.match(P, /<p class="beta-line">⚠️ 試作版です。内容は元資料でも確認してください<\/p>/);
    assert.match(P, /guide\.html#data/); assert(!P.includes('beta-banner"') && !P.includes('id="dataPolicy"><summary>'));
  }
  assert.match(I, /<p class="tagline">大会準備：/); assert.match(RC, /<p class="tagline">記録：/);
});
await check('sw.js：guide.html も初回に保存する', () => { assert.match(SW, /\.\/guide\.html/); assert.match(SW, /getPage\(GUIDE\)/); });
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);

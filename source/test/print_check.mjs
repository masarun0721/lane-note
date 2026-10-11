// v0.9.0（記録）：PDFにまとめる（印刷レイアウト）・選手を選ぶ画面（jsdom・実際のソース）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const tpl = src('records_template.html');
const html = tpl.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/records.html', runScripts: 'outside-only' }); const w = d.window;
let printed = 0, alerted = 0;
w.confirm = () => true; w.alert = () => { alerted++; }; w.print = () => { printed++; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {}; w.indexedDB = new IDBFactory(); w.fetch = () => Promise.reject(new Error('no net'));
w.eval(src('auth_common.js')); w.eval(src('results.js')); w.eval(src('print.js'));
w.eval(src('records_app.js').replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();'));
const R = w.ResultParser, t = w.__t, $ = id => w.document.getElementById(id);
const mk = (name, ev, date, mark, meet, grade) => { const r = { name, team: '架空中', event: ev, mark, wind: /^\d/.test(mark) ? '+0.5' : '', date, meet, grade }; r.id = R.recId(r.meet, r.date, r); return r; };
console.log('[PDFにまとめる]');
try {
  w.document.getElementById('rbSchool').value = '架空中';
  await t.putMany([mk('山田 太郎', '男子100m', '2026-04-01', '12.40', '春の大会', '2'), mk('山田 太郎', '男子100m', '2026-06-01', '12.10', '県大会', '2'), mk('山田 太郎', '男子走幅跳', '2026-06-01', '5.10', '県大会', '2'), mk('見本 次郎', '男子100m', '2026-06-01', '12.80', '県大会', '1'), mk('例題 三郎', '男子100m', '2026-05-01', 'DNS', '5月記録会', '3')], t.scope());
  await t.reload(t.scope()); await delay();
  const key = R.athleteKey(mk('山田 太郎', '男子100m', '2026-04-01', '12.40', 'x', '2'));
  await check('LanePrint.athleteSheet：学校名・出力日・LANE NOTE・名前・種目ごとのPB・記録の一覧・グラフ（純粋関数）', () => {
    const s = w.LanePrint.athleteSheet(R, [mk('山田 太郎', '男子100m', '2026-04-01', '12.40', '春', '2'), mk('山田 太郎', '男子100m', '2026-06-01', '12.10', '県', '2')], key, { school: '架空中', date: '2026-10-11', spark: () => '<svg class="spark"></svg>' });
    assert.match(s, /^<section class="lp-page">/); assert.match(s, /架空中/); assert.match(s, /出力日 2026-10-11/); assert.match(s, /LANE NOTE/); assert.match(s, /山田 太郎/);
    assert.match(s, /種目ごとの自己ベスト/); assert.match(s, /12\.10/); assert.match(s, /12\.40/); assert.match(s, /<svg class="lp-svg"/); assert.match(s, /lp-card/); assert.match(s, /公認/); assert.doesNotMatch(s, /<button/);
  });
  await check('名前などは HTML として入らない（エスケープ）', () => {
    const r = mk('<img src=x onerror=1>', '男子100m', '2026-04-01', '12.40', '<b>大会</b>', '1');
    const s = w.LanePrint.athleteSheet(R, [r], R.athleteKey(r), { school: '"><script>' });
    assert.doesNotMatch(s, /<img|<script|<b>大会/);
  });
  await check('印刷CSS：A4・1人1ページの改ページ・印刷時はボタンと他の画面を出さない', () => {
    assert.match(tpl, /@page\{size:A4/); assert.match(tpl, /\.lp-page\{[^}]*break-after:page/); assert.match(tpl, /\.lp-bar,\.lp-pick\{display:none!important\}/); assert.match(tpl, /body\.printing>\*:not\(#rbPrint\)\{display:none!important\}/);
  });
  await check('重ねる画面（#rbPrint）はアプリのスクリプトより前にある（読み込み時に要素が見つかる）', () => {
    assert(tpl.indexOf('id="rbPrint"') > 0 && tpl.indexOf('id="rbPrint"') < tpl.indexOf('__RECAPP__'));
  });
  w.location.hash = '#athlete=' + encodeURIComponent(key); await delay(60);
  await check('選手ページ：3つのボタン（画面で見る・PDF作成・印刷）→「画面で見る」は個人表1ページだけ・印刷ボタンで window.print', async () => {
    const acts = [...$('rbView').querySelectorAll('[data-print="ath"]')].map(b => b.getAttribute('data-act') + ':' + b.textContent);
    assert.deepEqual(acts, ['view:👀 画面で見る', 'pdf:📄 PDF作成', 'print:🖨 印刷']);
    $('rbView').querySelector('[data-print="ath"][data-act="view"]').click();
    assert.equal($('rbPrint').hidden, false); assert($('rbPrintBody').querySelectorAll('.lp-page').length === 1);
    assert.match($('rbPrintBody').textContent, /山田 太郎/); assert($('rbPrintBody').querySelector('svg.lp-svg'));
    assert.equal(printed, 0, '画面で見るでは印刷ダイアログを出さない');
    $('rbPrintGo').click(); await delay(20); assert.equal(printed, 1); assert.equal($('rbPrintHint').hidden, true);
    $('rbPrintClose').click(); assert.equal($('rbPrint').hidden, true); assert(!w.document.body.classList.contains('printing'));
  });
  await check('「📄 PDF作成」は開いて印刷し、『PDFに保存』の案内を出す／「🖨 印刷」は案内なしで印刷', async () => {
    printed = 0; $('rbView').querySelector('[data-print="ath"][data-act="pdf"]').click(); await delay(500);
    assert.equal(printed, 1); assert.equal($('rbPrintHint').hidden, false); assert.match($('rbPrintHint').textContent, /保存先で『PDFに保存』を選んでください/); $('rbPrintClose').click();
    $('rbView').querySelector('[data-print="ath"][data-act="print"]').click(); await delay(30); assert.equal(printed, 2); assert.equal($('rbPrintHint').hidden, true); $('rbPrintClose').click();
  });
  w.location.hash = ''; t.setTab('ath'); await delay(60);
  await check('選手を選ぶ画面：選手一覧の順でチェック・全解除→0人・2人だけ選ぶと2ページ', () => {
    $('rbView').querySelector('[data-print="pick"][data-act="view"]').click();
    const boxes = () => [...$('rbPrintBody').querySelectorAll('[data-ppk]')];
    assert.equal(boxes().length, 3); assert(boxes().every(b => b.checked)); assert.equal($('rbPrintGo').hidden, true);
    $('rbPrintBody').querySelector('[data-ppnone]').click(); assert(boxes().every(b => !b.checked)); assert.equal($('rbPPn').textContent, '0');
    $('rbPrintBody').querySelector('[data-ppmake]').click(); assert.equal(alerted, 1);
    $('rbPrintBody').querySelector('[data-ppall]').click(); assert(boxes().every(b => b.checked));
    $('rbPrintBody').querySelector('[data-ppnone]').click(); boxes()[0].checked = true; boxes()[1].checked = true;
    const names = boxes().slice(0, 2).map(b => b.closest('label').querySelector('b').textContent);
    $('rbPrintBody').querySelector('[data-ppmake]').click();
    const pages = $('rbPrintBody').querySelectorAll('.lp-page'); assert.equal(pages.length, 2);
    names.forEach((n, i) => assert.match(pages[i].querySelector('.lp-big').textContent, new RegExp(n)));
    assert.equal($('rbPrintGo').hidden, false); $('rbPrintClose').click();
  });
  t.setTab('rank'); await delay(60);
  await check('部内ランキング：この種目／全種目（条件と種目名つき）', () => {
    $('rbView').querySelector('[data-print="rank"][data-act="view"]').click();
    let b = $('rbPrintBody'); assert.match(b.textContent, /部内ランキング/); assert.equal(b.querySelectorAll('.lp-ev').length, 1); assert.match(b.querySelector('.lp-cond').textContent, /学年/);
    $('rbPrintClose').click(); $('rbView').querySelector('[data-print="rank-all"]').click();
    assert(b.querySelectorAll('.lp-ev').length >= 2); $('rbPrintClose').click();
  });
  t.setTab('hist'); await delay(60);
  await check('歴代記録：全種目をPDFに', () => {
    $('rbView').querySelector('[data-print="hist-all"]').click();
    assert.match($('rbPrintBody').textContent, /歴代記録/); assert($('rbPrintBody').querySelectorAll('.lp-ev').length >= 2); $('rbPrintClose').click();
  });
} catch (e) { fail++; console.log('  NG 準備', e && e.stack || e); }
console.log(`\nprint_check: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

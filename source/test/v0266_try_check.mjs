// v0.26.6 3分体験（try.html）：架空のサンプルでできあがりまで・保存も通信もしない
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {JSDOM, VirtualConsole} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(here, '../..');
const html = fs.readFileSync(path.join(OUT, 'try.html'), 'utf8'), app = fs.readFileSync(path.join(here, '../src/try_app.js'), 'utf8'), sample = fs.readFileSync(path.join(here, '../src/try_sample.js'), 'utf8');
let ok = 0, ng = 0; const check = async (n, f) => { try { await f(); ok++; console.log('  ok ' + n); } catch (e) { ng++; console.log('  NG ' + n + '\n    ' + e.message); } };
console.log('[v0.26.6] 3分体験');
await check('サンプルである表示・保存しない／送らない旨がある', () => { assert.match(html, /すべて架空のサンプル/); assert.match(html, /何も保存せず、クラウドにも送りません/); });
await check('Firebase・中継・保存の仕組みを読み込まない（try_app/try_sample/ページ）', () => {
  for (const s of [app, sample]) assert(!/localStorage|sessionStorage|indexedDB|firebase|fetch\(|XMLHttpRequest|workers\.dev/i.test(s.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert(!/firebase-config|gstatic\.com\/firebasejs|workers\.dev|<script[^>]+src=/i.test(html));
});
await check('サンプルは架空の名前・学校だけ（「架空」「見本」「例示」などの名前）', async () => { const S = (await import('node:module')).createRequire(import.meta.url)('../src/try_sample.js'); for (const e of S.prep.sl.entries) assert.match(e.team, /^架空/); });
function open() {
  const store = []; const dom = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/try.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), beforeParse(w) {
    for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(w, k, { get() { store.push(k); throw new Error(k + ' は使わない'); } });
    w.fetch = () => { store.push('fetch'); throw new Error('通信しない'); }; w.indexedDB = new Proxy({}, { get() { store.push('idb'); throw new Error('idb'); } }); w.print = () => store.push('print');
  } });
  return { w: dom.window, d: dom.window.document, store };
}
await check('大会準備：選ぶ → 読み取る → 学校名 → 時間順の一覧（招集・開始時刻つき）', () => {
  const { d, store } = open();
  d.getElementById('trPrep').click(); assert.match(d.querySelector('#trBody h2').textContent, /資料を入れる/); assert.match(d.getElementById('trBody').textContent, /サンプルのスタートリスト/);
  d.getElementById('trLoad').click(); assert.equal(d.getElementById('trSchool').value, '架空第一高');
  d.getElementById('trMake').click(); const t = d.getElementById('trOut'); assert(t); const rows = t.querySelectorAll('tr'); assert.equal(rows.length - 1, 8);
  assert.match(t.textContent, /9:30〜9:40/); assert(!/空想 健|見立 葵/.test(t.textContent), 'ほかの学校の選手が入っている');
  assert.match(d.getElementById('trBody').textContent, /できあがり/); assert.equal(d.querySelectorAll('#trSteps li.done').length, 3); assert.deepEqual(store, []);
});
await check('記録：選ぶ → 取り込む → 学校名 → 自己ベストと推移', () => {
  const { d, store } = open();
  d.getElementById('trRec').click(); d.getElementById('trLoad').click(); d.getElementById('trMake').click();
  const t = d.getElementById('trOut'); assert(t); assert.equal(t.querySelectorAll('tr').length - 1, 5);
  assert.match(t.textContent, /架空 一郎/); assert.match(t.textContent, /11\.12/); assert.match(t.textContent, /11\.48 → 11\.31 → 11\.12/); assert.match(t.textContent, /6m48/);
  assert(!/空想 健|模型 翔/.test(t.textContent)); assert(t.querySelector('svg.tr-spark')); assert.deepEqual(store, []);
});
await check('サンプルにいない学校名は、やさしく知らせて先に進まない・もどる／もう一方も体験できる', () => {
  const { d } = open(); d.getElementById('trRec').click(); d.getElementById('trLoad').click();
  d.getElementById('trSchool').value = '本郷高'; d.getElementById('trMake').click(); assert.match(d.getElementById('trMsg').textContent, /サンプルの中にいませんでした/);
  d.getElementById('trSchool').value = '架空第一高'; d.getElementById('trMake').click(); d.querySelector('[data-go="restart"]').click(); assert(d.getElementById('trPrep'));
});
await check('記録・大会準備・はじめての人のページから3分体験へ行ける', () => { for (const f of ['records.html', 'index.html', 'guide.html']) assert(fs.readFileSync(path.join(OUT, f), 'utf8').includes('href="try.html"'), f); });
await check('v0.26.8 sw.js：3分体験も初回に保存する（電波なしでも開ける）', () => { const SW = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8'); assert.match(SW, /\.\/try\.html/); assert.match(SW, /getPage\(TRY\)/); });
await check('v0.26.8 列を選ぶ画面：スマホでは2列で詰めて並べる', () => { const R = fs.readFileSync(path.join(OUT, 'records.html'), 'utf8'); assert.match(R, /@media \(max-width:640px\)\{\.xlmap\{grid-template-columns:1fr 1fr/); });
console.log(ok + ' passed, ' + ng + ' failed'); if (ng) process.exit(1);

// v0.26.7 読み取り失敗の救済：列を選んで読み取る（貼り付けた表・CSV の文章）。架空データのみ
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
async function recW() {
  const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only' }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, File });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory();
  for (const s of ['auth_common.js', 'results.js']) w.eval(src(s));
  let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; assert(js.includes(tail));
  w.eval(js.replace(tail, 'window.__t={scope};renderAuth();')); await delay(80); return w;
}
console.log('[v0.26.7] 読み取り失敗の救済（列を選ぶ）');
await check('splitTable：タブ・カンマ（"…"の中のカンマ）・2つ以上の空白で列に分ける', () => {
  assert.deepEqual(R.splitTable('a\tb\tc\n1\t2\t3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(R.splitTable('氏名,記録\n"架空, 一郎",11.52\n'), [['氏名', '記録'], ['架空, 一郎', '11.52']]);
  assert.deepEqual(R.splitTable('架空 一郎  架空第一高  11.52\n見本 太郎  架空第一高  11.80'), [['架空 一郎', '架空第一高', '11.52'], ['見本 太郎', '架空第一高', '11.80']]);
  assert.equal(R.isTable(R.splitTable('ただの文章です')), false);
});
await check('importRows：表に無い大会名・日付・種目は全行に使う／見出しなし（-1）は1行目から', () => {
  const aoa = [['架空 一郎', '架空第一高', '11.52'], ['見本 太郎', '架空南高', '11.80']];
  const res = R.importRows(aoa, { name: 0, team: 1, mark: 2 }, { headerRow: -1, def: { meet: '架空記録会', date: '2026-09-13', event: '男子100m' } });
  assert.equal(res.recs.length, 2); assert.equal(res.recs[0].meet, '架空記録会'); assert.equal(res.recs[0].date, '2026-09-13'); assert.equal(res.recs[0].event, '男子100m');
  const res2 = R.importRows(aoa, { name: 0, team: 1, mark: 2 }, { headerRow: -1 }); assert.equal(res2.recs.length, 0); assert.equal(res2.bad.length, 2);
});
const PASTE = '架空 一郎\t2\t架空第一高\t11.52\t+0.3\n見本 太郎\t1\t架空第一高\t11.80\t+0.3\n空想 健\t3\t架空南高\t11.20\t+0.3\n';
await check('1件も読めない貼り付けの表 → 「列を選ぶ」画面になり、選ぶと学校の選手だけ保存できる', async () => {
  const w = await recW(), d = w.document;
  d.getElementById('rbSchool').value = '架空第一高';
  d.getElementById('rbPaste').value = PASTE; d.getElementById('rbPasteGo').click(); await delay();
  const box = d.querySelector('#rbBatches .xl'); assert(box, '列を選ぶ画面が出ない: ' + d.getElementById('rbBatches').textContent.slice(0, 200));
  assert.match(box.textContent, /列を自分で選んで読み取ります/); assert(box.querySelector('.rb-sample'), '表の見本が出ない');
  const set = (sel, v) => { const e = box.ownerDocument.querySelector(sel); e.value = v; e.dispatchEvent(new w.Event('change', { bubbles: true })); };
  set('#rbBatches [data-xhr]', '-1');
  for (const [f, i] of [['name', 0], ['grade', 1], ['team', 2], ['mark', 3], ['wind', 4]]) set('#rbBatches [data-xmap="' + f + '"]', String(i));
  let t = d.getElementById('rbBatches').textContent; assert.match(t, /「日付」「種目」の列を選んでください|「種目」「日付」の列を選んでください/);
  set('#rbBatches [data-xdef="meet"]', '架空記録会'); set('#rbBatches [data-xdef="date"]', '2026-09-13'); set('#rbBatches [data-xdef="event"]', '男子100m');
  t = d.getElementById('rbBatches').textContent;
  assert.match(t, /取り込める記録：2件/); assert.match(t, /表全体 3件のうち「架空第一高」の選手だけ/); assert(!/空想 健/.test(d.querySelector('#rbBatches .rbt:not(.rb-sample)').textContent));
  const sv = d.querySelector('#rbBatches [data-save]'); assert.equal(sv.disabled, false); sv.click(); await delay(300);
  assert.match(d.getElementById('rbDone').textContent + d.getElementById('rbBatches').textContent, /2件保存/);
});
await check('読めたが学校の選手が0件のとき：「列を選んで読み取る」ボタンが出て、押すと列を選ぶ画面になる', async () => {
  const w = await recW(), d = w.document;
  d.getElementById('rbSchool').value = '架空第九高';
  const txt = '架空記録会 2026年9月13日\n男子100m 決勝\n順位\t氏名\t所属\t記録\n1\t架空 一郎(2)\t架空第一高\t11.52\n2\t見本 太郎(1)\t架空第一高\t11.80\n';
  d.getElementById('rbPaste').value = txt; d.getElementById('rbPasteGo').click(); await delay();
  const btn = d.querySelector('[data-rescue]'); assert(btn, 'ボタンが出ない: ' + d.getElementById('rbBatches').textContent.slice(0, 300));
  btn.click(); await delay(); assert(d.querySelector('#rbBatches .xl'), '列を選ぶ画面にならない');
});
await check('PDF・Webページで読めなかったときは、表をコピーして貼る案内が出る（手で全部打ち直さなくてよい）', () => {
  const js = src('records_app.js'); assert.match(js, /表の部分をコピーして/); assert.match(js, /Excel・CSV のファイルなら、そのまま入れると列を選べます/);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);

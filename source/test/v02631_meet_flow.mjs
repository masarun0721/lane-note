// v0.26.31 大会予定の進み具合（エントリー済・振込済・振込締切・金額・メモ・結果のURL）→ 結果を取り込む → 結果取込済・大会準備へ（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), ROOT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const P = createRequire(import.meta.url)('../src/plans.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.31] 大会予定の進み具合・結果を取り込む');
const TD = '2026-10-14';
await check('進み具合：未エントリー（締切7日以内は赤）→ エントリー済・未振込 → 準備OK／開催中・終了・結果未取込・結果取込済', () => {
  const s = (m, n) => P.stage(Object.assign({ date: '2026-10-30' }, m), TD, n);
  assert.deepEqual(s({}), { k: 'noentry', t: '未エントリー', c: 'todo' });
  assert.equal(s({ deadline: '2026-10-20' }).c, 'ng'); assert.equal(s({ deadline: '2026-10-25' }).c, 'todo'); assert.equal(s({ deadline: '2026-10-10' }).t, '未エントリー（締切過ぎ）');
  assert.equal(s({ entryAt: '2026-10-01' }).k, 'nopay'); assert.equal(s({ entryAt: '2026-10-01', payDue: '2026-10-16' }).c, 'ng');
  assert.equal(s({ entryAt: '2026-10-01', payAt: '2026-10-02' }).t, '準備OK');
  assert.equal(s({ date: '2026-10-14', entryAt: '2026-10-01' }).k, 'now'); assert.equal(s({ date: '2026-10-13', end: '2026-10-14' }).k, 'now');
  assert.equal(s({ date: '2026-10-10' }).t, '終了・結果未取込'); assert.equal(s({ date: '2026-10-10' }, 12).t, '結果取込済（12件）'); assert.equal(s({ date: '2026-10-10', importedAt: 'x' }).k, 'done');
});
await check('カレンダー：振込締切の日に「振込」の印', () => {
  const h = P.monthHtml([{ date: '2026-10-30', meet: '架空A', deadline: '2026-10-20', payDue: '2026-10-22' }], '2026-10', TD);
  assert(/振込締切：架空A/.test(h) && /lp-pd/.test(h) && /締切：架空A/.test(h));
  assert.equal(P.clean({ date: '2026-10-30', meet: 'A', payDue: '2026-10-22', payAt: 'x' }).payDue, '2026-10-22');
});
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
async function page(url, mets) {
  const d = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = m => { w.__alert = m; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
  w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
  if (mets) w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(mets));
  for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js']) w.eval(src(s));
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={mets:function(){return METS;},all:function(){return ALL;},imp:function(){return IMP;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  return w;
}
const w = await page('https://masarun0721.github.io/lane-note/schedule.html');
const doc = w.document;
doc.getElementById('rpPaste').value = '大会名,日付,終了日,会場,区分,締切\n架空記録会,2026-10-10,,架空第二競技場,中学,\n架空新人大会,2026-10-24,2026-10-25,架空競技場,高校,2026-10-18\n架空秋季大会,2026-11-03,,見本公園,中学,2026-10-28\n';
doc.getElementById('rpRead').click(); await delay(); doc.getElementById('rpSave').click(); await delay(300);
const li = k => doc.querySelector('#lpHome li[data-lpk="' + k + '"]'), st = k => li(k).querySelector('.lp-st');
await check('一覧に進み具合のバッジ（締切が近い未エントリーは赤）・終わった大会は「終了・結果未取込」', () => {
  assert.equal(st('2026-10-24|架空新人大会').textContent, '未エントリー'); assert(st('2026-10-24|架空新人大会').classList.contains('st-ng'));
  assert.equal(st('2026-11-03|架空秋季大会').textContent, '未エントリー'); assert(st('2026-11-03|架空秋季大会').classList.contains('st-todo'));
  assert.equal(st('2026-10-10|架空記録会').textContent, '終了・結果未取込');
});
await check('「📥 結果を取り込む」は始まった大会だけ・「📋 大会準備へ」はどれにも（その大会を選んだ状態で開くリンク）', () => {
  const a = li('2026-10-10|架空記録会').querySelector('.lp-imp'); assert(a); assert.equal(a.getAttribute('href'), 'records.html?imp=' + encodeURIComponent('2026-10-10|架空記録会'));
  assert(!li('2026-10-24|架空新人大会').querySelector('.lp-imp'));
  assert.equal([...li('2026-10-24|架空新人大会').querySelectorAll('a')].find(x => /大会準備へ/.test(x.textContent)).getAttribute('href'), 'index.html?plan=' + encodeURIComponent('2026-10-24|架空新人大会'));
});
await check('エントリー済のチェック → その日が入って保存（端末）・バッジが「エントリー済・未振込」、外すと消える', async () => {
  const c = li('2026-10-24|架空新人大会').querySelector('[data-lpck="entryAt"]'); c.checked = true; c.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(150);
  assert.equal(w.__t.mets()['2026-10-24|架空新人大会'].entryAt, TD); assert.equal(JSON.parse(w.localStorage.getItem('lanenote-rec-meets'))['2026-10-24|架空新人大会'].entryAt, TD);
  assert.equal(st('2026-10-24|架空新人大会').textContent, 'エントリー済・未振込'); assert(/エントリー済 10\/14/.test(li('2026-10-24|架空新人大会').textContent));
  const c2 = li('2026-10-24|架空新人大会').querySelector('[data-lpck="entryAt"]'); c2.checked = false; c2.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(150);
  assert.equal(w.__t.mets()['2026-10-24|架空新人大会'].entryAt, undefined); assert.equal(st('2026-10-24|架空新人大会').textContent, '未エントリー');
});
await check('直す：エントリーした日・振込締切・振り込んだ日・金額・メモ・結果のURL（http(s) 以外は保存しない）→ 準備OK・カレンダーに振込', async () => {
  li('2026-11-03|架空秋季大会').querySelector('[data-lpedit]').click(); await delay();
  const e = doc.querySelector('#lpHome .lp-edit'), set = (f, v) => { e.querySelector('[data-lpf="' + f + '"]').value = v; };
  set('entryAt', '2026-10-12'); set('payDue', '2026-10-31'); set('payAt', '2026-10-13'); set('fee', '9,000円'); set('memo', '架空のメモ'); set('resultUrl', 'javascript:alert(1)');
  e.querySelector('[data-lpsave]').click(); await delay(150);
  assert(/結果のURLは/.test(doc.getElementById('lpStatus').textContent)); assert.equal(w.__t.mets()['2026-11-03|架空秋季大会'].fee, undefined);
  set('resultUrl', 'https://kaku.example/result/'); e.querySelector('[data-lpsave]').click(); await delay(200);
  const m = w.__t.mets()['2026-11-03|架空秋季大会'];
  assert.deepEqual([m.entryAt, m.payDue, m.payAt, m.fee, m.memo, m.resultUrl, m.venue, m.deadline, m.plan], ['2026-10-12', '2026-10-31', '2026-10-13', '9,000円', '架空のメモ', 'https://kaku.example/result/', '見本公園', '2026-10-28', true]);
  assert.equal(st('2026-11-03|架空秋季大会').textContent, '準備OK'); const t = li('2026-11-03|架空秋季大会').textContent; assert(/9,000円/.test(t) && /架空のメモ/.test(t) && /振込締切 10\/31/.test(t) && /速報・結果のページ/.test(t));
  assert(doc.querySelector('#lpHome .lp-pd, #lpHome .lp-dk.k-pay'), 'カレンダーに振込の印がない');
});
await check('天気を直しても、進み具合は残る（saveMeet は大会予定の欄をまとめて残す）／予定を消すと進み具合も消える（記録は残す）', () => {
  const js = src('records_app.js'); assert.match(js, /var prev = METS\[key\] \|\| \{\}; PF\.forEach/); assert.match(js, /if \(PF\.indexOf\(k\) < 0\) o\[k\] = [mx]\[k\]/);
  for (const k of ['entryAt', 'payAt', 'payDue', 'fee', 'memo', 'resultUrl', 'importedAt', 'importedN']) assert(new RegExp("var PF = \\[[^\\]]*'" + k + "'").test(js), k);
});
// 結果を取り込む：records.html?imp=日付|大会名
const saved = JSON.parse(w.localStorage.getItem('lanenote-rec-meets'));
const w2 = await page('https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent('2026-10-10|架空記録会'), saved), d2 = w2.document;
await check('記録のページ：取り込む大会の案内が出る・URLがなければ資料を入れる案内', () => {
  const b = d2.getElementById('impBar'); assert(b); assert(/架空記録会/.test(b.textContent) && /2026-10-10/.test(b.textContent) && /PDF・Excel・WebページのURL/.test(b.textContent));
});
await check('資料を入れると、大会名・日付は予定のもの（資料の見出しより優先）→ 保存すると「結果取込済」（件数）', async () => {
  d2.getElementById('rbSchool').value = '架空第一高'; d2.getElementById('rbSchool').dispatchEvent(new w2.Event('input', { bubbles: true })); await delay();
  d2.getElementById('rbPaste').value = '見本大会 2026年9月13日\n男子100m 決勝\n順位\t氏名\t所属\t記録\n1\t架空 一郎(2)\t架空第一高\t11.52\n2\t見本 太郎(1)\t架空第一高\t11.80\n';
  d2.getElementById('rbPasteGo').click(); await delay(150);
  assert.equal(d2.querySelector('#rbBatches [data-f="name"]').value, '架空記録会'); assert.equal(d2.querySelector('#rbBatches [data-f="date"]').value, '2026-10-10');
  d2.querySelector('#rbBatches [data-save]').click(); await delay(500);
  const m = w2.__t.mets()['2026-10-10|架空記録会']; assert.equal(m.importedN, 2, JSON.stringify(m)); assert(m.importedAt);
  assert(/取り込みました（2件）/.test(d2.getElementById('impBar').textContent) && /結果取込済/.test(d2.getElementById('impBar').textContent));
  assert.equal(JSON.parse(w2.localStorage.getItem('lanenote-rec-meets'))['2026-10-10|架空記録会'].importedN, 2);
  assert.equal(d2.querySelector('#lpHome li[data-lpk="2026-10-10|架空記録会"] .lp-st').textContent, '結果取込済（2件）');
});
const w3 = await page('https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent('2026-11-03|架空秋季大会'), saved);
await check('結果のURLを登録してあれば、そのアドレスを読み込む（中継へ）', async () => {
  assert.equal(w3.document.getElementById('ruUrl').value, 'https://kaku.example/result/'); assert(/速報・結果のURLを読み込んでいます/.test(w3.document.getElementById('impBar').textContent));
});
const w4 = await page('https://masarun0721.github.io/lane-note/records.html?imp=' + encodeURIComponent('<b>x</b>'));
await check('おかしな imp は無視（日付|大会名 の形だけ）', () => { assert.equal(w4.__t.imp(), null); assert(!w4.document.getElementById('impBar')); });
await check('チームでも同じ：大会の印（teams/{id}/meets）の欄は決めていない（v0.29.4 から形と長さだけ検査）・マネージャーも直せる', () => {
  const r = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'); assert.match(r, /match \/meets\/\{k\} \{\s*allow read, delete: if activeMember\(t\);\s*allow create, update: if activeMember\(t\) && validTeamMeet\(request\.resource\.data\);/);
});
// 大会準備：index.html?plan=日付|大会名
await check('大会準備へ：その大会を選んだ状態（大会名・日付・会場）・案内が出る・端末の写しに無くても名前と日付は入る', async () => {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const run = async (q, list) => {
    const d = new JSDOM(h, { url: 'http://127.0.0.1:9/index.html' + q, runScripts: 'outside-only', virtualConsole: new VirtualConsole(), beforeParse(v) { v.localStorage.setItem('lanenote.plans.v1', JSON.stringify({ at: 1, uid: '', list })); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
    await delay(50); const v = d.window; for (const s of h.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''))) { try { v.eval(s); } catch (e) { } }
    v.document.dispatchEvent(new v.Event('DOMContentLoaded')); await delay(200); return v.document;
  };
  let dd = await run('?plan=' + encodeURIComponent('2026-10-24|架空新人大会'), [{ date: '2026-10-24', end: '2026-10-25', meet: '架空新人大会', venue: '架空競技場' }]);
  assert.equal(dd.getElementById('meetName').value, '架空新人大会'); assert(/2026年10月24日/.test(dd.getElementById('meetDate').value)); assert(/会場：架空競技場/.test(dd.getElementById('planPicked').textContent));
  assert(/架空新人大会/.test(dd.getElementById('planBar').textContent));
  dd = await run('?plan=' + encodeURIComponent('2026-11-20|架空冬季'), []); assert.equal(dd.getElementById('meetName').value, '架空冬季');
});
console.log(`v02631_meet_flow: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);

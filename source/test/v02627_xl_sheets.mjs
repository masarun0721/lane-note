// v0.26.27 種目ごとにシートを分けたExcel（シート名＝種目・1枚に表が並ぶシート・リレーのシート）をまとめて読む（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.27] 種目ごとのシートのExcel');
// 先生のExcelと同じ形：A列は空、1行目が見出し（名前 学年 タイム 風 大会 日付）。日付は Excel の通し番号、タイムは数値や 2'01"26
const S = (rows) => ({ aoa: rows, text: rows.map(r => r.map(v => typeof v === 'number' && v > 40000 ? '上午/下午 00時00分00秒 ' : v === '' ? '' : String(v))) });
const SH = {
  '100': S([['', '名前', '学年', 'タイム', '風', '大会', '日付'], ['', '架空　一郎', 2, 11.14, 3.6, '支部新人(予)', 46263], ['', '見本 二郎', 1, 11.5, 0, '区秋季', 46270], ['', '試験　三太', 1, '', '', '区秋季', 46270]]),
  '800': S([['', '名前', '学年', 'タイム', '大会', '日付'], ['', '架空　一郎', 2, `2'01"26`, '支部予選(決)', 46131], ['', '見本　二郎', 1, '2:05.10', '学年別', 46172]]),
  '4×100': S([[], ['', 'タイム', '1走', '2走', '3走', '4走', '大会', '日付'], ['', 43.48, '架空　一郎', '見本　二郎', '試験　三太', '仮名　四郎', '新人戦', 46287], ['', 'DQ', '架空　一郎', '見本　二郎', '試験　三太', '仮名　四郎', '支部春季', 46115]]),
  'Sheet4': S([
    ['走幅跳', '名前', '学年', '記録', '風', '大会', '日付', '', '走高跳', '名前', '学年', '記録', '大会', '日付'],
    ['', '架空　一郎', 2, '6m14', 0.9, '区スプリング', 46166, '', '', '見本　二郎', 1, '1m75', '支部春季', 46115],
    ['', '見本　二郎', 1, '5m80', -1.2, '区スプリング', 46166, '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '110JH', '名前', '学年', 'タイム', '大会', '日付'],
    ['110H', '名前', '学年', 'タイム', '風', '大会', '日付', '', '', '試験　三太', 1, 16.51, '学年別', 46172],
    ['', '仮名　四郎', 2, 16.58, 2.1, '支部新人', 46263, '', '', '', '', '', '', '']]),
  'メモ': S([['', '練習の予定'], ['', '火・木']]),
};
const sheets = () => Object.entries(SH).map(([name, s]) => ({ name, aoa: s.aoa, text: s.text }));
await check('シート名・表の名前 → 種目（100→100m・110H→110mH・110JH→110mJH・3000SC→3000mSC・4×100→4×100mR・走幅跳）。Sheet1 などは種目にしない', () => {
  assert.deepEqual(['100', '1500', '110H', '110JH', '3000SC', '4×100', '4x400', '走幅跳', '女子200', 'Sheet4', 'メモ', '記録一覧'].map(R.sheetEvent),
    ['100m', '1500m', '110mH', '110mJH', '3000mSC', '4×100mR', '4×400mR', '走幅跳', '女子200m', '', '', '']);
});
await check('1枚に表が横・縦に並ぶシート：表ごとに見出しの行・列・名前（すぐ左のセル）を見つける', () => {
  const b = R.sheetBlocks(SH.Sheet4.text);
  assert.deepEqual(b.map(x => [x.label, x.hr, x.c0, x.c1, x.r1]), [['走幅跳', 0, 1, 6, 2], ['走高跳', 0, 9, 13, 1], ['110JH', 3, 9, 13, 4], ['110H', 4, 1, 6, 5]]);
  assert.deepEqual(R.sheetBlocks(SH['4×100'].text).map(x => [x.hr, x.relay]), [[1, true]]);
});
const W = R.importWorkbook(sheets(), { school: '架空中' });
await check('ブック全体：シートごとの件数・種目・風・日付・記録の形（11.5→11.50、2\'01"26→2:01.26）', () => {
  assert.deepEqual(W.map(s => [s.name, s.recs.length, s.relays.length, s.bad.length]), [['100', 2, 0, 1], ['800', 2, 0, 0], ['4×100', 0, 1, 1], ['Sheet4', 5, 0, 0], ['メモ', 0, 0, 0]]);
  const a = W[0].recs; assert.deepEqual(a.map(r => [r.event, r.name, r.grade, r.mark, r.wind, r.date, r.meet, r.team]), [['100m', '架空 一郎', '2', '11.14', '+3.6', '2026-08-29', '支部新人(予)', '架空中'], ['100m', '見本 二郎', '1', '11.50', '0.0', '2026-09-05', '区秋季', '架空中']]);
  assert.equal(W[1].recs[0].mark, '2:01.26'); assert.equal(W[1].recs[0].wind, '');
  assert.deepEqual(W[3].recs.map(r => [r.event, r.name, r.mark, r.wind]), [['走幅跳', '架空 一郎', '6m14', '+0.9'], ['走幅跳', '見本 二郎', '5m80', '-1.2'], ['走高跳', '見本 二郎', '1m75', ''], ['110mJH', '試験 三太', '16.51', ''], ['110mH', '仮名 四郎', '16.58', '+2.1']]);
});
await check('読めない行は理由つきで分ける（記録が空・リレーの DQ）。見出しの無いシートは「見つかりません」', () => {
  assert.equal(W[0].bad[0].row, 4); assert(/記録/.test(W[0].bad[0].warn));
  assert.deepEqual(W[2].bad.map(x => [x.row, x.why]), [[4, 'DQ（記録なし）']]);
  assert(/見出しが見つかりません/.test(W[4].note));
});
await check('リレーのシート：見出しが2行目でも読む。記録・日付・大会・1〜4走', () => {
  const c = W[2].relays[0]; assert.deepEqual([c.event, c.team, c.mark, c.date, c.meet, c.runners.map(r => r.name).join('/')], ['4×100mR', '架空中', '43.48', '2026-09-22', '新人戦', '架空 一郎/見本 二郎/試験 三太/仮名 四郎']);
});
await check('種目の列があるシートは列のほうを使う（シート名は使わない）', () => {
  const r = R.importWorkbook([{ name: '記録', aoa: [['名前', '種目', 'タイム', '日付'], ['架空 一郎', '200m', 23.1, '2026/9/1']] }]);
  assert.deepEqual(r[0].recs.map(x => [x.event, x.mark]), [['200m', '23.10']]); assert.equal(r[0].note, '');
});
// 画面：記録のページで、シートごとの一覧 → シートを外す → 保存（個人とリレー）
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
// Excel を読む部品の代わり（シートの中身はそのまま渡す）
w.XLSX = { read: () => ({ SheetNames: Object.keys(SH), Sheets: Object.fromEntries(Object.entries(SH).map(([n, s]) => [n, s])) }), utils: { sheet_to_json: (ws, o) => o.raw ? ws.aoa : ws.text } };
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={putMany:putMany,reload:reload,all:function(){return ALL;},readSheet:readSheet,scope:scope,batches:function(){return batches;}};renderAuth();reload();')); await delay(200);
const T = w.__t, doc = w.document;
doc.getElementById('rbSchool').value = '架空中'; doc.getElementById('rbSchool').dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
await T.readSheet(new w.File([new Uint8Array([1, 2, 3])], '架空_記録.xlsx'), T.scope()); await delay();
const box = () => doc.querySelector('.rb-batch.xlm');
await check('シートごとの一覧：シート名・種目・件数・リレー・読めない行、保存は個人＋リレーの合計', () => {
  assert(box(), doc.getElementById('rbBatches').innerHTML.slice(0, 300));
  const rows = [...box().querySelectorAll('table.xlsheets tr')].slice(1).map(tr => [...tr.cells].slice(0, 5).map(c => c.textContent.trim()));
  assert.deepEqual(rows.map(r => r[0]), ['100', '800', '4×100', 'Sheet4', 'メモ']);
  assert.deepEqual(rows[3].slice(1), ['走幅跳→走幅跳・走高跳→走高跳・110JH→110mJH・110H→110mH', '5', '', '']);
  assert.equal(rows[2][3], '1'); assert.equal(rows[0][4], '1');
  assert(/記録に保存（10件）/.test(box().querySelector('[data-save]').textContent));
  assert(/読めない行 2件/.test(box().textContent) && /「100」4行目/.test(box().textContent) && /DQ（記録なし）/.test(box().textContent));
});
await check('シートのチェックを外すと、そのシートは取り込まない', async () => {
  const c = box().querySelector('[data-xskip="1"]'); c.checked = false; c.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/記録に保存（8件）/.test(box().querySelector('[data-save]').textContent));
});
await check('「列を選ぶ」でそのシートだけ今までの列の画面（種目はシート名から）→ 一覧に戻る', async () => {
  box().querySelector('[data-xpick="0"]').click(); await delay();
  const v = doc.querySelector('.rb-batch.xl'); assert(!v.classList.contains('xlm')); assert(/シート「100」の列を選ぶ/.test(v.textContent));
  assert.equal(v.querySelector('[data-xdef="event"]').value, '100m'); assert(!v.querySelector('[data-xsheet]'));
  v.querySelector('[data-xback]').click(); await delay();
  assert(box()); assert(/列を選び直しました/.test(box().textContent)); assert(/記録に保存（8件）/.test(box().querySelector('[data-save]').textContent));
});
await check('保存：個人の記録（シート名の種目）と 🏃リレー（チーム＝学校名・走順）が入る。外したシートは入らない', async () => {
  box().querySelector('[data-save]').click(); await delay(400);
  const a = T.all(); assert.equal(a.length, 8, JSON.stringify(a.map(r => r.event)));
  assert(!a.some(r => r.event === '800m'));
  const rl = a.find(r => R.isRelay(r.event)); assert.deepEqual([rl.event, rl.team, rl.mark, rl.date, rl.meet, rl.legs], ['4×100mR', '架空中', '43.48', '2026-09-22', '新人戦', '1走 架空 一郎／2走 見本 二郎／3走 試験 三太／4走 仮名 四郎']);
  assert(a.some(r => r.event === '110mJH' && r.name === '試験 三太'));
});
await check('重複の判定（R.dupCheck）：入力済み・重複かも（日付違い／大会名違い／同じ日で記録違い）・新しい。表の中で同じ行が2回でも入力済み', () => {
  const h = [{ name: '架空 一郎', event: '男子100m', date: '2026-08-29', mark: '11.14', meet: '支部新人' }];
  const st = R.dupCheck([{ name: '架空　一郎', event: '100m', date: '2026-08-29', mark: '11.14', meet: '支部新人' }, { name: '架空 一郎', event: '100m', date: '2026-09-01', mark: '11.14' },
    { name: '架空 一郎', event: '100m', date: '', mark: '11.14' }, { name: '架空 一郎', event: '100m', date: '2026-08-29', mark: '11.30' }, { name: '見本 二郎', event: '100m', date: '2026-08-29', mark: '11.14' },
    { name: '見本 二郎', event: '200m', date: '2026-08-29', mark: '23.00' }, { name: '見本　二郎', event: '200m', date: '2026-08-29', mark: '23.00' }], h).map(x => x.st);
  assert.deepEqual(st, ['dup', 'maybe', 'maybe', 'maybe', '', '', 'dup']);
});
await check('同じExcelをもう一度読む：全部「入力済み」でチェックなし（保存は0件）。数の表示', async () => {
  await T.readSheet(new w.File([new Uint8Array([1])], '架空_記録.xlsx'), T.scope()); await delay();
  const t = box().querySelector('.xdcount').textContent; assert(/新しい記録 2件・入力済み 8件/.test(t), t);   // 800m の2件はさっき外したので新しい
  const c = box().querySelector('[data-xskip="1"]'); c.checked = false; c.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/新しい記録 0件・入力済み 8件（最初からチェックなし）・重複かも 0件/.test(box().querySelector('.xdcount').textContent));
  assert([...box().querySelectorAll('[data-xrec]')].every(x => !x.checked)); assert(box().querySelectorAll('.xd-dup').length === 8);
  assert(box().querySelector('[data-save]').disabled);
});
await check('重複かも：同じ人・種目・記録で日付が違う記録があると印が付く（チェックは残す）。入力済みもチェックを付ければ保存できる', async () => {
  box().querySelector('[data-del]').click(); await delay();
  await T.putMany([{ id: 'z1', name: '架空 一郎', team: '架空中', event: '男子800m', mark: '2:01.26', date: '2026-04-20', meet: '別の大会' }], T.scope()); await T.reload(T.scope()); await delay();
  await T.readSheet(new w.File([new Uint8Array([1])], '架空_記録.xlsx'), T.scope()); await delay();
  assert(/新しい記録 1件・入力済み 8件（最初からチェックなし）・重複かも 1件/.test(box().querySelector('.xdcount').textContent), box().querySelector('.xdcount').textContent);
  const mb = box().querySelector('.xd-maybe'); assert(/重複かも/.test(mb.textContent) && /2:01.26/.test(mb.textContent)); assert(mb.querySelector('[data-xrec]').checked);
  assert(/記録に保存（2件）/.test(box().querySelector('[data-save]').textContent));
  const d1 = box().querySelector('.xd-dup [data-xrec]'); d1.checked = true; d1.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert(/記録に保存（3件）/.test(box().querySelector('[data-save]').textContent));
});
console.log(`v0.26.27 Excel のシート ${pass} ok / ${fail} NG`); if (fail) process.exit(1);

// v0.26.58 走る種目の小数1けたの記録を2けたにそろえる（取り込み・保存・前の記録の表示）。跳躍・投てきはそのまま。架空データのみ。
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), S = req('../src/suspect.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }

console.log('[v0.26.58] 小数1けたの記録を2けたにそろえる');
const rec = o => Object.assign({ meet: '架空区大会', date: '2026-09-06', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+0.5', bib: '', lane: '', rank: 1, comment: '' }, o);
const withId = r => (r.id = r.id || R.recId(r.meet, r.date, r), r);
await check('padTime：走る種目は 11.8 → 11.80・55.1 → 55.10・2:05.3 → 2:05.30。跳躍・投てき・2けた・DNS・得点はそのまま', () => {
  const P = (m, ev = '男子100m') => R.padTime(m, ev);
  assert.equal(P('11.8'), '11.80'); assert.equal(P('55.1', '男子400m'), '55.10'); assert.equal(P('2:05.3', '男子800m'), '2:05.30'); assert.equal(P('48.3', '男子4×100mR'), '48.30');
  for (const m of ['11.85', '2:05.30', 'DNS', 'NM', '', '6012', '5m80']) assert.equal(P(m), m, m);
  for (const ev of ['男子走幅跳', '男子砲丸投', '男子走高跳']) { assert.equal(P('5.8', ev), '5.8'); assert.equal(P('5.80', ev), '5.80'); }
  const r = rec({ mark: '12.1' }), v = R.viewRecord(r); assert.equal(v.mark, '12.10'); assert.equal(r.mark, '12.1', '元の記録は書きかえない'); assert.equal(v.id, r.id);
  const f = rec({ event: '男子走幅跳', mark: '5.80' }); assert.equal(R.viewRecord(f), f);
});
await check('取り込み：表・貼り付け・HTML（速報）・1件ずつ・Excel で「12.1」「2:05.3」は「12.10」「2:05.30」', () => {
  const txt = '男子100m 決勝\n順位\t氏名\t所属\t記録\t風\n1\t架空 一郎(2)\t架空中\t12.1\t+0.5\n男子800m 決勝\n順位\t氏名\t所属\t記録\n1\t架空 二郎(2)\t架空中\t2:05.3\n男子走幅跳 決勝\n順位\t氏名\t所属\t記録\t風\n1\t架空 三郎(2)\t架空中\t5.80\t+1.0\n';
  const o = R.parsePlain(txt, {}), m = Object.fromEntries(o.recs.map(r => [r.name, r.mark]));
  assert.deepEqual(m, { '架空 一郎': '12.10', '架空 二郎': '2:05.30', '架空 三郎': '5.80' });
  const M = f => R.manualRecord(Object.assign({ name: '架空 一郎', event: '男子100m', mark: '11.85', date: '2026-10-04' }, f)).rec.mark;
  assert.equal(M({ mark: '11.8' }), '11.80'); assert.equal(M({ event: '男子800m', mark: '2:05.3' }), '2:05.30'); assert.equal(M({ event: '男子走幅跳', mark: '5.74' }), '5m74');
  const x = R.importRows([['種目', '氏名', '記録', '日付'], ['男子100m', '架空 一郎', '12.1', '2026-09-06'], ['男子800m', '架空 二郎', '2:05.3', '2026-09-06']], { event: 0, name: 1, mark: 2, date: 3 }, {});
  assert.deepEqual(x.recs.map(r => r.mark), ['12.10', '2:05.30']);
});
await check('怪しい記録チェック：「12.1」と「12.10」は二重（記録がちがう、にしない）', () => {
  const L = S.scan(R, [rec({ mark: '12.1' }), rec({ mark: '12.10', meet: '架空区民大会' })].map(withId), {});
  assert.deepEqual(L.map(x => x.type), ['dup']);
  const B = S.forBatch(R, [withId(rec({ mark: '12.10', meet: '架空区民大会' }))], [withId(rec({ mark: '12.1' }))], {});
  assert.deepEqual(B.list.map(x => [x.type, x.ex]), [['dup', true]]);
});
/* ---------- 画面（jsdom・fake-indexeddb。クラウドにはつながない） ---------- */
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const ind = (date, title, rows) => `<!-- ${date} 09:00:00 15 (Lsoku=0)-->\n<html lang="ja"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${title}</title></head>\n${title}<br>\n<hr>\n<center>風:+0.5<br></center>\n` + rows.map(r => `<font color="#000080">${r}<br>\n</font>`).join('') + '<hr>\n<a href="kyougi.html">競技一覧画面へ</a></body></html>';
const pr = (k, name, team, mark, g = 2, bib = 11) => `${k}位　(${bib})<br>　${mark}<br>${name}(${g})<br>${team}<br>`;
async function page(o = {}) {
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => (w.__conf = (w.__conf || 0) + 1, o.confirm !== false); w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.indexedDB = new IDBFactory(); w.fetch = () => Promise.reject(new Error('no network'));
  if (o.player) w.localStorage.setItem('lanenote.mode.v1', 'player');
  if (o.mets) w.localStorage.setItem('lanenote-rec-meets', JSON.stringify(o.mets));
  for (const s of ['auth_common.js', 'mode.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js', 'pubmeets.js', 'prepdel.js', 'yearbuild.js', 'suspect.js', 'print.js', 'review.js', 'tips.js']) { try { w.eval(src(s)); } catch (e) { if (s !== 'mode.js') throw e; } }
  assert(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={all:function(){return ALL;},put:function(a){return putMany(a,scope()).then(function(){return reload(scope());});},batches:function(){return batches;},files:function(f){return handleFilesIn(f,scope()).then(function(){renderBatches();});},rb:function(){renderBatches();},ev:function(s){return eval(s);}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
  const sch = w.document.getElementById('rbSchool'); sch.value = '架空'; sch.dispatchEvent(new w.Event('input', { bubbles: true })); await delay();
  return w;
}
await check('記録のページ：前に保存した「12.1」は「12.10」で見せる（保存した記録はそのまま）・同じ記録を入れ直しても二重にしない・新しく入れると「12.10」で保存', async () => {
  const w = await page();
  try {
    const old = withId(rec({ mark: '12.1' })), oldF = withId(rec({ name: '架空 三郎', event: '男子走幅跳', mark: '5.8', wind: '+1.0' }));
    await w.__t.ev("(function(a){var sc=scope();return ltx('readwrite',function(s){a.forEach(function(r){s.put(r);});},sc.dbName,sc).then(function(){return reload(sc);});})")([old, oldF]); await delay(150);
    const a = w.__t.all(); assert.equal(a.find(r => r.id === old.id).mark, '12.10'); assert.equal(a.find(r => r.id === oldF.id).mark, '5.8', '跳躍はそのまま');
    const raw = await w.__t.ev("(function(){var sc=scope();return lgetAll(sc.dbName,sc);})")(); assert.equal(raw.find(r => r.id === old.id).mark, '12.1', '保存した記録は書きかえない');
    w.document.querySelector('.tabs [data-v="all"]').click(); await delay(100); const tbl = w.document.getElementById('rbView').textContent; assert(tbl.includes('12.10'), '一覧'); assert(tbl.includes('5.8')); assert(!/12\.1(?!\d)/.test(tbl), '画面に 12.1 を出さない');
    await w.__t.put([rec({ mark: '12.1' })]); await delay(100); assert.equal(w.__t.all().length, 2, '同じ記録は重ねない');
    await w.__t.put([rec({ name: '架空 二郎', mark: '11.9' })]); await delay(100);
    const n = w.__t.all().find(r => r.name === '架空 二郎'); assert.equal(n.mark, '11.90'); assert.equal(n.id, R.recId(n.meet, n.date, n), 'ID も 11.90 で作る');
  } finally { w.close(); }
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);

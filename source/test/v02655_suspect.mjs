// v0.26.55 怪しい記録のチェック：決まり（LaneSuspect）・保存の前の確認画面・「🔍 怪しい記録チェック」（消す・元に戻す・問題ない・選手モード）。架空データのみ。
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), S = req('../src/suspect.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.55] 怪しい記録のチェック');
const rec = (o) => Object.assign({ meet: '架空区大会', date: '2026-09-06', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '中2', team: '架空中', mark: '12.40', wind: '+0.5', bib: '', lane: '', rank: 1, comment: '' }, o);
const withId = r => (r.id = r.id || R.recId(r.meet, r.date, r), r);
const types = L => L.map(x => x.type + ':' + x.recs.map(r => r.name + '/' + r.mark).join(','));

/* ---------- 決まり ---------- */
await check('二重：同じ選手・日・種目・ラウンド・記録なら、大会名がちがっても（DNS どうしも）', () => {
  const a = [rec({ mark: 'DNS', meet: '架空区大会' }), rec({ mark: 'DNS', meet: '架空区民大会' }), rec({ name: '架空 二郎', mark: '12.80' }), rec({ name: '架空 二郎', mark: '12.80', meet: '架空区民大会' })].map(withId);
  const L = S.scan(R, a, { today: '2026-10-16' });
  assert.deepEqual(L.filter(x => x.type === 'dup').map(x => x.recs.map(r => r.name + '/' + r.mark).join(',')).sort(), ['架空 一郎/DNS,架空 一郎/DNS', '架空 二郎/12.80,架空 二郎/12.80']);
  assert(L.find(x => x.type === 'dup').why.includes('大会名がちがいます'));
});
await check('記録がちがう：同じ選手・日・種目・ラウンドで記録が2つ。ラウンドが空なら組がそろうときだけ・日やラウンドがちがえば出さない', () => {
  const a = [rec({ mark: '12.40' }), rec({ mark: '12.55', meet: '別の名前' }), rec({ name: '架空 三郎', round: '', heat: '2', mark: '12.90' }), rec({ name: '架空 三郎', round: '', heat: '', mark: '12.70' }),
    rec({ name: '架空 四郎', round: '予選', mark: '12.90' }), rec({ name: '架空 四郎', round: '決勝', mark: '12.70' }), rec({ name: '架空 五郎', date: '2026-09-07', mark: '12.1' === 'x' ? '' : '12.60' }), rec({ name: '架空 五郎', mark: '12.62' })].map(withId);
  assert.deepEqual(types(S.scan(R, a, {}).filter(x => x.type === 'conflict')), ['conflict:架空 一郎/12.40,架空 一郎/12.55']);
});
await check('ありえない記録：種目・男女・中学/高校の幅、単位（cm）、形のまちがい、読めない記録。DNS・DQ などは出さない', () => {
  const w = o => S.markWhy(R, rec(o));
  assert.match(w({ mark: '9.40', team: '架空高', grade: '高2' }), /速すぎ/); assert.equal(w({ mark: '10.10', team: '架空高', grade: '高2' }), '');
  assert.match(w({ mark: '9.90' }), /速すぎ/, '中学の100mで 9.90'); assert.match(w({ mark: '26.00' }), /遅すぎ/);
  assert.match(w({ event: '女子100m', mark: '10.20' }), /速すぎ/); assert.equal(w({ event: '女子100m', mark: '12.30' }), '');
  assert.match(w({ event: '男子走幅跳', mark: '614' }), /cm/); assert.equal(w({ event: '男子走幅跳', mark: '6m14' }), '');
  assert.match(w({ event: '男子走幅跳', mark: '8m50' }), /ふつうは/, '中学で 8m50'); assert.equal(w({ event: '男子走幅跳', mark: '8m50', team: '架空高', grade: '高3' }), '');
  assert.match(w({ event: '男子1500m', mark: '4m32' }), /長さの形/); assert.match(w({ event: '男子走高跳', mark: '1:75' }), /時間の形/);
  assert.match(w({ mark: '1l.50' }), /読めません/);
  for (const m of ['DNS', 'DQ', 'DNF', 'NM', '失格', '欠場', '-', '', 'DQ(TR17.3.1)']) assert.equal(w({ mark: m }), '', m);
  assert.equal(w({ event: '男子四種競技', mark: '1500' }), '', '混成は幅を決めない');
  assert.equal(w({ event: '男子4×100mR', mark: '45.20', name: '', team: '架空中' }), '');
});
await check('日付：大会予定の日程の外・未来の日付。予定にない大会はくらべない', () => {
  const plans = [{ meet: '架空選手権', date: '2026-05-03', end: '2026-05-04' }];
  const a = [rec({ meet: '架空選手権', date: '2026-05-04' }), rec({ meet: '架空選手権', date: '2026-05-06', name: '架空 二郎' }), rec({ meet: 'よその大会', date: '2026-05-06', name: '架空 三郎' }), rec({ date: '2099-01-01', name: '架空 四郎' })].map(withId);
  assert.deepEqual(types(S.scan(R, a, { plans, today: '2026-10-16' }).filter(x => x.type === 'date')), ['date:架空 二郎/12.40', 'date:架空 四郎/12.40']);
});
await check('「問題ない」にしたもの（sig）は出さない。保存の前：二重ははじめから入れない、ほかは入れて印だけ。同じIDは二重にしない', () => {
  const old = [rec({ mark: 'DNS', meet: '架空区民大会' }), rec({ name: '架空 二郎', mark: '12.80' })].map(withId);
  const L = S.scan(R, old.concat(withId(rec({ mark: 'DNS' }))), {}); assert.equal(L.length, 1); assert.equal(S.scan(R, old.concat(withId(rec({ mark: 'DNS' }))), { ok: { [L[0].sig]: 1 } }).length, 0);
  const add = [rec({ mark: 'DNS' }), rec({ name: '架空 二郎', mark: '12.95', meet: '架空区民大会' }), rec({ name: '架空 三郎', mark: '8.10' }), rec({ name: '架空 二郎', mark: '12.80' })].map(withId);
  const B = S.forBatch(R, add, old, {}).list.map(x => [x.rec.name + '/' + x.rec.mark, x.type, x.ex]);
  assert.deepEqual(B, [['架空 一郎/DNS', 'dup', true], ['架空 二郎/12.95', 'conflict', false], ['架空 三郎/8.10', 'mark', false]], JSON.stringify(B));
  // 入れる中で2回（大会名ちがい）：2つ目だけ入れない
  const two = [rec({ name: '架空 六郎', mark: '13.00' }), rec({ name: '架空 六郎', mark: '13.00', meet: '架空区民大会' })].map(withId);
  assert.deepEqual(S.forBatch(R, two, [], {}).list.map(x => [x.rec.meet, x.ex]), [['架空区大会', false], ['架空区民大会', true]]);
  assert.deepEqual(S.forBatch(R, [rec({ name: '架空 七郎' })].map(withId), [rec({ name: '架空 七郎' })].map(withId), {}).list, [], '同じIDの保存ずみは、もともと重ねない');
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
const PAGE = ind('2026/09/06', '男子 １００ｍ 決勝', [pr(1, '架空 一郎', '架空中', '12.40'), pr(2, '架空 三郎', '架空中', '8.10', 3, 12), pr(3, '架空 五郎', '架空中', '12.90', 1, 13)]);
const BASE = { meet: '架空区民大会', date: '2026-09-06', round: '決勝', heat: '', lane: '', bib: '', rank: '', comment: '', wind: '', kana: '' };
await check('保存の前の確認画面：「🔍 気になる行」。二重（大会名ちがいの保存ずみ）ははじめから入れない・ありえない記録は入れて印だけ・チェックで変えられる・値は変えない', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await w.__t.files([new w.File([PAGE], 'rel001.html', { type: 'text/html' })]); await delay(200);
    const b = w.__t.batches()[0]; assert(b && b.all && b.all.recs.length === 3, '読み取り'); b.meta.name = '架空区大会'; b.meta.date = '2026-09-06'; b.meta.typedName = b.meta.typedDate = true;
    const one = b.all.recs.find(r => r.name === '架空 一郎');
    const old = Object.assign({}, one, { meet: '架空区民大会', date: '2026-09-06' }); old.id = R.recId(old.meet, old.date, old); await w.__t.put([old]); await delay(100);
    w.__t.rb(); await delay();
    const box = w.document.querySelector('.rb-sus'); assert(box, '気になる行'); assert.match(box.textContent, /気になる行 2件/); assert.match(box.textContent, /1件は入れません/);
    const cb = [...box.querySelectorAll('input[data-susx]')]; assert.equal(cb.length, 2);
    const li = n => [...box.querySelectorAll('li')].find(l => l.textContent.includes(n));
    assert(li('架空 一郎').querySelector('input').checked, '二重は入れない'); assert.match(li('架空 一郎').textContent, /二重.*架空区民大会/);
    assert(!li('架空 三郎').querySelector('input').checked, 'ありえない記録は入れる（印だけ）'); assert.match(li('架空 三郎').textContent, /ありえない記録.*速すぎ/);
    // 三郎も入れないにする → 保存
    const c3 = li('架空 三郎').querySelector('input'); c3.checked = true; c3.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    w.document.querySelector('[data-save]').click(); await delay(500);
    const all = w.__t.all().map(r => [r.meet, r.name, r.mark]).sort();
    assert.deepEqual(all, [['架空区大会', '架空 五郎', '12.90'], ['架空区民大会', '架空 一郎', '12.40']], JSON.stringify(all));
    assert.match($('rbDone').textContent, /2件は「入れない」にした行/);
  } finally { w.close(); }
});
await check('保存の前：既定のまま保存すると、二重だけ入れずにほかは入れる（記録はそのまま）', async () => {
  const w = await page();
  try {
    await w.__t.files([new w.File([PAGE], 'rel001.html', { type: 'text/html' })]); await delay(200);
    const b = w.__t.batches()[0]; b.meta.name = '架空区大会'; b.meta.date = '2026-09-06'; b.meta.typedName = b.meta.typedDate = true;
    const old = Object.assign({}, b.all.recs.find(r => r.name === '架空 一郎'), { meet: '架空区民大会', date: '2026-09-06' }); old.id = R.recId(old.meet, old.date, old); await w.__t.put([old]); await delay(100);
    w.__t.rb(); await delay(); w.document.querySelector('[data-save]').click(); await delay(500);
    assert.deepEqual(w.__t.all().map(r => [r.meet, r.name, r.mark]).sort(), [['架空区大会', '架空 三郎', '8.10'], ['架空区大会', '架空 五郎', '12.90'], ['架空区民大会', '架空 一郎', '12.40']]);
  } finally { w.close(); }
});
const SAVED = () => [
  Object.assign({}, BASE, { meet: '架空区大会', event: '男子100m', name: '架空 一郎', team: '架空中', grade: '2', mark: 'DNS' }),
  Object.assign({}, BASE, { meet: '架空区民大会', event: '男子100m', name: '架空 一郎', team: '架空中', grade: '2', mark: 'DNS' }),
  Object.assign({}, BASE, { event: '男子走幅跳', name: '架空 二郎', team: '架空中', grade: '3', mark: '614' }),
  Object.assign({}, BASE, { meet: '架空選手権', date: '2026-05-06', event: '男子200m', name: '架空 三郎', team: '架空中', grade: '1', mark: '26.10' }),
  Object.assign({}, BASE, { event: '男子200m', name: '架空 四郎', team: '架空中', grade: '2', mark: '25.90' }),
  Object.assign({}, BASE, { event: '男子200m', name: '架空 四郎', team: '架空中', grade: '2', mark: '26.40', meet: '架空区大会' })
].map(withId);
const METS = { '2026-05-03|架空選手権': { plan: true, date: '2026-05-03', end: '2026-05-04', meet: '架空選手権' } };
await check('🔍 怪しい記録チェック：種類ごとに並ぶ・各行に選手・大会・日付・種目・記録・「消す」「問題ない」。説明は「?」の中', async () => {
  const w = await page({ mets: METS }), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(SAVED()); await delay(100);
    assert($('rbSus').hidden); $('rbSusOpen').click(); await delay();
    const box = $('rbSus'); assert(!box.hidden); assert.equal($('rbSusOpen').getAttribute('aria-expanded'), 'true');
    assert.deepEqual([...box.querySelectorAll('.sus-h')].map(h => h.firstChild.textContent), ['二重', '記録がちがう', 'ありえない記録', '日付が合わない']);
    assert.match(box.querySelector('.card-h').textContent, /4件/);
    await delay(80); const help = box.querySelector('.card-h .sus-help[data-xp]'), q = help && help.closest('.xpw') && help.closest('.xpw').querySelector('button.tipq');   // v0.26.56 共通の「？」（tips.js）
    assert(q, '説明は共通の「？」の中'); assert.equal(q.getAttribute('aria-expanded'), 'false', '説明は閉じた「？」'); assert.equal(q.querySelector('.tipi').textContent, '?'); assert.match(help.textContent, /値は直しません/);
    const dup = box.querySelector('.sus-dup'); assert.match(dup.textContent, /架空 一郎/); assert.match(dup.textContent, /架空区大会/); assert.match(dup.textContent, /架空区民大会/); assert.match(dup.textContent, /2026-09-06/); assert.match(dup.textContent, /DNS/);
    assert.equal(dup.querySelectorAll('[data-susdel]').length, 2); assert(dup.querySelector('[data-susok]'));
    assert.match(box.querySelector('.sus-mark').textContent, /cm/); assert.match(box.querySelector('.sus-date').textContent, /架空 三郎.*|日程/);
    assert.match(box.querySelector('.sus-conflict').textContent, /25\.90.*26\.40|26\.40.*25\.90/);
    assert(box.textContent.length < 1200, '文は短く');
  } finally { w.close(); }
});
await check('消す（確認つき）→ 元に戻す。やめたら消さない', async () => {
  const w = await page({ mets: METS }), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(SAVED()); await delay(100); $('rbSusOpen').click(); await delay();
    const n0 = w.__t.all().length, id = $('rbSus').querySelector('.sus-dup [data-susdel]').getAttribute('data-susdel');
    const btn = () => [...$('rbSus').querySelectorAll('[data-susdel]')].find(x => x.getAttribute('data-susdel') === id);
    w.confirm = () => false; btn().click(); await delay(200); assert.equal(w.__t.all().length, n0, 'やめたら消さない');
    w.confirm = () => true; btn().click(); await delay(400);
    assert.equal(w.__t.all().length, n0 - 1); assert(!w.__t.all().some(r => r.id === id)); assert.match($('rbSus').textContent, /消しました/); assert(!$('rbSus').querySelector('.sus-dup'), '二重は消えた');
    $('rbSus').querySelector('[data-sus="undo"]').click(); await delay(400);
    assert.equal(w.__t.all().length, n0); assert(w.__t.all().some(r => r.id === id)); assert.match($('rbSus').textContent, /元に戻しました/); assert($('rbSus').querySelector('.sus-dup'));
  } finally { w.close(); }
});
await check('問題ない：この端末で覚えて、閉じて開き直しても・読み直しても出さない', async () => {
  const w = await page({ mets: METS }), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(SAVED()); await delay(100); $('rbSusOpen').click(); await delay();
    $('rbSus').querySelector('.sus-mark [data-susok]').click(); await delay();
    assert(!$('rbSus').querySelector('.sus-mark')); assert.match($('rbSus').textContent, /問題ない/);
    const ok = JSON.parse(w.localStorage.getItem('lanenote-sus-ok')); assert.equal(Object.keys(ok).length, 1);
    $('rbSus').querySelector('[data-sus="close"]').click(); await delay(); assert($('rbSus').hidden);
    $('rbSusOpen').click(); await delay(); assert(!$('rbSus').querySelector('.sus-mark')); assert($('rbSus').querySelector('.sus-dup'));
    assert(w.__t.all().some(r => r.mark === '614'), '記録はそのまま（直さない）');
  } finally { w.close(); }
});
await check('選手モード・「個人で使う」では消せない（「問題ない」だけ）', async () => {
  const w = await page({ mets: METS, player: true }), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put(SAVED()); await delay(100); $('rbSusOpen').click(); await delay();
    assert($('rbSus').querySelector('.sus-dup')); assert.equal($('rbSus').querySelectorAll('[data-susdel]').length, 0); assert($('rbSus').querySelector('[data-susok]'));
    assert.match($('rbSus').textContent, /顧問・マネージャーが消せます/);
  } finally { w.close(); }
});
await check('1年分をまとめる：はじめの期間は今年度（4/1〜今日）。ボタンで「この1年」も選べる', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    $('rbYear').open = true; $('rbYear').dispatchEvent(new w.Event('toggle')); await delay();
    const td = w.__t.ev('ybToday()'), fy = +td.slice(0, 4) - (+td.slice(5, 7) < 4 ? 1 : 0);
    assert.equal($('ybFrom').value, fy + '-04-01'); assert.equal($('ybTo').value, td);
    const y1 = $('rbYear').querySelector('[data-ybr="y"]'); assert(y1, '「この1年」のボタンは残る'); y1.click(); await delay();
    assert.notEqual($('ybFrom').value, fy + '-04-01');
  } finally { w.close(); }
});
await check('ふりかえりシート：1年分の 📝 から開くと、まとめた期間の終わりをふくむ年度。ほかから開くといつも今の年度（記録がなければ記録のある最後の年度）', async () => {
  const w = await page(), $ = id => w.document.getElementById(id);
  try {
    await w.__t.put([withId(rec({ date: '2025-06-01', meet: '架空春季' })), withId(rec({ date: '2026-06-01', meet: '架空夏季', mark: '12.20' }))]); await delay(100);
    const now = w.__t.ev('nowSeason()');
    $('rbYear').open = true; $('rbYear').dispatchEvent(new w.Event('toggle')); await delay();
    const f = $('ybFrom'); f.value = '2025-10-01'; f.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); const t = $('ybTo'); t.value = '2026-02-15'; t.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    const bt = w.document.createElement('button'); bt.setAttribute('data-ybreview', '1'); $('rbYear').appendChild(bt); bt.click(); await delay(200);
    const per = () => { const b = $('rbPrintBody'); return [b.querySelector('[data-rvseason]').value, b.querySelector('[data-rvfrom]').value, b.querySelector('[data-rvto]').value]; };
    assert(!$('rbPrint').hidden); assert.deepEqual(per(), ['2025', '2025-04-01', '2026-03-31'], '2026-02-15 をふくむ 2025年度');
    assert.match($('rbPrintBody').querySelector('[data-rvseason] option[value="2025"]').textContent, /2025年度/);
    // 期間の切りかえは今までどおり
    const sel = $('rbPrintBody').querySelector('[data-rvseason]'); sel.value = String(now); sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay(); assert.equal(per()[0], String(now));
    w.__t.ev('closePrint()'); w.__t.ev("RV.from = '2025-05-01'; RV.to = '2025-05-31'");
    // 選手別などの「ふりかえりシート（選手を選ぶ）」から：今の年度に戻る
    const pb = w.document.createElement('button'); pb.setAttribute('data-print', 'rpick'); $('rbView').appendChild(pb); pb.click(); await delay(200);
    assert.deepEqual(per(), [String(now), now + '-04-01', (now + 1) + '-03-31']);
  } finally { w.close(); }
});
await check('ログアウト・端末のデータを消すで「問題ない」の控えも消す', () => {
  assert(src('auth_common.js').includes("'lanenote-sus-ok-' + uid")); assert(src('records_app.js').includes("localStorage.removeItem('lanenote-sus-ok')"));
});
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
